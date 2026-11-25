import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  FilePlus2,
  FolderPlus,
  Globe2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../state/AppContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { DropdownMenu } from '../components/DropdownMenu';
import { ModuleDialog } from '../components/ModuleDialog';
import { ModuleIconContent } from '../components/ModuleIcon';
import type { Module } from '../types';
import { extractPlainText, firstImageUrl, formatNumber, formatRelativeTime, moduleTreeStats, todayLabel } from '../utils';
import '../styles/forge-dashboard.css';

type PageDetail = { excerpt: string; cover: string | null };

function moduleIcon(module: Module) {
  return (
    <span className="fd-module-icon">
      <ModuleIconContent module={module} />
    </span>
  );
}

export function Dashboard() {
  const { data, refresh, removeModuleLocal } = useApp();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const [moduleDialog, setModuleDialog] = useState<{
    open: boolean;
    module: Module | null;
    parentId?: string | null;
    parentTitle?: string;
  }>({ open: false, module: null });
  const [details, setDetails] = useState<Record<string, PageDetail>>({});

  const pages = data?.pages || [];
  const recent = (data?.recent || []).slice(0, 3);
  const modules = useMemo(
    () => [...(data?.modules || [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [data?.modules],
  );
  const topModules = useMemo(() => modules.filter((module) => !module.parentId), [modules]);
  const modulesById = new Map(modules.map((module) => [module.id, module]));
  const featured = recent[0];
  const side = recent.slice(1);

  useEffect(() => {
    if (!recent.length) return;
    let cancelled = false;
    Promise.all(recent.map(async (page) => {
      try {
        const result = await api.getPage(page.id);
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

  if (!data) return null;

  async function addPage(moduleId: string) {
    try {
      const result = await api.createPage({ moduleId, title: '未命名页面', icon: '📄' });
      await refresh();
      navigate(`/page/${result.page.id}`);
      toast('新页面已创建。', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '创建失败', 'error');
    }
  }

  async function deleteModule(module: Module) {
    const tree = moduleTreeStats(modules, pages, module.id);
    const count = tree.pageCount;
    const ok = await confirm({
      title: `删除「${module.title}」？`,
      message: count > 0 || tree.moduleCount > 0
        ? `这个模块下的 ${count} 个页面${tree.moduleCount ? `、${tree.moduleCount} 个小模块` : ''}也会一起删除，且不能撤销。建议先在设置里导出备份。`
        : '这个模块会被永久删除，且不能撤销。',
      confirmText: '删除模块',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteModule(module.id);
      removeModuleLocal(module.id);
      await refresh();
      toast('模块已删除。', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '删除失败', 'error');
    }
  }

  async function togglePublic(module: Module) {
    try {
      await api.updateModule(module.id, { isPublic: !module.isPublic });
      await refresh();
      toast(module.isPublic ? '模块已设为私密。' : '模块已公开到网站。', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '操作失败', 'error');
    }
  }

  const newPageMenu = modules.length ? (
    <DropdownMenu
      trigger={(
        <button type="button" className="btn btn-primary fd-primary-btn">
          <Plus size={16} /> 新建页面
        </button>
      )}
      items={modules.map((module) => ({
        label: `${module.icon}  ${module.title}`,
        onSelect: () => { void addPage(module.id); },
      }))}
    />
  ) : (
    <button type="button" className="btn btn-primary fd-primary-btn" onClick={() => setModuleDialog({ open: true, module: null })}>
      <Plus size={16} /> 新建模块
    </button>
  );

  return (
    <div className="fd-dashboard">
      <header className="fd-head">
        <div>
          <span className="fd-eyebrow"><Sparkles size={12} /> WORKBENCH / 工作台 · {todayLabel()}</span>
          <h1>继续建造。</h1>
          <p>把想做的游戏，拆成今天能完成的一步。</p>
        </div>
        <div className="fd-head-actions">
          {newPageMenu}
          <button type="button" className="btn btn-ghost" onClick={() => setModuleDialog({ open: true, module: null })}>
            <FolderPlus size={16} /> 新建模块
          </button>
        </div>
      </header>

      <section className="fd-stats">
        <div><span>模块</span><strong>{data.stats.moduleCount}</strong><em>个</em></div>
        <div><span>页面</span><strong>{data.stats.pageCount}</strong><em>张</em></div>
        <div><span>累计内容</span><strong>{formatNumber(data.stats.chars)}</strong><em>字</em></div>
        <div><span>最近更新</span><strong>{formatRelativeTime(data.stats.updatedAt)}</strong></div>
      </section>

      <section className="fd-section fd-recent">
        <div className="fd-section-head">
          <div>
            <span className="fd-eyebrow">RECENT / 最近继续</span>
            <h2>从上次停下的地方继续</h2>
          </div>
          <button type="button" className="fd-text-link" onClick={() => navigate('/kb')}>查看全部 <ArrowUpRight size={14} /></button>
        </div>

        {featured ? (
          <div className="fd-feature-grid">
            <button type="button" className="fd-feature-card" onClick={() => navigate(`/page/${featured.id}`)}>
              <div
                className={`fd-feature-cover${details[featured.id]?.cover ? ' has-image' : ''}`}
                style={details[featured.id]?.cover ? { backgroundImage: `url(${details[featured.id].cover})` } : undefined}
              >
                <span className="fd-cover-badge">继续编辑</span>
                <span className="fd-cover-icon">{featured.icon || '▤'}</span>
                <span className="fd-cover-title">{featured.title}</span>
              </div>
              <div className="fd-feature-body">
                <span className="fd-card-meta">{modulesById.get(featured.moduleId)?.title || '未分组'} · {formatRelativeTime(featured.updatedAt)} · {formatNumber(featured.chars)} 字</span>
                <p>{details[featured.id]?.excerpt || '打开页面继续上次的内容。'}</p>
                <span className="fd-card-cta">继续编辑 <ArrowUpRight size={15} /></span>
              </div>
            </button>

            <div className="fd-side-cards">
              {side.map((page) => {
                const module = modulesById.get(page.moduleId);
                return (
                  <button key={page.id} type="button" className="fd-side-card" onClick={() => navigate(`/page/${page.id}`)}>
                    <span className="fd-side-card-icon">{page.icon || '▤'}</span>
                    <span className="fd-side-card-main">
                      <span className="fd-card-meta">{module?.title || '未分组'} · {formatRelativeTime(page.updatedAt)}</span>
                      <strong>{page.title}</strong>
                      <span>{details[page.id]?.excerpt || '打开页面继续。'}</span>
                    </span>
                    <ArrowUpRight size={15} className="fd-side-card-arrow" />
                  </button>
                );
              })}
              {side.length === 0 ? <div className="fd-empty-side">还没有更多最近编辑的页面。</div> : null}
            </div>
          </div>
        ) : (
          <div className="fd-empty">还没有页面。先创建你的第一个模块。</div>
        )}
      </section>

      <section className="fd-section">
        <div className="fd-section-head">
          <div>
            <span className="fd-eyebrow">MODULES / 我的内容</span>
            <h2>按项目继续</h2>
          </div>
          <button type="button" className="fd-text-link" onClick={() => setModuleDialog({ open: true, module: null })}><Plus size={14} /> 新建模块</button>
        </div>

        {topModules.length === 0 ? (
          <div className="fd-empty">
            <FolderPlus size={26} />
            <h3>还没有模块</h3>
            <p>先建一个「Godot 入门」，或者任何你正在研究的方向。</p>
            <button type="button" className="btn btn-primary" onClick={() => setModuleDialog({ open: true, module: null })}>
              <Plus size={16} /> 创建第一个模块
            </button>
          </div>
        ) : (
          <div className="fd-module-grid">
            {topModules.map((module) => {
              const tree = moduleTreeStats(modules, pages, module.id);
              const progress = tree.todoTotal
                ? Math.round((tree.todoDone / tree.todoTotal) * 100)
                : Math.max(8, Math.round((tree.chars / Math.max(1, data.stats.chars)) * 100));
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
                    <div className="fd-module-menu" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu
                        trigger={(
                          <button type="button" className="icon-btn" aria-label="模块菜单"><MoreHorizontal size={15} /></button>
                        )}
                        items={[
                          { label: '打开模块', icon: ArrowRight, onSelect: () => navigate(`/module/${module.id}`) },
                          { label: '新建子模块', icon: FolderPlus, onSelect: () => setModuleDialog({ open: true, module: null, parentId: module.id, parentTitle: module.title }) },
                          { label: '新建页面', icon: FilePlus2, onSelect: () => { void addPage(module.id); } },
                          { label: '编辑模块', icon: Pencil, onSelect: () => setModuleDialog({ open: true, module }) },
                          { label: module.isPublic ? '设为私密' : '公开到网站', icon: module.isPublic ? Lock : Globe2, onSelect: () => { void togglePublic(module); } },
                          { label: '', separator: true, onSelect: () => undefined },
                          { label: '删除模块', icon: Trash2, danger: true, onSelect: () => { void deleteModule(module); } },
                        ]}
                      />
                    </div>
                  </div>
                  <div className="fd-module-body">
                    <div className="fd-module-title">
                      <strong>{module.title}</strong>
                      <span>{module.isPublic ? '公开' : '私密'}</span>
                    </div>
                    <span className="fd-card-meta">
                      {tree.moduleCount ? `${tree.moduleCount} 个小模块 · ` : ''}
                      {tree.pageCount} 张页面 · {formatNumber(tree.chars)} 字
                    </span>
                    <div className="fd-progress"><span style={{ width: `${progress}%` }} /></div>
                    <span className="fd-card-foot">
                      {tree.todoTotal ? `任务 ${tree.todoDone}/${tree.todoTotal}` : '还没有任务'}
                      <ArrowUpRight size={13} />
                    </span>
                  </div>
                </article>
              );
            })}
            <button type="button" className="fd-module-card fd-module-new" onClick={() => setModuleDialog({ open: true, module: null })}>
              <FolderPlus size={20} />
              <strong>新建模块</strong>
              <span>把下一个方向放进工作台</span>
            </button>
          </div>
        )}
      </section>

      <footer className="fd-footer">
        <span>DEVFORGE / BUILD {data.system.version}</span>
        <span>{data.system.icp?.number ? (
          <a href={data.system.icp.link || 'https://beian.miit.gov.cn/'} target="_blank" rel="noreferrer">
            {data.system.icp.number}
          </a>
        ) : '做小，做完，再做下一个。'}</span>
      </footer>

      <ModuleDialog
        open={moduleDialog.open}
        module={moduleDialog.module}
        parentId={moduleDialog.parentId ?? null}
        parentTitle={moduleDialog.parentTitle}
        onClose={() => setModuleDialog({ open: false, module: null })}
      />
    </div>
  );
}
