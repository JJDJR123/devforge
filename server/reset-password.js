import {
  closeDatabase,
  deleteSessionsForUser,
  getUserByUsername,
  updatePassword,
} from './db.js';
import { hashPassword, validatePassword } from './auth.js';

const username = String(process.argv[2] || '').trim();
const newPassword = String(process.argv[3] || process.env.NEW_PASSWORD || '');

if (!username || !newPassword) {
  console.error('用法: node server/reset-password.js <用户名> <新密码>');
  console.error('或:   NEW_PASSWORD=新密码 node server/reset-password.js <用户名>');
  process.exit(1);
}

const check = validatePassword(newPassword);
if (!check.ok) {
  console.error(check.message);
  process.exit(1);
}

const user = getUserByUsername(username);
if (!user) {
  console.error(`用户不存在: ${username}`);
  process.exit(1);
}

updatePassword(user.id, hashPassword(newPassword));
const removed = deleteSessionsForUser(user.id);
console.log(`已重置 ${user.username} 的密码，并退出 ${removed} 个已登录会话。`);
closeDatabase();
