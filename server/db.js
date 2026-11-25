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
        accent TEXT NOT NULL DEFAULT '#f16436',
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

  if (version < 9) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kb_docs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'recipe',
        status TEXT NOT NULL DEFAULT 'draft',
        summary TEXT NOT NULL DEFAULT '',
        body_md TEXT NOT NULL DEFAULT '',
        tool TEXT NOT NULL DEFAULT '',
        prompt TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        search_text TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        source_ref TEXT NOT NULL DEFAULT '',
        version INTEGER NOT NULL DEFAULT 1,
        supersedes_id TEXT,
        verified_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_kb_status ON kb_docs(status, kind, updated_at);
      CREATE INDEX IF NOT EXISTS idx_kb_updated ON kb_docs(updated_at);
      PRAGMA user_version = 9;
    `);
  }

  if (version < 10) {
    db.exec(`
      ALTER TABLE assets ADD COLUMN purpose TEXT NOT NULL DEFAULT 'unknown';
      CREATE INDEX IF NOT EXISTS idx_assets_purpose ON assets(purpose, created_at);
      PRAGMA user_version = 10;
    `);
  }

  if (version < 11) {
    db.exec(`
      ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin';
      ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

      CREATE TABLE IF NOT EXISTS registration_requests (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        contact TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        ip TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        reviewed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_registration_status ON registration_requests(status, created_at);

      ALTER TABLE kb_docs ADD COLUMN visibility TEXT NOT NULL DEFAULT 'admin';
      CREATE INDEX IF NOT EXISTS idx_kb_visibility ON kb_docs(status, visibility, updated_at);

      PRAGMA user_version = 11;
    `);
  }

  if (version < 12) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'reader',
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at DESC);

      CREATE TABLE IF NOT EXISTS suggestions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unread',
        created_at TEXT NOT NULL,
        read_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status, created_at DESC);

      CREATE TABLE IF NOT EXISTS invite_codes (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        used_at TEXT,
        used_by TEXT,
        hidden INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_invite_code ON invite_codes(code);
      CREATE INDEX IF NOT EXISTS idx_invite_visible ON invite_codes(hidden, created_at DESC);

      PRAGMA user_version = 12;
    `);
  }

  if (version < 13) {
    db.exec(`
      ALTER TABLE suggestions ADD COLUMN reply TEXT NOT NULL DEFAULT '';
      ALTER TABLE suggestions ADD COLUMN replied_at TEXT;
      ALTER TABLE suggestions ADD COLUMN replied_by TEXT;
      PRAGMA user_version = 13;
    `);
  }

  if (version < 14) {
    db.exec(`
      ALTER TABLE users ADD COLUMN note TEXT NOT NULL DEFAULT '';
      PRAGMA user_version = 14;
    `);
  }

  if (version < 15) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS friendships (
        id TEXT PRIMARY KEY,
        requester_id TEXT NOT NULL,
        addressee_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        blocked_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(requester_id, addressee_id)
      );
      CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);
      CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);

      CREATE TABLE IF NOT EXISTS friend_notes (
        owner_id TEXT NOT NULL,
        friend_id TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        PRIMARY KEY(owner_id, friend_id)
      );

      CREATE TABLE IF NOT EXISTS direct_messages (
        id TEXT PRIMARY KEY,
        conversation_key TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        attachment_id TEXT,
        attachment_name TEXT,
        attachment_mime TEXT,
        attachment_size INTEGER,
        attachment_cleared INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        read_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_dm_key ON direct_messages(conversation_key, created_at);
      CREATE INDEX IF NOT EXISTS idx_dm_recipient ON direct_messages(recipient_id, read_at);
      CREATE INDEX IF NOT EXISTS idx_dm_attachment ON direct_messages(attachment_id);

      ALTER TABLE assets ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';
      PRAGMA user_version = 15;
    `);
  }

  if (version < 16) {
    db.exec(`
      UPDATE modules SET accent = '#f16436' WHERE lower(accent) = '#c8f76a';
      PRAGMA user_version = 16;
    `);
  }

  if (version < 17) {
    const savedTheme = db.prepare("SELECT value FROM settings WHERE key = 'theme'").get();
    if (savedTheme?.value) {
      try {
        const theme = JSON.parse(savedTheme.value);
        if (theme?.preset === 'forge' && String(theme.accent || '').toLowerCase() === '#c8f76a') {
          db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'theme'")
            .run(JSON.stringify({ ...theme, accent: '#f16436', radius: 6, grid: false, glow: false }), now());
        }
      } catch { /* keep malformed legacy theme untouched */ }
    }
    db.exec('PRAGMA user_version = 17;');
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
  return db.prepare('SELECT id, username, role, status, note, created_at FROM users WHERE id = ?').get(id) || null;
}

export function listUsers() {
  return db.prepare(`
    SELECT id, username, role, status, note, created_at
    FROM users
    ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, created_at ASC
  `).all();
}

export function countAdmins() {
  return db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
}

export function resetUserPassword(id, passwordHash) {
  updatePassword(id, passwordHash);
  deleteSessionsForUser(id);
  return getUserById(id);
}

export function deleteUser(id) {
  deleteSessionsForUser(id);
  return db.prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
}

export function updateUserNote(id, note) {
  db.prepare('UPDATE users SET note = ? WHERE id = ?').run(String(note || '').trim().slice(0, 500), id);
  return getUserById(id);
}

export function setUserStatus(id, status) {
  const next = status === 'suspended' ? 'suspended' : 'active';
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(next, id);
  return getUserById(id);
}

export function createUser({ username, passwordHash, role = 'admin', status = 'active' }) {
  const id = uid();
  db.prepare('INSERT INTO users (id, username, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, username, passwordHash, role, status, now());
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
    SELECT s.id, s.expires_at, u.id AS user_id, u.username, u.role, u.status
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > ? AND u.status = 'active'
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
/* registration requests                                               */
/* ------------------------------------------------------------------ */

const registrationFromRow = (row) => row && ({
  id: row.id,
  username: row.username,
  reason: row.reason,
  contact: row.contact,
  status: row.status,
  ip: row.ip,
  userAgent: row.user_agent,
  createdAt: row.created_at,
  reviewedAt: row.reviewed_at || null,
});

export function createRegistrationRequest({
  username,
  passwordHash,
  reason = '',
  contact = '',
  ip = '',
  userAgent = '',
}) {
  const id = uid();
  db.prepare(`
    INSERT INTO registration_requests
      (id, username, password_hash, reason, contact, status, ip, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(id, username, passwordHash, reason, contact, ip, userAgent, now());
  return registrationFromRow(db.prepare('SELECT * FROM registration_requests WHERE id = ?').get(id));
}

export function listRegistrationRequests(status = '') {
  const rows = status
    ? db.prepare('SELECT * FROM registration_requests WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM registration_requests ORDER BY created_at DESC').all();
  return rows.map(registrationFromRow);
}

export function getRegistrationRequest(id) {
  return registrationFromRow(db.prepare('SELECT * FROM registration_requests WHERE id = ?').get(id));
}

export function pendingRegistrationExists(username) {
  return Boolean(db.prepare("SELECT 1 FROM registration_requests WHERE username = ? AND status = 'pending'").get(username));
}

export function countRegistrationsSince(hours = 24) {
  const cutoff = new Date(Date.now() - Math.max(1, Number(hours) || 24) * 60 * 60 * 1000).toISOString();
  return db.prepare('SELECT COUNT(*) AS n FROM registration_requests WHERE created_at >= ?').get(cutoff).n;
}

export function approveRegistrationRequest(id) {
  const request = db.prepare('SELECT * FROM registration_requests WHERE id = ?').get(id);
  if (!request) return { error: 'NOT_FOUND' };
  if (request.status !== 'pending') return { error: 'ALREADY_REVIEWED' };
  db.exec('BEGIN');
  try {
    const user = createUser({
      username: request.username,
      passwordHash: request.password_hash,
      role: 'reader',
      status: 'active',
    });
    db.prepare("UPDATE registration_requests SET status = 'approved', reviewed_at = ? WHERE id = ?")
      .run(now(), id);
    db.exec('COMMIT');
    return { user };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    if (String(error?.code || '').includes('CONSTRAINT')) return { error: 'USERNAME_TAKEN' };
    throw error;
  }
}

export function rejectRegistrationRequest(id) {
  const result = db.prepare(
    "UPDATE registration_requests SET status = 'rejected', reviewed_at = ? WHERE id = ? AND status = 'pending'",
  ).run(now(), id);
  return result.changes > 0;
}

/* ------------------------------------------------------------------ */
/* chat + suggestions                                                  */
/* ------------------------------------------------------------------ */

function mapChatRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    role: row.role,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function listChatMessages(limit = 100) {
  const rows = db.prepare(
    'SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT ?',
  ).all(Math.min(Math.max(Number(limit) || 100, 1), 300));
  return rows.reverse().map(mapChatRow);
}

export function createChatMessage({ userId, username, role, body }) {
  const id = uid();
  db.prepare(
    'INSERT INTO chat_messages (id, user_id, username, role, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, userId, username, role, body, now());
  return mapChatRow(db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id));
}

function mapSuggestionRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    readAt: row.read_at || null,
    reply: row.reply || '',
    repliedAt: row.replied_at || null,
    repliedBy: row.replied_by || null,
  };
}

export function createSuggestion({ userId, username, body }) {
  const id = uid();
  db.prepare(
    'INSERT INTO suggestions (id, user_id, username, body, status, created_at) VALUES (?, ?, ?, ?, \'unread\', ?)',
  ).run(id, userId, username, body, now());
  return mapSuggestionRow(db.prepare('SELECT * FROM suggestions WHERE id = ?').get(id));
}

export function listSuggestions({ userId = '', status = '', limit = 100 } = {}) {
  const where = [];
  const params = [];
  if (userId) { where.push('user_id = ?'); params.push(userId); }
  if (status) { where.push('status = ?'); params.push(status); }
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 300));
  return db.prepare(`
    SELECT * FROM suggestions
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at DESC LIMIT ?
  `).all(...params).map(mapSuggestionRow);
}

export function markSuggestionRead(id) {
  const result = db.prepare(
    "UPDATE suggestions SET status = 'read', read_at = ? WHERE id = ? AND status = 'unread'",
  ).run(now(), id);
  return result.changes > 0;
}

export function replyToSuggestion(id, { reply, repliedBy = '' }) {
  const result = db.prepare(`
    UPDATE suggestions
    SET reply = ?, replied_at = ?, replied_by = ?, status = 'read', read_at = COALESCE(read_at, ?)
    WHERE id = ?
  `).run(String(reply || '').trim().slice(0, 3000), now(), String(repliedBy || '').slice(0, 80), now(), id);
  if (!result.changes) return null;
  return mapSuggestionRow(db.prepare('SELECT * FROM suggestions WHERE id = ?').get(id));
}

/* ------------------------------------------------------------------ */
/* invite codes                                                        */
/* ------------------------------------------------------------------ */

const INVITE_VISIBLE_LIMIT = 50;
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newInviteCode() {
  let value = '';
  for (let i = 0; i < 8; i += 1) {
    value += INVITE_ALPHABET[crypto.randomInt(0, INVITE_ALPHABET.length)];
    if (i === 3) value += '-';
  }
  return `DF-${value}`;
}

function trimInviteCodes() {
  let visible = db.prepare('SELECT COUNT(*) AS n FROM invite_codes WHERE hidden = 0').get().n;
  if (visible <= INVITE_VISIBLE_LIMIT) return;
  // 先隐藏最近使用过的邀请码（按用户要求：超过 50 条时优先隐藏最近的已用码）。
  const used = db.prepare(`
    SELECT id FROM invite_codes
    WHERE hidden = 0 AND used_at IS NOT NULL
    ORDER BY used_at DESC
  `).all();
  const hide = db.prepare('UPDATE invite_codes SET hidden = 1 WHERE id = ?');
  for (const row of used) {
    if (visible <= INVITE_VISIBLE_LIMIT) break;
    hide.run(row.id);
    visible -= 1;
  }
  // 如果仍未使用码也超过上限，删除最旧的未使用码，避免留下不可用又看不见的码。
  if (visible > INVITE_VISIBLE_LIMIT) {
    const unused = db.prepare(`
      SELECT id FROM invite_codes
      WHERE hidden = 0 AND used_at IS NULL
      ORDER BY created_at ASC
    `).all();
    const remove = db.prepare('DELETE FROM invite_codes WHERE id = ?');
    for (const row of unused) {
      if (visible <= INVITE_VISIBLE_LIMIT) break;
      remove.run(row.id);
      visible -= 1;
    }
  }
}

function mapInviteRow(row) {
  return {
    id: row.id,
    code: row.code,
    createdAt: row.created_at,
    usedAt: row.used_at || null,
    usedBy: row.used_by || null,
    used: Boolean(row.used_at),
  };
}

export function listInviteCodes() {
  return db.prepare(
    'SELECT * FROM invite_codes WHERE hidden = 0 ORDER BY created_at DESC',
  ).all().map(mapInviteRow);
}

export function createInviteCodes(count = 10, createdBy = '') {
  const amount = Math.min(50, Math.max(1, Number(count) || 10));
  db.exec('BEGIN');
  try {
    const insert = db.prepare(
      'INSERT INTO invite_codes (id, code, created_by, created_at) VALUES (?, ?, ?, ?)',
    );
    for (let i = 0; i < amount; i += 1) {
      let code;
      do { code = newInviteCode(); } while (db.prepare('SELECT 1 FROM invite_codes WHERE code = ?').get(code));
      insert.run(uid(), code, createdBy, now());
    }
    trimInviteCodes();
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  }
  return listInviteCodes();
}

export function consumeInviteCode({ code, username, passwordHash }) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return { error: 'INVALID_CODE' };
  const invite = db.prepare(
    'SELECT * FROM invite_codes WHERE code = ? AND hidden = 0 AND used_at IS NULL',
  ).get(normalized);
  if (!invite) return { error: 'INVALID_CODE' };
  db.exec('BEGIN');
  try {
    const user = createUser({ username, passwordHash, role: 'reader', status: 'active' });
    db.prepare(
      'UPDATE invite_codes SET used_at = ?, used_by = ? WHERE id = ?',
    ).run(now(), username, invite.id);
    trimInviteCodes();
    db.exec('COMMIT');
    return { user };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    if (String(error?.code || '').includes('CONSTRAINT')) return { error: 'USERNAME_TAKEN' };
    throw error;
  }
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

export function createModule({ title, icon = '🎮', iconUrl = '', accent = '#f16436', isPublic = true, parentId = null }) {
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

export function getPublicPageLinks(id) {
  if (!getPublicPage(id)) return { outgoing: [], backlinks: [] };
  const links = getPageLinks(id);
  const publicModules = publicModuleIdSet();
  const publicPages = new Set(listPublicPageMeta().map((page) => page.id));
  return {
    outgoing: links.outgoing.filter((link) => (
      link.targetType === 'module'
        ? Boolean(link.targetModuleId && publicModules.has(link.targetModuleId))
        : Boolean(link.targetPageId && publicPages.has(link.targetPageId))
    )),
    backlinks: links.backlinks.filter((link) => publicPages.has(link.sourcePageId)),
  };
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

function extractInlineLinkTargets(blocks) {
  const targets = [];
  const visitContent = (content) => {
    if (!Array.isArray(content)) return;
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      if (item.type === 'link' && typeof item.href === 'string') {
        const text = (item.content || [])
          .map((child) => (child && typeof child.text === 'string' ? child.text : ''))
          .join('')
          .trim();
        const pageMatch = item.href.match(/^\/page\/([^/?#]+)/);
        const moduleMatch = item.href.match(/^\/module\/([^/?#]+)/);
        if (pageMatch) targets.push({ kind: 'page', id: pageMatch[1], title: text });
        else if (moduleMatch) targets.push({ kind: 'module', id: moduleMatch[1], title: text });
        continue;
      }
      if (item.type !== 'text') continue;
      const href = (item.marks || []).find((mark) => mark?.type === 'link')?.href;
      if (typeof href !== 'string') continue;
      const pageMatch = href.match(/^\/page\/([^/?#]+)/);
      const moduleMatch = href.match(/^\/module\/([^/?#]+)/);
      if (pageMatch) targets.push({ kind: 'page', id: pageMatch[1], title: String(item.text || '').trim() });
      else if (moduleMatch) targets.push({ kind: 'module', id: moduleMatch[1], title: String(item.text || '').trim() });
    }
  };
  const walk = (list) => {
    if (!Array.isArray(list)) return;
    for (const block of list) {
      if (!block || typeof block !== 'object') continue;
      visitContent(block.content);
      if (block.content?.type === 'tableContent') {
        for (const row of block.content.rows || []) {
          for (const cell of row.cells || []) visitContent(cell);
        }
      }
      if (Array.isArray(block.children)) walk(block.children);
    }
  };
  walk(blocks);
  return targets;
}

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

  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const modulesById = new Map(modules.map((module) => [module.id, module]));
  for (const inline of extractInlineLinkTargets(blocks)) {
    const isModule = inline.kind === 'module';
    const targetPage = isModule ? null : pagesById.get(inline.id) || null;
    const targetModule = isModule ? modulesById.get(inline.id) || null : null;
    if (targetPage?.id === pageId) continue;
    const key = isModule ? `module:${inline.id}` : `page:${inline.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = targetPage?.title || targetModule?.title || inline.title || '未命名';
    links.push({
      id: uid(),
      sourcePageId: pageId,
      targetPageId: targetPage?.id || null,
      targetModuleId: targetModule?.id || null,
      targetTitle: title,
      alias: null,
      context: `内联链接：${title}`,
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
    kbDocs: listKbDocs({ limit: 500 }),
  };
}

/* ------------------------------------------------------------------ */
/* friends + direct messages                                           */
/* ------------------------------------------------------------------ */

export function friendPairKey(a, b) {
  return [String(a), String(b)].sort().join('|');
}

export function findFriendshipBetween(a, b) {
  return db.prepare(`
    SELECT * FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?)
       OR (requester_id = ? AND addressee_id = ?)
    LIMIT 1
  `).get(a, b, b, a) || null;
}

function mapFriendUser(row, note = '') {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status,
    note,
  };
}

function friendRowUser(id) {
  return db.prepare('SELECT id, username, role, status, note FROM users WHERE id = ?').get(id) || null;
}

export function listFriendData(userId) {
  const rows = db.prepare(`
    SELECT * FROM friendships
    WHERE requester_id = ? OR addressee_id = ?
    ORDER BY updated_at DESC
  `).all(userId, userId);
  const notes = new Map(
    db.prepare('SELECT friend_id, note FROM friend_notes WHERE owner_id = ?').all(userId)
      .map((row) => [row.friend_id, row.note]),
  );
  const friends = [];
  const incoming = [];
  const outgoing = [];
  const blocked = [];
  for (const row of rows) {
    const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
    const other = friendRowUser(otherId);
    if (!other) continue;
    const item = {
      friendshipId: row.id,
      user: mapFriendUser(other, notes.get(otherId) || ''),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (row.status === 'accepted') friends.push(item);
    else if (row.status === 'pending' && row.addressee_id === userId) incoming.push(item);
    else if (row.status === 'pending' && row.requester_id === userId) outgoing.push(item);
    else if (row.status === 'blocked') blocked.push(item);
  }
  return { friends, incoming, outgoing, blocked };
}

export function createFriendRequest(requesterId, addresseeId) {
  const existing = findFriendshipBetween(requesterId, addresseeId);
  if (existing) {
    if (existing.status === 'accepted') return { error: 'ALREADY_FRIENDS' };
    if (existing.status === 'blocked') return { error: 'BLOCKED' };
    if (existing.status === 'pending' && existing.addressee_id === requesterId) {
      db.prepare(`
        UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?
      `).run(now(), existing.id);
      return { friendship: db.prepare('SELECT * FROM friendships WHERE id = ?').get(existing.id), autoAccepted: true };
    }
    if (existing.status === 'pending') return { error: 'ALREADY_PENDING' };
    db.prepare(`
      UPDATE friendships SET requester_id = ?, addressee_id = ?, status = 'pending', blocked_by = NULL, updated_at = ?
      WHERE id = ?
    `).run(requesterId, addresseeId, now(), existing.id);
    return { friendship: db.prepare('SELECT * FROM friendships WHERE id = ?').get(existing.id) };
  }
  const id = uid();
  db.prepare(`
    INSERT INTO friendships (id, requester_id, addressee_id, status, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `).run(id, requesterId, addresseeId, now(), now());
  return { friendship: db.prepare('SELECT * FROM friendships WHERE id = ?').get(id) };
}

export function answerFriendRequest(id, userId, accept) {
  const row = db.prepare('SELECT * FROM friendships WHERE id = ?').get(id);
  if (!row || row.addressee_id !== userId || row.status !== 'pending') return null;
  const status = accept ? 'accepted' : 'rejected';
  db.prepare('UPDATE friendships SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
  return db.prepare('SELECT * FROM friendships WHERE id = ?').get(id);
}

export function removeFriend(userId, otherId) {
  const row = findFriendshipBetween(userId, otherId);
  if (!row || row.status !== 'accepted') return false;
  db.prepare('DELETE FROM friendships WHERE id = ?').run(row.id);
  db.prepare('DELETE FROM friend_notes WHERE (owner_id = ? AND friend_id = ?) OR (owner_id = ? AND friend_id = ?)')
    .run(userId, otherId, otherId, userId);
  return true;
}

export function blockFriend(userId, otherId) {
  const existing = findFriendshipBetween(userId, otherId);
  if (existing) {
    db.prepare("UPDATE friendships SET status = 'blocked', blocked_by = ?, updated_at = ? WHERE id = ?")
      .run(userId, now(), existing.id);
  } else {
    db.prepare(`
      INSERT INTO friendships (id, requester_id, addressee_id, status, blocked_by, created_at, updated_at)
      VALUES (?, ?, ?, 'blocked', ?, ?, ?)
    `).run(uid(), userId, otherId, userId, now(), now());
  }
  return true;
}

export function unblockFriend(userId, otherId) {
  const row = findFriendshipBetween(userId, otherId);
  if (!row || row.status !== 'blocked' || row.blocked_by !== userId) return false;
  db.prepare('DELETE FROM friendships WHERE id = ?').run(row.id);
  return true;
}

export function setFriendNote(ownerId, friendId, note) {
  db.prepare(`
    INSERT INTO friend_notes (owner_id, friend_id, note, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(owner_id, friend_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at
  `).run(ownerId, friendId, String(note || '').trim().slice(0, 120), now());
  return String(note || '').trim().slice(0, 120);
}

export function searchUsers(userId, q, limit = 20) {
  const term = String(q || '').trim().toLowerCase();
  if (!term) return [];
  return db.prepare(`
    SELECT id, username, role, status FROM users
    WHERE id <> ? AND status = 'active' AND lower(username) LIKE ?
    ORDER BY username ASC LIMIT ?
  `).all(userId, `%${term}%`, Math.min(Math.max(Number(limit) || 20, 1), 50));
}

function mapDmRow(row) {
  return {
    id: row.id,
    conversationKey: row.conversation_key,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    body: row.body || '',
    createdAt: row.created_at,
    readAt: row.read_at || null,
    attachment: row.attachment_id ? {
      id: row.attachment_id,
      url: `/api/dm/attachments/${row.attachment_id}`,
      name: row.attachment_name || '图片',
      mime: row.attachment_mime || 'image/*',
      size: row.attachment_size || 0,
      cleared: Boolean(row.attachment_cleared),
    } : null,
    attachmentCleared: Boolean(row.attachment_cleared),
  };
}

export function createDmMessage({ senderId, recipientId, body, attachment = null }) {
  const key = friendPairKey(senderId, recipientId);
  const id = uid();
  db.prepare(`
    INSERT INTO direct_messages (
      id, conversation_key, sender_id, recipient_id, body,
      attachment_id, attachment_name, attachment_mime, attachment_size, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, key, senderId, recipientId, String(body || '').slice(0, 2000),
    attachment?.id || null,
    attachment?.name || null,
    attachment?.mime || null,
    attachment?.size || null,
    now(),
  );
  return mapDmRow(db.prepare('SELECT * FROM direct_messages WHERE id = ?').get(id));
}

export function listDmMessages(userId, otherId, limit = 200) {
  const key = friendPairKey(userId, otherId);
  db.prepare(`
    UPDATE direct_messages SET read_at = ?
    WHERE conversation_key = ? AND recipient_id = ? AND read_at IS NULL
  `).run(now(), key, userId);
  const rows = db.prepare(`
    SELECT * FROM direct_messages
    WHERE conversation_key = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(key, Math.min(Math.max(Number(limit) || 200, 1), 300));
  return rows.reverse().map(mapDmRow);
}

export function listDmConversations(userId) {
  const rows = db.prepare(`
    SELECT * FROM direct_messages
    WHERE sender_id = ? OR recipient_id = ?
    ORDER BY created_at DESC LIMIT 1000
  `).all(userId, userId);
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.conversation_key)) grouped.set(row.conversation_key, row);
  }
  const result = [];
  for (const [key, last] of grouped) {
    const otherId = last.sender_id === userId ? last.recipient_id : last.sender_id;
    const other = friendRowUser(otherId);
    if (!other) continue;
    const unread = db.prepare(`
      SELECT COUNT(*) AS n FROM direct_messages
      WHERE conversation_key = ? AND recipient_id = ? AND read_at IS NULL
    `).get(key, userId).n;
    result.push({
      key,
      user: mapFriendUser(other),
      lastMessage: last.body || (last.attachment_id ? '[图片]' : ''),
      lastAt: last.created_at,
      unread,
    });
  }
  return result.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export function listAdminDmConversations() {
  const rows = db.prepare('SELECT * FROM direct_messages ORDER BY created_at DESC LIMIT 2000').all();
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.conversation_key)) grouped.set(row.conversation_key, row);
  }
  const result = [];
  for (const [key, last] of grouped) {
    const a = friendRowUser(last.sender_id);
    const b = friendRowUser(last.recipient_id);
    if (!a || !b) continue;
    result.push({
      key,
      users: [mapFriendUser(a, a.note), mapFriendUser(b, b.note)],
      lastMessage: last.body || (last.attachment_id ? '[图片]' : ''),
      lastAt: last.created_at,
    });
  }
  return result.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export function listAdminDmMessages(conversationKey, limit = 200) {
  const rows = db.prepare(`
    SELECT * FROM direct_messages WHERE conversation_key = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(conversationKey, Math.min(Math.max(Number(limit) || 200, 1), 300));
  return rows.reverse().map(mapDmRow);
}

export function listDmAssetsBefore(cutoff) {
  return db.prepare(`
    SELECT * FROM assets WHERE purpose = 'dm' AND created_at < ?
  `).all(cutoff);
}

export function markDmAttachmentCleared(assetId) {
  db.prepare(`
    UPDATE direct_messages
    SET attachment_cleared = 1, attachment_id = NULL, attachment_name = NULL, attachment_mime = NULL, attachment_size = NULL
    WHERE attachment_id = ?
  `).run(assetId);
}

/* ------------------------------------------------------------------ */
/* assets                                                              */
/* ------------------------------------------------------------------ */

export function createAsset({ filename, originalName, mime, size, purpose = 'unknown', ownerId = '' }) {
  const id = uid();
  db.prepare(`
    INSERT INTO assets (id, filename, original_name, mime, size, purpose, owner_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, filename, originalName, mime, size, purpose, ownerId, now());
  return { id, filename, originalName, mime, size, purpose, ownerId };
}

export function getAsset(id) {
  return db.prepare('SELECT * FROM assets WHERE id = ?').get(id) || null;
}

export function deleteAsset(id) {
  const asset = getAsset(id);
  if (!asset) return null;
  db.prepare('DELETE FROM assets WHERE id = ?').run(id);
  return asset;
}

export function listAssets(limit = 500) {
  return db.prepare(`
    SELECT id, filename, original_name, mime, size, purpose, created_at
    FROM assets
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.min(2000, Math.max(1, Number(limit) || 500)));
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
          if (!item || typeof item !== 'object') continue;
          if (item.type === 'link' && Array.isArray(item.content)) {
            for (const child of item.content) {
              if (child && typeof child.text === 'string') out.push(child.text);
            }
          } else if (typeof item.text === 'string') {
            out.push(item.text);
          }
        }
      }
      if (block.type === 'table' && block.content?.type === 'tableContent') {
        for (const row of block.content.rows || []) {
          for (const cell of row.cells || []) {
            if (typeof cell === 'string') {
              out.push(cell);
              continue;
            }
            if (cell && typeof cell === 'object' && Array.isArray(cell.content)) {
              for (const item of cell.content) {
                if (item && typeof item === 'object' && typeof item.text === 'string') out.push(item.text);
              }
              continue;
            }
            if (!Array.isArray(cell)) {
              if (cell && typeof cell === 'object' && typeof cell.text === 'string') out.push(cell.text);
              continue;
            }
            for (const item of cell) {
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

  const module = createModule({ title: '启程', icon: '🚀', accent: '#f16436' });

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

/* ------------------------------------------------------------------ */
/* AI 知识库 (kb_docs)                                                  */
/* ------------------------------------------------------------------ */

export const KB_KINDS = ['recipe', 'rule', 'fact', 'reference'];
export const KB_STATUSES = ['draft', 'published', 'archived'];

function normalizeKind(kind) {
  return KB_KINDS.includes(kind) ? kind : 'recipe';
}

function normalizeStatus(status) {
  return KB_STATUSES.includes(status) ? status : 'draft';
}

function normalizeVisibility(visibility) {
  return visibility === 'members' ? 'members' : 'admin';
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
  if (typeof tags === 'string') {
    return tags.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 20);
  }
  return [];
}

function kbSearchText(doc) {
  return [doc.title, doc.summary, doc.body_md, doc.tool, doc.prompt, (doc.tags || []).join(' ')]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

function mapKbRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    visibility: row.visibility || 'admin',
    summary: row.summary,
    bodyMd: row.body_md,
    tool: row.tool,
    prompt: row.prompt,
    tags: (() => { try { return JSON.parse(row.tags); } catch { return []; } })(),
    source: row.source,
    sourceRef: row.source_ref,
    version: row.version,
    supersedesId: row.supersedes_id,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listKbDocs({ status = '', kind = '', q = '', limit = 200 } = {}) {
  const where = [];
  const params = [];
  if (status) { where.push('status = ?'); params.push(normalizeStatus(status)); }
  if (kind) { where.push('kind = ?'); params.push(normalizeKind(kind)); }
  if (q) { where.push('search_text LIKE ?'); params.push(`%${q.toLowerCase()}%`); }
  const sql = `SELECT * FROM kb_docs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC LIMIT ?`;
  params.push(Math.min(Math.max(Number(limit) || 200, 1), 500));
  return db.prepare(sql).all(...params).map(mapKbRow);
}

export function getKbDoc(id) {
  return mapKbRow(db.prepare('SELECT * FROM kb_docs WHERE id = ?').get(id));
}

export function createKbDoc({
  title,
  kind = 'recipe',
  status = 'draft',
  visibility = 'admin',
  summary = '',
  bodyMd = '',
  tool = '',
  prompt = '',
  tags = [],
  source = '',
  sourceRef = '',
  supersedesId = null,
} = {}) {
  const stamp = now();
  const doc = {
    id: uid(),
    title: String(title || '未命名条目').trim().slice(0, 200) || '未命名条目',
    kind: normalizeKind(kind),
    status: normalizeStatus(status),
    visibility: normalizeVisibility(visibility),
    summary: String(summary || '').trim(),
    bodyMd: String(bodyMd || ''),
    tool: String(tool || '').trim().slice(0, 80),
    prompt: String(prompt || ''),
    tags: normalizeTags(tags),
    source: String(source || '').trim().slice(0, 60),
    sourceRef: String(sourceRef || '').trim().slice(0, 500),
    supersedesId: supersedesId || null,
  };
  db.prepare(`
    INSERT INTO kb_docs (id, title, kind, status, visibility, summary, body_md, tool, prompt, tags, search_text, source, source_ref, version, supersedes_id, verified_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).run(
    doc.id, doc.title, doc.kind, doc.status, doc.visibility, doc.summary, doc.bodyMd, doc.tool, doc.prompt,
    JSON.stringify(doc.tags), kbSearchText(doc), doc.source, doc.sourceRef,
    doc.supersedesId, doc.status === 'published' ? stamp : null, stamp, stamp,
  );
  return getKbDoc(doc.id);
}

export function updateKbDoc(id, patch = {}) {
  const current = getKbDoc(id);
  if (!current) return null;
  const next = {
    title: patch.title != null ? String(patch.title).trim().slice(0, 200) || current.title : current.title,
    kind: patch.kind != null ? normalizeKind(patch.kind) : current.kind,
    status: patch.status != null ? normalizeStatus(patch.status) : current.status,
    visibility: patch.visibility != null ? normalizeVisibility(patch.visibility) : current.visibility,
    summary: patch.summary != null ? String(patch.summary).trim() : current.summary,
    bodyMd: patch.bodyMd != null ? String(patch.bodyMd) : current.bodyMd,
    tool: patch.tool != null ? String(patch.tool).trim().slice(0, 80) : current.tool,
    prompt: patch.prompt != null ? String(patch.prompt) : current.prompt,
    tags: patch.tags != null ? normalizeTags(patch.tags) : current.tags,
    source: patch.source != null ? String(patch.source).trim().slice(0, 60) : current.source,
    sourceRef: patch.sourceRef != null ? String(patch.sourceRef).trim().slice(0, 500) : current.sourceRef,
  };
  const stamp = now();
  const verifiedAt = next.status === 'published'
    ? (current.status === 'published' ? current.verifiedAt || stamp : stamp)
    : current.verifiedAt;
  db.prepare(`
    UPDATE kb_docs SET title = ?, kind = ?, status = ?, visibility = ?, summary = ?, body_md = ?, tool = ?, prompt = ?, tags = ?,
      search_text = ?, source = ?, source_ref = ?, version = ?, verified_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    next.title, next.kind, next.status, next.visibility, next.summary, next.bodyMd, next.tool, next.prompt,
    JSON.stringify(next.tags), kbSearchText(next), next.source, next.sourceRef,
    current.version + 1, verifiedAt, stamp, id,
  );
  return getKbDoc(id);
}

export function setKbDocStatus(id, status) {
  const current = getKbDoc(id);
  if (!current) return null;
  const next = normalizeStatus(status);
  const stamp = now();
  db.prepare('UPDATE kb_docs SET status = ?, verified_at = ?, updated_at = ? WHERE id = ?')
    .run(next, next === 'published' ? stamp : current.verifiedAt, stamp, id);
  return getKbDoc(id);
}

export function deleteKbDoc(id) {
  return db.prepare('DELETE FROM kb_docs WHERE id = ?').run(id).changes > 0;
}

export function listMemberKbDocs({ q = '', kind = '', limit = 200 } = {}) {
  const where = ["status = 'published'"];
  const params = [];
  if (kind) { where.push('kind = ?'); params.push(normalizeKind(kind)); }
  if (q) { where.push('search_text LIKE ?'); params.push(`%${q.toLowerCase()}%`); }
  params.push(Math.min(Math.max(Number(limit) || 200, 1), 500));
  return db.prepare(`
    SELECT * FROM kb_docs WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ?
  `).all(...params).map(mapKbRow);
}

export function getMemberKbDoc(id) {
  const row = db.prepare(
    "SELECT * FROM kb_docs WHERE id = ? AND status = 'published'",
  ).get(id);
  return mapKbRow(row);
}

function likeEscape(value) {
  return String(value).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** 给 AI 检索用：只返回已发布条目 */
export function searchKbPublished(query, { kind = '', limit = 8 } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean).slice(0, 6);
  const clauses = [];
  const params = [];
  for (const word of words) {
    clauses.push("search_text LIKE ? ESCAPE '\\'");
    params.push(`%${likeEscape(word.toLowerCase())}%`);
  }
  const where = [`status = 'published'`, `(${clauses.join(' OR ')})`];
  if (kind) { where.push('kind = ?'); params.push(normalizeKind(kind)); }
  const orderParam = `%${likeEscape(q.toLowerCase())}%`;
  const lim = Math.min(Math.max(Number(limit) || 8, 1), 30);
  return db.prepare(`
    SELECT id, title, kind, summary, body_md, tool, prompt, tags, verified_at, updated_at
    FROM kb_docs WHERE ${where.join(' AND ')}
    ORDER BY CASE WHEN title LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT ?
  `).all(...params, orderParam, lim)
    .map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      summary: row.summary,
      body: row.body_md,
      tool: row.tool,
      prompt: row.prompt,
      tags: (() => { try { return JSON.parse(row.tags); } catch { return []; } })(),
      verifiedAt: row.verified_at,
      updatedAt: row.updated_at,
    }));
}

export function kbStats() {
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM kb_docs GROUP BY status').all();
  const byKind = db.prepare('SELECT kind, COUNT(*) AS n FROM kb_docs WHERE status = \'published\' GROUP BY kind').all();
  const stats = { draft: 0, published: 0, archived: 0 };
  for (const row of rows) stats[row.status] = row.n;
  return { ...stats, total: rows.reduce((sum, row) => sum + row.n, 0), byKind };
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
