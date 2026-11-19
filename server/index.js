import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';

import {
  DATA_DIR,
  DIST_DIR,
  HOST,
  ICP_LINK,
  ICP_NUMBER,
  MAX_BLOCKS_BYTES,
  MAX_UPLOAD_BYTES,
  NODE_ENV,
  PORT,
  UPLOAD_DIR,
} from './config.js';
import {
  clearSetupTokenFile,
  clearLoginFailures,
  destroySession,
  hashPassword,
  issueSession,
  loginAllowed,
  recordLoginFailure,
  requireAuth,
  resolveSession,
  setSessionCookie,
  setupToken,
  setupTokenValid,
  validatePassword,
  validateUsername,
  verifyPassword,
} from './auth.js';
import {
  closeDatabase,
  countUsers,
  createAsset,
  createModule,
  createPage,
  createUser,
  databaseSize,
  db,
  deleteAIConversation,
  deleteExpiredSessions,
  deleteModule,
  deleteOtherSessions,
  deletePage,
  exportAll,
  getAIConversation,
  getAsset,
  getBootstrap,
  getModule,
  getPage,
  getPageBreadcrumb,
  getPageLinks,
  getPublicBootstrap,
  getPublicPage,
  getPublicPageBreadcrumb,
  getPublicPageLinks,
  getUserById,
  getUserByUsername,
  getTheme,
  listAIConversations,
  listAIMessages,
  listModules,
  moduleSubtreeIds,
  reorderModules,
  reorderPages,
  searchPages,
  searchPublicPages,
  seedInitialContent,
  setSetting,
  updateModule,
  updatePageContent,
  updatePageMeta,
  updatePassword,
  updateSiteSettings,
  updateUsername,
} from './db.js';
import { chatWithAI, AIError, getAIStatus, setAIModel } from './ai.js';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  trustProxy: true,
  bodyLimit: MAX_BLOCKS_BYTES + 2 * 1024 * 1024,
});

app.decorateRequest('user', null);
app.decorateRequest('session', null);

await app.register(cookie);
await app.register(multipart, {
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    fields: 20,
    parts: 30,
  },
});

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const fail = (reply, status, error, message) => reply.code(status).send({ error, message });

const cleanTitle = (value, fallback = '未命名页面') => {
  const title = String(value ?? '').replace(/\s+/g, ' ').trim();
  return (title || fallback).slice(0, 160);
};

const cleanIcon = (value, fallback = '📄') => {
  const icon = String(value ?? '').trim();
  return (icon || fallback).slice(0, 32);
};

const cleanAccent = (value, fallback = '#c8f76a') => {
  const accent = String(value ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : fallback;
};

const cleanAssetUrl = (value) => {
  const url = String(value ?? '').trim();
  if (!url) return '';
  if (url.startsWith('/api/assets/') || url.startsWith('/api/public/assets/') || /^https:\/\//i.test(url)) {
    return url.slice(0, 500);
  }
  return '';
};

const cleanBool = (value, fallback = true) => {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
};

const stripBlocks = (page) => {
  if (!page) return page;
  const { blocks, ...meta } = page;
  return meta;
};

const publicAssetBlocks = (blocks) => {
  try {
    const text = JSON.stringify(blocks).replaceAll('/api/assets/', '/api/public/assets/');
    return JSON.parse(text);
  } catch {
    return blocks;
  }
};

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function requestOriginAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  let originUrl;
  try { originUrl = new URL(origin); } catch { return false; }
  const forwarded = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwarded || req.headers.host;
  if (!host) return false;
  if (originUrl.host === host) return true;

  // Nginx $host drops a non-default port. Allow the same hostname in that case,
  // so http://IP:8080 works behind the reverse proxy.
  try {
    const expected = new URL(`http://${host}`);
    return originUrl.hostname === expected.hostname;
  } catch {
    return false;
  }
}

app.addHook('onRequest', async (req, reply) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
  if (!requestOriginAllowed(req)) {
    return fail(reply, 403, 'BAD_ORIGIN', '请求来源校验失败，请刷新页面后重试。');
  }
});

app.addHook('onSend', async (req, reply, payload) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'same-origin');
  reply.header('X-Frame-Options', 'DENY');
  if (req.url.startsWith('/api/') || req.url.startsWith('/admin')) {
    reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (
    req.url.startsWith('/api/')
    && !req.url.startsWith('/api/assets/')
    && !req.url.startsWith('/api/public/assets/')
  ) {
    reply.header('Cache-Control', 'no-store');
  }
  return payload;
});

/* ------------------------------------------------------------------ */
/* health & auth                                                       */
/* ------------------------------------------------------------------ */

app.get('/api/health', async () => ({
  ok: true,
  app: 'DEVFORGE',
  version: '1.0.0',
  setupRequired: countUsers() === 0,
}));

app.get('/api/auth/status', async (req) => {
  const icp = { number: ICP_NUMBER, link: ICP_LINK };
  if (countUsers() === 0) {
    return { setupRequired: true, authenticated: false, user: null, icp };
  }
  const session = resolveSession(req);
  return {
    setupRequired: false,
    authenticated: Boolean(session),
    user: session?.user || null,
    icp,
  };
});

app.post('/api/auth/setup', async (req, reply) => {
  if (countUsers() > 0) {
    return fail(reply, 409, 'ALREADY_SETUP', '这个站点已经完成初始化。');
  }
  if (!loginAllowed(req)) {
    return fail(reply, 429, 'RATE_LIMITED', '尝试次数过多，请 10 分钟后再试。');
  }

  const body = req.body || {};
  if (!setupTokenValid(body.token)) {
    recordLoginFailure(req);
    return fail(reply, 403, 'SETUP_TOKEN_INVALID', '初始化口令不正确，请查看服务器日志或 data/setup-token.txt。');
  }

  const username = validateUsername(body.username);
  if (!username.ok) return fail(reply, 400, 'INVALID_USERNAME', username.message);
  const password = validatePassword(body.password);
  if (!password.ok) return fail(reply, 400, 'INVALID_PASSWORD', password.message);

  let user;
  try {
    db.exec('BEGIN');
    user = createUser({
      username: username.value,
      passwordHash: hashPassword(password.value),
    });
    seedInitialContent();
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    req.log.error(error);
    return fail(reply, 500, 'SETUP_FAILED', '初始化失败，请查看服务器日志。');
  }

  clearSetupTokenFile();
  clearLoginFailures(req);
  const session = issueSession(user.id);
  setSessionCookie(reply, req, session.token, session.maxAge);
  req.log.info({ username: user.username }, 'admin account created');
  return { user, setupRequired: false };
});

app.post('/api/auth/login', async (req, reply) => {
  if (countUsers() === 0) {
    return fail(reply, 409, 'SETUP_REQUIRED', '站点还没有初始化。');
  }
  if (!loginAllowed(req)) {
    return fail(reply, 429, 'RATE_LIMITED', '尝试次数过多，请 10 分钟后再试。');
  }

  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) {
    return fail(reply, 400, 'INVALID_INPUT', '请输入用户名和密码。');
  }

  const user = getUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    const left = recordLoginFailure(req);
    return fail(reply, 401, 'INVALID_CREDENTIALS', `用户名或密码不正确${left <= 3 ? `，还可以尝试 ${left} 次` : ''}。`);
  }

  clearLoginFailures(req);
  const session = issueSession(user.id);
  setSessionCookie(reply, req, session.token, session.maxAge);
  return { user: { id: user.id, username: user.username } };
});

app.post('/api/auth/logout', async (req, reply) => {
  destroySession(req);
  reply.clearCookie('df_session', { path: '/' });
  return { ok: true };
});

app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => ({
  user: req.user,
}));

app.post('/api/auth/password', { preHandler: requireAuth }, async (req, reply) => {
  const current = String(req.body?.currentPassword || '');
  const next = validatePassword(req.body?.newPassword);
  if (!next.ok) return fail(reply, 400, 'INVALID_PASSWORD', next.message);

  const user = getUserByUsername(req.user.username);
  if (!user || !verifyPassword(current, user.password_hash)) {
    return fail(reply, 400, 'WRONG_PASSWORD', '当前密码不正确。');
  }
  updatePassword(user.id, hashPassword(next.value));
  deleteOtherSessions(user.id, req.session.tokenHash);
  return { ok: true };
});

app.patch('/api/auth/account', { preHandler: requireAuth }, async (req, reply) => {
  const username = validateUsername(req.body?.username);
  if (!username.ok) return fail(reply, 400, 'INVALID_USERNAME', username.message);
  const current = String(req.body?.currentPassword || '');
  const user = getUserByUsername(req.user.username);
  if (!user || !verifyPassword(current, user.password_hash)) {
    return fail(reply, 400, 'WRONG_PASSWORD', '当前密码不正确。');
  }
  if (username.value === user.username) return { user: { id: user.id, username: user.username } };
  try {
    const updated = updateUsername(user.id, username.value);
    return { user: { id: updated.id, username: updated.username } };
  } catch (error) {
    if (String(error?.code || '').includes('CONSTRAINT')) {
      return fail(reply, 409, 'USERNAME_TAKEN', '这个用户名已经被使用了。');
    }
    throw error;
  }
});

/* ------------------------------------------------------------------ */
/* bootstrap                                                           */
/* ------------------------------------------------------------------ */

app.get('/api/bootstrap', { preHandler: requireAuth }, async (req) => ({
  user: req.user,
  ...getBootstrap(),
  system: {
    version: '1.0.0',
    databaseBytes: databaseSize(),
    setupComplete: true,
    icp: { number: ICP_NUMBER, link: ICP_LINK },
  },
}));

/* ------------------------------------------------------------------ */
/* public read-only API                                                */
/* ------------------------------------------------------------------ */

app.get('/api/public/bootstrap', async () => ({
  ...getPublicBootstrap(),
  icp: { number: ICP_NUMBER, link: ICP_LINK },
}));

app.get('/api/public/pages/:id', async (req, reply) => {
  const page = getPublicPage(req.params.id);
  if (!page) return fail(reply, 404, 'NOT_FOUND', '页面不存在或未公开。');
  return {
    page: { ...page, blocks: publicAssetBlocks(page.blocks) },
    breadcrumb: getPublicPageBreadcrumb(page.id),
  };
});

app.get('/api/public/pages/:id/links', async (req, reply) => {
  if (!getPublicPage(req.params.id)) return fail(reply, 404, 'NOT_FOUND', '页面不存在或未公开。');
  return getPublicPageLinks(req.params.id);
});

app.get('/api/public/search', async (req) => {
  const q = String(req.query?.q || '').trim();
  if (!q) return { query: '', results: [] };
  return { query: q, results: searchPublicPages(q, 30) };
});

/* ------------------------------------------------------------------ */
/* modules                                                             */
/* ------------------------------------------------------------------ */

app.post('/api/modules', { preHandler: requireAuth }, async (req, reply) => {
  const body = req.body || {};
  const parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : null;
  if (parentId && !getModule(parentId)) {
    return fail(reply, 404, 'PARENT_NOT_FOUND', '父模块不存在。');
  }
  const module = createModule({
    title: cleanTitle(body.title, '新模块'),
    icon: cleanIcon(body.icon, '🎮'),
    iconUrl: cleanAssetUrl(body.iconUrl),
    accent: cleanAccent(body.accent),
    isPublic: cleanBool(body.isPublic, true),
    parentId,
  });
  return { module };
});

app.patch('/api/modules/:id', { preHandler: requireAuth }, async (req, reply) => {
  if (!getModule(req.params.id)) return fail(reply, 404, 'NOT_FOUND', '模块不存在。');
  const body = req.body || {};
  try {
    const module = updateModule(req.params.id, {
      ...(body.title !== undefined ? { title: cleanTitle(body.title, '新模块') } : {}),
      ...(body.icon !== undefined ? { icon: cleanIcon(body.icon, '🎮') } : {}),
      ...(body.iconUrl !== undefined ? { iconUrl: cleanAssetUrl(body.iconUrl) } : {}),
      ...(body.accent !== undefined ? { accent: cleanAccent(body.accent) } : {}),
      ...(body.isPublic !== undefined ? { isPublic: cleanBool(body.isPublic, true) } : {}),
      ...(body.parentId !== undefined ? { parentId: body.parentId || null } : {}),
    });
    return { module };
  } catch (error) {
    if (error.message === 'MODULE_CYCLE') return fail(reply, 400, 'MODULE_CYCLE', '不能把模块移动到自己的子模块里。');
    if (error.message === 'PARENT_NOT_FOUND') return fail(reply, 404, 'PARENT_NOT_FOUND', '父模块不存在。');
    throw error;
  }
});

app.delete('/api/modules/:id', { preHandler: requireAuth }, async (req, reply) => {
  if (!getModule(req.params.id)) return fail(reply, 404, 'NOT_FOUND', '模块不存在。');
  const ids = moduleSubtreeIds(req.params.id);
  const placeholders = ids.map(() => '?').join(', ');
  const count = db.prepare(`SELECT COUNT(*) AS n FROM pages WHERE module_id IN (${placeholders})`).get(...ids).n;
  deleteModule(req.params.id);
  return { ok: true, deletedPages: count, deletedModules: ids.length };
});

app.post('/api/modules/reorder', { preHandler: requireAuth }, async (req, reply) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    return fail(reply, 400, 'INVALID_INPUT', '排序数据不正确。');
  }
  reorderModules(ids.slice(0, 500));
  return { ok: true, modules: listModules() };
});

/* ------------------------------------------------------------------ */
/* pages                                                               */
/* ------------------------------------------------------------------ */

app.get('/api/pages/:id', { preHandler: requireAuth }, async (req, reply) => {
  const page = getPage(req.params.id);
  if (!page) return fail(reply, 404, 'NOT_FOUND', '页面不存在。');
  return { page, breadcrumb: getPageBreadcrumb(page.id) };
});

app.get('/api/pages/:id/links', { preHandler: requireAuth }, async (req, reply) => {
  if (!getPage(req.params.id)) return fail(reply, 404, 'NOT_FOUND', '页面不存在。');
  return getPageLinks(req.params.id);
});

app.post('/api/pages', { preHandler: requireAuth }, async (req, reply) => {
  const body = req.body || {};
  try {
    const page = createPage({
      moduleId: body.moduleId,
      parentId: body.parentId || null,
      title: cleanTitle(body.title, '未命名页面'),
      icon: cleanIcon(body.icon, '📄'),
    });
    return { page };
  } catch (error) {
    if (String(error.message).includes('PARENT_NOT_FOUND')) {
      return fail(reply, 400, 'PARENT_NOT_FOUND', '上级页面不存在。');
    }
    if (String(error.message).includes('MODULE_NOT_FOUND')) {
      return fail(reply, 400, 'MODULE_NOT_FOUND', '模块不存在。');
    }
    throw error;
  }
});

app.patch('/api/pages/:id', { preHandler: requireAuth }, async (req, reply) => {
  const existing = getPage(req.params.id);
  if (!existing) return fail(reply, 404, 'NOT_FOUND', '页面不存在。');
  const body = req.body || {};
  const page = updatePageMeta(req.params.id, {
    ...(body.title !== undefined ? { title: cleanTitle(body.title, '未命名页面') } : {}),
    ...(body.icon !== undefined ? { icon: cleanIcon(body.icon, '📄') } : {}),
  });
  return { page: stripBlocks(page) };
});

app.put('/api/pages/:id/content', { preHandler: requireAuth }, async (req, reply) => {
  const existing = getPage(req.params.id);
  if (!existing) return fail(reply, 404, 'NOT_FOUND', '页面不存在。');
  const { blocks, searchText } = req.body || {};
  if (!Array.isArray(blocks)) {
    return fail(reply, 400, 'INVALID_BLOCKS', '页面内容格式不正确。');
  }
  const serialized = JSON.stringify(blocks);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BLOCKS_BYTES) {
    return fail(reply, 413, 'CONTENT_TOO_LARGE', '页面内容太大了，请拆分页面。');
  }
  const result = updatePageContent(req.params.id, blocks, typeof searchText === 'string' ? searchText : '');
  return {
    ok: true,
    updatedAt: result.updated_at,
    todoTotal: result.todo_total,
    todoDone: result.todo_done,
  };
});

app.delete('/api/pages/:id', { preHandler: requireAuth }, async (req, reply) => {
  if (!getPage(req.params.id)) return fail(reply, 404, 'NOT_FOUND', '页面不存在。');
  deletePage(req.params.id);
  return { ok: true };
});

app.post('/api/pages/reorder', { preHandler: requireAuth }, async (req, reply) => {
  const { ids, moduleId, parentId = null } = req.body || {};
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string') || typeof moduleId !== 'string') {
    return fail(reply, 400, 'INVALID_INPUT', '排序数据不正确。');
  }
  if (!getModule(moduleId)) return fail(reply, 404, 'NOT_FOUND', '模块不存在。');
  reorderPages(ids.slice(0, 1000), moduleId, parentId || null);
  return { ok: true };
});

app.get('/api/ai/status', { preHandler: requireAuth }, async () => getAIStatus());

app.put('/api/ai/model', { preHandler: requireAuth }, async (req, reply) => {
  try {
    return setAIModel(req.body?.model);
  } catch (error) {
    if (error instanceof AIError) return fail(reply, error.status, error.code, error.message);
    throw error;
  }
});

app.get('/api/ai/conversations', { preHandler: requireAuth }, async () => ({
  conversations: listAIConversations(40),
}));

app.get('/api/ai/conversations/:id', { preHandler: requireAuth }, async (req, reply) => {
  const conversation = getAIConversation(req.params.id);
  if (!conversation) return fail(reply, 404, 'NOT_FOUND', '这段对话不存在。');
  return { conversation, messages: listAIMessages(conversation.id) };
});

app.delete('/api/ai/conversations/:id', { preHandler: requireAuth }, async (req) => ({
  ok: deleteAIConversation(req.params.id),
}));

app.post('/api/ai/chat', { preHandler: requireAuth }, async (req, reply) => {
  const message = String(req.body?.message || '').trim();
  const pageId = typeof req.body?.pageId === 'string' ? req.body.pageId : null;
  const conversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId : null;
  try {
    const result = await chatWithAI({ message, pageId, conversationId });
    return result;
  } catch (error) {
    if (error instanceof AIError) {
      return fail(reply, error.status, error.code, error.message);
    }
    req.log.error(error);
    return fail(reply, 500, 'AI_ERROR', 'AI 助手暂时不可用，请稍后再试。');
  }
});

/* ------------------------------------------------------------------ */
/* settings, search, export                                            */
/* ------------------------------------------------------------------ */

app.put('/api/settings/theme', { preHandler: requireAuth }, async (req, reply) => {
  const theme = req.body?.theme;
  if (!isPlainObject(theme)) return fail(reply, 400, 'INVALID_THEME', '主题格式不正确。');
  if (Buffer.byteLength(JSON.stringify(theme), 'utf8') > 20_000) {
    return fail(reply, 413, 'THEME_TOO_LARGE', '主题设置太大了。');
  }
  setSetting('theme', theme);
  return { theme: getTheme() };
});

app.put('/api/settings/site', { preHandler: requireAuth }, async (req, reply) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const tagline = String(body.tagline || '').trim();
  const logoUrl = String(body.logoUrl || '').trim();
  if (!name || name.length > 40) return fail(reply, 400, 'INVALID_NAME', '站点名称需要 1–40 个字符。');
  if (tagline.length > 100) return fail(reply, 400, 'INVALID_TAGLINE', '站点副标题最多 100 个字符。');
  if (logoUrl && !logoUrl.startsWith('/api/assets/') && !logoUrl.startsWith('/api/public/assets/') && !/^https:\/\//i.test(logoUrl)) {
    return fail(reply, 400, 'INVALID_LOGO', '图标地址不正确。');
  }
  const site = updateSiteSettings({ name, tagline, logoUrl });
  return { site };
});

app.get('/api/search', { preHandler: requireAuth }, async (req) => {
  const q = String(req.query?.q || '').trim();
  if (!q) return { query: '', results: [] };
  return { query: q, results: searchPages(q, 30) };
});

app.get('/api/export', { preHandler: requireAuth }, async (req, reply) => {
  const stamp = new Date().toISOString().slice(0, 10);
  reply.header('Content-Disposition', `attachment; filename="devforge-export-${stamp}.json"`);
  reply.type('application/json; charset=utf-8');
  return exportAll();
});

/* ------------------------------------------------------------------ */
/* uploads                                                             */
/* ------------------------------------------------------------------ */

const ALLOWED_MIME = [
  /^image\/(png|jpeg|webp|gif|avif)$/,
  /^video\/(mp4|webm|quicktime)$/,
  /^audio\/(mpeg|wav|ogg|webm|mp4)$/,
  /^application\/pdf$/,
  /^application\/zip$/,
  /^application\/x-zip-compressed$/,
  /^application\/x-7z-compressed$/,
  /^application\/x-rar-compressed$/,
  /^application\/msword$/,
  /^application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)$/,
  /^application\/vnd\.ms-(excel|powerpoint)$/,
  /^text\/(plain|markdown)$/,
  /^application\/octet-stream$/,
];

const MIME_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.weba',
  'audio/mp4': '.m4a',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/x-7z-compressed': '.7z',
  'application/x-rar-compressed': '.rar',
  'text/plain': '.txt',
  'text/markdown': '.md',
};

const INLINE_MIME = /^(image\/(png|jpeg|webp|gif|avif)|video\/|audio\/|application\/pdf)/;

const safeName = (name) => {
  const base = path.basename(String(name || 'file')).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (base || 'file').slice(0, 180);
};

const extensionFor = (name, mime) => {
  const ext = path.extname(name || '').toLowerCase();
  if (/^\.[a-z0-9]{1,10}$/.test(ext)) return ext;
  return MIME_EXT[mime] || '.bin';
};

app.post('/api/uploads', { preHandler: requireAuth }, async (req, reply) => {
  let part;
  try {
    part = await req.file();
  } catch (error) {
    if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
      return fail(reply, 413, 'FILE_TOO_LARGE', `文件不能超过 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB。`);
    }
    throw error;
  }
  if (!part) return fail(reply, 400, 'NO_FILE', '没有收到文件。');
  if (!ALLOWED_MIME.some((re) => re.test(part.mimetype))) {
    part.file.resume();
    return fail(reply, 415, 'UNSUPPORTED_FILE', '不支持这种文件类型。');
  }

  const id = crypto.randomUUID();
  const originalName = safeName(part.filename);
  const filename = `${id}${extensionFor(originalName, part.mimetype)}`;
  const target = path.join(UPLOAD_DIR, filename);

  try {
    await pipeline(part.file, fs.createWriteStream(target, { flags: 'wx' }));
  } catch (error) {
    try { fs.unlinkSync(target); } catch { /* ignore */ }
    if (error.code === 'FST_REQ_FILE_TOO_LARGE' || part.file.truncated) {
      return fail(reply, 413, 'FILE_TOO_LARGE', `文件不能超过 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB。`);
    }
    throw error;
  }

  if (part.file.truncated) {
    try { fs.unlinkSync(target); } catch { /* ignore */ }
    return fail(reply, 413, 'FILE_TOO_LARGE', `文件不能超过 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB。`);
  }

  const stat = fs.statSync(target);
  if (!stat.size) {
    try { fs.unlinkSync(target); } catch { /* ignore */ }
    return fail(reply, 400, 'EMPTY_FILE', '文件是空的。');
  }

  const asset = createAsset({
    filename,
    originalName,
    mime: part.mimetype,
    size: stat.size,
  });

  return {
    id: asset.id,
    url: `/api/assets/${asset.id}`,
    name: originalName,
    mime: part.mimetype,
    size: stat.size,
  };
});

function sendAsset(req, reply, publicCache = false) {
  const asset = getAsset(req.params.id);
  if (!asset) return fail(reply, 404, 'NOT_FOUND', '文件不存在。');
  const file = path.join(UPLOAD_DIR, asset.filename);
  if (!fs.existsSync(file)) return fail(reply, 404, 'NOT_FOUND', '文件已丢失。');

  const inline = INLINE_MIME.test(asset.mime);
  reply.header('Content-Type', asset.mime);
  reply.header('Content-Length', asset.size);
  reply.header(
    'Cache-Control',
    publicCache ? 'public, max-age=86400' : 'private, max-age=31536000, immutable',
  );
  reply.header(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${asset.original_name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(asset.original_name)}`,
  );
  return reply.send(fs.createReadStream(file));
}

app.get('/api/assets/:id', { preHandler: requireAuth }, async (req, reply) => sendAsset(req, reply, false));
app.get('/api/public/assets/:id', async (req, reply) => sendAsset(req, reply, true));

/* ------------------------------------------------------------------ */
/* static frontend                                                     */
/* ------------------------------------------------------------------ */

const hasDist = fs.existsSync(path.join(DIST_DIR, 'index.html'));

if (hasDist) {
  await app.register(fastifyStatic, {
    root: DIST_DIR,
    prefix: '/',
    index: ['index.html'],
    setHeaders(reply, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        reply.header('Cache-Control', 'no-cache');
      }
    },
  });
}

app.setNotFoundHandler((req, reply) => {
  const url = req.raw.url || '/';
  if (url.startsWith('/api/') || req.method !== 'GET') {
    return fail(reply, 404, 'NOT_FOUND', '接口不存在。');
  }
  const pathname = url.split('?')[0];
  if (path.extname(pathname)) {
    return fail(reply, 404, 'NOT_FOUND', '文件不存在。');
  }
  if (!hasDist) {
    return reply.code(404).send({
      error: 'NOT_BUILT',
      message: '前端尚未构建。开发时请访问 Vite 的 5173 端口，生产环境请先运行 npm run build。',
    });
  }
  return reply.type('text/html').sendFile('index.html');
});

app.setErrorHandler((error, req, reply) => {
  req.log.error({ err: error }, 'request failed');
  if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
    return fail(reply, 413, 'FILE_TOO_LARGE', `文件不能超过 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB。`);
  }
  if (error.statusCode && error.statusCode < 500) {
    return fail(reply, error.statusCode, 'BAD_REQUEST', error.message || '请求格式不正确。');
  }
  return fail(reply, 500, 'SERVER_ERROR', '服务器开小差了，请稍后再试。');
});

/* ------------------------------------------------------------------ */
/* lifecycle                                                           */
/* ------------------------------------------------------------------ */

const start = async () => {
  await app.listen({ port: PORT, host: HOST });
  deleteExpiredSessions();
  const cleanup = setInterval(() => {
    try { deleteExpiredSessions(); } catch (error) { app.log.error(error); }
  }, 60 * 60 * 1000);
  cleanup.unref();

  if (countUsers() === 0) {
    const token = setupToken();
    app.log.info('');
    app.log.info('  DEVFORGE 首次启动，需要初始化管理员账号');
    app.log.info(`  初始化口令: ${token}`);
    app.log.info(`  本机访问: http://127.0.0.1:${PORT}`);
    app.log.info('  口令也会保存在 data/setup-token.txt');
    app.log.info('');
  } else if (NODE_ENV !== 'production') {
    app.log.info(`DEVFORGE 已启动: http://${HOST}:${PORT}`);
  }
};

start().catch((error) => {
  app.log.error(error);
  process.exit(1);
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  app.log.info(`${signal} received, shutting down`);
  try {
    await app.close();
    closeDatabase();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
