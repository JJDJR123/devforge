import { useEffect, useState } from 'react';
import { Check, Clock3, Loader2, RefreshCw, UserPlus, X } from 'lucide-react';
import { api } from '../api';
import type { RegistrationRequest } from '../types';
import { useToast } from '../components/Toast';
import { getErrorMessage } from '../utils';

type Tab = 'pending' | 'all';

const STATUS_LABEL: Record<RegistrationRequest['status'], string> = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已拒绝',
};

export function RegistrationRequestsView() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('pending');
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  async function load(nextTab = tab) {
    setLoading(true);
    setError('');
    try {
      const result = await api.registrations(nextTab);
      setRequests(result.requests);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(tab); }, [tab]);

  async function approve(request: RegistrationRequest) {
    if (busyId) return;
    setBusyId(request.id);
    try {
      await api.approveRegistration(request.id);
      toast(`已通过「${request.username}」的申请，可以用申请时设置的密码登录。`, 'success');
      await load();
    } catch (approveError) {
      toast(getErrorMessage(approveError), 'error');
    } finally {
      setBusyId('');
    }
  }

  async function reject(request: RegistrationRequest) {
    if (busyId) return;
    setBusyId(request.id);
    try {
      await api.rejectRegistration(request.id);
      toast(`已拒绝「${request.username}」。`, 'success');
      await load();
    } catch (rejectError) {
      toast(getErrorMessage(rejectError), 'error');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="requests-view">
      <header className="assets-head">
        <div>
          <span className="eyebrow">ADMIN / MEMBERSHIP</span>
          <h1>注册申请</h1>
          <p>审批只读成员。通过后用户使用申请时填写的用户名和密码登录，不会获得管理权限。</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => { void load(); }} disabled={loading}>
          {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} 刷新
        </button>
      </header>

      <div className="assets-filters" role="tablist" aria-label="申请状态">
        <button type="button" role="tab" aria-selected={tab === 'pending'} className={`assets-filter${tab === 'pending' ? ' is-active' : ''}`} onClick={() => setTab('pending')}>
          待审批
        </button>
        <button type="button" role="tab" aria-selected={tab === 'all'} className={`assets-filter${tab === 'all' ? ' is-active' : ''}`} onClick={() => setTab('all')}>
          全部
        </button>
      </div>

      {error ? <div className="assets-error">{error}</div> : null}
      {loading && !requests.length ? (
        <div className="assets-empty"><Loader2 size={22} className="spin" /><p>正在读取申请…</p></div>
      ) : requests.length === 0 ? (
        <div className="assets-empty"><UserPlus size={26} /><p>{tab === 'pending' ? '暂时没有待审批申请。' : '还没有注册申请。'}</p></div>
      ) : (
        <div className="requests-list">
          {requests.map((request) => (
            <article key={request.id} className={`request-card is-${request.status}`}>
              <div className="request-main">
                <div className="request-head">
                  <strong>{request.username}</strong>
                  <span className={`request-status is-${request.status}`}>{STATUS_LABEL[request.status]}</span>
                </div>
                <p className="request-reason">{request.reason || '没有填写申请说明'}</p>
                <div className="request-meta">
                  <span><Clock3 size={12} /> {new Date(request.createdAt).toLocaleString('zh-CN')}</span>
                  {request.contact ? <span>联系方式：{request.contact}</span> : null}
                  <span>IP：{request.ip || '未知'}</span>
                </div>
              </div>
              {request.status === 'pending' ? (
                <div className="request-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => { void approve(request); }} disabled={busyId === request.id}>
                    {busyId === request.id ? <Loader2 size={14} className="spin" /> : <Check size={14} />} 通过
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void reject(request); }} disabled={busyId === request.id}>
                    <X size={14} /> 拒绝
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
