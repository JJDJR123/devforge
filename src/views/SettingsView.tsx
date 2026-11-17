import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  Download,
  Eye,
  HardDrive,
  Info,
  KeyRound,
  Loader2,
  LogOut,
  Palette,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../state/AppContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { Avatar } from '../components/Avatar';
import { BrandMark } from '../components/BrandMark';
import {
  ACCENT_SWATCHES,
  THEME_DEFAULTS,
  THEME_PRESETS,
  normalizeTheme,
  presetAccent,
} from '../theme';
import { cn, formatNumber, getErrorMessage } from '../utils';

type Tab = 'appearance' | 'account' | 'data' | 'about';

const TABS: { id: Tab; label: string; icon: typeof Palette }[] = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'account', label: '账户', icon: UserRound },
  { id: 'data', label: '数据与备份', icon: HardDrive },
  { id: 'about', label: '关于', icon: Info },
];

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function SettingsView() {
  const { data, updateTheme, logout } = useApp();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('appearance');
  const [exporting, setExporting] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(window.matchMedia('(display-mode: standalone)').matches);
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!data) return null;

  async function exportData() {
    if (exporting) return;
    setExporting(true);
    try {
      await api.downloadExport();
      toast('备份已导出，请妥善保存。', 'success');
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    } finally {
      setExporting(false);
    }
  }

  async function installApp() {
    if (!installPrompt) {
      toast('当前浏览器没有提供安装入口，请用 Chrome/Edge 的「安装应用」，或 iOS 的「添加到主屏幕」。', 'info');
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') toast('已添加到桌面。', 'success');
    setInstallPrompt(null);
  }

  async function handleLogout() {
    const ok = await confirm({
      title: '退出登录？',
      message: '数据都保存在服务器上，下次登录即可继续。',
      confirmText: '退出登录',
    });
    if (ok) {
      await logout();
      navigate('/');
    }
  }

  return (
    <div className="settings-view">
      <header className="settings-head">
        <div>
          <span className="eyebrow">SETTINGS / 控制台</span>
          <h1>调整你的工作台</h1>
          <p>外观、账户和数据都在这里管理。改动会立即生效。</p>
        </div>
        <div className="settings-head-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              sessionStorage.setItem('devforge.preview', '1');
              window.location.href = '/';
            }}
          >
            <Eye size={14} /> 预览公开站点
          </button>
          <div className="settings-head-badge">
            <BrandMark size={34} />
            <div>
              <strong>DEVFORGE {data.system.version}</strong>
              <span>SELF HOSTED</span>
            </div>
          </div>
        </div>
      </header>

      <div className="settings-tabs" role="tablist" aria-label="设置分类">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={cn('settings-tab', tab === item.id && 'is-active')}
              onClick={() => setTab(item.id)}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'appearance' ? (
        <AppearancePanel />
      ) : tab === 'account' ? (
        <AccountPanel onLogout={handleLogout} />
      ) : tab === 'data' ? (
        <DataPanel
          exporting={exporting}
          onExport={exportData}
          databaseBytes={data.system.databaseBytes}
          pageCount={data.stats.pageCount}
        />
      ) : (
        <AboutPanel
          standalone={standalone}
          canInstall={Boolean(installPrompt)}
          onInstall={installApp}
        />
      )}

      <div className="settings-foot">
        <span>DEVFORGE · 单用户 · SQLite</span>
        {data.system.icp?.number ? (
          <a href={data.system.icp.link || 'https://beian.miit.gov.cn/'} target="_blank" rel="noreferrer">
            {data.system.icp.number}
          </a>
        ) : null}
        <span>{window.location.origin}</span>
      </div>
    </div>
  );
}

function AppearancePanel() {
  const { theme, updateTheme } = useApp();
  const normalized = normalizeTheme(theme);

  return (
    <div className="settings-panel appearance-panel">
      <section className="settings-block">
        <div className="settings-block-head">
          <div>
            <span className="eyebrow">THEME PRESET</span>
            <h2>主题预设</h2>
            <p>先选一个基调，再微调主色和密度。</p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => updateTheme(THEME_DEFAULTS)}
          >
            <RotateCcw size={14} /> 恢复默认
          </button>
        </div>
        <div className="preset-grid">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={cn('preset-card', normalized.preset === preset.id && 'is-active')}
              onClick={() => updateTheme({ preset: preset.id, accent: presetAccent(preset.id) })}
            >
              <span className="preset-swatch" style={{ background: preset.colors[0] }}>
                <i style={{ background: preset.colors[1] }} />
                <b style={{ background: preset.colors[2] }} />
              </span>
              <span className="preset-name">{preset.name}</span>
              <span className="preset-tagline">{preset.tagline}</span>
              {normalized.preset === preset.id ? <span className="preset-check"><Check size={12} /></span> : null}
            </button>
          ))}
        </div>
      </section>

      <div className="settings-two-col">
        <section className="settings-block">
          <div className="settings-block-head">
            <div>
              <span className="eyebrow">ACCENT</span>
              <h2>主色</h2>
              <p>按钮、进度条、选中状态的强调色。</p>
            </div>
          </div>
          <div className="accent-grid">
            {ACCENT_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                className={cn('settings-accent', normalized.accent === color && 'is-active')}
                style={{ backgroundColor: color }}
                onClick={() => updateTheme({ accent: color })}
                aria-label={`主色 ${color}`}
              >
                {normalized.accent === color ? <Check size={14} /> : null}
              </button>
            ))}
            <label className="settings-accent settings-accent-custom" title="自定义主色">
              <input
                type="color"
                value={normalized.accent}
                onChange={(event) => updateTheme({ accent: event.target.value })}
                aria-label="自定义主色"
              />
              <span style={{ backgroundColor: normalized.accent }} />
            </label>
          </div>
          <div className="accent-value">{normalized.accent.toUpperCase()}</div>
        </section>

        <section className="settings-block">
          <div className="settings-block-head">
            <div>
              <span className="eyebrow">SURFACE</span>
              <h2>质感</h2>
              <p>控制圆角、字号和背景网格。</p>
            </div>
          </div>
          <label className="range-field">
            <span><b>圆角</b><em>{normalized.radius}px</em></span>
            <input
              type="range"
              min={4}
              max={28}
              step={1}
              value={normalized.radius}
              onChange={(event) => updateTheme({ radius: Number(event.target.value) })}
            />
          </label>
          <label className="range-field">
            <span><b>字号</b><em>{normalized.fontScale}%</em></span>
            <input
              type="range"
              min={85}
              max={120}
              step={1}
              value={normalized.fontScale}
              onChange={(event) => updateTheme({ fontScale: Number(event.target.value) })}
            />
          </label>
          <div className="segmented-field">
            <span>信息密度</span>
            <div className="segmented">
              <button
                type="button"
                className={normalized.density === 'comfortable' ? 'is-active' : ''}
                onClick={() => updateTheme({ density: 'comfortable' })}
              >舒适</button>
              <button
                type="button"
                className={normalized.density === 'compact' ? 'is-active' : ''}
                onClick={() => updateTheme({ density: 'compact' })}
              >紧凑</button>
            </div>
          </div>
          <div className="toggle-field">
            <span><b>背景网格</b><em>深色工作台的网格纹理</em></span>
            <button
              type="button"
              className={cn('switch', normalized.grid && 'is-on')}
              onClick={() => updateTheme({ grid: !normalized.grid })}
              aria-pressed={normalized.grid}
            ><span /></button>
          </div>
          <div className="toggle-field">
            <span><b>环境光</b><em>主色在背景里的柔光</em></span>
            <button
              type="button"
              className={cn('switch', normalized.glow && 'is-on')}
              onClick={() => updateTheme({ glow: !normalized.glow })}
              aria-pressed={normalized.glow}
            ><span /></button>
          </div>
        </section>
      </div>

      <section className="settings-block">
        <div className="settings-block-head">
          <div>
            <span className="eyebrow">LIVE PREVIEW</span>
            <h2>实时预览</h2>
            <p>主题会立即应用到整个工作台，并在停止操作后自动保存。</p>
          </div>
        </div>
        <div className="theme-preview" style={{ '--preview-radius': `${normalized.radius}px` } as CSSProperties}>
          <div className="theme-preview-bar">
            <span /><span /><span />
            <em>DEVFORGE / PREVIEW</em>
          </div>
          <div className="theme-preview-body">
            <aside className="preview-sidebar">
              <span className="preview-logo" />
              <span className="preview-line w70" />
              <span className="preview-line w50" />
              <span className="preview-line w60" />
              <span className="preview-line w40" />
            </aside>
            <div className="preview-main">
              <span className="preview-eyebrow">MODULE / 01</span>
              <strong>把想法变成可玩的原型</strong>
              <span className="preview-line w80" />
              <span className="preview-line w60" />
              <div className="preview-card">
                <span className="preview-card-icon" />
                <div>
                  <b>今天先做一件事</b>
                  <span className="preview-line w70" />
                </div>
                <span className="preview-cta">继续 <Check size={11} /></span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function AccountPanel({ onLogout }: { onLogout: () => void }) {
  const { toast } = useToast();
  const { data } = useApp();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (newPassword.length < 8) {
      setError('新密码至少需要 8 个字符。');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致。');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast('密码已更新，其他设备上的登录会话已退出。', 'success');
    } catch (changeError) {
      setError(getErrorMessage(changeError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-panel account-panel">
      <section className="settings-block account-card">
        <div className="account-identity">
          <Avatar name="ADMIN" size={58} />
          <div>
            <span className="eyebrow">ADMINISTRATOR</span>
            <h2>管理员</h2>
            <p>密码只保存在服务器，网页端不会显示。公开访客看不到这个账号。</p>
          </div>
          <span className="account-badge"><ShieldCheck size={14} /> 管理员</span>
        </div>
        <div className="account-facts">
          <div><span>登录方式</span><strong>用户名 + 密码</strong></div>
          <div><span>会话有效期</span><strong>30 天</strong></div>
          <div><span>注册入口</span><strong>已关闭</strong></div>
          <div><span>数据库</span><strong>{formatNumber(Math.round((data?.system.databaseBytes || 0) / 1024))} KB SQLite</strong></div>
        </div>
        <button type="button" className="btn btn-ghost account-logout" onClick={onLogout}>
          <LogOut size={15} /> 退出登录
        </button>
      </section>

      <section className="settings-block">
        <div className="settings-block-head">
          <div>
            <span className="eyebrow">SECURITY</span>
            <h2>修改密码</h2>
            <p>修改后，其他设备上的会话会自动失效。</p>
          </div>
        </div>
        <form className="password-form" onSubmit={submit}>
          <label className="field">
            <span className="field-label"><KeyRound size={14} /> 当前密码</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="输入当前密码"
            />
          </label>
          <div className="password-row">
            <label className="field">
              <span className="field-label">新密码</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="至少 8 个字符"
              />
            </label>
            <label className="field">
              <span className="field-label">确认新密码</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="再输入一次"
              />
            </label>
          </div>
          {error ? <div className="form-error">{error}</div> : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
            {busy ? '更新中…' : '更新密码'}
          </button>
        </form>
      </section>
    </div>
  );
}

function DataPanel({
  exporting,
  onExport,
  databaseBytes,
  pageCount,
}: {
  exporting: boolean;
  onExport: () => void;
  databaseBytes: number;
  pageCount: number;
}) {
  const insecure = window.location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(window.location.hostname);
  return (
    <div className="settings-panel data-panel">
      {insecure ? (
        <div className="settings-warning">
          <AlertTriangle size={18} />
          <div>
            <strong>当前连接不是 HTTPS</strong>
            <span>登录密码会以明文经过网络。正式使用时请绑定域名并开启 HTTPS，Caddy 会自动签发证书。</span>
          </div>
        </div>
      ) : null}

      <div className="settings-two-col">
        <section className="settings-block data-card">
          <span className="data-icon"><Download size={21} /></span>
          <h2>导出完整备份</h2>
          <p>把所有模块、页面、块内容和主题导出为一个 JSON 文件。上传的图片和附件不包含在内。</p>
          <div className="data-facts">
            <span>{pageCount} 张页面</span>
            <span>{formatNumber(Math.round(databaseBytes / 1024))} KB</span>
          </div>
          <button type="button" className="btn btn-primary" onClick={onExport} disabled={exporting}>
            {exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
            {exporting ? '正在打包…' : '导出 JSON'}
          </button>
        </section>

        <section className="settings-block data-card">
          <span className="data-icon"><HardDrive size={21} /></span>
          <h2>服务器备份</h2>
          <p>在服务器项目目录执行下面的命令，会生成 SQLite 快照并自动保留最近 14 份。</p>
          <pre className="code-snippet">docker compose exec app node server/backup.js</pre>
          <p className="data-note">图片和文件在 <code>data/uploads</code>，建议一并备份。完整命令见部署文档。</p>
        </section>
      </div>

      <section className="settings-block">
        <div className="settings-block-head">
          <div>
            <span className="eyebrow">STORAGE</span>
            <h2>数据放在哪里</h2>
          </div>
        </div>
        <div className="storage-list">
          <div><span className="storage-key">数据库</span><code>data/devforge.db</code><em>SQLite · WAL</em></div>
          <div><span className="storage-key">图片 / 文件</span><code>data/uploads/</code><em>按 UUID 命名</em></div>
          <div><span className="storage-key">自动备份</span><code>data/backups/</code><em>最近 14 份</em></div>
        </div>
        <p className="data-note">整个 <code>data/</code> 目录就是你的全部数据。迁移服务器时复制它即可。</p>
      </section>
    </div>
  );
}

function AboutPanel({
  standalone,
  canInstall,
  onInstall,
}: {
  standalone: boolean;
  canInstall: boolean;
  onInstall: () => void;
}) {
  return (
    <div className="settings-panel about-panel">
      <section className="settings-block about-hero">
        <BrandMark size={64} />
        <div>
          <span className="eyebrow">ABOUT DEVFORGE</span>
          <h2>独立游戏开发学习舱</h2>
          <p>一个给自己用的、可以自由搭建的学习工作台。做小，做完，再做下一个。</p>
        </div>
        <span className="about-version">v1.0.0</span>
      </section>

      <div className="settings-two-col">
        <section className="settings-block">
          <div className="settings-block-head">
            <div>
              <span className="eyebrow">INSTALL</span>
              <h2>安装到桌面 / 手机</h2>
            </div>
          </div>
          <p className="about-text">
            DEVFORGE 是一个 PWA。安装后可以像应用一样从桌面或主屏幕直接打开，不需要应用商店。
          </p>
          <button type="button" className="btn btn-primary" onClick={onInstall} disabled={standalone}>
            <Smartphone size={16} /> {standalone ? '已在独立窗口中运行' : canInstall ? '安装 DEVFORGE' : '查看安装方法'}
          </button>
          <p className="data-note">
            iPhone / iPad：Safari 分享菜单 →「添加到主屏幕」。<br />
            Android：Chrome 菜单 →「安装应用」。<br />
            桌面：地址栏右侧的安装图标。
          </p>
        </section>

        <section className="settings-block">
          <div className="settings-block-head">
            <div>
              <span className="eyebrow">SHORTCUTS</span>
              <h2>快捷键</h2>
            </div>
          </div>
          <div className="shortcut-list">
            <div><span>全局搜索</span><kbd>Ctrl / ⌘</kbd><kbd>K</kbd></div>
            <div><span>插入积木</span><kbd>/</kbd></div>
            <div><span>保存标题</span><kbd>Enter</kbd></div>
            <div><span>关闭浮层</span><kbd>Esc</kbd></div>
          </div>
        </section>
      </div>

      <section className="settings-block">
        <div className="settings-block-head">
          <div>
            <span className="eyebrow">STACK</span>
            <h2>技术栈</h2>
          </div>
        </div>
        <div className="stack-grid">
          <div><strong>React + Vite</strong><span>界面与块编辑器</span></div>
          <div><strong>BlockNote</strong><span>Notion 风格积木内核</span></div>
          <div><strong>Fastify + SQLite</strong><span>API 与数据存储</span></div>
          <div><strong>Docker + Caddy</strong><span>部署与自动 HTTPS</span></div>
        </div>
        <p className="data-note">
          你的数据只保存在自己的服务器上。没有第三方分析、没有广告、没有公开注册。
        </p>
      </section>

      <div className="about-actions">
        <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
          <RefreshCw size={15} /> 刷新应用
        </button>
      </div>
    </div>
  );
}
