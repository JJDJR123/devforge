import { useMemo, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Eye,
  FileText,
  Globe2,
  Search,
  Sparkles,
} from 'lucide-react';
import type { PublicBootstrap } from '../types';
import { ModuleIconContent } from '../components/ModuleIcon';
import { formatNumber, formatRelativeTime, todayLabel } from '../utils';

export function PublicHome({
  data,
  onOpenSearch,
}: {
  data: PublicBootstrap;
  onOpenSearch: () => void;
}) {
  const navigate = useNavigate();
  const modules = useMemo(
    () => [...data.modules].sort((a, b) => a.sortOrder - b.sortOrder),
    [data.modules],
  );
  const topModules = useMemo(
    () => modules.filter((module) => !module.parentId),
    [modules],
  );
  const latest = data.recent[0] || null;
  const latestModule = latest ? modules.find((module) => module.id === latest.moduleId) : null;
  const firstPage = data.pages[0] || null;
  const pagesByModule = useMemo(() => {
    const map = new Map<string, number>();
    const chars = new Map<string, number>();
    for (const page of data.pages) {
      map.set(page.moduleId, (map.get(page.moduleId) || 0) + 1);
      chars.set(page.moduleId, (chars.get(page.moduleId) || 0) + page.chars);
    }
    return { pages: map, chars };
  }, [data.pages]);
  const completion = data.stats.todoTotal
    ? Math.round((data.stats.todoDone / data.stats.todoTotal) * 100)
    : 0;

  return (
    <div className="dashboard public-dashboard">
      <section className="dash-hero public-hero">
        <div className="hero-grid-deco" aria-hidden="true" />
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <Globe2 size={13} /> PUBLIC READING ROOM · {todayLabel()}
          </div>
          <h1>
            {data.site.name}<span className="public-dot">.</span>
          </h1>
          <p>{data.site.tagline}。这里公开记录独立游戏开发的学习模块、原型笔记和踩坑过程。</p>
          <div className="hero-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (firstPage) navigate(`/page/${firstPage.id}`);
                else if (modules[0]) navigate(`/module/${modules[0].id}`);
              }}
              disabled={!firstPage && !modules[0]}
            >
              开始浏览 <ArrowRight size={16} />
            </button>
            <button type="button" className="btn btn-ghost" onClick={onOpenSearch}>
              <Search size={15} /> 搜索内容
            </button>
          </div>
          <div className="hero-footnote">
            <span><Eye size={11} /> 只读浏览</span>
            <span>{data.stats.pageCount} 篇公开内容</span>
            <span>作者：管理员</span>
          </div>
        </div>

        <div className="hero-panel public-latest-panel">
          <div className="hero-panel-head">
            <span>LATEST NOTE / 最新更新</span>
            <span className="hero-panel-index">01</span>
          </div>
          {latest ? (
            <button type="button" className="focus-card" onClick={() => navigate(`/page/${latest.id}`)}>
              <span className="focus-label">最近更新</span>
              <span className="focus-icon">{latest.icon}</span>
              <strong>{latest.title}</strong>
              <span className="focus-meta">
                {latestModule?.title || '学习模块'} · {formatRelativeTime(latest.updatedAt)}
              </span>
              <span className="focus-cta">阅读这篇 <ArrowUpRight size={15} /></span>
            </button>
          ) : (
            <div className="focus-card is-empty">
              <span className="focus-label">准备中</span>
              <span className="focus-icon">✦</span>
              <strong>公开内容正在准备</strong>
              <span className="focus-meta">管理员发布模块后会显示在这里。</span>
            </div>
          )}
          <div className="hero-meter">
            <div className="hero-meter-label">
              <span>公开学习进度</span>
              <strong>{data.stats.todoDone} <em>/ {data.stats.todoTotal} 待办</em></strong>
            </div>
            <div className="meter-track"><span style={{ width: `${Math.max(3, completion)}%` }} /></div>
            <div className="hero-meter-foot">
              <span>{data.stats.moduleCount} 个模块</span>
              <span>{completion}% 完成</span>
            </div>
          </div>
        </div>
      </section>

      <section className="stat-grid public-stat-grid">
        <PublicStat label="公开模块" value={data.stats.moduleCount} suffix="个" foot="学习方向" />
        <PublicStat label="公开页面" value={data.stats.pageCount} suffix="篇" foot="可自由浏览" />
        <PublicStat label="累计字数" value={formatNumber(data.stats.chars)} suffix="字" foot="公开笔记" />
        <PublicStat label="最近更新" value={formatRelativeTime(data.stats.updatedAt)} suffix="" foot="持续记录" small />
      </section>

      <div className="dash-columns">
        <section className="dash-section modules-section">
          <div className="section-head">
            <div>
              <span className="eyebrow">MODULES / 学习模块</span>
              <h2>正在学习的方向</h2>
            </div>
            <span className="section-count">{modules.length}</span>
          </div>

          {topModules.length ? (
            <div className="module-grid">
              {topModules.map((module) => {
                const count = pagesByModule.pages.get(module.id) || 0;
                const chars = pagesByModule.chars.get(module.id) || 0;
                return (
                  <button
                    key={module.id}
                    type="button"
                    className="module-card public-module-card"
                    style={{ '--module-accent': module.accent } as CSSProperties}
                    onClick={() => navigate(`/module/${module.id}`)}
                  >
                    <div className="module-card-head">
                      <span className="module-icon"><ModuleIconContent module={module} /></span>
                      <span className="public-mini-badge"><Eye size={11} /> 公开</span>
                    </div>
                    <h3>{module.title}</h3>
                    <div className="module-card-meta">
                      <span>{count} 张页面</span>
                      <span>{formatNumber(chars)} 字</span>
                    </div>
                    <div className="module-track"><span style={{ width: `${Math.min(100, Math.max(6, count * 18))}%` }} /></div>
                    <div className="module-card-foot">
                      <span>阅读模块</span>
                      <span className="module-open">打开 <ArrowRight size={14} /></span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="module-empty public-empty">
              <div className="module-empty-art"><Globe2 size={28} /></div>
              <h3>公开内容正在准备中</h3>
              <p>管理员还没有发布公开模块。稍后再来看看，或者先阅读已有的公开笔记。</p>
            </div>
          )}
        </section>

        <aside className="dash-side">
          <section className="dash-section recent-section">
            <div className="section-head compact">
              <div>
                <span className="eyebrow">RECENT / 最近</span>
                <h2>最近更新</h2>
              </div>
              <span className="section-count">{data.recent.length}</span>
            </div>
            {data.recent.length ? (
              <div className="recent-list">
                {data.recent.map((page) => {
                  const module = modules.find((item) => item.id === page.moduleId);
                  return (
                    <button key={page.id} type="button" className="recent-row" onClick={() => navigate(`/page/${page.id}`)}>
                      <span className="recent-icon">{page.icon || '📄'}</span>
                      <span className="recent-main">
                        <strong>{page.title}</strong>
                        <span>{module?.title || '学习模块'} · {formatRelativeTime(page.updatedAt)}</span>
                      </span>
                      <ArrowUpRight size={15} className="recent-arrow" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="recent-empty">
                <p>还没有公开笔记。</p>
                <span>管理员发布后会显示在这里。</span>
              </div>
            )}
          </section>

          <section className="tip-card public-readonly-card">
            <div className="tip-head">
              <span className="eyebrow"><Sparkles size={13} /> READ ONLY</span>
              <Eye size={15} className="public-readonly-icon" />
            </div>
            <p>这是一个公开只读的学习舱。你可以自由浏览、搜索和阅读，但只有管理员可以编辑内容。</p>
            <span className="tip-index">PUBLIC SITE / VIEWER MODE</span>
          </section>
        </aside>
      </div>

      <footer className="dash-footer">
        <span>{data.site.name} / PUBLIC READING ROOM</span>
        <span><FileText size={10} /> {formatNumber(data.stats.chars)} 字公开记录</span>
        <span>做小，做完，再做下一个。</span>
      </footer>
    </div>
  );
}

function PublicStat({
  label,
  value,
  suffix,
  foot,
  small = false,
}: {
  label: string;
  value: string | number;
  suffix: string;
  foot: string;
  small?: boolean;
}) {
  return (
    <div className={small ? 'stat-card is-small' : 'stat-card'}>
      <span className="stat-label">{label}</span>
      <div className="stat-value"><strong>{value}</strong>{suffix ? <em>{suffix}</em> : null}</div>
      <span className="stat-foot">{foot}</span>
      <span className="stat-corner" />
    </div>
  );
}
