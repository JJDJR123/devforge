import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, FolderTree, Search, X } from 'lucide-react';
import type { Module, PageMeta } from '../types';
import { cn } from '../utils';

export function LinkPicker({
  open,
  pages,
  modules,
  currentPageId,
  currentModuleId,
  onClose,
  onSelect,
}: {
  open: boolean;
  pages: PageMeta[];
  modules: Module[];
  currentPageId: string;
  currentModuleId: string;
  onClose: () => void;
  onSelect: (kind: 'page' | 'module', id: string, title: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [open, onClose]);

  const moduleName = useMemo(
    () => new Map(modules.map((module) => [module.id, module.title])),
    [modules],
  );

  const q = query.trim().toLowerCase();
  const matchedModules = modules
    .filter((module) => !q || module.title.toLowerCase().includes(q))
    .slice(0, 12);
  const matchedPages = pages
    .filter((page) => page.id !== currentPageId)
    .filter((page) => !q
      || page.title.toLowerCase().includes(q)
      || (moduleName.get(page.moduleId) || '').toLowerCase().includes(q))
    .sort((a, b) => {
      const aSame = a.moduleId === currentModuleId ? 0 : 1;
      const bSame = b.moduleId === currentModuleId ? 0 : 1;
      return aSame - bSame || b.updatedAt.localeCompare(a.updatedAt);
    })
    .slice(0, 30);

  const items = [
    ...matchedModules.map((module) => ({ kind: 'module' as const, id: module.id, title: module.title })),
    ...matchedPages.map((page) => ({ kind: 'page' as const, id: page.id, title: page.title })),
  ];
  const active = Math.min(activeIndex, Math.max(0, items.length - 1));

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function choose(index: number) {
    const item = items[index];
    if (!item) return;
    onSelect(item.kind, item.id, item.title);
  }

  if (!open) return null;

  return (
    <div className="link-picker-backdrop" onMouseDown={onClose}>
      <div className="link-picker" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-label="关联页面或模块">
        <header className="link-picker-head">
          <div>
            <span className="eyebrow">LINK TO</span>
            <strong>关联页面或模块</strong>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </header>

        <label className="link-picker-search">
          <Search size={15} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((index) => items.length ? (index + 1) % items.length : 0);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((index) => items.length ? (index - 1 + items.length) % items.length : 0);
              } else if (event.key === 'Enter') {
                event.preventDefault();
                choose(active);
              }
            }}
            placeholder="搜索页面标题、模块名，或关键词…"
            spellCheck={false}
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="清空搜索">
              <X size={13} />
            </button>
          ) : null}
        </label>

        <div className="link-picker-list">
          {matchedModules.length ? (
            <div className="link-picker-group">
              <span className="link-picker-label">模块</span>
              {matchedModules.map((module, index) => (
                <button
                  key={module.id}
                  type="button"
                  className={cn('link-picker-item', active === index && 'is-active')}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => onSelect('module', module.id, module.title)}
                >
                  <span className="link-picker-icon"><FolderTree size={15} /></span>
                  <span className="link-picker-text">
                    <strong>{module.title}</strong>
                    <small>模块 · 链接到模块页</small>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {matchedPages.length ? (
            <div className="link-picker-group">
              <span className="link-picker-label">页面</span>
              {matchedPages.map((page, index) => (
                <button
                  key={page.id}
                  type="button"
                  className={cn('link-picker-item', active === matchedModules.length + index && 'is-active')}
                  onMouseEnter={() => setActiveIndex(matchedModules.length + index)}
                  onClick={() => onSelect('page', page.id, page.title)}
                >
                  <span className="link-picker-icon"><FileText size={15} /></span>
                  <span className="link-picker-text">
                    <strong>{page.title}</strong>
                    <small>{moduleName.get(page.moduleId) || '未分组'}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {!matchedModules.length && !matchedPages.length ? (
            <div className="link-picker-empty">没有匹配的页面或模块。</div>
          ) : null}
        </div>

        <footer className="link-picker-foot">
          <span>选择后插入到当前光标位置</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </footer>
      </div>
    </div>
  );
}
