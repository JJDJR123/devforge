import { useEffect, useState } from 'react';
import { Inbox, Loader2, MailOpen, RefreshCw } from 'lucide-react';
import { api } from '../api';
import type { Suggestion } from '../types';
import { useToast } from '../components/Toast';
import { getErrorMessage } from '../utils';

export function AdminMailboxView() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState('unread');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyOpenId, setReplyOpenId] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  async function load(next = status) {
    setLoading(true);
    try {
      const result = await api.adminMailbox(next);
      setMessages(result.messages);
      setError('');
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(status); }, [status]);

  async function markRead(message: Suggestion) {
    try {
      await api.markSuggestionRead(message.id);
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, status: 'read' } : item));
    } catch (markError) {
      toast(getErrorMessage(markError), 'error');
    }
  }

  function openReply(message: Suggestion) {
    setReplyOpenId(message.id);
    setReplyText(message.reply || '');
  }

  async function sendReply(message: Suggestion) {
    const body = replyText.trim();
    if (!body || sendingReply) return;
    setSendingReply(true);
    try {
      await api.replySuggestion(message.id, body);
      setReplyOpenId('');
      setReplyText('');
      toast('回复已发送。', 'success');
      await load();
    } catch (replyError) {
      toast(getErrorMessage(replyError), 'error');
    } finally {
      setSendingReply(false);
    }
  }

  return (
    <div className="requests-view mailbox-admin-view">
      <header className="assets-head">
        <div>
          <span className="eyebrow">ADMIN / MAILBOX</span>
          <h1>成员信箱</h1>
          <p>成员发来的建议和问题。</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => { void load(); }} disabled={loading}>
          {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} 刷新
        </button>
      </header>
      <div className="assets-filters" role="tablist">
        <button type="button" role="tab" aria-selected={status === 'unread'} className={`assets-filter${status === 'unread' ? ' is-active' : ''}`} onClick={() => setStatus('unread')}>未读</button>
        <button type="button" role="tab" aria-selected={status === ''} className={`assets-filter${status === '' ? ' is-active' : ''}`} onClick={() => setStatus('')}>全部</button>
      </div>
      {error ? <div className="assets-error">{error}</div> : null}
      {loading ? <div className="assets-empty"><Loader2 size={22} className="spin" /><p>正在读取…</p></div>
        : messages.length === 0 ? <div className="assets-empty"><Inbox size={26} /><p>没有消息。</p></div>
          : <div className="mailbox-list">
            {messages.map((message) => (
              <article key={message.id} className={`mailbox-item${message.status === 'unread' ? ' is-unread' : ''}`}>
                <div className="mailbox-item-head">
                  <strong>{message.username}</strong>
                  <span>{message.status === 'read' ? '已读' : '未读'}</span>
                  <time>{new Date(message.createdAt).toLocaleString('zh-CN')}</time>
                  {message.status === 'unread' ? <button type="button" className="link-button" onClick={() => { void markRead(message); }}><MailOpen size={12} /> 标为已读</button> : null}
                  <button type="button" className="link-button" onClick={() => openReply(message)}>{message.reply ? '修改回复' : '回复'}</button>
                </div>
                <p>{message.body}</p>
                {message.reply ? (
                  <div className="mailbox-reply">
                    <div className="mailbox-reply-head">管理员 {message.repliedBy || ''} · {message.repliedAt ? new Date(message.repliedAt).toLocaleString('zh-CN') : ''}</div>
                    <p>{message.reply}</p>
                  </div>
                ) : null}
                {replyOpenId === message.id ? (
                  <div className="mailbox-reply-form">
                    <textarea value={replyText} onChange={(event) => setReplyText(event.target.value)} rows={3} maxLength={3000} placeholder="回复这位成员…" autoFocus />
                    <div>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => { void sendReply(message); }} disabled={sendingReply || !replyText.trim()}>
                        {sendingReply ? <Loader2 size={14} className="spin" /> : null} 发送回复
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReplyOpenId('')} disabled={sendingReply}>取消</button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>}
    </div>
  );
}
