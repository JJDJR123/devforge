import {
  AI_API_KEY,
  AI_BASE_URL,
  AI_MAX_TOKENS,
  AI_MODEL,
} from './config.js';
import {
  getPage,
  getSiteSettings,
  listRecentPages,
  searchPages,
} from './db.js';

export class AIError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 20;
const requestTimes = [];

function checkRateLimit() {
  const now = Date.now();
  while (requestTimes.length && requestTimes[0] < now - RATE_WINDOW_MS) requestTimes.shift();
  if (requestTimes.length >= RATE_LIMIT) {
    throw new AIError('AI_RATE_LIMIT', 'AI 请求太频繁了，休息几分钟再试。', 429);
  }
  requestTimes.push(now);
}

function textFromInline(content) {
  if (!Array.isArray(content)) return '';
  return content.map((item) => {
    if (!item || typeof item !== 'object') return '';
    if (typeof item.text === 'string') return item.text;
    if (Array.isArray(item.content)) return textFromInline(item.content);
    return '';
  }).join('');
}

function textFromBlock(block) {
  if (!block || typeof block !== 'object') return '';
  const own = textFromInline(block.content);
  const children = Array.isArray(block.children)
    ? block.children.map(textFromBlock).join('\n')
    : '';
  return [own, children].filter(Boolean).join('\n');
}

function pageText(page, limit = 6000) {
  if (!page) return '';
  const body = (Array.isArray(page.blocks) ? page.blocks : []).map(textFromBlock).join('\n').trim();
  return body.slice(0, limit);
}

function buildContext(question, pageId) {
  const current = pageId ? getPage(pageId) : null;
  const found = searchPages(question, 6);
  const candidates = [];
  if (current) candidates.push(current);
  for (const hit of found) {
    if (candidates.some((page) => page.id === hit.id)) continue;
    const page = getPage(hit.id);
    if (page) candidates.push(page);
  }
  if (!candidates.length) {
    for (const recent of listRecentPages(4)) {
      const page = getPage(recent.id);
      if (page) candidates.push(page);
    }
  }

  const sources = [];
  const chunks = [];
  let budget = 15000;
  for (const page of candidates) {
    if (budget <= 0) break;
    const body = pageText(page, 5000);
    if (!body) continue;
    const text = `【页面：${page.title}】\n模块：${page.moduleId}\n${body}`;
    const bounded = text.slice(0, budget);
    chunks.push(bounded);
    budget -= bounded.length;
    sources.push({ id: page.id, title: page.title, icon: page.icon });
  }

  return {
    context: chunks.join('\n\n---\n\n'),
    sources,
    current: current ? { id: current.id, title: current.title } : null,
  };
}

async function callDeepSeek(messages) {
  if (!AI_API_KEY) {
    throw new AIError(
      'AI_NOT_CONFIGURED',
      '还没有配置 DeepSeek API Key。请在服务器 .env 里设置 AI_API_KEY 并重启服务。',
      503,
    );
  }

  let response;
  try {
    response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: AI_MAX_TOKENS,
        stream: false,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      throw new AIError('AI_TIMEOUT', 'DeepSeek 响应超时，请稍后再试。', 504);
    }
    throw new AIError('AI_UPSTREAM_ERROR', '连接 DeepSeek 失败，请检查服务器网络。', 502);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AIError('AI_AUTH_FAILED', 'DeepSeek API Key 无效或没有权限。', 502);
    }
    if (response.status === 429) {
      throw new AIError('AI_UPSTREAM_LIMIT', 'DeepSeek 额度或频率受限，请稍后再试。', 429);
    }
    throw new AIError('AI_UPSTREAM_ERROR', `DeepSeek 返回错误（${response.status}）。`, 502);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new AIError('AI_EMPTY', 'DeepSeek 没有返回内容，请换一种问法。', 502);
  }
  return content.trim();
}

export function getAIStatus() {
  return {
    configured: Boolean(AI_API_KEY),
    model: AI_MODEL,
    provider: 'DeepSeek',
  };
}

export async function chatWithAI({ message, pageId }) {
  const question = String(message || '').trim();
  if (!question) throw new AIError('INVALID_MESSAGE', '请输入问题。', 400);
  if (question.length > 4000) throw new AIError('MESSAGE_TOO_LONG', '问题太长了，请控制在 4000 字以内。', 400);

  checkRateLimit();
  const { context, sources, current } = buildContext(question, pageId);
  const site = getSiteSettings();

  const system = [
    `你是「${site.name}」的管理员 AI 助手，${site.tagline}。`,
    '你只能根据下面提供的笔记内容回答；如果笔记里没有依据，就明确说不确定，不要编造。',
    '用简体中文回答，条理清晰，优先给可执行的步骤。',
    '引用笔记时写出页面标题，例如「页面标题」，不要编造页面。',
    current ? `当前正在阅读的页面是「${current.title}」。` : '',
  ].filter(Boolean).join('\n');

  const user = [
    `问题：${question}`,
    context ? `\n以下是相关笔记内容：\n${context}` : '\n（没有找到相关笔记内容）',
  ].join('\n');

  const answer = await callDeepSeek([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  return { answer, sources };
}
