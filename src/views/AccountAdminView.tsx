import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, KeyRound, Loader2, RefreshCw, Save, Search, ShieldCheck, Trash2, UserRound, Users } from 'lucide-react';
import { api } from '../api';
import type { AdminUser } from '../types';
import { useApp } from '../state/AppContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { copyText, getErrorMessage } from '../utils';
import { RegistrationRequestsView } from './RegistrationRequestsView';
import { InviteCodesView } from './InviteCodesView';
import { AdminMailboxView } from './AdminMailboxView';
import { AdminDmPanel } from './AdminDmPanel';

type Tab = 'users' | 'requests' | 'invites' | 'mailbox' | 'dm';

const TAB_LABEL: Record<Tab, string> = {
  users: '用户',
  requests: '注册申请',
  invites: '邀请码',
  mailbox: '信箱',
  dm: '私聊',
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
        {tab === 'dm' ? <AdminDmPanel /> : null}
      </div>
    </div>
  );
}

function UsersPanel() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { user: currentUser } = useApp();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [temporary, setTemporary] = useState<{ username: string; password: string } | null>(null);
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

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function resetPassword(user: AdminUser) {
    if (busyId) return;
    setBusyId(user.id);
    try {
      const result = await api.resetAdminUserPassword(user.id);
      setTemporary({ username: user.username, password: result.temporaryPassword });
      toast(`已生成「${user.username}」的临时密码。`, 'success');
    } catch (resetError) {
      toast(getErrorMessage(resetError), 'error');
    } finally {
      setBusyId('');
    }
  }

  async function removeUser(user: AdminUser) {
    if (busyId) return;
    const ok = await confirm({
      title: `删除账号「${user.username}」？`,
      message: '账号和它的登录会话会被删除；已发送的聊天和信箱记录会保留。这个操作不能撤销。',
      confirmText: '删除账号',
      danger: true,
    });
    if (!ok) return;
    setBusyId(user.id);
    try {
      await api.deleteAdminUser(user.id);
      setSelected((current) => { const next = new Set(current); next.delete(user.id); return next; });
      toast(`已删除「${user.username}」。`, 'success');
      await load();
    } catch (deleteError) {
      toast(getErrorMessage(deleteError), 'error');
    } finally {
      setBusyId('');
    }
  }

  async function batch(action: 'suspend' | 'activate' | 'delete') {
    if (!selected.size) return;
    const label = action === 'suspend' ? '停用' : action === 'activate' ? '启用' : '删除';
    const ok = await confirm({
      title: `批量${label} ${selected.size} 个账号？`,
      message: action === 'delete' ? '删除账号不能撤销。当前管理员和最后一个管理员会被跳过。' : '当前登录管理员会被跳过。',
      confirmText: `批量${label}`,
      danger: action === 'delete',
    });
    if (!ok) return;
    setBusyId('batch');
    try {
      const result = await api.batchAdminUsers([...selected], action);
      setSelected(new Set());
      await load();
      if (result.skipped.length) {
        toast(`已处理 ${result.updated.length} 个，跳过 ${result.skipped.length} 个受保护账号。`, 'success');
      } else {
        toast(`已处理 ${result.updated.length} 个账号。`, 'success');
      }
    } catch (batchError) {
      toast(getErrorMessage(batchError), 'error');
    } finally {
      setBusyId('');
    }
  }

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

      {temporary ? (
        <div className="account-temp-password">
          <KeyRound size={16} />
          <span>「{temporary.username}」临时密码</span>
          <code>{temporary.password}</code>
          <button type="button" className="link-button" onClick={() => { void copyText(temporary.password).then((ok) => toast(ok ? '临时密码已复制。' : '复制失败。', ok ? 'success' : 'error')); }}>
            <Copy size={13} /> 复制
          </button>
          <button type="button" className="icon-btn" onClick={() => setTemporary(null)} aria-label="关闭">×</button>
        </div>
      ) : null}

      {selected.size ? (
        <div className="accounts-bulk">
          <span>已选 {selected.size} 个账号</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(visible.map((user) => user.id)))}>全选当前</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>清空</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void batch('suspend'); }}>批量停用</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void batch('activate'); }}>批量启用</button>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => { void batch('delete'); }}><Trash2 size={13} /> 批量删除</button>
        </div>
      ) : null}

      {error ? <div className="assets-error">{error}</div> : null}
      {loading && !users.length ? <div className="assets-empty"><Loader2 size={22} className="spin" /><p>正在读取账号…</p></div>
        : visible.length === 0 ? <div className="assets-empty"><Users size={24} /><p>没有匹配的账号。</p></div>
          : <div className="accounts-list">
            {visible.map((user) => (
              <article key={user.id} className={`account-card${user.status === 'suspended' ? ' is-suspended' : ''}`}>
                <label className="account-select" title="选择账号">
                  <input
                    type="checkbox"
                    checked={selected.has(user.id)}
                    onChange={() => toggle(user.id)}
                    disabled={user.id === currentUser?.id}
                    aria-label={`选择 ${user.username}`}
                  />
                </label>
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
                  {user.id !== currentUser?.id ? (
                    <>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void resetPassword(user); }} disabled={busyId === user.id}>
                        <KeyRound size={14} /> 重置密码
                      </button>
                      <button type="button" className={`btn btn-sm ${user.status === 'active' ? 'btn-ghost' : 'btn-primary'}`} onClick={() => { void toggleStatus(user); }} disabled={busyId === user.id}>
                        {user.status === 'active' ? '停用' : '启用'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void removeUser(user); }} disabled={busyId === user.id}>
                        <Trash2 size={14} /> 删除
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            ))}
          </div>}
    </section>
  );
}
