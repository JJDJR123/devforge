import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

// Local development convenience. Docker injects real environment variables.
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // .env is optional.
}

function resolveDir(value, fallback) {
  const dir = value ? path.resolve(ROOT, value) : path.join(ROOT, fallback);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const DATA_DIR = resolveDir(process.env.DATA_DIR, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

export const DIST_DIR = path.join(ROOT, 'dist');
export const PORT = Number(process.env.PORT || 3001);
export const HOST = process.env.HOST || '127.0.0.1';
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 25);
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const MAX_BLOCKS_BYTES = 5 * 1024 * 1024;
export const SETUP_TOKEN = String(process.env.SETUP_TOKEN || '').trim();
export const ICP_NUMBER = String(process.env.ICP_NUMBER || '').trim();
export const ICP_LINK = String(process.env.ICP_LINK || 'https://beian.miit.gov.cn/').trim();
export const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true'
  ? true
  : process.env.COOKIE_SECURE === 'false'
    ? false
    : null;

// DeepSeek / OpenAI-compatible chat API. The key never leaves the server.
export const AI_API_KEY = String(process.env.AI_API_KEY || '').trim();
export const AI_BASE_URL = String(process.env.AI_BASE_URL || 'https://api.deepseek.com').trim().replace(/\/+$/, '');
const DEFAULT_AI_MODELS = ['deepseek-flash', 'deepseek-v4-pro'];
const configuredAIModels = String(process.env.AI_MODELS || DEFAULT_AI_MODELS.join(','))
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);
export const AI_MODELS = Array.from(new Set(configuredAIModels.length ? configuredAIModels : DEFAULT_AI_MODELS));
const requestedAIModel = String(process.env.AI_MODEL || 'deepseek-flash').trim();
export const AI_MODEL = AI_MODELS.includes(requestedAIModel) ? requestedAIModel : AI_MODELS[0];
export const AI_MAX_TOKENS = Math.min(4000, Math.max(200, Number(process.env.AI_MAX_TOKENS || 1200)));

export const DEFAULT_THEME = {
  preset: 'forge',
  accent: '#f16436',
  radius: 6,
  fontScale: 100,
  density: 'comfortable',
  grid: false,
  glow: false,
};
