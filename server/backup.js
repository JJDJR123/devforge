import fs from 'node:fs';
import path from 'node:path';
import { BACKUP_DIR } from './config.js';
import { closeDatabase, databasePath, db } from './db.js';

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const target = path.join(BACKUP_DIR, `devforge-${stamp}.db`);

if (!fs.existsSync(databasePath())) {
  console.error(`数据库不存在: ${databasePath()}`);
  process.exit(1);
}

const escaped = target.replace(/'/g, "''");
db.exec(`VACUUM INTO '${escaped}'`);

const files = fs.readdirSync(BACKUP_DIR)
  .filter((name) => /^devforge-.*\.db$/.test(name))
  .map((name) => ({ name, time: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
  .sort((a, b) => b.time - a.time);

for (const file of files.slice(14)) {
  try { fs.unlinkSync(path.join(BACKUP_DIR, file.name)); } catch { /* ignore */ }
}

const size = fs.statSync(target).size;
console.log(`备份完成: ${target} (${(size / 1024).toFixed(1)} KB)`);
console.log(`本地上传目录需要单独备份: ${path.resolve(path.dirname(databasePath()), 'uploads')}`);
closeDatabase();
