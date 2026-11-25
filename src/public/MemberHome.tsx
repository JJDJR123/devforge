import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, BookOpen, Search, Sparkles } from 'lucide-react';
import { api } from '../api';
import type { Module, PageMeta, PublicBootstrap } from '../types';
import { ModuleIconContent } from '../components/ModuleIcon';
import { extractPlainText, firstImageUrl, formatNumber, formatRelativeTime } from '../utils';
import '../styles/forge-dashboard.css';

type PageDetail = { excerpt: string; cover: string | null };

function moduleIcon(module: Module) {
  return (
    <span className="fd-module-icon">
      <ModuleIconContent module={module} />
    </span>
  );
}

/** Reader overview. Same information architecture as the admin Forge home, without write actions. */
export function MemberHome({ data, onOpenSearch }: { data: PublicBootstrap; onOpenSearch: () => void }) {
  const navigate = useNavigate();
  const [details, setDetails] = useState<Record<string, PageDetail>>({});

  const modules = useMemo(
    () => [...data.modules].sort((a, b) => a.sortOrder - b.sortOrder),
    [data.modules],
  );
  const topModules = useMemo(() => modules.filter((module) => !module.parentId), [modules]);
  const pagesByModule = useMemo(() => {
    const map = new Map<string, PageMeta[]>();
    for (const page of data.pages) {
      const list = map.get(page.moduleId) || [];
      list.push(page);
      map.set(page.moduleId, list);
    }
    return map;
  }, [data.pages]);
  const recent = data.recent.slice(0, 3);
  const featured = recent[0];
  const side = recent.slice(1);
  const modulesById = new Map(modules.map((module) => [module.id, module]));

  useEffect(() => {
    if (!recent.length) return;
    let cancelled = false;
    Promise.all(recent.map(async (page) => {
      try {
        const result = await api.publicPage(page.id);
        return [page.id, {
          excerpt: extractPlainText(result.page.blocks).slice(0, 150),
          cover: firstImageUrl(result.page.blocks),
        }] as const;
      } catch {
        return [page.id, { excerpt: '', cover: null }] as const;
      }
    })).then((entries) => {
      if (!cancelled) setDetails(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [recent.map((page) => page.id).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fd-dashboard">
      <header className="fd-head">
        <div>
          <span className="fd-eyebrow"><Sparkles size={12} /> MEMBER / 成员工作台</span>
          <h1>继续阅读。</h1>
          <p>公开页面 · 成员只读空间 · 内容由管理员维护</p>
        </div>
        <div className="fd-head-actions">
          <button type="button" className="btn btn-ghost" onClick={onOpenSearch}>
            <Search size={15} /> 搜索公开内容
          </button>
          <span className="public-topbar-badge"><Sparkles size={12} /> 成员 · 只读</span>
        </div>
      </header>

      <section className="fd-stats">
        <div><span>公开模块</span><strong>{data.stats.moduleCount}</strong><em>个</em></div>
        <div><span>公开页面</span><strong>{data.stats.pageCount}</strong><em>张</em></div>
        <div><span>累计内容</span><strong>{formatNumber(data.stats.chars)}</strong><em>字</em></div>
        <div><span>最近更新</span><strong>{formatRelativeTime(data.stats.updatedAt)}</strong></div>
      </section>

      <section className="fd-section fd-recent">
        <div className="fd-section-head">
          <div>
            <span className="fd-eyebrow">RECENT / 最近阅读</span>
            <h2>从上次停下的地方继续</h2>
          </div>
          <button type="button" className="fd-text-link" onClick={() => navigate('/kb')}>
            <BookOpen size={14} /> 成员知识库
          </button>
        </div>

        {featured ? (
          <div className="fd-feature-grid">
            <button type="button" className="fd-feature-card" onClick={() => navigate(`/page/${featured.id}`)}>
              <div
                className={`fd-feature-cover${details[featured.id]?.cover ? ' has-image' : ''}`}
                style={details[featured.id]?.cover ? { backgroundImage: `url(${details[featured.id].cover})` } : undefined}
              >
                <span className="fd-cover-badge">最近更新</span>
                <span className="fd-cover-icon">{featured.icon || '▤'}</span>
                <span className="fd-cover-title">{featured.title}</span>
              </div>
              <div className="fd-feature-body">
                <span className="fd-card-meta">{modulesById.get(featured.moduleId)?.title || '公开内容'} · {formatRelativeTime(featured.updatedAt)} · {formatNumber(featured.chars)} 字</span>
                <p>{details[featured.id]?.excerpt || '打开页面继续阅读。'}</p>
                <span className="fd-card-cta">阅读这篇 <ArrowUpRight size={15} /></span>
              </div>
            </button>

            <div className="fd-side-cards">
              {side.map((page) => {
                const module = modulesById.get(page.moduleId);
                return (
                  <button key={page.id} type="button" className="fd-side-card" onClick={() => navigate(`/page/${page.id}`)}>
                    <span className="fd-side-card-icon">{page.icon || '▤'}</span>
                    <span className="fd-side-card-main">
                      <span className="fd-card-meta">{module?.title || '公开内容'} · {formatRelativeTime(page.updatedAt)}</span>
                      <strong>{page.title}</strong>
                      <span>{details[page.id]?.excerpt || '打开页面继续。'}</span>
                    </span>
                    <ArrowUpRight size={15} className="fd-side-card-arrow" />
                  </button>
                );
              })}
              {side.length === 0 ? <div className="fd-empty-side">还没有更多最近更新的公开页面。</div> : null}
            </div>
          </div>
        ) : (
          <div className="fd-empty">还没有公开页面。</div>
        )}
      </section>

      <section className="fd-section">
        <div className="fd-section-head">
          <div>
            <span className="fd-eyebrow">MODULES / 公开模块</span>
            <h2>按方向浏览</h2>
          </div>
          <button type="button" className="fd-text-link" onClick={() => navigate('/kb')}>
            成员知识库 <ArrowUpRight size={14} />
          </button>
        </div>

        {topModules.length === 0 ? (
          <div className="fd-empty">还没有公开模块。</div>
        ) : (
          <div className="fd-module-grid">
            {topModules.map((module) => {
              const modulePages = pagesByModule.get(module.id) || [];
              const chars = modulePages.reduce((sum, page) => sum + page.chars, 0);
              const todoTotal = modulePages.reduce((sum, page) => sum + page.todoTotal, 0);
              const todoDone = modulePages.reduce((sum, page) => sum + page.todoDone, 0);
              const progress = todoTotal ? Math.round((todoDone / todoTotal) * 100) : Math.max(8, Math.round((chars / Math.max(1, data.stats.chars)) * 100));
              return (
                <article
                  key={module.id}
                  className="fd-module-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/module/${module.id}`)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/module/${module.id}`);
                    }
                  }}
                >
                  <div className="fd-module-cover">
                    {moduleIcon(module)}
                    <span className="fd-module-cover-title">{module.title}</span>
                  </div>
                  <div className="fd-module-body">
                    <div className="fd-module-title">
                      <strong>{module.title}</strong>
                      <span>公开</span>
                    </div>
                    <span className="fd-card-meta">{modulePages.length} 张页面 · {formatNumber(chars)} 字</span>
                    <div className="fd-progress"><span style={{ width: `${progress}%` }} /></div>
                    <span className="fd-card-foot">{todoTotal ? `任务 ${todoDone}/${todoTotal}` : '公开阅读'}<ArrowUpRight size={13} /></span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className="fd-footer">
        <span>{data.site.name} · MEMBER READ ONLY</span>
        <span>{data.icp?.number ? (
          <a href={data.icp.link || 'https://beian.miit.gov.cn/'} target="_blank" rel="noreferrer">
            {data.icp.number}
          </a>
        ) : '内容由管理员维护'}</span>
      </footer>
    </div>
  );
}
