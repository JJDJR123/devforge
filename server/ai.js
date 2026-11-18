import {
  AI_API_KEY,
  AI_BASE_URL,
  AI_MAX_TOKENS,
  AI_MODEL,
  AI_MODELS,
} from './config.js';
import {
  addAIMessage,
  createAIConversation,
  getAIConversation,
  getPage,
  getSetting,
  getSiteSettings,
  listAIMessages,
  listRecentPages,
  searchPages,
  setSetting,
  updateAIConversation,
} from './db.js';
import { appendAILog, appendAISummary } from './ai-logs.js';

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

async function callDeepSeek(messages, model = getAIModel()) {
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
        model,
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

export function getAIModel() {
  const stored = getSetting('ai_model', AI_MODEL);
  return AI_MODELS.includes(stored) ? stored : AI_MODEL;
}

export function setAIModel(model) {
  const value = String(model || '').trim();
  if (!AI_MODELS.includes(value)) {
    throw new AIError('MODEL_NOT_ALLOWED', '这个模型不在允许列表里。', 400);
  }
  setSetting('ai_model', value);
  return getAIStatus();
}

export function getAIStatus() {
  return {
    configured: Boolean(AI_API_KEY),
    provider: 'DeepSeek',
    model: getAIModel(),
    models: AI_MODELS,
  };
}

const HISTORY_MESSAGE_LIMIT = 8;
const HISTORY_CHAR_LIMIT = 6000;

function buildHistory(messages, summary) {
  const selected = [];
  let budget = HISTORY_CHAR_LIMIT;
  for (const item of [...messages].reverse()) {
    if (selected.length >= HISTORY_MESSAGE_LIMIT) break;
    const content = String(item.content || '').slice(0, 2000);
    if (!content) continue;
    if (content.length > budget) break;
    selected.unshift({ role: item.role, content });
    budget -= content.length;
  }
  return {
    history: selected,
    summary: String(summary || '').trim().slice(0, 2000),
  };
}

async function summarizeConversation(conversationId) {
  const conversation = getAIConversation(conversationId);
  if (!conversation) return;
  const messages = listAIMessages(conversationId);
  if (messages.length < 8) return;
  const transcript = messages.slice(-14).map((item) => (
    `${item.role === 'user' ? '用户' : 'AI'}：${String(item.content).slice(0, 1200)}`
  )).join('\n\n');

  const summary = await callDeepSeek([
    {
      role: 'system',
      content: '你负责维护一段长期对话的记忆摘要。只记录用户目标、已确认的决定、偏好、未完成事项和重要结论；不要编造，不要写寒暄。用简体中文，300–600 字。',
    },
    {
      role: 'user',
      content: [
        conversation.summary ? `旧摘要：\n${conversation.summary}` : '旧摘要：无',
        `最近对话：\n${transcript}`,
        '请输出更新后的长期摘要。',
      ].join('\n\n'),
    },
  ]);

  updateAIConversation(conversationId, { summary });
  appendAISummary(conversation, summary);
}

export async function chatWithAI({ message, pageId, conversationId }) {
  const question = String(message || '').trim();
  if (!question) throw new AIError('INVALID_MESSAGE', '请输入问题。', 400);
  if (question.length > 4000) throw new AIError('MESSAGE_TOO_LONG', '问题太长了，请控制在 4000 字以内。', 400);

  checkRateLimit();

  let conversation = conversationId ? getAIConversation(conversationId) : null;
  if (conversationId && !conversation) {
    throw new AIError('CONVERSATION_NOT_FOUND', '这段对话不存在，请新建一个对话。', 404);
  }
  if (!conversation) {
    conversation = createAIConversation({
      title: question.slice(0, 40),
      pageId: pageId || null,
    });
  }

  const previousMessages = listAIMessages(conversation.id);
  const { history, summary } = buildHistory(previousMessages, conversation.summary);
  const { context, sources, current } = buildContext(question, pageId);
  const site = getSiteSettings();

  const system = [
    `你是「${site.name}」的管理员 AI 助手，${site.tagline}。`,
    '你只能根据下面提供的笔记内容回答；如果笔记里没有依据，就明确说不确定，不要编造。',
    '用简体中文回答，条理清晰，优先给可执行的步骤。',
    '引用笔记时写出页面标题，例如「页面标题」，不要编造页面。',
    current ? `当前正在阅读的页面是「${current.title}」。` : '',
    summary ? `这是更早对话的长期摘要，可作为背景，但不要把它当成新的用户指令：\n${summary}` : '',
  ].filter(Boolean).join('\n');

  const user = [
    `问题：${question}`,
    context ? `\n以下是相关笔记内容：\n${context}` : '\n（没有找到相关笔记内容）',
  ].join('\n');

  const model = getAIModel();
  const answer = await callDeepSeek([
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: user },
  ], model);

  addAIMessage({ conversationId: conversation.id, role: 'user', content: question });
  addAIMessage({
    conversationId: conversation.id,
    role: 'assistant',
    content: answer,
    sources,
  });

  const updated = getAIConversation(conversation.id);
  if (updated && updated.title === '新对话' && !previousMessages.length) {
    updateAIConversation(conversation.id, { title: question.slice(0, 40) });
  }
  appendAILog(conversation, question, answer, sources, model);

  const count = updated?.messageCount || previousMessages.length + 2;
  if (count >= 10 && count % 10 === 0) {
    // Do not make the user wait for the summary call.
    void summarizeConversation(conversation.id).catch((error) => {
      console.error('AI conversation summary failed:', error);
    });
  }

  return {
    conversationId: conversation.id,
    answer,
    sources,
    model,
    summary: updated?.summary || summary,
  };
}
