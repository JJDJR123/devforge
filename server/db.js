import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, DEFAULT_THEME } from './config.js';

const dbPath = path.join(DATA_DIR, 'devforge.db');
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = NORMAL;
`);

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

function migrate() {
  let version = db.prepare('PRAGMA user_version').get().user_version;

  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '🎮',
        accent TEXT NOT NULL DEFAULT '#c8f76a',
        is_public INTEGER NOT NULL DEFAULT 1,
        sort_order REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '📄',
        sort_order REAL NOT NULL DEFAULT 0,
        blocks TEXT NOT NULL DEFAULT '[]',
        search_text TEXT NOT NULL DEFAULT '',
        todo_total INTEGER NOT NULL DEFAULT 0,
        todo_done INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pages_module ON pages(module_id, parent_id, sort_order);
      CREATE INDEX IF NOT EXISTS idx_pages_updated ON pages(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

      PRAGMA user_version = 1;
    `);
    version = 1;
  }

  if (version < 2) {
    const columns = db.prepare('PRAGMA table_info(pages)').all().map((column) => column.name);
    if (!columns.includes('todo_total')) {
      db.exec('ALTER TABLE pages ADD COLUMN todo_total INTEGER NOT NULL DEFAULT 0');
    }
    if (!columns.includes('todo_done')) {
      db.exec('ALTER TABLE pages ADD COLUMN todo_done INTEGER NOT NULL DEFAULT 0');
    }

    const rows = db.prepare('SELECT id, blocks FROM pages').all();
    const update = db.prepare('UPDATE pages SET todo_total = ?, todo_done = ? WHERE id = ?');
    db.exec('BEGIN');
    try {
      for (const row of rows) {
        let blocks = [];
        try { blocks = JSON.parse(row.blocks); } catch { blocks = []; }
        const counts = countTodoBlocks(blocks);
        update.run(counts.total, counts.done, row.id);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    db.exec('PRAGMA user_version = 2');
  }

  if (version < 3) {
    const moduleColumns = db.prepare('PRAGMA table_info(modules)').all().map((column) => column.name);
    if (!moduleColumns.includes('is_public')) {
      db.exec('ALTER TABLE modules ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1');
    }
    // Upgrading from the private-only version must not publish existing notes by surprise.
    db.exec('UPDATE modules SET is_public = 0');
    db.exec('PRAGMA user_version = 3');
    version = 3;
  }

  if (version < 4) {
    const moduleColumns = db.prepare('PRAGMA table_info(modules)').all().map((column) => column.name);
    if (!moduleColumns.includes('parent_id')) {
      // No FK here: the column is added to an existing table, and deletes are
      // handled explicitly so they work on every SQLite build.
      db.exec('ALTER TABLE modules ADD COLUMN parent_id TEXT');
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_modules_parent ON modules(parent_id, sort_order)');
    db.exec('PRAGMA user_version = 4');
    version = 4;
  }

  if (version < 5) {
    const moduleColumns = db.prepare('PRAGMA table_info(modules)').all().map((column) => column.name);
    if (!moduleColumns.includes('icon_url')) {
      db.exec("ALTER TABLE modules ADD COLUMN icon_url TEXT NOT NULL DEFAULT ''");
    }
    db.exec('PRAGMA user_version = 5');
    version = 5;
  }

  if (version < 6) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        page_id TEXT,
        summary TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        sources TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated ON ai_conversations(updated_at DESC);
      PRAGMA user_version = 6;
    `);
    version = 6;
  }

  if (version < 7) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS page_links (
        id TEXT PRIMARY KEY,
        source_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        target_page_id TEXT REFERENCES pages(id) ON DELETE SET NULL,
        target_title TEXT NOT NULL,
        alias TEXT,
        context TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_page_links_source ON page_links(source_page_id);
      CREATE INDEX IF NOT EXISTS idx_page_links_target ON page_links(target_page_id);
      CREATE INDEX IF NOT EXISTS idx_page_links_target_title ON page_links(target_title COLLATE NOCASE);
      PRAGMA user_version = 7;
    `);
    version = 7;
  }

  if (version < 8) {
    const linkColumns = db.prepare('PRAGMA table_info(page_links)').all().map((column) => column.name);
    if (!linkColumns.includes('target_module_id')) {
      db.exec('ALTER TABLE page_links ADD COLUMN target_module_id TEXT REFERENCES modules(id) ON DELETE SET NULL');
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_page_links_module ON page_links(target_module_id);
      PRAGMA user_version = 8;
    `);
  }

  const stamp = now();
  db.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('theme', JSON.stringify(DEFAULT_THEME), stamp);
}

migrate();

/* ------------------------------------------------------------------ */
/* users & sessions                                                    */
/* ------------------------------------------------------------------ */

export function countUsers() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

export function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) || null;
}

export function getUserById(id) {
  return db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(id) || null;
}

export function createUser({ username, passwordHash }) {
  const id = uid();
  db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(id, username, passwordHash, now());
  return getUserById(id);
}

export function updatePassword(userId, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
}

export function updateUsername(userId, username) {
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, userId);
  return getUserById(userId);
}

export function createSession({ tokenHash, userId, expiresAt }) {
  db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(tokenHash, userId, expiresAt, now());
}

export function findSession(tokenHash) {
  return db.prepare(`
    SELECT s.id, s.expires_at, u.id AS user_id, u.username
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > ?
  `).get(tokenHash, Date.now()) || null;
}

export function deleteSession(tokenHash) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(tokenHash);
}

export function deleteOtherSessions(userId, keepTokenHash) {
  return db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?')
    .run(userId, keepTokenHash).changes;
}

export function deleteSessionsForUser(userId) {
  return db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId).changes;
}

export function deleteExpiredSessions() {
  return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now()).changes;
}

/* ------------------------------------------------------------------ */
/* modules                                                             */
/* ------------------------------------------------------------------ */

const moduleFromRow = (row) => row && ({
  id: row.id,
  parentId: row.parent_id || null,
  title: row.title,
  icon: row.icon,
  iconUrl: row.icon_url || '',
  accent: row.accent,
  isPublic: row.is_public !== 0,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function listModules() {
  return db.prepare('SELECT * FROM modules ORDER BY sort_order ASC, created_at ASC').all().map(moduleFromRow);
}

function isModuleEffectivelyPublic(moduleId, byId = null) {
  const modules = byId || new Map(listModules().map((module) => [module.id, module]));
  let current = modules.get(moduleId);
  const seen = new Set();
  while (current) {
    if (!current.isPublic) return false;
    if (!current.parentId || seen.has(current.id)) return true;
    seen.add(current.id);
    current = modules.get(current.parentId);
  }
  return false;
}

function publicModuleIdSet() {
  const modules = listModules();
  const byId = new Map(modules.map((module) => [module.id, module]));
  return new Set(modules.filter((module) => isModuleEffectivelyPublic(module.id, byId)).map((module) => module.id));
}

export function listPublicModules() {
  const modules = listModules();
  const byId = new Map(modules.map((module) => [module.id, module]));
  return modules
    .filter((module) => isModuleEffectivelyPublic(module.id, byId))
    .map((module) => ({
      ...module,
      iconUrl: module.iconUrl.startsWith('/api/assets/')
        ? module.iconUrl.replace('/api/assets/', '/api/public/assets/')
        : module.iconUrl,
    }));
}

export function getModule(id) {
  return moduleFromRow(db.prepare('SELECT * FROM modules WHERE id = ?').get(id));
}

function isModuleDescendant(candidateId, ancestorId) {
  let current = getModule(candidateId);
  const seen = new Set();
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    if (seen.has(current.id)) return true;
    seen.add(current.id);
    current = getModule(current.parentId);
  }
  return false;
}

export function createModule({ title, icon = '🎮', iconUrl = '', accent = '#c8f76a', isPublic = true, parentId = null }) {
  if (parentId && !getModule(parentId)) throw new Error('PARENT_NOT_FOUND');
  const id = uid();
  const stamp = now();
  const order = db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM modules
    WHERE parent_id IS ?
  `).get(parentId).n;
  db.prepare(`
    INSERT INTO modules (id, parent_id, title, icon, icon_url, accent, is_public, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, parentId, title, icon, iconUrl, accent, isPublic ? 1 : 0, order, stamp, stamp);
  return getModule(id);
}

export function updateModule(id, patch) {
  const current = getModule(id);
  if (!current) return null;
  const fields = [];
  const values = [];
  if (typeof patch.title === 'string') { fields.push('title = ?'); values.push(patch.title); }
  if (typeof patch.icon === 'string') { fields.push('icon = ?'); values.push(patch.icon); }
  if (typeof patch.iconUrl === 'string') { fields.push('icon_url = ?'); values.push(patch.iconUrl); }
  if (typeof patch.accent === 'string') { fields.push('accent = ?'); values.push(patch.accent); }
  if (typeof patch.isPublic === 'boolean') { fields.push('is_public = ?'); values.push(patch.isPublic ? 1 : 0); }
  if (patch.parentId !== undefined) {
    const parentId = patch.parentId || null;
    if (parentId === id) throw new Error('MODULE_CYCLE');
    if (parentId && !getModule(parentId)) throw new Error('PARENT_NOT_FOUND');
    if (parentId && isModuleDescendant(parentId, id)) throw new Error('MODULE_CYCLE');
    fields.push('parent_id = ?');
    values.push(parentId);
    if (parentId !== current.parentId) {
      const order = db.prepare(`
        SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM modules
        WHERE parent_id IS ?
      `).get(parentId).n;
      fields.push('sort_order = ?');
      values.push(order);
    }
  }
  if (!fields.length) return current;
  fields.push('updated_at = ?');
  values.push(now(), id);
  db.prepare(`UPDATE modules SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getModule(id);
}

export function moduleSubtreeIds(id) {
  const ids = [];
  const stack = [id];
  while (stack.length) {
    const current = stack.pop();
    if (!current || ids.includes(current)) continue;
    ids.push(current);
    const children = db.prepare('SELECT id FROM modules WHERE parent_id = ?').all(current);
    for (const child of children) stack.push(child.id);
  }
  return ids;
}

export function deleteModule(id) {
  const ids = moduleSubtreeIds(id);
  if (!ids.length) return false;
  const placeholders = ids.map(() => '?').join(', ');
  db.exec('BEGIN');
  try {
    db.prepare(`DELETE FROM pages WHERE module_id IN (${placeholders})`).run(...ids);
    for (const moduleId of [...ids].reverse()) {
      db.prepare('DELETE FROM modules WHERE id = ?').run(moduleId);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return true;
}

export function reorderModules(ids) {
  const stmt = db.prepare('UPDATE modules SET sort_order = ? WHERE id = ?');
  db.exec('BEGIN');
  try {
    ids.forEach((id, index) => stmt.run(index + 1, id));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* pages                                                               */
/* ------------------------------------------------------------------ */

const pageMetaFromRow = (row) => row && ({
  id: row.id,
  moduleId: row.module_id,
  parentId: row.parent_id,
  title: row.title,
  icon: row.icon,
  sortOrder: row.sort_order,
  chars: row.chars ?? 0,
  todoTotal: row.todo_total ?? 0,
  todoDone: row.todo_done ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function listPageMeta() {
  return db.prepare(`
    SELECT id, module_id, parent_id, title, icon, sort_order, created_at, updated_at,
           todo_total, todo_done, LENGTH(search_text) AS chars
    FROM pages
    ORDER BY module_id ASC, sort_order ASC, created_at ASC
  `).all().map(pageMetaFromRow);
}

export function listPublicPageMeta() {
  const ids = publicModuleIdSet();
  return db.prepare(`
    SELECT id, module_id, parent_id, title, icon, sort_order, created_at, updated_at,
           todo_total, todo_done, LENGTH(search_text) AS chars
    FROM pages
    ORDER BY module_id ASC, sort_order ASC, created_at ASC
  `).all().filter((row) => ids.has(row.module_id)).map(pageMetaFromRow);
}

export function listPublicRecentPages(limit = 6) {
  const ids = publicModuleIdSet();
  return db.prepare(`
    SELECT id, module_id, parent_id, title, icon, sort_order, created_at, updated_at,
           todo_total, todo_done, LENGTH(search_text) AS chars
    FROM pages
    ORDER BY updated_at DESC
  `).all().filter((row) => ids.has(row.module_id)).slice(0, limit).map(pageMetaFromRow);
}

export function listRecentPages(limit = 6) {
  return db.prepare(`
    SELECT id, module_id, parent_id, title, icon, sort_order, created_at, updated_at,
           todo_total, todo_done, LENGTH(search_text) AS chars
    FROM pages
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(limit).map(pageMetaFromRow);
}

export function getPage(id) {
  const row = db.prepare('SELECT * FROM pages WHERE id = ?').get(id);
  if (!row) return null;
  let blocks = [];
  try { blocks = JSON.parse(row.blocks); } catch { blocks = []; }
  return {
    ...pageMetaFromRow({ ...row, chars: row.search_text.length }),
    blocks,
  };
}

export function getPageBreadcrumb(id) {
  const page = getPage(id);
  if (!page) return null;
  const module = getModule(page.moduleId);
  const moduleChain = [];
  let moduleCursor = module;
  const seenModules = new Set();
  while (moduleCursor && !seenModules.has(moduleCursor.id)) {
    seenModules.add(moduleCursor.id);
    moduleChain.unshift({
      id: moduleCursor.id,
      title: moduleCursor.title,
      icon: moduleCursor.icon,
      iconUrl: moduleCursor.iconUrl,
    });
    moduleCursor = moduleCursor.parentId ? getModule(moduleCursor.parentId) : null;
  }
  const chain = [];
  let cursor = page;
  const seen = new Set();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    chain.unshift({ type: 'page', id: cursor.id, title: cursor.title, icon: cursor.icon });
    cursor = cursor.parentId ? getPage(cursor.parentId) : null;
  }
  return {
    module: module ? { id: module.id, title: module.title, icon: module.icon, iconUrl: module.iconUrl } : null,
    moduleChain,
    pages: chain,
  };
}

export function getPublicPage(id) {
  const page = getPage(id);
  if (!page) return null;
  if (!isModuleEffectivelyPublic(page.moduleId)) return null;
  return page;
}

export function getPublicPageBreadcrumb(id) {
  if (!getPublicPage(id)) return null;
  return getPageBreadcrumb(id);
}

export function createPage({ moduleId, parentId = null, title = '未命名页面', icon = '📄', blocks = [] }) {
  let targetModule = moduleId;
  if (parentId) {
    const parent = db.prepare('SELECT module_id FROM pages WHERE id = ?').get(parentId);
    if (!parent) throw new Error('PARENT_NOT_FOUND');
    targetModule = parent.module_id;
  }
  if (!targetModule || !getModule(targetModule)) throw new Error('MODULE_NOT_FOUND');

  const order = db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM pages
    WHERE module_id = ? AND parent_id IS ?
  `).get(targetModule, parentId).n;

  const id = uid();
  const stamp = now();
  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  const todo = countTodoBlocks(safeBlocks);
  db.prepare(`
    INSERT INTO pages (id, module_id, parent_id, title, icon, sort_order, blocks, search_text, todo_total, todo_done, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, targetModule, parentId, title, icon, order,
    JSON.stringify(safeBlocks), extractSearchText(safeBlocks), todo.total, todo.done, stamp, stamp,
  );
  rebuildAllPageLinks();
  return getPage(id);
}

export function updatePageMeta(id, patch) {
  const fields = [];
  const values = [];
  if (typeof patch.title === 'string') { fields.push('title = ?'); values.push(patch.title); }
  if (typeof patch.icon === 'string') { fields.push('icon = ?'); values.push(patch.icon); }
  if (!fields.length) return getPage(id);
  fields.push('updated_at = ?');
  values.push(now(), id);
  db.prepare(`UPDATE pages SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  if (typeof patch.title === 'string') rebuildAllPageLinks();
  return getPage(id);
}

export function updatePageContent(id, blocks, searchText) {
  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  const text = typeof searchText === 'string' && searchText.trim()
    ? searchText.slice(0, 500_000)
    : extractSearchText(safeBlocks);
  const todo = countTodoBlocks(safeBlocks);
  db.prepare(`
    UPDATE pages
    SET blocks = ?, search_text = ?, todo_total = ?, todo_done = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(safeBlocks), text, todo.total, todo.done, now(), id);
  rebuildPageLinks(id);
  return db.prepare('SELECT updated_at, todo_total, todo_done FROM pages WHERE id = ?').get(id);
}

export function deletePage(id) {
  const changed = db.prepare('DELETE FROM pages WHERE id = ?').run(id).changes > 0;
  if (changed) rebuildAllPageLinks();
  return changed;
}

/* ------------------------------------------------------------------ */
/* page links ([[wiki links]])                                         */
/* ------------------------------------------------------------------ */

const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g;

export function rebuildPageLinks(pageId) {
  const source = db.prepare('SELECT id, module_id, title, blocks FROM pages WHERE id = ?').get(pageId);
  if (!source) return;
  let blocks = [];
  try { blocks = JSON.parse(source.blocks); } catch { blocks = []; }
  const text = extractSearchText(blocks);
  const links = [];
  const seen = new Set();

  db.prepare('DELETE FROM page_links WHERE source_page_id = ?').run(pageId);

  if (!text) return;

  const pages = db.prepare('SELECT id, module_id, title, icon FROM pages').all();
  const byTitle = new Map();
  for (const page of pages) {
    const key = page.title.trim().toLowerCase();
    const list = byTitle.get(key) || [];
    list.push(page);
    byTitle.set(key, list);
  }

  const modules = db.prepare('SELECT id, title, icon FROM modules').all();
  const modulesByTitle = new Map();
  for (const module of modules) {
    modulesByTitle.set(module.title.trim().toLowerCase(), module);
  }

  WIKI_LINK_RE.lastIndex = 0;
  let match;
  while ((match = WIKI_LINK_RE.exec(text)) !== null) {
    const rawTarget = match[1].trim();
    const alias = (match[2] || '').trim() || null;
    const modulePrefix = rawTarget.match(/^模块[:：]\s*(.+)$/);
    const isModule = Boolean(modulePrefix);
    const targetTitle = (modulePrefix ? modulePrefix[1] : rawTarget).trim();
    if (!targetTitle) continue;

    const targetModule = isModule ? modulesByTitle.get(targetTitle.toLowerCase()) || null : null;
    const candidates = isModule ? [] : (byTitle.get(targetTitle.toLowerCase()) || []);
    const target = isModule ? null : (candidates.find((page) => page.module_id === source.module_id) || candidates[0] || null);
    if (target?.id === pageId) continue;
    const key = isModule
      ? (targetModule ? `module:${targetModule.id}` : `module-title:${targetTitle.toLowerCase()}`)
      : (target ? target.id : `title:${targetTitle.toLowerCase()}`);
    if (seen.has(key)) continue;
    seen.add(key);
    const start = Math.max(0, match.index - 70);
    const end = Math.min(text.length, match.index + match[0].length + 100);
    const context = text.slice(start, end).replace(/\s+/g, ' ').trim();
    links.push({
      id: uid(),
      sourcePageId: pageId,
      targetPageId: target?.id || null,
      targetModuleId: targetModule?.id || null,
      targetTitle,
      alias,
      context,
      createdAt: now(),
    });
  }

  const insert = db.prepare(`
    INSERT INTO page_links (id, source_page_id, target_page_id, target_module_id, target_title, alias, context, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const link of links) {
    insert.run(
      link.id, link.sourcePageId, link.targetPageId, link.targetModuleId,
      link.targetTitle, link.alias, link.context, link.createdAt,
    );
  }
}

export function rebuildAllPageLinks() {
  const ids = db.prepare('SELECT id FROM pages').all().map((row) => row.id);
  for (const id of ids) rebuildPageLinks(id);
}

export function getPageLinks(pageId) {
  const page = getPage(pageId);
  if (!page) return { outgoing: [], backlinks: [] };

  const outgoing = db.prepare(`
    SELECT l.*, p.title AS target_page_title, p.icon AS target_page_icon,
           m.title AS target_module_title, m.icon AS target_module_icon
    FROM page_links l
    LEFT JOIN pages p ON p.id = l.target_page_id
    LEFT JOIN modules m ON m.id = l.target_module_id
    WHERE l.source_page_id = ?
    ORDER BY l.created_at ASC
  `).all(pageId).map((row) => ({
    id: row.id,
    targetPageId: row.target_page_id || null,
    targetModuleId: row.target_module_id || null,
    targetType: row.target_page_id ? 'page' : row.target_module_id ? 'module' : 'unresolved',
    targetTitle: row.target_page_title || row.target_module_title || row.target_title,
    rawTitle: row.target_title,
    alias: row.alias || null,
    icon: row.target_page_icon || row.target_module_icon || (row.target_module_id ? '📦' : '📄'),
    resolved: Boolean(row.target_page_id || row.target_module_id),
    context: row.context,
  }));

  const backlinks = db.prepare(`
    SELECT l.*, p.title AS source_page_title, p.icon AS source_page_icon,
           p.module_id AS source_module_id
    FROM page_links l
    JOIN pages p ON p.id = l.source_page_id
    WHERE l.target_page_id = ?
       OR (l.target_page_id IS NULL AND lower(l.target_title) = lower(?))
    ORDER BY l.created_at ASC
  `).all(pageId, page.title).map((row) => ({
    id: row.id,
    sourcePageId: row.source_page_id,
    sourceTitle: row.source_page_title,
    icon: row.source_page_icon || '📄',
    alias: row.alias || null,
    context: row.context,
  }));

  return { outgoing, backlinks };
}

export function reorderPages(ids, moduleId, parentId = null) {
  const stmt = db.prepare(`
    UPDATE pages SET sort_order = ?, updated_at = ?
    WHERE id = ? AND module_id = ? AND parent_id IS ?
  `);
  db.exec('BEGIN');
  try {
    ids.forEach((id, index) => stmt.run(index + 1, now(), id, moduleId, parentId));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* AI conversations                                                    */
/* ------------------------------------------------------------------ */

const aiConversationFromRow = (row) => row && ({
  id: row.id,
  title: row.title,
  pageId: row.page_id || null,
  summary: row.summary || '',
  messageCount: row.message_count ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const aiMessageFromRow = (row) => {
  let sources = [];
  try { sources = JSON.parse(row.sources || '[]'); } catch { sources = []; }
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    sources: Array.isArray(sources) ? sources : [],
    createdAt: row.created_at,
  };
};

export function createAIConversation({ title = '新对话', pageId = null } = {}) {
  const id = uid();
  const stamp = now();
  db.prepare(`
    INSERT INTO ai_conversations (id, title, page_id, summary, created_at, updated_at)
    VALUES (?, ?, ?, '', ?, ?)
  `).run(id, String(title).trim().slice(0, 80) || '新对话', pageId || null, stamp, stamp);
  return getAIConversation(id);
}

export function listAIConversations(limit = 40) {
  return db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM ai_messages m WHERE m.conversation_id = c.id) AS message_count
    FROM ai_conversations c
    ORDER BY c.updated_at DESC
    LIMIT ?
  `).all(Math.min(100, Math.max(1, Number(limit) || 40))).map(aiConversationFromRow);
}

export function getAIConversation(id) {
  const row = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM ai_messages m WHERE m.conversation_id = c.id) AS message_count
    FROM ai_conversations c WHERE c.id = ?
  `).get(id);
  return aiConversationFromRow(row);
}

export function listAIMessages(conversationId) {
  return db.prepare(`
    SELECT * FROM ai_messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC, rowid ASC
  `).all(conversationId).map(aiMessageFromRow);
}

export function addAIMessage({ conversationId, role, content, sources = [] }) {
  const id = uid();
  const stamp = now();
  db.prepare(`
    INSERT INTO ai_messages (id, conversation_id, role, content, sources, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, conversationId, role, content, JSON.stringify(sources), stamp);
  db.prepare('UPDATE ai_conversations SET updated_at = ? WHERE id = ?').run(stamp, conversationId);
  return aiMessageFromRow(db.prepare('SELECT * FROM ai_messages WHERE id = ?').get(id));
}

export function updateAIConversation(id, patch) {
  const fields = [];
  const values = [];
  if (typeof patch.title === 'string') { fields.push('title = ?'); values.push(patch.title.trim().slice(0, 80) || '新对话'); }
  if (typeof patch.summary === 'string') { fields.push('summary = ?'); values.push(patch.summary.trim().slice(0, 6000)); }
  if (!fields.length) return getAIConversation(id);
  fields.push('updated_at = ?');
  values.push(now(), id);
  db.prepare(`UPDATE ai_conversations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getAIConversation(id);
}

export function deleteAIConversation(id) {
  return db.prepare('DELETE FROM ai_conversations WHERE id = ?').run(id).changes > 0;
}

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), now());
  return value;
}

export function getTheme() {
  const stored = getSetting('theme', {});
  return { ...DEFAULT_THEME, ...(stored && typeof stored === 'object' ? stored : {}) };
}

const DEFAULT_SITE = {
  name: 'DEVFORGE',
  tagline: '独立游戏开发学习舱',
  logoUrl: '',
};

export function getSiteSettings() {
  const stored = getSetting('site', {});
  return { ...DEFAULT_SITE, ...(stored && typeof stored === 'object' ? stored : {}) };
}

export function updateSiteSettings(patch) {
  const current = getSiteSettings();
  const next = {
    name: typeof patch.name === 'string' ? patch.name.trim().slice(0, 40) : current.name,
    tagline: typeof patch.tagline === 'string' ? patch.tagline.trim().slice(0, 100) : current.tagline,
    logoUrl: typeof patch.logoUrl === 'string' ? patch.logoUrl.trim().slice(0, 500) : current.logoUrl,
  };
  if (!next.name) next.name = DEFAULT_SITE.name;
  return setSetting('site', next);
}

/* ------------------------------------------------------------------ */
/* search & bootstrap                                                  */
/* ------------------------------------------------------------------ */

function mapSearchRows(rows, q) {
  return rows.map((row) => {
    const text = String(row.search_text || '').replace(/\s+/g, ' ').trim();
    let snippet = text.slice(0, 140);
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx >= 0) {
      const start = Math.max(0, idx - 45);
      snippet = `${start > 0 ? '…' : ''}${text.slice(start, start + 150)}${start + 150 < text.length ? '…' : ''}`;
    }
    return {
      id: row.id,
      moduleId: row.module_id,
      parentId: row.parent_id,
      title: row.title,
      icon: row.icon,
      updatedAt: row.updated_at,
      snippet,
      titleMatch: row.title.toLowerCase().includes(q.toLowerCase()),
    };
  });
}

export function searchPages(query, limit = 30) {
  const q = String(query || '').trim();
  if (!q) return [];
  const like = `%${q}%`;
  const rows = db.prepare(`
    SELECT id, module_id, parent_id, title, icon, search_text, updated_at
    FROM pages
    WHERE title LIKE ? OR search_text LIKE ?
    ORDER BY
      CASE WHEN title LIKE ? THEN 0 ELSE 1 END,
      updated_at DESC
    LIMIT ?
  `).all(like, like, like, limit);
  return mapSearchRows(rows, q);
}

export function searchPublicPages(query, limit = 30) {
  const q = String(query || '').trim();
  if (!q) return [];
  const ids = publicModuleIdSet();
  const like = `%${q}%`;
  const rows = db.prepare(`
    SELECT id, module_id, parent_id, title, icon, search_text, updated_at
    FROM pages
    WHERE title LIKE ? OR search_text LIKE ?
    ORDER BY
      CASE WHEN title LIKE ? THEN 0 ELSE 1 END,
      updated_at DESC
  `).all(like, like, like);
  return mapSearchRows(rows.filter((row) => ids.has(row.module_id)).slice(0, limit), q);
}

export function getBootstrap() {
  const modules = listModules();
  const pages = listPageMeta();
  return {
    site: getSiteSettings(),
    theme: getTheme(),
    modules,
    pages,
    recent: listRecentPages(6),
    stats: {
      moduleCount: modules.length,
      pageCount: pages.length,
      chars: pages.reduce((sum, page) => sum + (page.chars || 0), 0),
      todoTotal: pages.reduce((sum, page) => sum + (page.todoTotal || 0), 0),
      todoDone: pages.reduce((sum, page) => sum + (page.todoDone || 0), 0),
      updatedAt: pages.reduce((latest, page) => (
        !latest || page.updatedAt > latest ? page.updatedAt : latest
      ), null),
    },
  };
}

export function getPublicBootstrap() {
  const modules = listPublicModules();
  const pages = listPublicPageMeta();
  const site = getSiteSettings();
  return {
    site: {
      ...site,
      logoUrl: site.logoUrl.startsWith('/api/assets/')
        ? site.logoUrl.replace('/api/assets/', '/api/public/assets/')
        : site.logoUrl,
    },
    theme: getTheme(),
    modules,
    pages,
    recent: listPublicRecentPages(6),
    stats: {
      moduleCount: modules.length,
      pageCount: pages.length,
      chars: pages.reduce((sum, page) => sum + (page.chars || 0), 0),
      todoTotal: pages.reduce((sum, page) => sum + (page.todoTotal || 0), 0),
      todoDone: pages.reduce((sum, page) => sum + (page.todoDone || 0), 0),
      updatedAt: pages.reduce((latest, page) => (
        !latest || page.updatedAt > latest ? page.updatedAt : latest
      ), null),
    },
  };
}

export function exportAll() {
  return {
    app: 'DEVFORGE',
    version: 1,
    exportedAt: now(),
    theme: getTheme(),
    modules: listModules(),
    pages: db.prepare('SELECT * FROM pages ORDER BY module_id, sort_order').all().map((row) => ({
      ...pageMetaFromRow({ ...row, chars: row.search_text.length }),
      blocks: (() => { try { return JSON.parse(row.blocks); } catch { return []; } })(),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* assets                                                              */
/* ------------------------------------------------------------------ */

export function createAsset({ filename, originalName, mime, size }) {
  const id = uid();
  db.prepare(`
    INSERT INTO assets (id, filename, original_name, mime, size, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, filename, originalName, mime, size, now());
  return { id, filename, originalName, mime, size };
}

export function getAsset(id) {
  return db.prepare('SELECT * FROM assets WHERE id = ?').get(id) || null;
}

/* ------------------------------------------------------------------ */
/* seed                                                                */
/* ------------------------------------------------------------------ */

function extractSearchText(blocks) {
  const out = [];
  const walk = (list) => {
    if (!Array.isArray(list)) return;
    for (const block of list) {
      if (!block || typeof block !== 'object') continue;
      if (Array.isArray(block.content)) {
        for (const item of block.content) {
          if (item && typeof item.text === 'string') out.push(item.text);
        }
      }
      if (block.type === 'table' && block.content?.type === 'tableContent') {
        for (const row of block.content.rows || []) {
          for (const cell of row.cells || []) {
            for (const item of cell || []) {
              if (item && typeof item.text === 'string') out.push(item.text);
            }
          }
        }
      }
      if (Array.isArray(block.children)) walk(block.children);
    }
  };
  walk(blocks);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

function countTodoBlocks(blocks) {
  let total = 0;
  let done = 0;
  const walk = (list) => {
    if (!Array.isArray(list)) return;
    for (const block of list) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'checkListItem') {
        total += 1;
        if (block.props?.checked === true) done += 1;
      }
      if (Array.isArray(block.children)) walk(block.children);
    }
  };
  walk(blocks);
  return { total, done };
}

function textContent(text) {
  return [{ type: 'text', text, styles: {} }];
}

const props = (extra = {}) => ({
  backgroundColor: 'default',
  textColor: 'default',
  textAlignment: 'left',
  ...extra,
});

const b = {
  paragraph: (text) => ({ id: uid(), type: 'paragraph', props: props(), content: textContent(text), children: [] }),
  heading: (level, text) => ({ id: uid(), type: 'heading', props: props({ level }), content: textContent(text), children: [] }),
  bullet: (text) => ({ id: uid(), type: 'bulletListItem', props: props(), content: textContent(text), children: [] }),
  check: (text, checked = false) => ({ id: uid(), type: 'checkListItem', props: props({ checked }), content: textContent(text), children: [] }),
  quote: (text) => ({ id: uid(), type: 'quote', props: props(), content: textContent(text), children: [] }),
  code: (text, language = 'javascript') => ({ id: uid(), type: 'codeBlock', props: { language }, content: textContent(text), children: [] }),
  divider: () => ({ id: uid(), type: 'divider', props: {}, children: [] }),
};

export function seedInitialContent() {
  if (db.prepare('SELECT COUNT(*) AS n FROM modules').get().n > 0) return null;

  const module = createModule({ title: '启程', icon: '🚀', accent: '#c8f76a' });

  createPage({
    moduleId: module.id,
    title: '欢迎来到 DEVFORGE',
    icon: '👾',
    blocks: [
      b.heading(2, '你的独立游戏开发学习舱'),
      b.paragraph('这里不是课程表，而是一张可以自由搭建的学习工作台。把想做的游戏拆成模块，把每个模块拆成页面，然后从今天能完成的一小步开始。'),
      b.heading(3, '今天先做三件事'),
      b.check('新建一个属于自己的模块', false),
      b.check('在模块里建一张页面，写下第一个想法', false),
      b.check('输入 / 试试插入图片、代码或待办清单', false),
      b.heading(3, '编辑器小技巧'),
      b.bullet('输入 / 打开积木菜单，可以插入标题、列表、图片、视频、代码、表格和文件。'),
      b.bullet('鼠标移到块左侧，拖动手柄可以调整顺序。'),
      b.bullet('选中文字会出现格式工具栏，支持加粗、斜体、链接和颜色。'),
      b.quote('做小，做完，再做下一个。'),
      b.code('extends Node2D\n\nfunc _ready():\n\tprint("Hello, DEVFORGE!")', 'gdscript'),
    ],
  });

  createPage({
    moduleId: module.id,
    title: '如何组织你的学习',
    icon: '🧭',
    blocks: [
      b.heading(2, '一个够用的结构'),
      b.paragraph('不需要一开始就想得很完美。先用「模块 → 页面」把内容装起来，等它长出自己的形状。'),
      b.bullet('模块 = 一个方向，例如「Godot 入门」「像素美术」「玩法原型」。'),
      b.bullet('页面 = 一个具体主题，例如「场景切换」「角色移动」「调色练习」。'),
      b.bullet('块 = 内容本身，文字、图片、代码、待办、表格都可以。'),
      b.divider(),
      b.paragraph('建议每周只维护 3–5 个活跃页面，其余的先放在模块里。学习资料不是收藏品，能回到手边才有用。'),
      b.check('为「灵感库」建一张页面，收集三个想做的玩法', false),
    ],
  });

  return module;
}

export function databasePath() {
  return dbPath;
}

export function databaseSize() {
  try {
    const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
    return files.reduce((sum, file) => {
      try { return sum + fs.statSync(file).size; } catch { return sum; }
    }, 0);
  } catch {
    return 0;
  }
}

export function closeDatabase() {
  try { db.close(); } catch { /* already closed */ }
}
