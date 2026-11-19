import { useEffect, useState } from 'react';
import { FileText, FolderTree, Loader2, X } from 'lucide-react';
import { api } from '../api';
import type { Module, Page, PageMeta, Theme } from '../types';
import { PublicBlockEditor } from '../public/PublicBlockEditor';

type PreviewTarget =
  | { kind: 'page'; id: string }
  | { kind: 'module'; id: string }
  | null;

function parseTarget(href: string | null): PreviewTarget {
  if (!href) return null;
  const page = href.match(/^\/page\/([^/?#]+)/);
  if (page) return { kind: 'page', id: page[1] };
  const module = href.match(/^\/module\/([^/?#]+)/);
  if (module) return { kind: 'module', id: module[1] };
  return null;
}

export function WikiPreview({
  href,
  mode,
  pages,
  modules,
  theme,
  onClose,
}: {
  href: string | null;
  mode: 'admin' | 'public';
  pages: PageMeta[];
  modules: Module[];
  theme: Theme;
  onClose: () => void;
}) {
  const target = parseTarget(href);
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target || target.kind !== 'page') {
      setPage(null);
      setError('');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setPage(null);
    const request = mode === 'public'
      ? api.publicPage(target.id)
      : api.getPage(target.id);
    request
      .then((result) => { if (!cancelled) setPage(result.page); })
      .catch(() => { if (!cancelled) setError('这个页面不存在，或者没有公开。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [target?.kind, target?.id, mode]);

  useEffect(() => {
    if (!href) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handle);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', handle);
    };
  }, [href, onClose]);

  if (!href || !target) return null;

  const module = target.kind === 'module' ? modules.find((item) => item.id === target.id) : null;
  const modulePages = target.kind === 'module'
    ? pages.filter((item) => item.moduleId === target.id)
    : [];
  const pageModule = page ? modules.find((item) => item.id === page.moduleId) : null;
  const title = target.kind === 'module' ? module?.title || '模块' : page?.title || '页面';
  const icon = target.kind === 'module' ? module?.icon || '📦' : page?.icon || '📄';

  return (
    <div className="wiki-preview-backdrop" onMouseDown={onClose}>
      <section
        className="wiki-preview-window"
        role="dialog"
        aria-label={`快速预览：${title}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="wiki-preview-head">
          <div className="wiki-preview-heading">
            <span className="wiki-preview-icon">{icon}</span>
            <div>
              <span className="eyebrow">QUICK VIEW</span>
              <h2>{title}</h2>
              <p>
                {target.kind === 'module'
                  ? `模块 · ${modulePages.length} 个页面`
                  : pageModule?.title || '页面'}
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭预览">
            <X size={17} />
          </button>
        </header>

        <div className="wiki-preview-body">
          {target.kind === 'module' ? (
            <div className="wiki-preview-module">
              <div className="wiki-preview-module-mark"><FolderTree size={22} /></div>
              <p>这是一个模块。这里列出它直接包含的页面；完整内容可以分别打开页面查看。</p>
              {modulePages.length ? (
                <div className="wiki-preview-page-list">
                  {modulePages.map((item) => (
                    <div key={item.id} className="wiki-preview-page-row">
                      <span>{item.icon}</span>
                      <strong>{item.title}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="wiki-preview-empty">这个模块还没有页面。</p>
              )}
            </div>
          ) : loading ? (
            <div className="wiki-preview-state"><Loader2 size={18} className="spin" /> 正在读取内容…</div>
          ) : error ? (
            <div className="wiki-preview-state"><FileText size={18} /> {error}</div>
          ) : page ? (
            page.blocks.length ? (
              <PublicBlockEditor
                blocks={page.blocks}
                pages={pages}
                modules={modules}
                theme={theme}
                onLinkClick={() => undefined}
              />
            ) : (
              <div className="wiki-preview-state"><FileText size={18} /> 这张页面还没有内容。</div>
            )
          ) : null}
        </div>

        <footer className="wiki-preview-foot">
          <span>快速预览 · 不离开当前页面</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </footer>
      </section>
    </div>
  );
}
