import { useLocation } from 'react-router-dom';
import { useApp } from './state/AppContext';
import { SplashScreen } from './components/SplashScreen';
import { AuthScreen } from './components/AuthScreen';
import { BootError } from './components/BootError';
import { Shell } from './components/Shell';
import { PublicApp } from './public/PublicApp';

export function App() {
  const { phase, data } = useApp();
  const location = useLocation();
  const isAdminEntry = location.pathname.replace(/\/+$/, '') === '/admin';
  const preview = typeof sessionStorage !== 'undefined'
    && sessionStorage.getItem('devforge.preview') === '1';

  if (phase === 'loading') return <SplashScreen />;
  if (phase === 'error') return <BootError />;
  if (phase === 'setup') return <AuthScreen mode="setup" />;
  if (phase === 'login') {
    return isAdminEntry ? <AuthScreen mode="login" /> : <PublicApp />;
  }
  if (phase === 'ready' && data) {
    if (preview && !isAdminEntry) return <PublicApp preview />;
    return <Shell />;
  }
  return <SplashScreen />;
}
