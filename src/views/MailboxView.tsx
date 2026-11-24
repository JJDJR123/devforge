import { useEffect, useState } from 'react';
import { Inbox, Loader2, Send } from 'lucide-react';
import { api } from '../api';
import type { Suggestion } from '../types';
import { useToast } from '../components/Toast';
import { getErrorMessage } from '../utils';

export function MailboxView() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Suggestion[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const result = await api.mailboxMine();
      setMessages(result.messages);
      setError('');
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const result = await api.sendSuggestion(body);
      setMessages((current) => [result.message, ...current]);
      setText('');
      toast('建议已发送给管理员。', 'success');
    } catch (sendError) {
      toast(getErrorMessage(sendError), 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="member-view mailbox-view">
      <header className="member-head">
        <div>
          <span className="eyebrow">MEMBER / MAILBOX</span>
          <h1>信箱</h1>
          <p>给站长发送建议或问题。只有管理员能看到这些内容。</p>
        </div>
      </header>
      {error ? <div className="assets-error">{error}</div> : null}
      <div className="mailbox-compose">
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} maxLength={3000} placeholder="写下你的建议…" />
        <button type="button" className="btn btn-primary" onClick={() => { void send(); }} disabled={sending || !text.trim()}>
          {sending ? <Loader2 size={15} className="spin" /> : <Send size={15} />} 发送建议
        </button>
      </div>
      <div className="mailbox-list">
        {loading ? <div className="assets-empty"><Loader2 size={22} className="spin" /><p>正在读取…</p></div>
          : messages.length === 0 ? <div className="assets-empty"><Inbox size={24} /><p>还没有发送过建议。</p></div>
            : messages.map((message) => (
              <article key={message.id} className="mailbox-item">
                <div className="mailbox-item-head"><span>{message.status === 'read' ? '已读' : '未读'}</span><time>{new Date(message.createdAt).toLocaleString('zh-CN')}</time></div>
                <p>{message.body}</p>
              </article>
            ))}
      </div>
    </div>
  );
}
