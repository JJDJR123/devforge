import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, RefreshCw, Save, Search, ShieldCheck, UserRound, Users } from 'lucide-react';
import { api } from '../api';
import type { AdminUser } from '../types';
import { useToast } from '../components/Toast';
import { getErrorMessage } from '../utils';
import { RegistrationRequestsView } from './RegistrationRequestsView';
import { InviteCodesView } from './InviteCodesView';
import { AdminMailboxView } from './AdminMailboxView';

type Tab = 'users' | 'requests' | 'invites' | 'mailbox';

const TAB_LABEL: Record<Tab, string> = {
  users: '用户',
  requests: '注册申请',
  invites: '邀请码',
  mailbox: '信箱',
};

export function AccountAdminView() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') as Tab | null;
  const tab: Tab = rawTab && rawTab in TAB_LABEL ? rawTab : 'users';

  return (
    <div className="accounts-view">
      <header className="assets-head">
        <div>
          <span className="eyebrow">ADMIN / ACCOUNTS</span>
          <h1>账号管理</h1>
          <p>用户备注、注册审批、邀请码和成员信箱统一在这里处理。</p>
        </div>
      </header>

      <div className="accounts-tabs" role="tablist" aria-label="账号管理分类">
        {(Object.keys(TAB_LABEL) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`accounts-tab${tab === key ? ' is-active' : ''}`}
            onClick={() => setSearchParams(key === 'users' ? {} : { tab: key })}
          >
            {TAB_LABEL[key]}
          </button>
        ))}
      </div>

      <div className="accounts-panel">
        {tab === 'users' ? <UsersPanel /> : null}
        {tab === 'requests' ? <RegistrationRequestsView /> : null}
        {tab === 'invites' ? <InviteCodesView /> : null}
        {tab === 'mailbox' ? <AdminMailboxView /> : null}
      </div>
    </div>
  );
}

function UsersPanel() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const result = await api.adminUsers();
      setUsers(result.users);
      setNotes(Object.fromEntries(result.users.map((user) => [user.id, user.note])));
      setError('');
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) => user.username.toLowerCase().includes(q) || user.note.toLowerCase().includes(q));
  }, [users, query]);

  async function saveNote(user: AdminUser) {
    if (busyId) return;
    setBusyId(user.id);
    try {
      const result = await api.updateAdminUser(user.id, { note: notes[user.id] || '' });
      setUsers((current) => current.map((item) => item.id === user.id ? result.user : item));
      toast(`已更新「${user.username}」的备注。`, 'success');
    } catch (saveError) {
      toast(getErrorMessage(saveError), 'error');
    } finally {
      setBusyId('');
    }
  }

  async function toggleStatus(user: AdminUser) {
    if (busyId) return;
    const next = user.status === 'active' ? 'suspended' : 'active';
    setBusyId(user.id);
    try {
      const result = await api.updateAdminUser(user.id, { status: next });
      setUsers((current) => current.map((item) => item.id === user.id ? result.user : item));
      toast(next === 'suspended' ? `已停用「${user.username}」。` : `已启用「${user.username}」。`, 'success');
    } catch (statusError) {
      toast(getErrorMessage(statusError), 'error');
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="accounts-users">
      <div className="accounts-users-bar">
        <div className="member-search accounts-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索用户名或备注…" />
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void load(); }} disabled={loading}>
          {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} 刷新
        </button>
      </div>

      {error ? <div className="assets-error">{error}</div> : null}
      {loading && !users.length ? <div className="assets-empty"><Loader2 size={22} className="spin" /><p>正在读取账号…</p></div>
        : visible.length === 0 ? <div className="assets-empty"><Users size={24} /><p>没有匹配的账号。</p></div>
          : <div className="accounts-list">
            {visible.map((user) => (
              <article key={user.id} className={`account-card${user.status === 'suspended' ? ' is-suspended' : ''}`}>
                <div className="account-main">
                  <div className="account-title">
                    <span className={`account-avatar${user.role === 'admin' ? ' is-admin' : ''}`}>
                      {user.role === 'admin' ? <ShieldCheck size={16} /> : <UserRound size={16} />}
                    </span>
                    <div>
                      <strong>{user.username}</strong>
                      <span className={`account-role${user.role === 'admin' ? ' is-admin' : ''}`}>{user.role === 'admin' ? '管理员' : '只读成员'}</span>
                      <span className={`account-status is-${user.status}`}>{user.status === 'active' ? '正常' : '已停用'}</span>
                    </div>
                  </div>
                  <label className="account-note">
                    <span>管理员备注</span>
                    <input
                      value={notes[user.id] ?? ''}
                      onChange={(event) => setNotes((current) => ({ ...current, [user.id]: event.target.value }))}
                      placeholder="例如：公司同事 / 游戏美术 / 已确认身份"
                      maxLength={500}
                    />
                  </label>
                </div>
                <div className="account-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void saveNote(user); }} disabled={busyId === user.id}>
                    {busyId === user.id ? <Loader2 size={14} className="spin" /> : <Save size={14} />} 保存备注
                  </button>
                  {user.role !== 'admin' || user.status !== 'active' ? (
                    <button type="button" className={`btn btn-sm ${user.status === 'active' ? 'btn-ghost' : 'btn-primary'}`} onClick={() => { void toggleStatus(user); }} disabled={busyId === user.id}>
                      {user.status === 'active' ? '停用' : '启用'}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>}
    </section>
  );
}
