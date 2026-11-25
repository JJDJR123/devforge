import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Clock3,
  FolderPlus,
  GripVertical,
  Images,
  Inbox,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Plus,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../state/AppContext';
import type { Module, PageMeta } from '../types';
import { extractPlainText, formatNumber, formatRelativeTime } from '../utils';
import { ModuleIconContent } from '../components/ModuleIcon';
import { useToast } from '../components/Toast';
import { getErrorMessage } from '../utils';
import '../styles/forge-preview.css';

type PageDetail = { excerpt: string; cover: string | null };

function firstImageUrl(blocks: unknown): string | null {
  if (!Array.isArray(blocks)) return null;
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const record = block as { type?: string; props?: Record<string, unknown>; children?: unknown };
    if (record.type === 'image' && typeof record.props?.url === 'string') return record.props.url;
    const child = firstImageUrl(record.children);
    if (child) return child;
  }
  return null;
}

function moduleIcon(module: Module) {
  return (
    <span className="fp-module-icon" style={{ background: 'rgba(255,255,255,0.045)', color: '#f16436' }}>
      <ModuleIconContent module={module} />
    </span>
  );
}

export function ForgePreview() {
  const { data, logout, refresh } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [modules, setModules] = useState<Module[]>([]);
  const [draggedId, setDraggedId] = useState('');
  const [overId, setOverId] = useState('');
  const [creating, setCreating] = useState(false);
  const [details, setDetails] = useState<Record<string, PageDetail>>({});

  useEffect(() => {
    if (!data) return;
    setModules([...data.modules].sort((a, b) => a.sortOrder - b.sortOrder));
  }, [data]);

  const pagesByModule = useMemo(() => {
    const map = new Map<string, PageMeta[]>();
    for (const page of data?.pages || []) {
      const list = map.get(page.moduleId) || [];
      list.push(page);
      map.set(page.moduleId, list);
    }
    return map;
  }, [data?.pages]);

  const recent = (data?.recent || []).slice(0, 3);
  const modulesById = new Map((data?.modules || []).map((module) => [module.id, module]));
  const featured = recent[0];
  const side = recent.slice(1);

  useEffect(() => {
    if (!recent.length) return;
    let cancelled = false;
    Promise.all(recent.map(async (page) => {
      try {
        const result = await api.getPage(page.id);
        return [page.id, {
          excerpt: extractPlainText(result.page.blocks).slice(0, 140),
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

  function moveModule(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setModules((current) => {
      const from = current.findIndex((module) => module.id === draggedId);
      const to = current.findIndex((module) => module.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDraggedId('');
    setOverId('');
  }

  async function createPage() {
    if (creating) return;
    if (!modules.length) {
      navigate('/');
      return;
    }
    setCreating(true);
    try {
      const result = await api.createPage({ moduleId: modules[0].id, title: '未命名页面', icon: '📄' });
      await refresh();
      navigate(`/page/${result.page.id}`);
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    } finally {
      setCreating(false);
    }
  }

  if (!data) return null;

  return (
    <div className="fp-root">
      <aside className="fp-sidebar">
        <div className="fp-brand">
          <span className="fp-brand-mark">DF</span>
          <div>
            <strong>DEVFORGE</strong>
            <span>独立游戏开发学习舱</span>
          </div>
        </div>

        <div className="fp-side-section">
          <span className="fp-side-label">工作台</span>
          <button type="button" className="fp-side-item is-active" onClick={() => navigate('/')}>
            <LayoutDashboard size={16} /> 总览 <ChevronRight size={13} className="fp-side-chevron" />
          </button>
          <button type="button" className="fp-side-item" onClick={() => navigate('/kb')}>
            <BookOpen size={16} /> 知识库
          </button>
          <button type="button" className="fp-side-item" onClick={() => navigate('/assets')}>
            <Images size={16} /> 素材库
          </button>
          <button type="button" className="fp-side-item" onClick={() => navigate('/chat')}>
            <MessageCircle size={16} /> 聊天室
          </button>
          <button type="button" className="fp-side-item" onClick={() => navigate('/mailbox')}>
            <Inbox size={16} /> 信箱
          </button>
          <button type="button" className="fp-side-item" onClick={() => navigate('/friends')}>
            <UserRound size={16} /> 好友
          </button>
          <button type="button" className="fp-side-item" onClick={() => navigate('/accounts')}>
            <Users size={16} /> 账号管理
          </button>
        </div>

        <div className="fp-side-section fp-module-section">
          <div className="fp-side-label-row">
            <span className="fp-side-label">我的模块</span>
            <span className="fp-drag-hint">拖动排序</span>
          </div>
          <div className="fp-module-list">
            {modules.map((module) => {
              const count = (pagesByModule.get(module.id) || []).length;
              return (
                <div
                  key={module.id}
                  className={`fp-side-module${draggedId === module.id ? ' is-dragging' : ''}${overId === module.id ? ' is-over' : ''}`}
                  onDragOver={(event) => { event.preventDefault(); setOverId(module.id); }}
                  onDrop={(event) => { event.preventDefault(); moveModule(module.id); }}
                >
                  <button
                    type="button"
                    className="fp-drag-handle"
                    draggable
                    onDragStart={() => setDraggedId(module.id)}
                    onDragEnd={() => { setDraggedId(''); setOverId(''); }}
                    aria-label={`拖动 ${module.title}`}
                    title="拖动排序（仅预览）"
                  >
                    <GripVertical size={14} />
                  </button>
                  <button type="button" className="fp-side-module-main" onClick={() => navigate(`/module/${module.id}`)}>
                    {moduleIcon(module)}
                    <span>{module.title}</span>
                    <em>{count}</em>
                  </button>
                </div>
              );
            })}
            <button type="button" className="fp-add-module" onClick={() => navigate('/')}>
              <Plus size={14} /> 新建模块
            </button>
          </div>
        </div>

        <div className="fp-side-footer">
          <span className="fp-avatar">{(data.user?.username || 'D').slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{data.user?.username || '管理员'}</strong>
            <span>管理员 · 预览模式</span>
          </div>
          <button type="button" className="fp-icon-btn" title="退出" onClick={() => { void logout(); }}>
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      <main className="fp-main">
        <header className="fp-topbar">
          <div>
            <span className="fp-breadcrumb">工作台 <ChevronRight size={12} /> 总览</span>
            <h1>继续建造。</h1>
          </div>
          <div className="fp-top-actions">
            <span className="fp-preview-badge"><Sparkles size={12} /> 新版预览</span>
            <button type="button" className="btn btn-primary fp-new-btn" onClick={() => { void createPage(); }} disabled={creating}>
              <Plus size={16} /> {creating ? '创建中…' : '新建页面'}
            </button>
            <button type="button" className="btn btn-ghost fp-back-btn" onClick={() => navigate('/')}>
              <ArrowLeft size={15} /> 返回旧版
            </button>
          </div>
        </header>

        <section className="fp-stats">
          <div><span>模块</span><strong>{data.stats.moduleCount}</strong><em>个</em></div>
          <div><span>页面</span><strong>{data.stats.pageCount}</strong><em>张</em></div>
          <div><span>累计内容</span><strong>{formatNumber(data.stats.chars)}</strong><em>字</em></div>
          <div><span>最近更新</span><strong>{formatRelativeTime(data.stats.updatedAt)}</strong></div>
        </section>

        <section className="fp-recent">
          <div className="fp-section-head">
            <div>
              <span className="fp-eyebrow">RECENT / 最近继续</span>
              <h2>从上次停下的地方继续</h2>
            </div>
            <button type="button" className="fp-text-link" onClick={() => navigate('/kb')}>查看全部 <ArrowUpRight size={14} /></button>
          </div>

          {featured ? (
            <div className="fp-feature-grid">
              <button type="button" className="fp-feature-card" onClick={() => navigate(`/page/${featured.id}`)}>
                <div
                  className={`fp-feature-cover${details[featured.id]?.cover ? ' has-image' : ''}`}
                  style={details[featured.id]?.cover ? { backgroundImage: `url(${details[featured.id].cover})` } : undefined}
                >
                  <span className="fp-cover-badge">继续编辑</span>
                  <span className="fp-cover-icon">{featured.icon || '▤'}</span>
                  <span className="fp-cover-title">{featured.title}</span>
                </div>
                <div className="fp-feature-body">
                  <span className="fp-card-meta">{modulesById.get(featured.moduleId)?.title || '未分组'} · {formatRelativeTime(featured.updatedAt)} · {formatNumber(featured.chars)} 字</span>
                  <p>{details[featured.id]?.excerpt || '打开页面继续上次的内容。'}</p>
                  <span className="fp-card-cta">继续编辑 <ArrowUpRight size={15} /></span>
                </div>
              </button>

              <div className="fp-side-cards">
                {side.map((page) => {
                  const module = modulesById.get(page.moduleId);
                  return (
                    <button key={page.id} type="button" className="fp-side-card" onClick={() => navigate(`/page/${page.id}`)}>
                      <span className="fp-side-card-icon" style={{ background: 'rgba(241,100,54,0.1)', color: '#f16436' }}>
                        {page.icon || '▤'}
                      </span>
                      <span className="fp-side-card-main">
                        <span className="fp-card-meta">{module?.title || '未分组'} · {formatRelativeTime(page.updatedAt)}</span>
                        <strong>{page.title}</strong>
                        <span>{details[page.id]?.excerpt || '打开页面继续。'}</span>
                      </span>
                      <ArrowUpRight size={15} className="fp-side-card-arrow" />
                    </button>
                  );
                })}
                {side.length === 0 ? <div className="fp-empty-side">还没有更多最近编辑的页面。</div> : null}
              </div>
            </div>
          ) : (
            <div className="fp-empty">还没有页面。先创建你的第一个模块。</div>
          )}
        </section>

        <section className="fp-modules">
          <div className="fp-section-head">
            <div>
              <span className="fp-eyebrow">MODULES / 我的内容</span>
              <h2>按项目继续</h2>
            </div>
            <button type="button" className="fp-text-link" onClick={() => navigate('/')}><Plus size={14} /> 新建模块</button>
          </div>
          <div className="fp-module-grid">
            {modules.map((module) => {
              const modulePages = pagesByModule.get(module.id) || [];
              const chars = modulePages.reduce((sum, page) => sum + page.chars, 0);
              const done = modulePages.reduce((sum, page) => sum + page.todoDone, 0);
              const total = modulePages.reduce((sum, page) => sum + page.todoTotal, 0);
              const progress = total ? Math.round((done / total) * 100) : null;
              return (
                <button key={module.id} type="button" className="fp-module-card" onClick={() => navigate(`/module/${module.id}`)}>
                  <div className="fp-module-cover">
                    {moduleIcon(module)}
                    <span className="fp-module-cover-title">{module.title}</span>
                  </div>
                  <div className="fp-module-card-body">
                    <div className="fp-module-card-title">
                      <strong>{module.title}</strong>
                      <span className="fp-module-status">{module.isPublic ? '公开' : '私密'}</span>
                    </div>
                    <span className="fp-card-meta">{modulePages.length} 张页面 · {formatNumber(chars)} 字</span>
                    <div className="fp-progress"><span style={{ width: `${progress ?? Math.max(8, Math.min(100, Math.round((chars / Math.max(1, data.stats.chars)) * 100)))}%`, background: '#f16436' }} /></div>
                    <span className="fp-card-foot">{progress !== null ? `任务 ${done}/${total}` : '还没有任务'}<ArrowUpRight size={13} /></span>
                  </div>
                </button>
              );
            })}
            <button type="button" className="fp-module-card fp-module-new" onClick={() => navigate('/')}>
              <FolderPlus size={20} />
              <strong>新建模块</strong>
              <span>把下一个方向放进工作台</span>
            </button>
          </div>
        </section>

        <footer className="fp-footer">
          <span>DEVFORGE · FORGE PREVIEW</span>
          <span><Clock3 size={12} /> 这是独立预览版，不影响现有界面</span>
        </footer>
      </main>
    </div>
  );
}
