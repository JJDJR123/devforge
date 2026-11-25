import { useEffect, useRef, useState, type DragEvent, type ClipboardEvent } from 'react';
import {
  Check,
  ImagePlus,
  Loader2,
  MessageCircle,
  Search,
  Send,
  ShieldAlert,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { api } from '../api';
import type { DmMessage, FriendData, FriendItem, FriendUser } from '../types';
import { useApp } from '../state/AppContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { ChatEmojiPicker } from '../components/ChatEmojiPicker';
import { compressImageForUpload } from '../imageCompression';
import { getErrorMessage } from '../utils';

const TEN_MB = 10 * 1024 * 1024;

export function FriendsView({ member = false }: { member?: boolean }) {
  const { user } = useApp();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [data, setData] = useState<FriendData>({ friends: [], incoming: [], outgoing: [], blocked: [] });
  const [active, setActive] = useState<FriendItem | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendUser[]>([]);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [attachment, setAttachment] = useState<{ id: string; name: string; url: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadFriends() {
    try {
      const result = await api.friends();
      setData(result);
      setError('');
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadFriends(); }, []);

  useEffect(() => {
    if (!active) return;
    setNote(active.user.note);
    setMessages([]);
    void loadMessages(active.user.id);
    const timer = setInterval(() => { void loadMessages(active.user.id, false); }, 4000);
    return () => clearInterval(timer);
  }, [active?.user.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(() => {
      api.searchFriendUsers(query.trim())
        .then((result) => setResults(result.users))
        .catch(() => setResults([]));
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  async function loadMessages(userId: string, showLoading = true) {
    if (showLoading) setLoadingMessages(true);
    try {
      const result = await api.dmMessages(userId);
      setMessages(result.messages);
    } catch (loadError) {
      if (showLoading) toast(getErrorMessage(loadError), 'error');
    } finally {
      if (showLoading) setLoadingMessages(false);
    }
  }

  async function requestFriend(target: FriendUser) {
    try {
      const result = await api.requestFriend(target.id);
      toast(result.autoAccepted ? '对方之前申请过，已直接成为好友。' : '好友申请已发送。', 'success');
      setQuery('');
      setResults([]);
      await loadFriends();
    } catch (requestError) {
      toast(getErrorMessage(requestError), 'error');
    }
  }

  async function accept(item: FriendItem) {
    try {
      await api.acceptFriend(item.friendshipId);
      toast('已接受好友申请。', 'success');
      await loadFriends();
    } catch (acceptError) {
      toast(getErrorMessage(acceptError), 'error');
    }
  }

  async function reject(item: FriendItem) {
    try {
      await api.rejectFriend(item.friendshipId);
      await loadFriends();
    } catch (rejectError) {
      toast(getErrorMessage(rejectError), 'error');
    }
  }

  async function saveNote() {
    if (!active) return;
    try {
      const result = await api.setFriendNote(active.user.id, note);
      setData((current) => ({
        ...current,
        friends: current.friends.map((item) => item.user.id === active.user.id
          ? { ...item, user: { ...item.user, note: result.note } }
          : item),
      }));
      setActive((current) => current ? { ...current, user: { ...current.user, note: result.note } } : current);
      toast('好友备注已保存。', 'success');
    } catch (noteError) {
      toast(getErrorMessage(noteError), 'error');
    }
  }

  async function remove() {
    if (!active) return;
    const ok = await confirm({
      title: `删除好友「${active.user.username}」？`,
      message: '你们的好友关系和备注会被删除，私聊记录会保留。',
      confirmText: '删除好友',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.removeFriend(active.user.id);
      setActive(null);
      await loadFriends();
    } catch (removeError) {
      toast(getErrorMessage(removeError), 'error');
    }
  }

  async function block() {
    if (!active) return;
    const ok = await confirm({
      title: `拉黑「${active.user.username}」？`,
      message: '拉黑后双方不能继续发好友申请或私聊。',
      confirmText: '拉黑',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.blockFriend(active.user.id);
      setActive(null);
      await loadFriends();
      toast('已拉黑。', 'success');
    } catch (blockError) {
      toast(getErrorMessage(blockError), 'error');
    }
  }

  async function unblock(item: FriendItem) {
    try {
      await api.unblockFriend(item.user.id);
      await loadFriends();
    } catch (unblockError) {
      toast(getErrorMessage(unblockError), 'error');
    }
  }

  async function handleImage(file: File) {
    if (!file.type.startsWith('image/')) {
      toast('只能发送图片。', 'error');
      return;
    }
    if (file.size > TEN_MB) {
      toast('图片不能超过 10MB。', 'error');
      return;
    }
    setUploading(true);
    try {
      const prepared = await compressImageForUpload(file);
      const result = await api.uploadDmImage(prepared);
      setAttachment({ id: result.id, name: result.name, url: result.url });
    } catch (uploadError) {
      toast(getErrorMessage(uploadError), 'error');
    } finally {
      setUploading(false);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const image = [...event.clipboardData.items].find((item) => item.type.startsWith('image/'));
    if (image) {
      const file = image.getAsFile();
      if (file) {
        event.preventDefault();
        void handleImage(file);
      }
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleImage(file);
  }

  async function send() {
    if (!active || sending) return;
    const body = text.trim();
    if (!body && !attachment) return;
    setSending(true);
    try {
      const result = await api.sendDm(active.user.id, body, attachment?.id);
      setMessages((current) => [...current, result.message]);
      setText('');
      setAttachment(null);
    } catch (sendError) {
      toast(getErrorMessage(sendError), 'error');
    } finally {
      setSending(false);
    }
  }

  const currentRole = user?.role || (member ? 'reader' : 'admin');

  return (
    <div className="friends-view">
      <header className="member-head">
        <div>
          <span className="eyebrow">{member ? 'MEMBER' : 'ADMIN'} / FRIENDS</span>
          <h1>好友</h1>
          <p>好友之间可以私聊、发图片和备注。私聊内容管理员可见；图片 7 天后自动清理，文字保留。</p>
        </div>
      </header>

      {error ? <div className="assets-error">{error}</div> : null}
      <div className="friends-layout">
        <aside className="friends-side">
          <div className="friends-search">
            <Search size={14} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索用户名加好友…" />
          </div>
          {results.length ? (
            <div className="friend-results">
              {results.map((target) => (
                <button key={target.id} type="button" className="friend-result" onClick={() => { void requestFriend(target); }}>
                  <span>{target.username}</span>
                  <small>{target.role === 'admin' ? '管理员' : '成员'}</small>
                  <UserPlus size={13} />
                </button>
              ))}
            </div>
          ) : null}

          {data.incoming.length ? (
            <div className="friend-section">
              <div className="friend-section-title">好友申请 <em>{data.incoming.length}</em></div>
              {data.incoming.map((item) => (
                <div key={item.friendshipId} className="friend-request">
                  <span>{item.user.username}</span>
                  <div>
                    <button type="button" className="icon-btn" onClick={() => { void accept(item); }} aria-label="接受"><Check size={14} /></button>
                    <button type="button" className="icon-btn" onClick={() => { void reject(item); }} aria-label="拒绝"><X size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="friend-section">
            <div className="friend-section-title">我的好友 <em>{data.friends.length}</em></div>
            {loading ? <div className="friend-empty"><Loader2 size={18} className="spin" /></div>
              : data.friends.length === 0 ? <div className="friend-empty"><MessageCircle size={20} /><p>还没有好友</p></div>
                : data.friends.map((item) => (
                  <button
                    key={item.user.id}
                    type="button"
                    className={`friend-row${active?.user.id === item.user.id ? ' is-active' : ''}`}
                    onClick={() => setActive(item)}
                  >
                    <span className="friend-avatar">{item.user.username.slice(0, 1).toUpperCase()}</span>
                    <span className="friend-name">
                      <strong>{item.user.note || item.user.username}</strong>
                      {item.user.note ? <small>@{item.user.username}</small> : null}
                    </span>
                    {item.user.role === 'admin' ? <em>管理员</em> : null}
                  </button>
                ))}
          </div>

          {data.blocked.length ? (
            <div className="friend-section">
              <div className="friend-section-title">已拉黑</div>
              {data.blocked.map((item) => (
                <div key={item.friendshipId} className="friend-blocked-row">
                  <span>{item.user.username}</span>
                  <button type="button" className="link-button" onClick={() => { void unblock(item); }}>解除</button>
                </div>
              ))}
            </div>
          ) : null}
        </aside>

        <section className="friend-chat">
          {active ? (
            <>
              <header className="friend-chat-head">
                <div>
                  <strong>{active.user.note || active.user.username}</strong>
                  {active.user.note ? <span>@{active.user.username}</span> : null}
                </div>
                <div className="friend-chat-actions">
                  <button type="button" className="link-button" onClick={() => { void remove(); }}><UserMinus size={13} /> 删除好友</button>
                  <button type="button" className="link-button is-danger" onClick={() => { void block(); }}><ShieldAlert size={13} /> 拉黑</button>
                </div>
              </header>
              <div className="friend-note-row">
                <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} placeholder="给这个好友写备注（只有你能看到）" />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void saveNote(); }}>保存备注</button>
              </div>
              <div className="friend-messages">
                {loadingMessages && !messages.length ? <div className="assets-empty"><Loader2 size={20} className="spin" /></div>
                  : messages.length === 0 ? <div className="assets-empty"><MessageCircle size={22} /><p>还没有私聊，打个招呼吧。</p></div>
                    : messages.map((message) => {
                      const senderIsAdmin = message.senderId === user?.id ? currentRole === 'admin' : active.user.role === 'admin';
                      const mine = message.senderId === user?.id && !senderIsAdmin;
                      return (
                        <div key={message.id} className={`dm-message${senderIsAdmin ? ' is-admin' : mine ? ' is-mine' : ''}`}>
                          <div className="dm-message-head">{message.senderId === user?.id ? '你' : active.user.username}<time>{new Date(message.createdAt).toLocaleString('zh-CN')}</time></div>
                          {message.attachment && !message.attachment.cleared ? (
                            <a href={message.attachment.url} target="_blank" rel="noreferrer">
                              <img src={message.attachment.url} alt={message.attachment.name} loading="lazy" />
                            </a>
                          ) : message.attachmentCleared ? <div className="dm-cleared">图片已按 7 天规则清理</div> : null}
                          {message.body ? <p>{message.body}</p> : null}
                        </div>
                      );
                    })}
                <div ref={bottomRef} />
              </div>
              <div
                className={`dm-compose${dragging ? ' is-dragging' : ''}`}
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                {attachment ? (
                  <div className="dm-attachment">
                    <img src={attachment.url} alt={attachment.name} />
                    <span>{attachment.name}</span>
                    <button type="button" className="icon-btn" onClick={() => setAttachment(null)} aria-label="移除图片"><X size={13} /></button>
                  </div>
                ) : null}
                <div className="dm-compose-row">
                  <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="添加图片">
                    {uploading ? <Loader2 size={16} className="spin" /> : <ImagePlus size={16} />}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleImage(file); event.target.value = ''; }} />
                  <ChatEmojiPicker onPick={(emoji) => setText((value) => `${value}${emoji}`)} disabled={sending} />
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    onPaste={handlePaste}
                    placeholder="输入私聊内容，可拖入或粘贴图片…"
                    rows={2}
                    maxLength={2000}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <button type="button" className="btn btn-primary" onClick={() => { void send(); }} disabled={sending || uploading || (!text.trim() && !attachment)}>
                    {sending ? <Loader2 size={14} className="spin" /> : <Send size={14} />} 发送
                  </button>
                </div>
                <div className="dm-notice">图片仅支持 10MB 以内；管理员可查看私聊内容；图片每 7 天清理一次，文字保留。</div>
              </div>
            </>
          ) : (
            <div className="friend-chat-empty">
              <MessageCircle size={28} />
              <h2>选择一个好友</h2>
              <p>左侧是好友和申请。管理员账号也可以被加为好友。</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
