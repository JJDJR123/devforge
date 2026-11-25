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
  registrationAllowed,
  recordRegistrationAttempt,
  requireAuth,
  requireUser,
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
  deleteAsset,
  deleteExpiredSessions,
  deleteModule,
  deleteOtherSessions,
  deletePage,
  deleteSessionsForUser,
  deleteUser,
  countAdmins,
  resetUserPassword,
  listUsers,
  updateUserNote,
  setUserStatus,
  approveRegistrationRequest,
  createRegistrationRequest,
  countRegistrationsSince,
  createChatMessage,
  createSuggestion,
  listChatMessages,
  listSuggestions,
  markSuggestionRead,
  replyToSuggestion,
  friendPairKey,
  findFriendshipBetween,
  listFriendData,
  createFriendRequest,
  answerFriendRequest,
  removeFriend,
  blockFriend,
  unblockFriend,
  setFriendNote,
  searchUsers,
  createDmMessage,
  listDmMessages,
  listDmConversations,
  listAdminDmConversations,
  listAdminDmMessages,
  listDmAssetsBefore,
  markDmAttachmentCleared,
  createInviteCodes,
  listInviteCodes,
  consumeInviteCode,
  getRegistrationRequest,
  listRegistrationRequests,
  pendingRegistrationExists,
  rejectRegistrationRequest,
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
  getSiteSettings,
  getMemberKbDoc,
  listMemberKbDocs,
  listPublicPageMeta,
  listPublicModules,
  getUserById,
  getUserByUsername,
  getTheme,
  getSetting,
  listAIConversations,
  listAIMessages,
  listKbDocs,
  getKbDoc,
  createKbDoc,
  updateKbDoc,
  setKbDocStatus,
  deleteKbDoc,
  searchKbPublished,
  kbStats,
  KB_KINDS,
  KB_STATUSES,
  listAssets,
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

const cleanAccent = (value, fallback = '#f16436') => {
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
  if (user.status !== 'active') {
    return fail(reply, 403, 'ACCOUNT_INACTIVE', '这个账号暂时不可用。');
  }

  clearLoginFailures(req);
  const session = issueSession(user.id);
  setSessionCookie(reply, req, session.token, session.maxAge);
  return { user: { id: user.id, username: user.username, role: user.role } };
});

app.post('/api/auth/logout', async (req, reply) => {
  destroySession(req);
  reply.clearCookie('df_session', { path: '/' });
  return { ok: true };
});

/* ------------------------------------------------------------------ */
/* registration requests                                               */
/* ------------------------------------------------------------------ */

app.post('/api/register', async (req, reply) => {
  if (!registrationAllowed(req)) {
    return fail(reply, 429, 'RATE_LIMITED', '提交太频繁，请稍后再试。');
  }
  if (countRegistrationsSince(24) >= 50) {
    return fail(reply, 429, 'REGISTRATION_FULL', '今日申请已满，请明天再试。');
  }
  recordRegistrationAttempt(req);
  const body = req.body || {};
  if (String(body.website || '').trim()) {
    return fail(reply, 400, 'INVALID_REQUEST', '申请信息无效。');
  }
  const username = validateUsername(body.username);
  if (!username.ok) return fail(reply, 400, 'INVALID_USERNAME', username.message);
  const password = validatePassword(body.password);
  if (!password.ok) return fail(reply, 400, 'INVALID_PASSWORD', password.message);
  const reason = String(body.reason || '').trim().slice(0, 500);
  const contact = String(body.contact || '').trim().slice(0, 200);
  const inviteCode = String(body.inviteCode || '').trim();
  if (inviteCode) {
    const consumed = consumeInviteCode({
      code: inviteCode,
      username: username.value,
      passwordHash: hashPassword(password.value),
    });
    if (consumed.error === 'INVALID_CODE') {
      return fail(reply, 400, 'INVALID_INVITE', '邀请码无效、已使用或已隐藏。');
    }
    if (consumed.error === 'USERNAME_TAKEN') {
      return fail(reply, 409, 'USERNAME_TAKEN', '这个用户名已经被使用了。');
    }
    clearLoginFailures(req);
    return {
      ok: true,
      activated: true,
      message: '邀请码已使用，账号已激活，可以直接登录。',
      user: consumed.user,
    };
  }

  if (getUserByUsername(username.value) || pendingRegistrationExists(username.value)) {
    return fail(reply, 409, 'USERNAME_UNAVAILABLE', '这个用户名已经有账号或正在审批，请换一个。');
  }

  let request;
  try {
    request = createRegistrationRequest({
      username: username.value,
      passwordHash: hashPassword(password.value),
      reason,
      contact,
      ip: String(req.ip || req.socket?.remoteAddress || '').slice(0, 64),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
    });
  } catch (error) {
    req.log.error(error);
    return fail(reply, 500, 'REGISTER_FAILED', '申请提交失败，请稍后再试。');
  }
  req.log.info({ username: request.username, requestId: request.id }, 'registration requested');
  return { ok: true, message: '申请已提交，管理员审批通过后即可使用该用户名和密码登录。' };
});

app.get('/api/admin/registrations', { preHandler: requireAuth }, async (req) => {
  const status = String(req.query?.status || 'pending');
  const requests = listRegistrationRequests(status === 'all' ? '' : status);
  return { requests };
});

app.get('/api/admin/users', { preHandler: requireAuth }, async () => ({ users: listUsers() }));

app.patch('/api/admin/users/:id', { preHandler: requireAuth }, async (req, reply) => {
  const existing = getUserById(req.params.id);
  if (!existing) return fail(reply, 404, 'NOT_FOUND', '账号不存在。');
  const body = req.body || {};
  let user = existing;
  if (body.note !== undefined) {
    user = updateUserNote(existing.id, String(body.note || ''));
  }
  if (body.status !== undefined) {
    if (existing.id === req.user.id) {
      return fail(reply, 400, 'SELF_STATUS', '不能停用当前登录的管理员账号。');
    }
    const status = body.status === 'suspended' ? 'suspended' : 'active';
    user = setUserStatus(existing.id, status);
    if (status === 'suspended') deleteSessionsForUser(existing.id);
  }
  return { user };
});

app.post('/api/admin/users/:id/reset-password', { preHandler: requireAuth }, async (req, reply) => {
  const user = getUserById(req.params.id);
  if (!user) return fail(reply, 404, 'NOT_FOUND', '账号不存在。');
  if (user.id === req.user.id) {
    return fail(reply, 400, 'SELF_PASSWORD', '请在设置里修改自己的密码。');
  }
  const temporaryPassword = crypto.randomBytes(9).toString('base64url');
  resetUserPassword(user.id, hashPassword(temporaryPassword));
  return { ok: true, temporaryPassword, user: getUserById(user.id) };
});

app.delete('/api/admin/users/:id', { preHandler: requireAuth }, async (req, reply) => {
  const user = getUserById(req.params.id);
  if (!user) return fail(reply, 404, 'NOT_FOUND', '账号不存在。');
  if (user.id === req.user.id) {
    return fail(reply, 400, 'SELF_DELETE', '不能删除当前登录的管理员账号。');
  }
  if (user.role === 'admin' && countAdmins() <= 1) {
    return fail(reply, 400, 'LAST_ADMIN', '不能删除最后一个管理员。');
  }
  deleteUser(user.id);
  return { ok: true };
});

app.post('/api/admin/users/batch', { preHandler: requireAuth }, async (req, reply) => {
  const action = String(req.body?.action || '');
  if (!['suspend', 'activate', 'delete'].includes(action)) {
    return fail(reply, 400, 'INVALID_ACTION', '不支持的批量操作。');
  }
  const ids = Array.isArray(req.body?.ids)
    ? [...new Set(req.body.ids.map((id) => String(id)).filter(Boolean))].slice(0, 100)
    : [];
  if (!ids.length) return fail(reply, 400, 'NO_IDS', '没有选择账号。');
  const updated = [];
  const skipped = [];
  for (const id of ids) {
    const user = getUserById(id);
    if (!user) { skipped.push({ id, reason: 'NOT_FOUND' }); continue; }
    if (user.id === req.user.id) { skipped.push({ id, reason: 'SELF' }); continue; }
    if (action === 'delete') {
      if (user.role === 'admin' && countAdmins() <= 1) {
        skipped.push({ id, reason: 'LAST_ADMIN' });
        continue;
      }
      deleteUser(id);
      updated.push(id);
    } else {
      const status = action === 'suspend' ? 'suspended' : 'active';
      setUserStatus(id, status);
      if (status === 'suspended') deleteSessionsForUser(id);
      updated.push(id);
    }
  }
  return { updated, skipped };
});

app.post('/api/admin/registrations/:id/approve', { preHandler: requireAuth }, async (req, reply) => {
  const result = approveRegistrationRequest(req.params.id);
  if (result.error === 'NOT_FOUND') return fail(reply, 404, 'NOT_FOUND', '申请不存在。');
  if (result.error === 'ALREADY_REVIEWED') return fail(reply, 409, 'ALREADY_REVIEWED', '这条申请已经处理过了。');
  if (result.error === 'USERNAME_TAKEN') return fail(reply, 409, 'USERNAME_TAKEN', '用户名已经被占用，无法通过。');
  req.log.info({ username: result.user.username, requestId: req.params.id }, 'registration approved');
  return { ok: true, user: result.user };
});

app.post('/api/admin/registrations/:id/reject', { preHandler: requireAuth }, async (req, reply) => {
  const ok = rejectRegistrationRequest(req.params.id);
  if (!ok) return fail(reply, 404, 'NOT_FOUND', '申请不存在或已经处理过了。');
  return { ok: true };
});

app.get('/api/admin/invites', { preHandler: requireAuth }, async () => ({ codes: listInviteCodes() }));

app.post('/api/admin/invites', { preHandler: requireAuth }, async (req) => {
  const count = Math.min(50, Math.max(1, Number(req.body?.count) || 10));
  return { codes: createInviteCodes(count, req.user.username) };
});

/* ------------------------------------------------------------------ */
/* chat + mailbox                                                      */
/* ------------------------------------------------------------------ */

const chatRate = new Map();
const suggestionRate = new Map();
const dmRate = new Map();

function rateAllowed(map, key, max, windowMs) {
  const now = Date.now();
  const current = map.get(key);
  if (!current || current.resetAt <= now) {
    map.set(key, { count: 0, resetAt: now + windowMs });
    return true;
  }
  return current.count < max;
}

function recordRate(map, key) {
  const current = map.get(key);
  if (current) current.count += 1;
}

setInterval(() => {
  const now = Date.now();
  for (const map of [chatRate, suggestionRate, dmRate]) {
    for (const [key, value] of map) if (value.resetAt <= now) map.delete(key);
  }
}, 60_000).unref();

app.get('/api/chat/messages', { preHandler: requireUser }, async (req) => {
  const messages = listChatMessages(200);
  if (req.user.role === 'admin') {
    const notes = new Map(
      db.prepare("SELECT id, note FROM users WHERE note <> ''").all().map((row) => [row.id, row.note]),
    );
    for (const message of messages) message.note = notes.get(message.userId) || '';
  }
  return { messages };
});

app.post('/api/chat/messages', { preHandler: requireUser }, async (req, reply) => {
  if (!rateAllowed(chatRate, req.user.id, 10, 60_000)) {
    return fail(reply, 429, 'RATE_LIMITED', '发言太快，请稍后再试。');
  }
  const body = String(req.body?.body || '').trim();
  if (!body) return fail(reply, 400, 'EMPTY_MESSAGE', '消息不能为空。');
  if (body.length > 1000) return fail(reply, 400, 'MESSAGE_TOO_LONG', '消息不能超过 1000 字。');
  recordRate(chatRate, req.user.id);
  const message = createChatMessage({
    userId: req.user.id,
    username: req.user.username,
    role: req.user.role,
    body,
  });
  return { message };
});

app.get('/api/mailbox/mine', { preHandler: requireUser }, async (req) => ({
  messages: listSuggestions({ userId: req.user.id, limit: 100 }),
}));

app.post('/api/mailbox', { preHandler: requireUser }, async (req, reply) => {
  if (!rateAllowed(suggestionRate, req.user.id, 5, 60 * 60 * 1000)) {
    return fail(reply, 429, 'RATE_LIMITED', '发送太频繁，请稍后再试。');
  }
  const body = String(req.body?.body || '').trim();
  if (!body) return fail(reply, 400, 'EMPTY_MESSAGE', '建议内容不能为空。');
  if (body.length > 3000) return fail(reply, 400, 'MESSAGE_TOO_LONG', '建议不能超过 3000 字。');
  recordRate(suggestionRate, req.user.id);
  return {
    message: createSuggestion({ userId: req.user.id, username: req.user.username, body }),
  };
});

app.get('/api/admin/mailbox', { preHandler: requireAuth }, async (req) => ({
  messages: listSuggestions({ status: String(req.query?.status || '') }),
}));

app.post('/api/admin/mailbox/:id/read', { preHandler: requireAuth }, async (req, reply) => {
  const ok = markSuggestionRead(req.params.id);
  if (!ok) return fail(reply, 404, 'NOT_FOUND', '消息不存在或已经读过。');
  return { ok: true };
});

app.post('/api/admin/mailbox/:id/reply', { preHandler: requireAuth }, async (req, reply) => {
  const body = String(req.body?.body || '').trim();
  if (!body) return fail(reply, 400, 'EMPTY_REPLY', '回复内容不能为空。');
  if (body.length > 3000) return fail(reply, 400, 'REPLY_TOO_LONG', '回复不能超过 3000 字。');
  const message = replyToSuggestion(req.params.id, { reply: body, repliedBy: req.user.username });
  if (!message) return fail(reply, 404, 'NOT_FOUND', '消息不存在。');
  return { message };
});

/* ------------------------------------------------------------------ */
/* friends + direct messages                                           */
/* ------------------------------------------------------------------ */

function friendTarget(value) {
  const target = getUserById(String(value || ''));
  return target && target.status === 'active' ? target : null;
}

app.get('/api/friends', { preHandler: requireUser }, async (req) => listFriendData(req.user.id));

app.get('/api/friends/search', { preHandler: requireUser }, async (req) => ({
  users: searchUsers(req.user.id, String(req.query?.q || '')),
}));

app.post('/api/friends/requests', { preHandler: requireUser }, async (req, reply) => {
  const target = friendTarget(req.body?.userId);
  if (!target) return fail(reply, 404, 'NOT_FOUND', '找不到这个成员。');
  if (target.id === req.user.id) return fail(reply, 400, 'SELF', '不能加自己为好友。');
  const result = createFriendRequest(req.user.id, target.id);
  if (result.error === 'ALREADY_FRIENDS') return fail(reply, 409, 'ALREADY_FRIENDS', '你们已经是好友了。');
  if (result.error === 'BLOCKED') return fail(reply, 403, 'BLOCKED', '当前关系已被拉黑。');
  if (result.error === 'ALREADY_PENDING') return fail(reply, 409, 'ALREADY_PENDING', '已经发过好友申请了。');
  return { friendship: result.friendship, autoAccepted: Boolean(result.autoAccepted) };
});

app.post('/api/friends/requests/:id/accept', { preHandler: requireUser }, async (req, reply) => {
  const row = answerFriendRequest(req.params.id, req.user.id, true);
  if (!row) return fail(reply, 404, 'NOT_FOUND', '申请不存在或已经处理过了。');
  return { ok: true };
});

app.post('/api/friends/requests/:id/reject', { preHandler: requireUser }, async (req, reply) => {
  const row = answerFriendRequest(req.params.id, req.user.id, false);
  if (!row) return fail(reply, 404, 'NOT_FOUND', '申请不存在或已经处理过了。');
  return { ok: true };
});

app.delete('/api/friends/:userId', { preHandler: requireUser }, async (req, reply) => {
  if (!removeFriend(req.user.id, req.params.userId)) {
    return fail(reply, 404, 'NOT_FOUND', '好友关系不存在。');
  }
  return { ok: true };
});

app.post('/api/friends/:userId/block', { preHandler: requireUser }, async (req, reply) => {
  const target = friendTarget(req.params.userId);
  if (!target || target.id === req.user.id) return fail(reply, 404, 'NOT_FOUND', '找不到这个成员。');
  blockFriend(req.user.id, target.id);
  return { ok: true };
});

app.post('/api/friends/:userId/unblock', { preHandler: requireUser }, async (req, reply) => {
  if (!unblockFriend(req.user.id, req.params.userId)) {
    return fail(reply, 404, 'NOT_FOUND', '没有可解除的拉黑关系。');
  }
  return { ok: true };
});

app.patch('/api/friends/:userId/note', { preHandler: requireUser }, async (req, reply) => {
  const friendship = findFriendshipBetween(req.user.id, req.params.userId);
  if (!friendship || friendship.status !== 'accepted') {
    return fail(reply, 403, 'NOT_FRIENDS', '只有好友可以设置备注。');
  }
  const note = setFriendNote(req.user.id, req.params.userId, String(req.body?.note || ''));
  return { note };
});

app.get('/api/dm/conversations', { preHandler: requireUser }, async (req) => ({
  conversations: listDmConversations(req.user.id),
}));

app.get('/api/dm/conversations/:userId', { preHandler: requireUser }, async (req, reply) => {
  const other = friendTarget(req.params.userId);
  if (!other) return fail(reply, 404, 'NOT_FOUND', '找不到这个成员。');
  const friendship = findFriendshipBetween(req.user.id, other.id);
  if (!friendship || friendship.status !== 'accepted') {
    return fail(reply, 403, 'NOT_FRIENDS', '只有好友之间可以查看私聊。');
  }
  return {
    user: { id: other.id, username: other.username, role: other.role },
    messages: listDmMessages(req.user.id, other.id),
  };
});

app.post('/api/dm/messages', { preHandler: requireUser }, async (req, reply) => {
  if (!rateAllowed(dmRate, req.user.id, 20, 60_000)) {
    return fail(reply, 429, 'RATE_LIMITED', '发送太快，请稍后再试。');
  }
  const to = friendTarget(req.body?.toUserId);
  if (!to) return fail(reply, 404, 'NOT_FOUND', '找不到这个成员。');
  const friendship = findFriendshipBetween(req.user.id, to.id);
  if (!friendship || friendship.status !== 'accepted') {
    return fail(reply, 403, 'NOT_FRIENDS', '只有好友之间可以私聊。');
  }
  const body = String(req.body?.body || '').trim();
  let attachment = null;
  if (req.body?.attachmentId) {
    const asset = getAsset(String(req.body.attachmentId));
    if (!asset || asset.purpose !== 'dm' || asset.owner_id !== req.user.id) {
      return fail(reply, 400, 'INVALID_ATTACHMENT', '图片无效，请重新上传。');
    }
    attachment = {
      id: asset.id,
      name: asset.original_name,
      mime: asset.mime,
      size: asset.size,
    };
  }
  if (!body && !attachment) return fail(reply, 400, 'EMPTY_MESSAGE', '消息不能为空。');
  if (body.length > 2000) return fail(reply, 400, 'MESSAGE_TOO_LONG', '消息不能超过 2000 字。');
  recordRate(dmRate, req.user.id);
  return { message: createDmMessage({ senderId: req.user.id, recipientId: to.id, body, attachment }) };
});

app.get('/api/dm/attachments/:id', { preHandler: requireUser }, async (req, reply) => {
  const asset = getAsset(req.params.id);
  if (!asset || asset.purpose !== 'dm') return fail(reply, 404, 'NOT_FOUND', '图片不存在。');
  const allowed = req.user.role === 'admin'
    || asset.owner_id === req.user.id
    || Boolean(db.prepare('SELECT 1 FROM direct_messages WHERE attachment_id = ? AND (sender_id = ? OR recipient_id = ?) LIMIT 1').get(asset.id, req.user.id, req.user.id));
  if (!allowed) return fail(reply, 403, 'FORBIDDEN', '没有权限查看这张图片。');
  const file = path.join(UPLOAD_DIR, asset.filename);
  if (!fs.existsSync(file)) return fail(reply, 404, 'NOT_FOUND', '图片已被清理。');
  return reply.type(asset.mime).header('Cache-Control', 'private, max-age=86400').send(fs.createReadStream(file));
});

const MAX_DM_UPLOAD_BYTES = 10 * 1024 * 1024;

app.post('/api/dm/upload', { preHandler: requireUser }, async (req, reply) => {
  let part;
  try {
    part = await req.file();
  } catch (error) {
    if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
      return fail(reply, 413, 'FILE_TOO_LARGE', '图片不能超过 10MB。');
    }
    throw error;
  }
  if (!part) return fail(reply, 400, 'NO_FILE', '没有收到图片。');
  if (!/^image\//.test(part.mimetype) || !ALLOWED_MIME.some((re) => re.test(part.mimetype))) {
    part.file.resume();
    return fail(reply, 415, 'UNSUPPORTED_FILE', '只支持图片文件。');
  }
  const id = crypto.randomUUID();
  const originalName = safeName(part.filename);
  const filename = `${id}${extensionFor(originalName, part.mimetype)}`;
  const target = path.join(UPLOAD_DIR, filename);
  let size = 0;
  try {
    await pipeline(part.file, fs.createWriteStream(target, { flags: 'wx' }));
    size = fs.statSync(target).size;
    if (size > MAX_DM_UPLOAD_BYTES) {
      try { fs.unlinkSync(target); } catch { /* ignore */ }
      return fail(reply, 413, 'FILE_TOO_LARGE', '图片不能超过 10MB。');
    }
  } catch (error) {
    try { fs.unlinkSync(target); } catch { /* ignore */ }
    if (error.code === 'FST_REQ_FILE_TOO_LARGE' || part.file.truncated) {
      return fail(reply, 413, 'FILE_TOO_LARGE', '图片不能超过 10MB。');
    }
    throw error;
  }
  if (!size) {
    try { fs.unlinkSync(target); } catch { /* ignore */ }
    return fail(reply, 400, 'EMPTY_FILE', '图片是空的。');
  }
  const asset = createAsset({
    filename,
    originalName,
    mime: part.mimetype,
    size,
    purpose: 'dm',
    ownerId: req.user.id,
  });
  return {
    id: asset.id,
    url: `/api/dm/attachments/${asset.id}`,
    name: originalName,
    mime: asset.mime,
    size: asset.size,
  };
});

app.get('/api/admin/dm/conversations', { preHandler: requireAuth }, async () => ({
  conversations: listAdminDmConversations(),
}));

app.get('/api/admin/dm/messages', { preHandler: requireAuth }, async (req, reply) => {
  const key = String(req.query?.key || '');
  if (!/^[0-9a-f-]{36}\|[0-9a-f-]{36}$/i.test(key)) {
    return fail(reply, 400, 'INVALID_KEY', '会话参数不正确。');
  }
  return { messages: listAdminDmMessages(key) };
});

function cleanupDmAttachments() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  for (const asset of listDmAssetsBefore(cutoff)) {
    markDmAttachmentCleared(asset.id);
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, asset.filename));
    } catch { /* ignore missing file */ }
    deleteAsset(asset.id);
  }
}

cleanupDmAttachments();
setInterval(cleanupDmAttachments, 6 * 60 * 60 * 1000).unref();

app.get('/api/auth/me', { preHandler: requireUser }, async (req) => ({
  user: req.user,
}));

app.post('/api/auth/password', { preHandler: requireUser }, async (req, reply) => {
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

app.patch('/api/auth/account', { preHandler: requireUser }, async (req, reply) => {
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
/* member read-only portal                                             */
/* ------------------------------------------------------------------ */

app.get('/api/member/kb', { preHandler: requireUser }, async (req) => ({
  docs: listMemberKbDocs({
    q: String(req.query?.q || '').trim(),
    kind: String(req.query?.kind || ''),
    limit: 300,
  }),
}));

app.get('/api/member/kb/:id', { preHandler: requireUser }, async (req, reply) => {
  const doc = getMemberKbDoc(req.params.id);
  if (!doc) return fail(reply, 404, 'NOT_FOUND', '条目不存在或未对成员开放。');
  return { doc };
});

app.get('/api/member/assets', { preHandler: requireUser }, async () => {
  const publicPages = new Map(listPublicPageMeta().map((page) => [page.id, page.title]));
  const assetMap = new Map();
  if (publicPages.size) {
    const rows = db.prepare('SELECT id, title, blocks FROM pages').all();
    const pattern = /\/api\/(?:public\/)?assets\/([0-9a-f-]{36})/gi;
    for (const row of rows) {
      if (!publicPages.has(row.id)) continue;
      let blocks = [];
      try { blocks = JSON.parse(row.blocks || '[]'); } catch { blocks = []; }
      for (const match of JSON.stringify(blocks).matchAll(pattern)) {
        assetMap.set(match[1], publicPages.get(row.id));
      }
    }
  }
  const assets = listAssets(1000)
    .filter((asset) => assetMap.has(asset.id) && String(asset.mime).startsWith('image/'))
    .map((asset) => ({
      id: asset.id,
      url: `/api/public/assets/${asset.id}`,
      name: asset.original_name,
      mime: asset.mime,
      size: asset.size,
      pageTitle: assetMap.get(asset.id),
      createdAt: asset.created_at,
    }));
  return { assets };
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

/* ------------------------------------------------------------------ */
/* AI 知识库                                                            */
/* ------------------------------------------------------------------ */

const KB_TOKEN_KEY = 'kbToken';

function kbToken() {
  const existing = getSetting(KB_TOKEN_KEY, null);
  if (existing) return String(existing);
  const token = crypto.randomBytes(24).toString('base64url');
  setSetting(KB_TOKEN_KEY, token);
  return token;
}

/** 管理员会话，或者带了知识库 token 的机器调用（给 Codex MCP 用） */
async function requireKbAccess(req, reply) {
  const header = String(req.headers.authorization || '');
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (bearer && bearer === kbToken()) return;
  const session = resolveSession(req);
  if (!session) {
    return fail(reply, 401, 'UNAUTHORIZED', '需要管理员会话或知识库 token。');
  }
  req.session = session;
  req.user = session.user;
}

app.get('/api/kb/stats', { preHandler: requireAuth }, async () => ({ stats: kbStats() }));

app.get('/api/kb', { preHandler: requireAuth }, async (req) => ({
  docs: listKbDocs({
    status: String(req.query?.status || ''),
    kind: String(req.query?.kind || ''),
    q: String(req.query?.q || ''),
    limit: Number(req.query?.limit) || 200,
  }),
  stats: kbStats(),
  kinds: KB_KINDS,
  statuses: KB_STATUSES,
}));

app.get('/api/kb/token', { preHandler: requireAuth }, async () => ({ token: kbToken() }));

app.post('/api/kb/token', { preHandler: requireAuth }, async () => {
  const token = crypto.randomBytes(24).toString('base64url');
  setSetting(KB_TOKEN_KEY, token);
  return { token };
});

app.get('/api/kb/search', { preHandler: requireKbAccess }, async (req) => {
  const q = String(req.query?.q || '').trim();
  const limit = Number(req.query?.limit) || 8;
  return {
    query: q,
    results: searchKbPublished(q, { kind: String(req.query?.kind || ''), limit }),
  };
});

app.post('/api/kb/propose', { preHandler: requireKbAccess }, async (req, reply) => {
  const body = req.body || {};
  if (!String(body.title || '').trim()) {
    return fail(reply, 400, 'TITLE_REQUIRED', 'title 不能为空。');
  }
  const doc = createKbDoc({
    title: body.title,
    kind: body.kind || 'recipe',
    status: 'draft',
    summary: body.summary || '',
    bodyMd: body.body ?? body.bodyMd ?? '',
    tool: body.tool || '',
    prompt: body.prompt || '',
    tags: body.tags || [],
    source: body.source || 'agent',
    sourceRef: body.sourceRef || '',
  });
  return { doc };
});

app.get('/api/kb/:id', { preHandler: requireAuth }, async (req, reply) => {
  const doc = getKbDoc(req.params.id);
  if (!doc) return fail(reply, 404, 'NOT_FOUND', '条目不存在。');
  return { doc };
});

app.post('/api/kb', { preHandler: requireAuth }, async (req) => {
  const body = req.body || {};
  const doc = createKbDoc({
    title: body.title,
    kind: body.kind || 'recipe',
    status: body.status || 'draft',
    visibility: body.visibility || 'admin',
    summary: body.summary || '',
    bodyMd: body.bodyMd ?? body.body ?? '',
    tool: body.tool || '',
    prompt: body.prompt || '',
    tags: body.tags || [],
    source: body.source || 'manual',
    sourceRef: body.sourceRef || '',
  });
  return { doc };
});

app.patch('/api/kb/:id', { preHandler: requireAuth }, async (req, reply) => {
  const existing = getKbDoc(req.params.id);
  if (!existing) return fail(reply, 404, 'NOT_FOUND', '条目不存在。');
  const body = req.body || {};
  const doc = updateKbDoc(req.params.id, {
    title: body.title,
    kind: body.kind,
    status: body.status,
    visibility: body.visibility,
    summary: body.summary,
    bodyMd: body.bodyMd ?? body.body,
    tool: body.tool,
    prompt: body.prompt,
    tags: body.tags,
    source: body.source,
    sourceRef: body.sourceRef,
  });
  return { doc };
});

app.post('/api/kb/:id/status', { preHandler: requireAuth }, async (req, reply) => {
  const existing = getKbDoc(req.params.id);
  if (!existing) return fail(reply, 404, 'NOT_FOUND', '条目不存在。');
  const status = String(req.body?.status || '');
  if (!KB_STATUSES.includes(status)) return fail(reply, 400, 'BAD_STATUS', '状态不合法。');
  return { doc: setKbDocStatus(req.params.id, status) };
});

app.delete('/api/kb/:id', { preHandler: requireAuth }, async (req, reply) => {
  if (!deleteKbDoc(req.params.id)) return fail(reply, 404, 'NOT_FOUND', '条目不存在。');
  return { ok: true };
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

  const rawPurpose = String(req.query?.purpose || 'note');
  const purpose = ['note', 'module_icon', 'site_logo'].includes(rawPurpose) ? rawPurpose : 'note';
  const asset = createAsset({
    filename,
    originalName,
    mime: part.mimetype,
    size: stat.size,
    purpose,
  });

  return {
    id: asset.id,
    url: `/api/assets/${asset.id}`,
    name: originalName,
    mime: part.mimetype,
    size: stat.size,
    purpose: asset.purpose,
  };
});

function assetIdFromUrl(value) {
  const match = String(value || '').match(/\/api\/(?:public\/)?assets\/([0-9a-f-]{36})/i);
  return match ? match[1] : '';
}

function publicAssetIds() {
  const ids = new Set();
  const addUrl = (value) => {
    const id = assetIdFromUrl(value);
    if (id) ids.add(id);
  };
  addUrl(getSiteSettings().logoUrl);
  for (const module of listPublicModules()) addUrl(module.iconUrl);
  const publicPages = new Set(listPublicPageMeta().map((page) => page.id));
  if (publicPages.size) {
    const rows = db.prepare('SELECT id, blocks FROM pages').all();
    const pattern = /\/api\/(?:public\/)?assets\/([0-9a-f-]{36})/gi;
    for (const row of rows) {
      if (!publicPages.has(row.id)) continue;
      for (const match of String(row.blocks || '').matchAll(pattern)) ids.add(match[1]);
    }
  }
  return ids;
}

function collectAssetUsage() {
  const usage = new Map();
  const addUsage = (assetId, kind, label) => {
    if (!assetId) return;
    const entry = usage.get(assetId) || { site: false, modules: [], pages: [] };
    if (kind === 'site') entry.site = true;
    if (kind === 'module' && !entry.modules.includes(String(label))) entry.modules.push(String(label));
    if (kind === 'page' && !entry.pages.includes(String(label))) entry.pages.push(String(label));
    usage.set(assetId, entry);
  };

  addUsage(assetIdFromUrl(getSiteSettings().logoUrl), 'site');
  for (const module of listModules()) {
    addUsage(assetIdFromUrl(module.iconUrl), 'module', module.title);
  }
  const pageRows = db.prepare('SELECT id, title, blocks FROM pages').all();
  const assetPattern = /\/api\/(?:public\/)?assets\/([0-9a-f-]{36})/gi;
  for (const row of pageRows) {
    let blocks = [];
    try { blocks = JSON.parse(row.blocks || '[]'); } catch { blocks = []; }
    const raw = JSON.stringify(blocks);
    for (const match of raw.matchAll(assetPattern)) {
      addUsage(match[1], 'page', row.title);
    }
  }
  return usage;
}

function assetCategory(usedBy) {
  if (usedBy.site) return 'site_logo';
  if (usedBy.modules.length) return 'module_icon';
  if (usedBy.pages.length) return 'note';
  return 'orphan';
}

app.get('/api/assets', { preHandler: requireAuth }, async () => {
  const usage = collectAssetUsage();
  const assets = listAssets(1000)
    .filter((asset) => asset.purpose !== 'dm')
    .map((asset) => {
      const usedBy = usage.get(asset.id) || { site: false, modules: [], pages: [] };
      return {
        id: asset.id,
        url: `/api/assets/${asset.id}`,
        name: asset.original_name,
        mime: asset.mime,
        size: asset.size,
        purpose: asset.purpose || 'unknown',
        category: assetCategory(usedBy),
        usedBy,
        createdAt: asset.created_at,
      };
    });

  return {
    assets,
    counts: assets.reduce((result, asset) => {
      result[asset.category] = (result[asset.category] || 0) + 1;
      return result;
    }, {}),
  };
});

app.post('/api/assets/delete', { preHandler: requireAuth }, async (req, reply) => {
  const ids = Array.isArray(req.body?.ids)
    ? [...new Set(req.body.ids.map((id) => String(id)).filter(Boolean))].slice(0, 500)
    : [];
  if (!ids.length) return fail(reply, 400, 'NO_IDS', '没有选择要删除的文件。');
  const usage = collectAssetUsage();
  const deleted = [];
  const skipped = [];
  for (const id of ids) {
    const asset = getAsset(id);
    if (!asset) {
      skipped.push({ id, reason: 'NOT_FOUND' });
      continue;
    }
    if (asset.purpose === 'dm') {
      skipped.push({ id, reason: 'PRIVATE_CHAT', usedBy: { site: false, modules: [], pages: [] } });
      continue;
    }
    const usedBy = usage.get(id) || { site: false, modules: [], pages: [] };
    if (usedBy.site || usedBy.modules.length || usedBy.pages.length) {
      skipped.push({ id, reason: 'IN_USE', usedBy });
      continue;
    }
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, asset.filename));
    } catch {
      // 文件已丢失时仍然清理数据库记录。
    }
    deleteAsset(id);
    deleted.push(id);
  }
  return { deleted, skipped };
});

function sendAsset(req, reply, publicCache = false) {
  const asset = getAsset(req.params.id);
  if (!asset) return fail(reply, 404, 'NOT_FOUND', '文件不存在。');
  if (publicCache && !publicAssetIds().has(asset.id)) {
    return fail(reply, 404, 'NOT_FOUND', '文件不存在。');
  }
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
