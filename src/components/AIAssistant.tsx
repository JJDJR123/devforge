import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Bot,
  FileText,
  History,
  Loader2,
  Plus,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../api';
import type { AIConversation, AIMessage, AIStatus, AISource } from '../types';
import { cn, formatRelativeTime, getErrorMessage } from '../utils';

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  sources?: AISource[];
};

const GREETING: ChatMessage = {
  role: 'assistant',
  text: '我是你的学习舱 AI 助手。可以让我总结当前页面、根据笔记回答问题，或者帮你找相关笔记。对话会保存在本地。',
};

export function AIAssistant() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState('');
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [modelBusy, setModelBusy] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const pageId = location.pathname.startsWith('/page/')
    ? decodeURIComponent(location.pathname.slice('/page/'.length).split('/')[0] || '') || null
    : null;

  function toChatMessage(message: AIMessage): ChatMessage {
    return { role: message.role, text: message.content, sources: message.sources };
  }

  async function refreshConversations() {
    const result = await api.aiConversations();
    setConversations(result.conversations);
    return result.conversations;
  }

  async function loadConversation(id: string) {
    setLoadingHistory(true);
    setError('');
    try {
      const result = await api.aiConversation(id);
      setConversationId(result.conversation.id);
      setConversationTitle(result.conversation.title);
      setMessages(result.messages.map(toChatMessage));
      setHistoryOpen(false);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoadingHistory(false);
    }
  }

  async function loadStartup() {
    setStatusLoading(true);
    setError('');
    try {
      const [aiStatus, conversationList] = await Promise.all([
        api.aiStatus(),
        api.aiConversations(),
      ]);
      setStatus(aiStatus);
      setConversations(conversationList.conversations);
      if (!conversationId && conversationList.conversations[0]) {
        await loadConversation(conversationList.conversations[0].id);
      }
    } catch (loadError) {
      setStatus(null);
      setError(getErrorMessage(loadError));
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    if (open) void loadStartup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy, open]);

  function newConversation() {
    setConversationId(null);
    setConversationTitle('');
    setMessages([]);
    setHistoryOpen(false);
    setError('');
  }

  async function changeModel(model: string) {
    if (modelBusy || model === status?.model) return;
    setModelBusy(true);
    setError('');
    try {
      const next = await api.setAIModel(model);
      setStatus(next);
    } catch (changeError) {
      setError(getErrorMessage(changeError));
    } finally {
      setModelBusy(false);
    }
  }

  async function send(text?: string) {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    if (!status?.configured) {
      setError('还没有配置 DeepSeek API Key。');
      return;
    }
    setError('');
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setBusy(true);
    try {
      const result = await api.aiChat({ message: question, pageId, conversationId });
      setConversationId(result.conversationId);
      if (!conversationTitle) setConversationTitle(question.slice(0, 40));
      setMessages((prev) => [...prev, {
        role: 'assistant',
        text: result.answer,
        sources: result.sources,
      }]);
      void refreshConversations().catch(() => undefined);
    } catch (chatError) {
      const message = getErrorMessage(chatError);
      setError(message);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        text: `这次没有成功：${message}`,
      }]);
    } finally {
      setBusy(false);
    }
  }

  const showingChat = Boolean(status?.configured);

  return (
    <div className={cn('ai-assistant', open && 'is-open')}>
      {open ? (
        <section className="ai-panel" aria-label="AI 助手">
          <header className="ai-head">
            <div className="ai-head-title">
              <span className="ai-head-mark"><Bot size={17} /></span>
              <div>
                <strong>AI 助手</strong>
                <span>{status?.configured ? `${status.provider} · 模型可切换` : '等待配置'}</span>
              </div>
            </div>
            <div className="ai-head-actions">
              <button type="button" className="icon-btn" onClick={newConversation} aria-label="新对话" title="新对话">
                <Plus size={16} />
              </button>
              <button
                type="button"
                className={cn('icon-btn', historyOpen && 'is-active')}
                onClick={() => setHistoryOpen((value) => !value)}
                aria-label="对话记录"
                title="对话记录"
              >
                <History size={16} />
              </button>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="关闭 AI 助手">
                <X size={17} />
              </button>
            </div>
          </header>

          {showingChat && status ? (
            <div className="ai-model-bar">
              <label htmlFor="ai-model-select">模型</label>
              <select
                id="ai-model-select"
                value={status.model}
                onChange={(event) => { void changeModel(event.target.value); }}
                disabled={modelBusy || busy}
              >
                {(status.models?.length ? status.models : [status.model]).map((model) => (
                  <option key={model} value={model}>
                    {model === 'deepseek-flash'
                      ? 'DeepSeek V4.1 Flash（通用）'
                      : model === 'deepseek-v4-pro'
                        ? 'DeepSeek V4 Pro（推理）'
                        : model === 'deepseek-chat'
                          ? 'DeepSeek Chat（旧名）'
                          : model === 'deepseek-reasoner'
                            ? 'DeepSeek Reasoner（旧名）'
                            : model}
                  </option>
                ))}
              </select>
              <span>{modelBusy ? '切换中…' : '下一轮生效'}</span>
            </div>
          ) : null}

          {historyOpen ? (
            <div className="ai-history">
              <div className="ai-history-head">
                <strong>本地对话记录</strong>
                <span>{conversations.length} 段</span>
              </div>
              {loadingHistory ? (
                <div className="ai-history-empty"><Loader2 size={14} className="spin" /> 读取中…</div>
              ) : conversations.length ? (
                <div className="ai-history-list">
                  {conversations.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn('ai-history-item', item.id === conversationId && 'is-active')}
                      onClick={() => { void loadConversation(item.id); }}
                    >
                      <span className="ai-history-title">{item.title || '新对话'}</span>
                      <span className="ai-history-meta">{item.messageCount} 条 · {formatRelativeTime(item.updatedAt)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="ai-history-empty">还没有历史对话。</div>
              )}
            </div>
          ) : null}

          {statusLoading ? (
            <div className="ai-state"><Loader2 size={18} className="spin" /> 正在检查 AI 配置…</div>
          ) : !showingChat ? (
            <div className="ai-setup">
              <div className="ai-setup-icon"><Sparkles size={22} /></div>
              <h3>还差一步</h3>
              <p>服务器还没有配置 DeepSeek API Key。配置后，这个面板就可以用了。</p>
              <pre>AI_API_KEY=你的key
AI_MODEL=deepseek-chat</pre>
              <p className="ai-hint">在服务器 <code>/opt/devforge/.env</code> 里填写，然后执行：</p>
              <pre>sudo systemctl restart devforge</pre>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void loadStartup(); }}>
                重新检查
              </button>
            </div>
          ) : (
            <>
              <div className="ai-context">
                <FileText size={13} />
                {conversationTitle ? `${conversationTitle} · ` : ''}
                {pageId ? '会参考当前页面和相关笔记' : '会参考你的学习笔记'}
              </div>

              <div className="ai-messages">
                {messages.length === 0 ? (
                  <div className="ai-message is-assistant">
                    <div className="ai-message-text">{GREETING.text}</div>
                  </div>
                ) : null}
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={cn('ai-message', `is-${message.role}`)}>
                    <div className="ai-message-text">{message.text}</div>
                    {message.sources?.length ? (
                      <div className="ai-sources">
                        <span>参考页面</span>
                        {message.sources.slice(0, 6).map((source) => (
                          <button
                            key={source.id}
                            type="button"
                            onClick={() => { navigate(`/page/${source.id}`); setOpen(false); }}
                          >
                            {source.icon} {source.title}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {busy ? <div className="ai-message is-assistant ai-thinking"><Loader2 size={14} className="spin" /> 正在翻你的笔记…</div> : null}
                <div ref={bottomRef} />
              </div>

              {messages.length === 0 ? (
                <div className="ai-suggestions">
                  {['总结当前页面', '根据我的笔记回答：我最近在学什么？', '找出和这个页面相关的笔记'].map((suggestion) => (
                    <button key={suggestion} type="button" onClick={() => { void send(suggestion); }} disabled={busy}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}

              {error ? <div className="ai-error"><AlertCircle size={13} /> {error}</div> : null}

              <form
                className="ai-composer"
                onSubmit={(event) => { event.preventDefault(); void send(); }}
              >
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  maxLength={4000}
                  placeholder="问 AI，或让它总结当前页…"
                  disabled={busy}
                />
                <button type="submit" className="ai-send" disabled={busy || !input.trim()} aria-label="发送">
                  {busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                </button>
              </form>
              <p className="ai-footnote">对话已保存到本地日志；AI 会使用长期摘要 + 最近消息 + 相关页面。</p>
            </>
          )}
        </section>
      ) : null}

      <button
        type="button"
        className={cn('ai-fab', open && 'is-hidden')}
        onClick={() => setOpen(true)}
        aria-label="打开 AI 助手"
      >
        <Sparkles size={18} />
        <span>AI</span>
      </button>
    </div>
  );
}
