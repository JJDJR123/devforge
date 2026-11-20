#!/usr/bin/env node
/**
 * DEVFORGE 知识库 MCP server（stdio）
 *
 * 只暴露两个工具：
 *   kb_search  —— 检索已发布条目
 *   kb_propose —— 提交草稿，等待管理员审核
 *
 * 环境变量：
 *   DEVFORGE_KB_URL        默认 http://127.0.0.1:3000
 *   DEVFORGE_KB_TOKEN      在平台「知识库 → 接口 token」里生成
 *   DEVFORGE_KB_TOKEN_FILE 可选，默认 ~/.devforge-kb-token
 *
 * 如果 Codex 没有把 token 环境变量传进来，就把 token 写进
 * ~/.devforge-kb-token（或 DEVFORGE_KB_TOKEN_FILE 指定的文件），本进程会读它。
 *
 * 这个进程不读取 API Key，不直接访问 SQLite，只调用平台 HTTP API。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const TOKEN_FILE = process.env.DEVFORGE_KB_TOKEN_FILE
  || path.join(os.homedir(), '.devforge-kb-token');

function readToken() {
  const fromEnv = String(process.env.DEVFORGE_KB_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch {
    return '';
  }
}

const BASE = (process.env.DEVFORGE_KB_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
let TOKEN = readToken();
const PROTOCOL = '2024-11-05';
const SERVER_INFO = { name: 'devforge-kb', version: '1.0.0' };

const tools = [
  {
    name: 'kb_search',
    description: '检索 DEVFORGE 中已经由管理员发布的 AI 知识库条目。只返回 published，不返回草稿。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索关键词，例如：像素立绘 工作流' },
        kind: {
          type: 'string',
          enum: ['recipe', 'rule', 'fact', 'reference'],
          description: '可选：按类型过滤',
        },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: '最多返回条数，默认 5' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'kb_propose',
    description: '向 DEVFORGE 知识库提交一条草稿。草稿需要管理员在网页审核通过后才会进入 AI 检索。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '条目标题' },
        kind: {
          type: 'string',
          enum: ['recipe', 'rule', 'fact', 'reference'],
          description: '类型，默认 recipe',
        },
        summary: { type: 'string', description: '一句话摘要；检索时先看这句' },
        body: { type: 'string', description: 'Markdown 正文：步骤、参数、产出' },
        tool: { type: 'string', description: '工具链，例如 ComfyUI / Blender 5.2' },
        prompt: { type: 'string', description: '可复用提示词' },
        tags: {
          oneOf: [
            { type: 'string', description: '逗号分隔的标签' },
            { type: 'array', items: { type: 'string' }, description: '标签数组' },
          ],
          description: '标签',
        },
        sourceRef: { type: 'string', description: '来源对话或链接' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
];

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function rpcResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function rpcError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function api(path, options = {}) {
  if (!TOKEN) {
    throw new Error(`没有设置 DEVFORGE_KB_TOKEN。可以把 token 写进 ${TOKEN_FILE}，或配置 MCP 的环境变量。`);
  }
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${TOKEN}`,
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) {
    const message = data?.message || data?.error || text || `HTTP ${response.status}`;
    throw new Error(`平台返回 ${response.status}：${message}`);
  }
  return data;
}

function textResult(text, isError = false) {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}

async function callTool(name, args) {
  if (name === 'kb_search') {
    const query = String(args?.query || '').trim();
    if (!query) throw new Error('query 不能为空。');
    const params = new URLSearchParams({ q: query });
    if (args?.kind) params.set('kind', String(args.kind));
    if (args?.limit) params.set('limit', String(args.limit));
    const data = await api(`/api/kb/search?${params.toString()}`);
    const hits = Array.isArray(data?.results) ? data.results : [];
    if (!hits.length) return textResult(`没有找到与「${query}」相关的已发布知识库条目。`);
    const blocks = hits.map((hit, index) => {
      const lines = [
        `${index + 1}. ${hit.title}（${hit.kind}）`,
        hit.summary ? `摘要：${hit.summary}` : '',
        hit.tool ? `工具：${hit.tool}` : '',
        hit.body ? `正文：\n${String(hit.body).slice(0, 3200)}` : '',
        hit.prompt ? `提示词：\n${hit.prompt}` : '',
        hit.tags?.length ? `标签：${hit.tags.join('、')}` : '',
      ];
      return lines.filter(Boolean).join('\n');
    });
    return textResult(`找到 ${hits.length} 条已发布知识库条目：\n\n${blocks.join('\n\n---\n\n')}`);
  }

  if (name === 'kb_propose') {
    const title = String(args?.title || '').trim();
    if (!title) throw new Error('title 不能为空。');
    const data = await api('/api/kb/propose', {
      method: 'POST',
      body: JSON.stringify({
        title,
        kind: args?.kind || 'recipe',
        summary: args?.summary || '',
        body: args?.body || '',
        tool: args?.tool || '',
        prompt: args?.prompt || '',
        tags: args?.tags || [],
        sourceRef: args?.sourceRef || '',
      }),
    });
    const doc = data?.doc;
    return textResult(`已提交草稿：${doc?.title || title}（${doc?.id || '未知 id'}）。请在 DEVFORGE → 知识库 → 待审中审核；审核通过前不会被 AI 检索。`);
  }

  throw new Error(`未知工具：${name}`);
}

async function handle(message) {
  const { id, method, params } = message;
  if (method === 'initialize') {
    rpcResult(id, {
      protocolVersion: params?.protocolVersion || PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
    return;
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return;
  if (method === 'ping') {
    rpcResult(id, {});
    return;
  }
  if (method === 'tools/list') {
    rpcResult(id, { tools });
    return;
  }
  if (method === 'tools/call') {
    try {
      const result = await callTool(params?.name, params?.arguments || {});
      rpcResult(id, result);
    } catch (error) {
      rpcResult(id, textResult(`知识库工具失败：${error.message}`, true));
    }
    return;
  }
  if (id != null) rpcError(id, -32601, `不支持的方法：${method}`);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    rpcError(null, -32700, 'JSON 解析失败');
    return;
  }
  void handle(message);
});
