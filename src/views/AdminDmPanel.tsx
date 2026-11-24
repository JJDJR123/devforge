import { useEffect, useState } from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import { api } from '../api';
import type { AdminDmConversation, DmMessage } from '../types';
import { useToast } from '../components/Toast';
import { getErrorMessage } from '../utils';

export function AdminDmPanel() {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<AdminDmConversation[]>([]);
  const [selected, setSelected] = useState<AdminDmConversation | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const result = await api.adminDmConversations();
      setConversations(result.conversations);
      setError('');
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!selected) return;
    setLoadingMessages(true);
    api.adminDmMessages(selected.key)
      .then((result) => setMessages(result.messages))
      .catch((loadError) => toast(getErrorMessage(loadError), 'error'))
      .finally(() => setLoadingMessages(false));
  }, [selected?.key]);

  return (
    <section className="admin-dm">
      <p className="admin-dm-warning">管理员可见所有成员私聊。请按会话选择查看，避免把无关内容混在一起。</p>
      {error ? <div className="assets-error">{error}</div> : null}
      <div className="admin-dm-layout">
        <aside className="admin-dm-list">
          {loading ? <div className="friend-empty"><Loader2 size={18} className="spin" /></div>
            : conversations.length === 0 ? <div className="friend-empty"><MessageCircle size={20} /><p>还没有私聊</p></div>
              : conversations.map((conversation) => (
                <button
                  key={conversation.key}
                  type="button"
                  className={`admin-dm-row${selected?.key === conversation.key ? ' is-active' : ''}`}
                  onClick={() => setSelected(conversation)}
                >
                  <strong>{conversation.users.map((user) => user.username).join(' ↔ ')}</strong>
                  <span>{conversation.lastMessage || '[图片]'}</span>
                  <time>{new Date(conversation.lastAt).toLocaleString('zh-CN')}</time>
                </button>
              ))}
        </aside>
        <section className="admin-dm-messages">
          {!selected ? <div className="friend-chat-empty"><MessageCircle size={24} /><p>选择左侧的一个会话查看私聊。</p></div>
            : loadingMessages ? <div className="assets-empty"><Loader2 size={20} className="spin" /></div>
              : messages.map((message) => (
                <div key={message.id} className="dm-message is-observed">
                  <div className="dm-message-head">
                    {(selected.users.find((user) => user.id === message.senderId)?.username) || '成员'}
                    <time>{new Date(message.createdAt).toLocaleString('zh-CN')}</time>
                  </div>
                  {message.attachment && !message.attachment.cleared ? <img src={message.attachment.url} alt={message.attachment.name} loading="lazy" /> : null}
                  {message.attachmentCleared ? <div className="dm-cleared">图片已清理</div> : null}
                  {message.body ? <p>{message.body}</p> : null}
                </div>
              ))}
        </section>
      </div>
    </section>
  );
}
