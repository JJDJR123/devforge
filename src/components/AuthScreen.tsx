import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Cloud,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Terminal,
  UserRound,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { BrandLockup, BrandMark } from './BrandMark';
import { getErrorMessage } from '../utils';

type Mode = 'setup' | 'login';

export function AuthScreen({
  mode,
  allowGuest = false,
  onGuest,
  onLoginSuccess,
}: {
  mode: Mode;
  allowGuest?: boolean;
  onGuest?: () => void;
  onLoginSuccess?: () => void;
}) {
  const { setup, login, icp } = useApp();
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showResetHint, setShowResetHint] = useState(false);
  const isSetup = mode === 'setup';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');

    if (isSetup) {
      if (!token.trim()) {
        setError('请输入首次启动口令。');
        return;
      }
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
    }

    setBusy(true);
    try {
      if (isSetup) {
        await setup(token.trim(), username.trim(), password);
      } else {
        await login(username.trim(), password);
      }
      onLoginSuccess?.();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <AuthVisual />
      <div className="auth-panel">
        <div className="auth-mobile-brand">
          <BrandLockup compact />
        </div>
        <div className="auth-card">
          <div className="auth-kicker">
            <span className={isSetup ? 'status-dot is-warm' : 'status-dot'} />
            {isSetup ? 'FIRST BOOT · 首次初始化' : allowGuest ? 'ADMIN / GUEST · 选择进入方式' : 'ADMIN · 管理员登录'}
          </div>
          <h2>{isSetup ? '点火，建立你的学习舱' : allowGuest ? '进入学习舱' : '欢迎回来'}</h2>
          <p className="auth-lead">
            {isSetup
              ? '这是第一次启动。设置一个管理员账号，之后所有电脑都用它登录。'
              : allowGuest
                ? '管理员登录后可以编辑和管理内容；没有账号，直接以游客身份浏览公开内容。'
                : '登录管理端，继续搭建你的独立游戏开发知识库。'}
          </p>

          <form className="auth-form" onSubmit={submit}>
            {isSetup ? (
              <label className="field">
                <span className="field-label"><KeyRound size={14} /> 首次启动口令</span>
                <input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="在服务器日志或 data/setup-token.txt 中"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  autoFocus
                />
              </label>
            ) : null}

            <label className="field">
              <span className="field-label"><UserRound size={14} /> 用户名</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="你的用户名"
                autoComplete="username"
                spellCheck={false}
                autoFocus={!isSetup}
              />
            </label>

            <label className="field">
              <span className="field-label"><LockKeyhole size={14} /> 密码</span>
              <span className="password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isSetup ? '至少 8 个字符' : '输入密码'}
                  autoComplete={isSetup ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>

            {isSetup ? (
              <label className="field">
                <span className="field-label"><ShieldCheck size={14} /> 确认密码</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="再输入一次"
                  autoComplete="new-password"
                />
              </label>
            ) : null}

            {error ? (
              <div className="form-error" role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            ) : null}

            <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
              {busy ? <Loader2 size={17} className="spin" /> : null}
              {busy ? '正在进入…' : isSetup ? '建立学习舱' : allowGuest ? '管理员登录' : '进入学习舱'}
              {!busy ? <ArrowRight size={17} /> : null}
            </button>
          </form>

          {allowGuest && !isSetup ? (
            <div className="auth-guest-entry">
              <span>没有管理员账号？</span>
              <button type="button" className="btn btn-ghost" onClick={onGuest}>
                <Eye size={16} /> 以游客身份进入
              </button>
            </div>
          ) : null}

          {isSetup ? (
            <div className="auth-hint">
              <Terminal size={15} />
              <span>
                找不到口令？在服务器运行 <code>docker compose logs app</code>，或查看
                <code>data/setup-token.txt</code>。
              </span>
            </div>
          ) : (
            <div className="auth-login-foot">
              <button type="button" className="link-button" onClick={() => setShowResetHint((value) => !value)}>
                忘记密码？
              </button>
              {showResetHint ? (
                <div className="auth-hint">
                  <Terminal size={15} />
                  <span>
                    在服务器执行 <code>sudo runuser -u devforge -- /opt/node/bin/node /opt/devforge/server/reset-password.js &lt;用户名&gt; 新密码</code>
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="auth-legal">
          <ShieldCheck size={13} /> 单管理员 · 游客只读 · 不开放注册 · 数据保存在你自己的服务器
          {icp?.number ? (
            <a href={icp.link || 'https://beian.miit.gov.cn/'} target="_blank" rel="noreferrer">
              {icp.number}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AuthVisual() {
  return (
    <div className="auth-visual">
      <div className="auth-visual-grid" aria-hidden="true" />
      <div className="auth-visual-top">
        <BrandLockup />
        <div className="auth-build-tag">BUILD 1.0 / SELF HOSTED</div>
      </div>

      <div className="auth-hero">
        <span className="eyebrow"><Sparkles size={13} /> YOUR PRIVATE GAME DEV WORKBENCH</span>
        <h1>
          把想做的游戏，
          <br />
          拆成今天能完成的<span>一步</span>。
        </h1>
        <p>
          不是又一份课程表。模块、页面、灵感、代码和截图，
          都放进一个可以自由搭建的个人学习舱。
        </p>
        <div className="auth-features">
          <span><Boxes size={15} /> 自由积木编辑</span>
          <span><Cloud size={15} /> 自动保存</span>
          <span><ShieldCheck size={15} /> 私有部署</span>
        </div>
      </div>

      <div className="auth-terminal" aria-hidden="true">
        <div className="terminal-head">
          <span /><span /><span />
          <em>devforge@studio:~</em>
        </div>
        <div className="terminal-body">
          <div><b>$</b> boot devforge</div>
          <div><i>[ok]</i> sqlite database connected</div>
          <div><i>[ok]</i> theme engine loaded <u>forge</u></div>
          <div><i>[ok]</i> block editor armed</div>
          <div><i>[ok]</i> autosave standing by</div>
          <div className="terminal-cursor"><b>&gt;</b> ready to build your game <span /></div>
        </div>
      </div>

      <div className="auth-visual-foot">
        <BrandMark size={26} />
        <span>做小，做完，再做下一个。</span>
        <span className="auth-foot-code">DF-001</span>
      </div>
    </div>
  );
}
