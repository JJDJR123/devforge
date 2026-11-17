import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  CornerDownLeft,
  FileText,
  LayoutDashboard,
  Loader2,
  Search,
  Settings,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../state/AppContext';
import { Modal } from './Modal';
import type { Module, PageMeta, SearchResult } from '../types';
import { cn, formatRelativeTime, getErrorMessage } from '../utils';
import { useToast } from './Toast';

type SearchSource = {
  modules: Module[];
  recent: PageMeta[];
};

export function SearchDialog({
  open,
  onClose,
  publicMode = false,
  dataOverride,
  searchOverride,
}: {
  open: boolean;
  onClose: () => void;
  publicMode?: boolean;
  dataOverride?: SearchSource | null;
  searchOverride?: (q: string) => Promise<{ results: SearchResult[] }>;
}) {
  const { data: appData } = useApp();
  const data: SearchSource | null = dataOverride ?? (appData ? { modules: appData.modules, recent: appData.recent } : null);
  const searchFn = searchOverride ?? api.search;
  const { toast } = useToast();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const moduleNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const module of data?.modules || []) map.set(module.id, module.title);
    return map;
  }, [data?.modules]);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const value = query.trim();
    if (!value) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      searchFn(value)
        .then((response) => {
          setResults(response.results);
          setActive(0);
        })
        .catch((error) => toast(getErrorMessage(error), 'error'))
        .finally(() => setLoading(false));
    }, 180);
    return () => clearTimeout(timer);
  }, [query, open, toast, searchFn]);

  const quickItems = useMemo(() => {
    if (query.trim()) return [];
    return (data?.recent || []).slice(0, 5);
  }, [data?.recent, query]);

  const actions = useMemo(() => [
    { id: 'home', label: '回到总览', hint: 'Dashboard', icon: LayoutDashboard, run: () => navigate('/') },
    ...(publicMode ? [] : [
      { id: 'settings', label: '打开设置', hint: 'Settings', icon: Settings, run: () => navigate('/settings') },
    ]),
  ], [navigate, publicMode]);

  const total = query.trim() ? results.length : quickItems.length + actions.length;

  function go(path: string) {
    navigate(path);
    onClose();
  }

  function handleKey(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((value) => Math.min(total - 1, value + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((value) => Math.max(0, value - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (query.trim()) {
        const result = results[active];
        if (result) go(`/page/${result.id}`);
      } else if (active < quickItems.length) {
        go(`/page/${quickItems[active].id}`);
      } else {
        const action = actions[active - quickItems.length];
        action?.run();
        onClose();
      }
    }
  }

  return (
    <Modal open={open} onClose={onClose} className="search-modal" ariaLabel="搜索">
      <div className="search-panel">
        <div className="search-head">
          <Search size={20} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKey}
            placeholder="搜索页面标题或内容…"
            spellCheck={false}
            aria-label="搜索"
          />
          {loading ? <Loader2 size={17} className="spin" /> : <kbd>ESC</kbd>}
        </div>

        <div className="search-body">
          {query.trim() ? (
            results.length ? (
              <div className="search-group">
                <div className="search-group-head">页面 · {results.length}</div>
                {results.map((result, index) => (
                  <button
                    key={result.id}
                    type="button"
                    className={cn('search-result', active === index && 'is-active')}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(`/page/${result.id}`)}
                  >
                    <span className="search-result-icon">{result.icon || '📄'}</span>
                    <span className="search-result-main">
                      <strong>{result.title}</strong>
                      <span>{result.snippet || '空白页面'}</span>
                    </span>
                    <span className="search-result-meta">
                      <em>{moduleNames.get(result.moduleId) || '模块'}</em>
                      <small>{formatRelativeTime(result.updatedAt)}</small>
                    </span>
                    <ArrowUpRight size={15} className="search-result-arrow" />
                  </button>
                ))}
              </div>
            ) : loading ? null : (
              <div className="search-empty">
                <Search size={24} />
                <p>没有找到「{query.trim()}」</p>
                <span>试试标题里的关键词，或者更短的字。</span>
              </div>
            )
          ) : (
            <>
              {quickItems.length ? (
                <div className="search-group">
                  <div className="search-group-head">最近编辑</div>
                  {quickItems.map((page, index) => (
                    <button
                      key={page.id}
                      type="button"
                      className={cn('search-result', active === index && 'is-active')}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(`/page/${page.id}`)}
                    >
                      <span className="search-result-icon">{page.icon || '📄'}</span>
                      <span className="search-result-main">
                        <strong>{page.title}</strong>
                        <span>{moduleNames.get(page.moduleId) || '模块'}</span>
                      </span>
                      <span className="search-result-meta">
                        <small>{formatRelativeTime(page.updatedAt)}</small>
                      </span>
                      <ArrowUpRight size={15} className="search-result-arrow" />
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="search-group">
                <div className="search-group-head">快捷操作</div>
                {actions.map((action, index) => {
                  const Icon = action.icon;
                  const itemIndex = quickItems.length + index;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      className={cn('search-result is-action', active === itemIndex && 'is-active')}
                      onMouseEnter={() => setActive(itemIndex)}
                      onClick={() => { action.run(); onClose(); }}
                    >
                      <span className="search-action-icon"><Icon size={17} /></span>
                      <span className="search-result-main"><strong>{action.label}</strong></span>
                      <span className="search-result-meta"><small>{action.hint}</small></span>
                      <CornerDownLeft size={14} className="search-result-arrow" />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="search-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>↵</kbd> 打开</span>
          <span><kbd>ESC</kbd> 关闭</span>
          <span className="search-foot-brand">DEVFORGE SEARCH</span>
        </div>
      </div>
    </Modal>
  );
}
