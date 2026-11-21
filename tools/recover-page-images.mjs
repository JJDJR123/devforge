#!/usr/bin/env node
/**
 * 只读排查：在服务器或本地数据库/备份中寻找某页面的图片块。
 * 不修改数据库、不上传、不删除。
 *
 * 用法（在 /opt/devforge 下）：
 *   /opt/node/bin/node tools/recover-page-images.mjs
 *   PAGE_TITLE="01火焰-火焰火花本体" /opt/node/bin/node tools/recover-page-images.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const TITLE = process.env.PAGE_TITLE || '01火焰-火焰火花本体';
const root = process.cwd();
const currentDb = path.join(root, 'data', 'devforge.db');
const backupDir = path.join(root, 'data', 'backups');

function walkImages(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) walkImages(item, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  if (value.type === 'image') {
    output.push({
      type: 'image',
      url: value.props?.url || '',
      name: value.props?.name || '',
      caption: value.props?.caption || '',
    });
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') walkImages(child, output);
  }
  return output;
}

function openReadonly(file) {
  try {
    return new DatabaseSync(file, { readOnly: true });
  } catch {
    return new DatabaseSync(file);
  }
}

function inspectDb(file) {
  if (!fs.existsSync(file)) return;
  let db;
  try {
    db = openReadonly(file);
    const exact = db.prepare('SELECT id, title, updated_at, blocks FROM pages WHERE title = ?').all(TITLE);
    const fuzzy = exact.length ? [] : db.prepare('SELECT id, title, updated_at, blocks FROM pages WHERE title LIKE ?').all(`%${TITLE.slice(0, 4)}%`);
    const rows = [...exact, ...fuzzy];
    if (!rows.length) {
      console.log(`\n[${path.relative(root, file)}] 没有找到标题匹配的页面`);
      return;
    }
    for (const row of rows) {
      let blocks = [];
      try { blocks = JSON.parse(row.blocks || '[]'); } catch { blocks = []; }
      const images = walkImages(blocks);
      console.log(`\n[${path.relative(root, file)}]`);
      console.log(`  page: ${row.title} (${row.id})`);
      console.log(`  updated: ${row.updated_at}`);
      console.log(`  blocks: ${blocks.length}`);
      console.log(`  image blocks: ${images.length}`);
      for (const image of images.slice(0, 50)) {
        console.log(`    - ${image.name || '(未命名)'} | ${image.url || '(无 URL)'} | ${image.caption || ''}`);
      }
    }
  } catch (error) {
    console.log(`\n[${path.relative(root, file)}] 读取失败：${error.message}`);
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

console.log(`=== 只读查找页面：${TITLE} ===`);
console.log(`当前目录：${root}`);
inspectDb(currentDb);

if (fs.existsSync(backupDir)) {
  const backups = fs.readdirSync(backupDir)
    .filter((name) => name.endsWith('.db'))
    .sort()
    .reverse();
  console.log(`\n=== 备份文件：${backups.length} 个 ===`);
  for (const name of backups) inspectDb(path.join(backupDir, name));
} else {
  console.log('\n没有 data/backups 目录');
}

const uploadsDir = path.join(root, 'data', 'uploads');
if (fs.existsSync(uploadsDir)) {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  const files = fs.readdirSync(uploadsDir)
    .map((name) => {
      const full = path.join(uploadsDir, name);
      try {
        const stat = fs.statSync(full);
        return { name, size: stat.size, mtime: stat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((file) => file.mtime >= cutoff)
    .sort((a, b) => b.mtime - a.mtime);
  console.log(`\n=== 最近 6 小时上传文件：${files.length} 个 ===`);
  for (const file of files.slice(0, 100)) {
    console.log(`  ${new Date(file.mtime).toISOString()}  ${file.size}  ${file.name}`);
  }
}

console.log('\n只读排查结束，没有修改任何数据。');
