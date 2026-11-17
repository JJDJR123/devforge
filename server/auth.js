import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  COOKIE_SECURE,
  DATA_DIR,
  SESSION_DAYS,
  SETUP_TOKEN,
} from './config.js';
import {
  createSession,
  deleteSession,
  findSession,
} from './db.js';

export const COOKIE_NAME = 'df_session';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function issueSession(userId) {
  const token = newToken();
  const days = Math.max(1, SESSION_DAYS);
  const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
  createSession({ tokenHash: hashToken(token), userId, expiresAt });
  return { token, expiresAt, maxAge: Math.floor((expiresAt - Date.now()) / 1000) };
}

export function resolveSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || token.length > 200) return null;
  const session = findSession(hashToken(token));
  if (!session) return null;
  return {
    tokenHash: session.id,
    user: { id: session.user_id, username: session.username },
    expiresAt: session.expires_at,
  };
}

export function destroySession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) deleteSession(hashToken(token));
}

export function isSecureRequest(req) {
  if (COOKIE_SECURE !== null) return COOKIE_SECURE;
  return req.protocol === 'https';
}

export function setSessionCookie(reply, req, token, maxAge) {
  reply.setCookie(COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    maxAge,
  });
}

export function clearSessionCookie(reply, req) {
  reply.clearCookie(COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
  });
}

export function requireAuth(req, reply, done) {
  const session = resolveSession(req);
  if (!session) {
    reply.code(401).send({ error: 'UNAUTHORIZED', message: '登录已过期，请重新登录。' });
    return;
  }
  req.session = session;
  req.user = session.user;
  done();
}

/* ------------------------------------------------------------------ */
/* login throttling                                                    */
/* ------------------------------------------------------------------ */

const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function bucket(req) {
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(key, entry);
  }
  return entry;
}

export function loginAllowed(req) {
  return bucket(req).count < MAX_ATTEMPTS;
}

export function recordLoginFailure(req) {
  const entry = bucket(req);
  entry.count += 1;
  return Math.max(0, MAX_ATTEMPTS - entry.count);
}

export function clearLoginFailures(req) {
  attempts.delete(req.ip || req.socket?.remoteAddress || 'unknown');
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(key);
  }
}, 60_000).unref();

/* ------------------------------------------------------------------ */
/* setup token                                                         */
/* ------------------------------------------------------------------ */

export function setupToken() {
  if (SETUP_TOKEN) return SETUP_TOKEN;
  const file = path.join(DATA_DIR, 'setup-token.txt');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch { /* generate below */ }
  const token = crypto.randomBytes(9).toString('base64url').toUpperCase();
  fs.writeFileSync(file, `${token}\n`, { mode: 0o600 });
  return token;
}

export function setupTokenValid(candidate) {
  const expected = setupToken();
  const a = Buffer.from(String(candidate || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function clearSetupTokenFile() {
  if (SETUP_TOKEN) return;
  try { fs.unlinkSync(path.join(DATA_DIR, 'setup-token.txt')); } catch { /* already gone */ }
}

export function validateUsername(username) {
  const value = String(username || '').trim();
  if (value.length < 2 || value.length > 32) {
    return { ok: false, message: '用户名需要 2–32 个字符。' };
  }
  if (!/^[\p{L}\p{N}_-]+$/u.test(value)) {
    return { ok: false, message: '用户名只能包含文字、数字、下划线或短横线。' };
  }
  return { ok: true, value };
}

export function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8 || value.length > 200) {
    return { ok: false, message: '密码至少需要 8 个字符。' };
  }
  return { ok: true, value };
}
