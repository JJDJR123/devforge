import { useMemo, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  Eye,
  FileText,
  FolderOpen,
} from 'lucide-react';
import type { PageMeta, PublicBootstrap } from '../types';
import { ModuleIconContent } from '../components/ModuleIcon';
import { formatNumber, formatRelativeTime } from '../utils';

export function PublicModule({ data }: { data: PublicBootstrap }) {
  const { moduleId = '' } = useParams();
  const navigate = useNavigate();
  const module = data.modules.find((item) => item.id === moduleId) || null;
  const childModules = useMemo(
    () => data.modules
      .filter((item) => item.parentId === moduleId)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [data.modules, moduleId],
  );
  const ancestorModules = useMemo(() => {
    const chain: typeof data.modules = [];
    let current = module;
    const seen = new Set<string>();
    while (current?.parentId && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = data.modules.find((item) => item.id === current?.parentId);
      if (!parent) break;
      chain.unshift(parent);
      current = parent;
    }
    return chain;
  }, [data.modules, module]);
  const modulePages = useMemo(
    () => data.pages.filter((page) => page.moduleId === moduleId),
    [data.pages, moduleId],
  );
  const pagesByParent = useMemo(() => {
    const map = new Map<string, PageMeta[]>();
    for (const page of modulePages) {
      const key = page.parentId || '__root__';
      const list = map.get(key) || [];
      list.push(page);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [modulePages]);

  if (!module) {
    return (
      <div className="page-missing public-missing">
        <div className="page-missing-icon"><FolderOpen size={26} /></div>
        <h1>模块不存在或未公开</h1>
        <p>它可能已被管理员隐藏，或者链接不完整。</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>回到公开首页</button>
      </div>
    );
  }

  const roots = pagesByParent.get('__root__') || [];
  const chars = modulePages.reduce((sum, page) => sum + page.chars, 0);
  const todoTotal = modulePages.reduce((sum, page) => sum + page.todoTotal, 0);
  const todoDone = modulePages.reduce((sum, page) => sum + page.todoDone, 0);
  const completion = todoTotal ? Math.round((todoDone / todoTotal) * 100) : 0;
  const lastUpdated = modulePages.reduce<string | null>((latest, page) => (
    !latest || page.updatedAt > latest ? page.updatedAt : latest
  ), null);

  function renderPage(page: PageMeta, depth = 0) {
    const children = pagesByParent.get(page.id) || [];
    return (
      <div key={page.id} className="module-page-branch">
        <div className="module-page-row public-page-row" style={{ paddingLeft: 18 + depth * 26 }}>
          <button type="button" className="module-page-main" onClick={() => navigate(`/page/${page.id}`)}>
            <span className="module-page-icon">{page.icon}</span>
            <span className="module-page-text">
              <strong>{page.title}</strong>
              <span>{formatNumber(page.chars)} 字{page.todoTotal ? ` · 待办 ${page.todoDone}/${page.todoTotal}` : ''} · {formatRelativeTime(page.updatedAt)}</span>
            </span>
            {children.length ? <em className="module-page-childcount">{children.length} 子页</em> : null}
            <ArrowUpRight size={15} className="module-page-arrow" />
          </button>
        </div>
        {children.map((child) => renderPage(child, depth + 1))}
      </div>
    );
  }

  return (
    <div className="module-view public-module-view">
      <div className="page-crumb">
        <button type="button" onClick={() => navigate('/')}>
          <FolderOpen size={13} /> 公开首页
        </button>
        {ancestorModules.map((item) => (
          <span key={item.id} className="page-crumb-parent">
            <ChevronRight size={13} />
            <button type="button" onClick={() => navigate(`/module/${item.id}`)}>{item.title}</button>
          </span>
        ))}
        <ChevronRight size={13} />
        <span className="page-crumb-current">{module.title}</span>
      </div>

      <header className="module-hero" style={{ '--module-accent': module.accent } as CSSProperties}>
        <div className="module-hero-glow" aria-hidden="true" />
        <div className="module-hero-main">
          <span className="module-hero-icon"><ModuleIconContent module={module} /></span>
          <div>
            <span className="eyebrow">MODULE / 公开学习模块</span>
            <h1>{module.title}</h1>
            <p>{modulePages.length} 张页面{childModules.length ? ` · ${childModules.length} 个子模块` : ''} · {formatNumber(chars)} 字 · {lastUpdated ? `更新于 ${formatRelativeTime(lastUpdated)}` : '还没有内容'}</p>
            {todoTotal ? (
              <div className="module-hero-progress">
                <div className="module-hero-progress-label">
                  <span>待办进度</span>
                  <strong>{todoDone} / {todoTotal} · {completion}%</strong>
                </div>
                <div className="meter-track"><span style={{ width: `${Math.max(3, completion)}%` }} /></div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="public-readonly-badge"><Eye size={13} /> 只读浏览</div>
      </header>

      {childModules.length ? (
        <section className="module-submodules-section">
          <div className="section-head">
            <div>
              <span className="eyebrow">SUBMODULES / 子模块</span>
              <h2>继续浏览</h2>
            </div>
            <span className="section-count">{childModules.length}</span>
          </div>
          <div className="module-submodule-grid">
            {childModules.map((child) => {
              const count = data.pages.filter((page) => page.moduleId === child.id).length;
              return (
                <button
                  key={child.id}
                  type="button"
                  className="module-submodule-card"
                  style={{ '--module-accent': child.accent } as CSSProperties}
                  onClick={() => navigate(`/module/${child.id}`)}
                >
                  <span className="module-submodule-icon"><ModuleIconContent module={child} /></span>
                  <span className="module-submodule-text">
                    <strong>{child.title}</strong>
                    <em>{count} 张公开页面</em>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="module-pages-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">PAGES / 公开页面</span>
            <h2>这个模块里的内容</h2>
          </div>
          <span className="section-count">{modulePages.length}</span>
        </div>

        {roots.length ? (
          <div className="module-page-list">
            {roots.map((page) => renderPage(page))}
          </div>
        ) : (
          <div className="module-pages-empty public-empty">
            <div className="module-empty-art"><FileText size={28} /></div>
            <h3>这个模块还没有公开页面</h3>
            <p>管理员添加页面后会显示在这里。</p>
          </div>
        )}
      </section>

      <div className="module-view-foot">
        <button type="button" className="link-button" onClick={() => navigate('/')}>
          <ArrowLeft size={14} /> 返回公开首页
        </button>
        <span>PUBLIC MODULE / {module.id.slice(0, 8).toUpperCase()}</span>
      </div>
    </div>
  );
}
