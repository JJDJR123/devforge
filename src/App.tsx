import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useApp } from './state/AppContext';
import { SplashScreen } from './components/SplashScreen';
import { AuthScreen } from './components/AuthScreen';
import { ApplyScreen } from './components/ApplyScreen';
import { BootError } from './components/BootError';
import { Shell } from './components/Shell';
import { PublicApp } from './public/PublicApp';
import { ForgePreview } from './views/ForgePreview';

const ENTRY_KEY = 'devforge.entry';
type EntryMode = 'admin' | 'guest' | null;

function readEntryMode(): EntryMode {
  if (typeof sessionStorage === 'undefined') return null;
  const value = sessionStorage.getItem(ENTRY_KEY);
  return value === 'admin' || value === 'guest' ? value : null;
}

export function App() {
  const { phase, data, user } = useApp();
  const location = useLocation();
  const [entryMode, setEntryMode] = useState<EntryMode>(readEntryMode);
  const isAdminEntry = location.pathname.replace(/\/+$/, '') === '/admin';
  const isApplyEntry = location.pathname.replace(/\/+$/, '') === '/apply';
  const isForgePreview = location.pathname.replace(/\/+$/, '') === '/forge-preview';
  const preview = typeof sessionStorage !== 'undefined'
    && sessionStorage.getItem('devforge.preview') === '1';

  function rememberEntry(mode: Exclude<EntryMode, null>) {
    sessionStorage.setItem(ENTRY_KEY, mode);
    setEntryMode(mode);
  }

  useEffect(() => {
    // Entering through /admin with an existing session should keep the admin
    // in admin mode when they later navigate to /.
    if (phase === 'ready' && isAdminEntry && entryMode !== 'admin') {
      rememberEntry('admin');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isAdminEntry, entryMode]);

  if (phase === 'loading') return <SplashScreen />;
  if (phase === 'error') return <BootError />;
  if (isApplyEntry) return <ApplyScreen />;
  if (phase === 'setup') {
    return <AuthScreen mode="setup" onLoginSuccess={() => rememberEntry('admin')} />;
  }
  if (user?.role === 'reader' && !isApplyEntry) {
    if (isAdminEntry || isForgePreview) return <Navigate to="/" replace />;
    return <PublicApp member />;
  }
  if (phase === 'login') {
    if (isAdminEntry) {
      return <AuthScreen mode="login" onLoginSuccess={() => rememberEntry('admin')} />;
    }
    if (entryMode === 'guest') return <PublicApp />;
    return (
      <AuthScreen
        mode="login"
        allowGuest
        onGuest={() => rememberEntry('guest')}
        onLoginSuccess={() => rememberEntry('admin')}
      />
    );
  }
  if (phase === 'ready' && data) {
    if (isForgePreview) {
      if (user?.role !== 'admin') return <Navigate to="/" replace />;
      return <ForgePreview />;
    }
    if (preview && !isAdminEntry) return <PublicApp preview />;
    if (isAdminEntry) return <Shell />;
    if (entryMode === 'guest') return <PublicApp />;
    if (entryMode === 'admin') return <Shell />;
    return (
      <AuthScreen
        mode="login"
        allowGuest
        onGuest={() => rememberEntry('guest')}
        onLoginSuccess={() => rememberEntry('admin')}
      />
    );
  }
  return <SplashScreen />;
}
