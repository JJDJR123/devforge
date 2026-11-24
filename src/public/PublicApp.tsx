import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Globe2,
  Images,
  Inbox,
  LogOut,
  Menu,
  MessageCircle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../state/AppContext';
import { applyTheme } from '../theme';
import type { Module, PageMeta, PublicBootstrap } from '../types';
import { cn, formatRelativeTime, getErrorMessage, isApplePlatform } from '../utils';
import { BrandLockup, BrandMark } from '../components/BrandMark';
import { ModuleIconContent } from '../components/ModuleIcon';
import { SearchDialog } from '../components/SearchDialog';
import { PublicHome } from './PublicHome';
import { PublicModule } from './PublicModule';
import { PublicPage } from './PublicPage';
import { MemberKbView } from '../views/MemberKbView';
import { MemberAssetsView } from '../views/MemberAssetsView';
import { ChatView } from '../views/ChatView';
import { MailboxView } from '../views/MailboxView';

const COLLAPSE_KEY = 'devforge.public.collapsed';

function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

export function PublicApp({ preview = false, member = false }: { preview?: boolean; member?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useApp();
  const [data, setData] = useState<PublicBootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchShortcut = isApplePlatform() ? '⌘ K' : 'Ctrl K';

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await api.publicBootstrap();
      setData(result);
      applyTheme(result.theme);
      try { localStorage.setItem('devforge.theme', JSON.stringify(result.theme)); } catch { /* ignore */ }
      setLoading(false);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!data) return;
    document.title = `${data.site.name} · ${data.site.tagline}`;
    if (data.site.logoUrl) {
      const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (icon) icon.href = data.site.logoUrl;
    }
  }, [data]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const searchSource = useMemo(
    () => (data ? { modules: data.modules, recent: data.recent } : null),
    [data],
  );

  if (loading) {
    return (
      <div className="public-loading-screen">
        <BrandMark size={56} />
        <span>DEVFORGE</span>
        <em>正在打开公开学习舱…</em>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="boot-error-screen">
        <div className="boot-error-card">
          <BrandLockup compact />
          <div className="boot-error-icon"><Globe2 size={26} /></div>
          <h1>公开内容暂时无法加载</h1>
          <p>{error || '服务器没有响应，请稍后再试。'}</p>
          <button type="button" className="btn btn-primary" onClick={() => { void load(); }}>
            <RefreshCw size={16} /> 重试
          </button>
        </div>
      </div>
    );
  }

  const title = location.pathname.startsWith('/module/')
    ? '模块'
    : location.pathname.startsWith('/page/')
      ? '页面'
      : location.pathname.startsWith('/kb')
        ? '知识库'
        : location.pathname.startsWith('/assets')
          ? '素材库'
          : location.pathname.startsWith('/chat')
            ? '聊天室'
            : location.pathname.startsWith('/mailbox')
              ? '信箱'
              : '总览';

  async function handleLogout() {
    await logout();
    navigate('/admin');
  }

  return (
    <div className={cn('app-shell public-shell', sidebarOpen && 'sidebar-open')}>
      <PublicSidebar
        data={data}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenSearch={() => setSearchOpen(true)}
      />
      {sidebarOpen ? <button type="button" className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="关闭侧栏" /> : null}

      <div className="app-main">
        <header className="topbar public-topbar">
          <div className="topbar-left">
            <button type="button" className="icon-btn topbar-menu" onClick={() => setSidebarOpen(true)} aria-label="打开侧栏">
              <Menu size={19} />
            </button>
            <div className="topbar-crumb">
              <span className="crumb-root">公开站点</span>
              <span className="crumb-sep">/</span>
              <strong>{title}</strong>
            </div>
          </div>

          <button type="button" className="topbar-search" onClick={() => setSearchOpen(true)}>
            <Search size={15} />
            <span>搜索公开内容</span>
            <kbd>{searchShortcut}</kbd>
          </button>

          <div className="topbar-right">
            {preview ? (
              <button
                type="button"
                className="public-preview-exit"
                onClick={() => {
                  sessionStorage.removeItem('devforge.preview');
                  window.location.href = '/admin';
                }}
              >
                返回管理 <ArrowLeft size={13} />
              </button>
            ) : member ? (
              <div className="public-member-actions">
                <button type="button" className="public-member-link" onClick={() => navigate('/kb')}>
                  <BookOpen size={13} /> 知识库
                </button>
                <button type="button" className="public-member-link" onClick={() => navigate('/assets')}>
                  <Images size={13} /> 素材库
                </button>
                <button type="button" className="public-member-link" onClick={() => navigate('/chat')}>
                  <MessageCircle size={13} /> 聊天室
                </button>
                <button type="button" className="public-member-link" onClick={() => navigate('/mailbox')}>
                  <Inbox size={13} /> 信箱
                </button>
                <span className="public-topbar-badge"><Eye size={12} /> 成员 · 只读</span>
                <button type="button" className="public-member-link" onClick={() => { void handleLogout(); }}>
                  <LogOut size={13} /> 退出
                </button>
              </div>
            ) : (
              <span className="public-topbar-badge"><Eye size={12} /> 游客 · 只读</span>
            )}
          </div>
        </header>

        <main className="app-view" key={location.pathname}>
          <Routes>
            <Route path="/" element={<PublicHome data={data} onOpenSearch={() => setSearchOpen(true)} />} />
            <Route path="/module/:moduleId" element={<PublicModule data={data} />} />
            <Route path="/page/:pageId" element={<PublicPage data={data} />} />
            {member ? <Route path="/kb" element={<MemberKbView />} /> : null}
            {member ? <Route path="/assets" element={<MemberAssetsView />} /> : null}
            {member ? <Route path="/chat" element={<ChatView member />} /> : null}
            {member ? <Route path="/mailbox" element={<MailboxView />} /> : null}
            <Route path="/settings" element={<Navigate to="/" replace />} />
            <Route path="*" element={<PublicMissing />} />
          </Routes>
          <footer className="public-global-foot">
            <span>{data.site.name} · 公开学习舱</span>
            <span><Eye size={11} /> 游客浏览 · 只读 · 内容由管理员维护</span>
            {data.icp?.number ? (
              <a href={data.icp.link || 'https://beian.miit.gov.cn/'} target="_blank" rel="noreferrer">
                {data.icp.number}
              </a>
            ) : null}
          </footer>
        </main>
      </div>

      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        publicMode
        dataOverride={searchSource}
        searchOverride={api.publicSearch}
      />
    </div>
  );
}

function PublicSidebar({
  data,
  open,
  onClose,
  onOpenSearch,
}: {
  data: PublicBootstrap;
  open: boolean;
  onClose: () => void;
  onOpenSearch: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
  const searchShortcut = isApplePlatform() ? '⌘ K' : 'Ctrl K';
  const modules = useMemo(
    () => [...data.modules].sort((a, b) => a.sortOrder - b.sortOrder),
    [data.modules],
  );
  const modulesByParent = useMemo(() => {
    const map = new Map<string, Module[]>();
    for (const module of modules) {
      const key = module.parentId || 'root';
      const list = map.get(key) || [];
      list.push(module);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [modules]);
  const topModules = modulesByParent.get('root') || [];
  const pagesByParent = useMemo(() => {
    const map = new Map<string, PageMeta[]>();
    for (const page of data.pages) {
      const key = page.parentId || `module:${page.moduleId}`;
      const list = map.get(key) || [];
      list.push(page);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [data.pages]);

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed])); } catch { /* ignore */ }
  }, [collapsed]);

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function go(path: string) {
    navigate(path);
    onClose();
  }

  const activePageId = location.pathname.startsWith('/page/')
    ? decodeURIComponent(location.pathname.slice('/page/'.length).split('/')[0] || '')
    : '';

  function renderPage(page: PageMeta, depth: number): ReactElement {
    const children = pagesByParent.get(page.id) || [];
    const key = `page:${page.id}`;
    const isCollapsed = collapsed.has(key);
    return (
      <div key={page.id}>
        <div className={cn('side-page-row', activePageId === page.id && 'is-active')} style={{ paddingLeft: 12 + depth * 14 }}>
          {children.length ? (
            <button type="button" className="side-collapse page-collapse" onClick={() => toggle(key)} aria-label={isCollapsed ? '展开子页面' : '收起子页面'}>
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
          ) : <span className="page-indent" />}
          <button type="button" className="side-page-link" onClick={() => go(`/page/${page.id}`)}>
            <span className="side-page-icon">{page.icon}</span>
            <span className="side-page-title">{page.title}</span>
          </button>
        </div>
        {!isCollapsed && children.map((child) => renderPage(child, depth + 1))}
      </div>
    );
  }

  function renderModule(module: Module, depth: number): ReactElement {
    const key = `module:${module.id}`;
    const isCollapsed = collapsed.has(key);
    const pages = pagesByParent.get(key) || [];
    const children = modulesByParent.get(module.id) || [];
    return (
      <div className="side-module" key={module.id} style={depth > 0 ? { marginLeft: 10 + depth * 4 } : undefined}>
        <div className="side-module-head">
          <button type="button" className="side-collapse" onClick={() => toggle(key)} aria-label={isCollapsed ? '展开模块' : '收起模块'}>
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <button type="button" className="side-module-link" onClick={() => go(`/module/${module.id}`)}>
            <span className="side-module-icon" style={{ backgroundColor: `${module.accent}1a`, color: module.accent }}>
              <ModuleIconContent module={module} />
            </span>
            <span className="side-module-name">{module.title}</span>
            <span className="side-module-count">{pages.length + children.length}</span>
          </button>
        </div>
        {!isCollapsed ? (
          <div className="side-pages">
            {pages.map((page) => renderPage(page, depth))}
            {children.map((child) => renderModule(child, depth + 1))}
            {pages.length === 0 && children.length === 0 ? (
              <span className="side-page-empty">暂无公开页面</span>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <aside className={cn('sidebar public-sidebar', open && 'is-open')}>
      <div className="sidebar-head">
        <button type="button" className="brand-button" onClick={() => go('/')} aria-label="公开首页">
          <BrandLockup
            name={data.site.name}
            tagline={data.site.tagline}
            logoUrl={data.site.logoUrl}
          />
        </button>
        <button type="button" className="icon-btn sidebar-close" onClick={onClose} aria-label="关闭侧栏">
          <X size={18} />
        </button>
      </div>

      <div className="public-side-label">
        <span><Globe2 size={12} /> 公开学习舱</span>
        <em>GUEST / READ ONLY</em>
      </div>

      <div className="sidebar-actions">
        <button type="button" className="search-box" onClick={onOpenSearch}>
          <Search size={16} />
          <span>搜索公开内容…</span>
          <kbd>{searchShortcut}</kbd>
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="公开导航">
        <button type="button" className={cn('nav-item', location.pathname === '/' && 'is-active')} onClick={() => go('/')}>
          <Globe2 size={16} />
          <span>公开首页</span>
        </button>
      </nav>

      <div className="sidebar-tree-head">
        <span>学习模块</span>
        <span className="tree-count">{modules.length}</span>
      </div>

      <div className="sidebar-tree">
        {topModules.length === 0 ? (
          <div className="sidebar-empty">
            <Globe2 size={22} />
            <p>还没有公开模块</p>
          </div>
        ) : topModules.map((module) => renderModule(module, 0))}
      </div>

      <div className="sidebar-foot public-sidebar-foot">
        <div className="public-sidebar-note">
          <Eye size={13} />
          <span>游客浏览模式</span>
        </div>
        <div className="public-sidebar-note is-muted">
          <FileText size={12} />
          <span>内容由管理员维护</span>
        </div>
      </div>
    </aside>
  );
}

function PublicMissing() {
  const navigate = useNavigate();
  return (
    <div className="page-missing public-missing">
      <div className="page-missing-icon"><Globe2 size={26} /></div>
      <h1>这个页面不存在</h1>
      <p>链接可能不完整，或者内容还没有公开。</p>
      <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>回到公开首页</button>
    </div>
  );
}
