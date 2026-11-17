import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, UNAUTHORIZED_EVENT } from '../api';
import type { AuthStatus, Bootstrap, PageMeta, Theme, User } from '../types';
import { applyTheme, normalizeTheme, THEME_DEFAULTS } from '../theme';
import { getErrorMessage } from '../utils';
import { useToast } from '../components/Toast';

type AuthPhase = 'loading' | 'setup' | 'login' | 'ready' | 'error';

type AppContextValue = {
  phase: AuthPhase;
  user: User | null;
  data: Bootstrap | null;
  bootError: string;
  theme: Theme;
  icp: { number: string; link: string } | null;
  login: (username: string, password: string) => Promise<void>;
  setup: (token: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retryBoot: () => void;
  refresh: () => Promise<void>;
  updateTheme: (patch: Partial<Theme>) => void;
  applyPageMeta: (id: string, patch: Partial<PageMeta>) => void;
  applyModule: (module: Bootstrap['modules'][number]) => void;
  removePageLocal: (id: string) => void;
  removeModuleLocal: (id: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

const THEME_CACHE = 'devforge.theme';

function readCachedTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_CACHE);
    if (!raw) return THEME_DEFAULTS;
    return normalizeTheme(JSON.parse(raw));
  } catch {
    return THEME_DEFAULTS;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<AuthPhase>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<Bootstrap | null>(null);
  const [bootError, setBootError] = useState('');
  const [icp, setIcp] = useState<{ number: string; link: string } | null>(null);
  const dataRef = useRef<Bootstrap | null>(null);
  const themeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    applyTheme(readCachedTheme());
  }, []);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const loadBootstrap = useCallback(async () => {
    const result = await api.bootstrap();
    setData(result);
    setUser(result.user);
    applyTheme(normalizeTheme(result.theme));
    try { localStorage.setItem(THEME_CACHE, JSON.stringify(result.theme)); } catch { /* ignore */ }
    setPhase('ready');
  }, []);

  const boot = useCallback(async () => {
    setPhase('loading');
    setBootError('');
    try {
      const status: AuthStatus = await api.status();
      if (status.icp?.number) setIcp(status.icp);
      if (status.setupRequired) {
        setPhase('setup');
        return;
      }
      if (!status.authenticated) {
        setPhase('login');
        return;
      }
      await loadBootstrap();
    } catch (error) {
      setBootError(getErrorMessage(error));
      setPhase('error');
    }
  }, [loadBootstrap]);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    const handler = () => {
      setPhase('login');
      setData(null);
      setUser(null);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.login({ username, password });
    setUser(result.user);
    await loadBootstrap();
    toast('欢迎回来，工作台已就绪。', 'success');
  }, [loadBootstrap, toast]);

  const setup = useCallback(async (token: string, username: string, password: string) => {
    const result = await api.setup({ token, username, password });
    setUser(result.user);
    await loadBootstrap();
    toast('初始化完成。这里以后就是你的学习舱。', 'success');
  }, [loadBootstrap, toast]);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* clear locally anyway */ }
    setPhase('login');
    setData(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await api.bootstrap();
      setData(result);
      setUser(result.user);
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }, [toast]);

  const updateTheme = useCallback((patch: Partial<Theme>) => {
    const current = dataRef.current;
    if (!current) return;
    const theme = normalizeTheme({ ...current.theme, ...patch });
    applyTheme(theme);
    const next = { ...current, theme };
    dataRef.current = next;
    setData(next);
    try { localStorage.setItem(THEME_CACHE, JSON.stringify(theme)); } catch { /* ignore */ }
    if (themeTimer.current) clearTimeout(themeTimer.current);
    themeTimer.current = setTimeout(() => {
      api.saveTheme(theme).catch((error) => toast(getErrorMessage(error), 'error'));
    }, 450);
  }, [toast]);

  useEffect(() => () => {
    if (themeTimer.current) clearTimeout(themeTimer.current);
  }, []);

  const applyPageMeta = useCallback((id: string, patch: Partial<PageMeta>) => {
    setData((prev) => {
      if (!prev) return prev;
      const pages = prev.pages.map((page) => page.id === id ? { ...page, ...patch } : page);
      const recent = prev.recent
        .map((page) => page.id === id ? { ...page, ...patch } : page)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 6);
      return { ...prev, pages, recent };
    });
  }, []);

  const applyModule = useCallback((module: Bootstrap['modules'][number]) => {
    setData((prev) => prev ? {
      ...prev,
      modules: prev.modules.map((item) => item.id === module.id ? module : item),
    } : prev);
  }, []);

  const removePageLocal = useCallback((id: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const removed = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const page of prev.pages) {
          if (page.parentId && removed.has(page.parentId) && !removed.has(page.id)) {
            removed.add(page.id);
            changed = true;
          }
        }
      }
      return {
        ...prev,
        pages: prev.pages.filter((page) => !removed.has(page.id)),
        recent: prev.recent.filter((page) => !removed.has(page.id)),
      };
    });
  }, []);

  const removeModuleLocal = useCallback((id: string) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        modules: prev.modules.filter((module) => module.id !== id),
        pages: prev.pages.filter((page) => page.moduleId !== id),
        recent: prev.recent.filter((page) => page.moduleId !== id),
      };
    });
  }, []);

  const value = useMemo<AppContextValue>(() => ({
    phase,
    user: user || data?.user || null,
    data,
    bootError,
    theme: data?.theme || readCachedTheme(),
    icp,
    login,
    setup,
    logout,
    retryBoot: () => { void boot(); },
    refresh,
    updateTheme,
    applyPageMeta,
    applyModule,
    removePageLocal,
    removeModuleLocal,
  }), [
    phase,
    user,
    data,
    bootError,
    icp,
    login,
    setup,
    logout,
    boot,
    refresh,
    updateTheme,
    applyPageMeta,
    applyModule,
    removePageLocal,
    removeModuleLocal,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
