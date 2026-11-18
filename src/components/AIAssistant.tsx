import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Bot,
  FileText,
  Loader2,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../api';
import type { AIStatus, AISource } from '../types';
import { cn, getErrorMessage } from '../utils';

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  sources?: AISource[];
};

const GREETING: ChatMessage = {
  role: 'assistant',
  text: '我是你的学习舱 AI 助手。可以让我总结当前页面、根据笔记回答问题，或者帮你找相关笔记。',
};

export function AIAssistant() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const pageId = location.pathname.startsWith('/page/')
    ? decodeURIComponent(location.pathname.slice('/page/'.length).split('/')[0] || '') || null
    : null;

  async function loadStatus() {
    setStatusLoading(true);
    try {
      setStatus(await api.aiStatus());
    } catch (statusError) {
      setStatus(null);
      setError(getErrorMessage(statusError));
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    if (open && !status) void loadStatus();
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
      const result = await api.aiChat({ message: question, pageId });
      setMessages((prev) => [...prev, {
        role: 'assistant',
        text: result.answer,
        sources: result.sources,
      }]);
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

  return (
    <div className={cn('ai-assistant', open && 'is-open')}>
      {open ? (
        <section className="ai-panel" aria-label="AI 助手">
          <header className="ai-head">
            <div className="ai-head-title">
              <span className="ai-head-mark"><Bot size={17} /></span>
              <div>
                <strong>AI 助手</strong>
                <span>{status?.configured ? `${status.provider} · ${status.model}` : '等待配置'}</span>
              </div>
            </div>
            <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="关闭 AI 助手">
              <X size={17} />
            </button>
          </header>

          {statusLoading ? (
            <div className="ai-state"><Loader2 size={18} className="spin" /> 正在检查 AI 配置…</div>
          ) : status && !status.configured ? (
            <div className="ai-setup">
              <div className="ai-setup-icon"><Sparkles size={22} /></div>
              <h3>还差一步</h3>
              <p>服务器还没有配置 DeepSeek API Key。配置后，这个面板就可以用了。</p>
              <pre>AI_API_KEY=你的key
AI_MODEL=deepseek-chat</pre>
              <p className="ai-hint">在服务器 <code>/opt/devforge/.env</code> 里填写，然后执行：</p>
              <pre>sudo systemctl restart devforge</pre>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void loadStatus(); }}>
                重新检查
              </button>
            </div>
          ) : (
            <>
              <div className="ai-context">
                <FileText size={13} />
                {pageId ? '会参考当前页面和相关笔记' : '会参考你的学习笔记'}
              </div>

              <div className="ai-messages">
                {[GREETING, ...messages].map((message, index) => (
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
              <p className="ai-footnote">AI 会读取相关笔记作为上下文；答案可能出错，请核对原文。</p>
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
