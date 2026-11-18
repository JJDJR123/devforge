import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { listAIConversations } from './db.js';

export const AI_LOG_DIR = path.join(DATA_DIR, 'ai-logs');

function ensureDir() {
  fs.mkdirSync(AI_LOG_DIR, { recursive: true });
}

function safeId(id) {
  return String(id || 'conversation').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function fileFor(id) {
  return path.join(AI_LOG_DIR, `${safeId(id)}.md`);
}

export function rebuildAILogIndex() {
  ensureDir();
  const rows = listAIConversations(100);
  const lines = [
    '# AI 对话日志索引',
    '',
    `> 由 DEVFORGE 自动维护，最后更新：${stamp()}`,
    '> 完整对话在同一个目录的 `<conversation-id>.md` 文件里。',
    '',
    '| 会话 | 标题 | 消息数 | 最近更新 |',
    '| --- | --- | ---: | --- |',
  ];
  for (const row of rows) {
    const title = String(row.title || '新对话').replace(/\|/g, '\\|');
    lines.push(`| [${row.id}](${row.id}.md) | ${title} | ${row.messageCount || 0} | ${row.updatedAt} |`);
  }
  lines.push('');
  fs.writeFileSync(path.join(AI_LOG_DIR, 'index.md'), `${lines.join('\n')}\n`, 'utf8');
}

export function appendAILog(conversation, userText, assistantText, sources = []) {
  try {
    ensureDir();
    const file = fileFor(conversation.id);
    const isNew = !fs.existsSync(file);
    const parts = [];
    if (isNew) {
      parts.push(
        `# AI 对话：${conversation.title || '新对话'}`,
        '',
        `- 会话 ID：\`${conversation.id}\``,
        `- 创建时间：${conversation.createdAt || stamp()}`,
        conversation.pageId ? `- 起始页面 ID：\`${conversation.pageId}\`` : '',
        '',
        '> 本文件是本地对话日志。上下文窗口会使用摘要 + 最近消息 + 相关页面，而不是全文回灌。',
        '',
        '---',
        '',
      );
    }

    parts.push(
      `## ${stamp()} · 用户`,
      '',
      userText,
      '',
      `## ${stamp()} · AI`,
      '',
      assistantText,
      '',
    );
    if (sources.length) {
      parts.push('**参考页面**');
      for (const source of sources) {
        parts.push(`- ${source.icon || '📄'} ${source.title}（\`${source.id}\`）`);
      }
      parts.push('');
    }
    parts.push('---', '');

    fs.appendFileSync(file, `${parts.filter((part) => part !== null).join('\n')}\n`, 'utf8');
    rebuildAILogIndex();
  } catch (error) {
    // Logging must never break the chat response.
    console.error('AI log write failed:', error);
  }
}

export function appendAISummary(conversation, summary) {
  try {
    ensureDir();
    const file = fileFor(conversation.id);
    fs.appendFileSync(
      file,
      `\n> **长期摘要更新**（${stamp()}）\n>\n> ${String(summary).replace(/\n/g, '\n> ')}\n\n---\n`,
      'utf8',
    );
    rebuildAILogIndex();
  } catch (error) {
    console.error('AI summary log write failed:', error);
  }
}
