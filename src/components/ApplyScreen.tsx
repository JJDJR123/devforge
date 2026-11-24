import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Loader2, Send, UserRound } from 'lucide-react';
import { api } from '../api';
import { BrandLockup } from './BrandMark';
import { getErrorMessage } from '../utils';

export function ApplyScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [reason, setReason] = useState('');
  const [contact, setContact] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [website, setWebsite] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [activated, setActivated] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (username.trim().length < 2) {
      setError('用户名至少需要 2 个字符。');
      return;
    }
    if (password.length < 8) {
      setError('密码至少需要 8 个字符。');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致。');
      return;
    }
    setBusy(true);
    try {
      await api.register({
        username: username.trim(),
        password,
        reason: reason.trim(),
        contact: contact.trim(),
        inviteCode: inviteCode.trim(),
        website,
      });
      setActivated(Boolean(inviteCode.trim()));
      setDone(true);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout apply-layout">
      <div className="auth-panel">
        <div className="auth-mobile-brand"><BrandLockup compact /></div>
        <div className="auth-card">
          <div className="auth-kicker"><span className="status-dot" /> MEMBERSHIP · 成员申请</div>
          <h2>申请一个只读账号</h2>
          <p className="auth-lead">
            账号只用于浏览公开页面、成员知识库和成员素材库。管理员审批通过后，使用这里填写的用户名和密码登录。
          </p>

          {done ? (
            <div className="apply-success">
              <Check size={22} />
              <strong>{activated ? '账号已激活' : '申请已提交'}</strong>
              <p>{activated ? '邀请码有效，账号已创建。现在可以直接用刚才的用户名和密码登录。' : '管理员审批通过后即可登录。如果没有通过，管理员会在有联系方式时告知你。'}</p>
              <Link className="btn btn-primary" to="/admin">返回登录</Link>
            </div>
          ) : (
            <form className="auth-form" onSubmit={submit}>
              <label className="field">
                <span className="field-label"><UserRound size={14} /> 用户名</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="2–32 个字符"
                  autoComplete="username"
                  spellCheck={false}
                  autoFocus
                />
              </label>
              <label className="field">
                <span className="field-label">密码</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="至少 8 个字符"
                  autoComplete="new-password"
                />
              </label>
              <label className="field">
                <span className="field-label">确认密码</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="再输入一次"
                  autoComplete="new-password"
                />
              </label>
              <label className="field">
                <span className="field-label">申请说明</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="简单说明你想看什么内容（可选）"
                  rows={3}
                  maxLength={500}
                />
              </label>
              <label className="field">
                <span className="field-label">邀请码（可选）</span>
                <input
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder="有邀请码可以直接激活"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="field">
                <span className="field-label">联系方式（可选）</span>
                <input
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  placeholder="邮箱或其他联系方式"
                  maxLength={200}
                />
              </label>
              <label className="apply-honeypot" aria-hidden="true">
                <span>Website</span>
                <input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
              </label>
              {error ? <div className="auth-error">{error}</div> : null}
              <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
                {busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
                {busy ? '提交中…' : '提交申请'}
              </button>
              <Link className="apply-back" to="/admin"><ArrowLeft size={13} /> 返回登录</Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
