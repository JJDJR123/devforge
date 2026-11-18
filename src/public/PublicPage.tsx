import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Eye, FileText } from 'lucide-react';
import { api } from '../api';
import type { Breadcrumb, Page, PublicBootstrap } from '../types';
import { formatNumber, formatRelativeTime, getErrorMessage } from '../utils';
import { PublicBlockEditor } from './PublicBlockEditor';

export function PublicPage({ data }: { data: PublicBootstrap }) {
  const { pageId = '' } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState<Page | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<Breadcrumb | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.publicPage(pageId)
      .then((result) => {
        if (cancelled) return;
        setPage(result.page);
        setBreadcrumb(result.breadcrumb);
        setLoading(false);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(getErrorMessage(fetchError));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [pageId]);

  useEffect(() => {
    if (!page) return;
    const previous = document.title;
    document.title = `${page.title} · ${data.site.name}`;
    return () => { document.title = previous; };
  }, [page, data.site.name]);

  if (loading) {
    return (
      <div className="page-loading public-page-loading">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-meta" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="page-missing public-missing">
        <div className="page-missing-icon"><FileText size={26} /></div>
        <h1>页面不存在或未公开</h1>
        <p>它可能已被管理员隐藏，或者链接不完整。</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>回到公开首页</button>
      </div>
    );
  }

  const breadcrumbModules = breadcrumb?.moduleChain?.length
    ? breadcrumb.moduleChain
    : breadcrumb?.module
      ? [breadcrumb.module]
      : [];

  return (
    <article className="page-view public-page-view">
      <div className="page-crumb">
        {breadcrumbModules.map((item) => (
          <span key={item.id} className="page-crumb-parent">
            <button type="button" onClick={() => navigate(`/module/${item.id}`)}>
              <span>{item.icon}</span>
              {item.title}
            </button>
            <ChevronRight size={13} />
          </span>
        ))}
        {breadcrumb?.pages.slice(0, -1).map((item) => (
          <span key={item.id} className="page-crumb-parent">
            <button type="button" onClick={() => navigate(`/page/${item.id}`)}>{item.title}</button>
            <ChevronRight size={13} />
          </span>
        ))}
        <span className="page-crumb-current">{page.title}</span>
      </div>

      <header className="page-head public-page-head">
        <div className="page-icon-wrap">
          <span className="page-icon-static">{page.icon}</span>
        </div>
        <div className="page-title-wrap">
          <h1 className="public-page-title">{page.title}</h1>
          <div className="page-submeta">
            <span>{breadcrumb?.module?.title || '公开模块'}</span>
            <i />
            <span>{formatNumber(page.chars || 0)} 字</span>
            {page.todoTotal ? (
              <>
                <i />
                <span>待办 {page.todoDone}/{page.todoTotal}</span>
              </>
            ) : null}
            <i />
            <span>更新于 {formatRelativeTime(page.updatedAt)}</span>
          </div>
        </div>
        <div className="public-readonly-badge"><Eye size={13} /> 只读</div>
      </header>

      <div className="public-page-body">
        {page.blocks.length ? (
          <PublicBlockEditor blocks={page.blocks} theme={data.theme} />
        ) : (
          <div className="public-empty-page">
            <FileText size={24} />
            <p>这张页面还没有内容。</p>
          </div>
        )}
      </div>

      <div className="page-end">
        <span className="page-end-line" />
        <span className="page-end-mark">PUBLIC</span>
        <span className="page-end-line" />
      </div>
      <div className="page-foot public-page-foot">
        <span>最后更新 {formatRelativeTime(page.updatedAt)}</span>
        <span><Eye size={12} /> 公开只读页面</span>
      </div>
    </article>
  );
}
