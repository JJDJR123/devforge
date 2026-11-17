import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Search, Settings } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { SearchDialog } from './SearchDialog';
import { Avatar } from './Avatar';
import { Dashboard } from '../views/Dashboard';
import { ModuleView } from '../views/ModuleView';
import { PageView } from '../views/PageView';
import { SettingsView } from '../views/SettingsView';
import { useApp } from '../state/AppContext';
import { cn } from '../utils';

export function Shell() {
  const { data } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

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

  const title = location.pathname.startsWith('/page/')
    ? '页面'
    : location.pathname.startsWith('/module/')
      ? '模块'
      : location.pathname.startsWith('/settings')
        ? '设置'
        : '总览';

  return (
    <div className={cn('app-shell', sidebarOpen && 'sidebar-open')}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onOpenSearch={() => setSearchOpen(true)} />
      {sidebarOpen ? <button type="button" className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="关闭侧栏" /> : null}

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button type="button" className="icon-btn topbar-menu" onClick={() => setSidebarOpen(true)} aria-label="打开侧栏">
              <Menu size={19} />
            </button>
            <div className="topbar-crumb">
              <span className="crumb-root">工作台</span>
              <span className="crumb-sep">/</span>
              <strong>{title}</strong>
            </div>
          </div>

          <button type="button" className="topbar-search" onClick={() => setSearchOpen(true)}>
            <Search size={15} />
            <span>搜索</span>
            <kbd>⌘ K</kbd>
          </button>

          <div className="topbar-right">
            <span className="topbar-connection">
              <i className="status-dot" />
              已连接
            </span>
            <button
              type="button"
              className="topbar-avatar"
              onClick={() => navigate('/settings')}
              aria-label="账户与设置"
            >
              <Avatar name="ADMIN" size={32} />
            </button>
            <button
              type="button"
              className="icon-btn topbar-settings"
              onClick={() => navigate('/settings')}
              aria-label="设置"
            >
              <Settings size={18} />
            </button>
          </div>
        </header>

        <main className="app-view" key={location.pathname}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/module/:moduleId" element={<ModuleView />} />
            <Route path="/page/:pageId" element={<PageView />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
