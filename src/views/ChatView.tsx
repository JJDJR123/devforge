import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, Send } from 'lucide-react';
import { api } from '../api';
import type { ChatMessage } from '../types';
import { useApp } from '../state/AppContext';
import { useToast } from '../components/Toast';
import { ChatEmojiPicker } from '../components/ChatEmojiPicker';
import { getErrorMessage } from '../utils';

export function ChatView({ member = false }: { member?: boolean }) {
  const { user } = useApp();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const result = await api.chatMessages();
      setMessages(result.messages);
      setError('');
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const result = await api.sendChatMessage(body);
      setText('');
      setMessages((current) => [...current, result.message]);
    } catch (sendError) {
      toast(getErrorMessage(sendError), 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`member-view chat-view${member ? ' is-member' : ''}`}>
      <header className="member-head">
        <div>
          <span className="eyebrow">{member ? 'MEMBER' : 'ADMIN'} / CHAT</span>
          <h1>聊天室</h1>
          <p>{member ? '已审批成员和站长都可以在这里交流。' : '成员聊天室，管理员也可以参与。'}</p>
        </div>
      </header>

      {error ? <div className="assets-error">{error}</div> : null}
      <div className="chat-box">
        <div className="chat-messages">
          {loading && !messages.length ? (
            <div className="assets-empty"><Loader2 size={22} className="spin" /><p>正在加载消息…</p></div>
          ) : messages.length === 0 ? (
            <div className="assets-empty"><MessageCircle size={24} /><p>还没有人说话。</p></div>
          ) : messages.map((message) => (
            <div key={message.id} className={`chat-message${message.role === 'admin' ? ' is-admin' : message.userId === user?.id ? ' is-mine' : ''}`}>
              <div className="chat-message-head">
                <strong>{message.username}</strong>
                {message.role === 'admin' ? <span>管理员</span> : null}
                {user?.role === 'admin' && message.note ? <span className="chat-note">{message.note}</span> : null}
                <time>{new Date(message.createdAt).toLocaleString('zh-CN')}</time>
              </div>
              <p>{message.body}</p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="chat-compose">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="说点什么…（Enter 发送，Shift+Enter 换行）"
            rows={2}
            maxLength={1000}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <ChatEmojiPicker onPick={(emoji) => setText((value) => `${value}${emoji}`)} disabled={sending} />
          <button type="button" className="btn btn-primary" onClick={() => { void send(); }} disabled={sending || !text.trim()}>
            {sending ? <Loader2 size={15} className="spin" /> : <Send size={15} />} 发送
          </button>
        </div>
      </div>
    </div>
  );
}
