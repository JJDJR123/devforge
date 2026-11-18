import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  FilePlus2,
  FolderPlus,
  Globe2,
  Lightbulb,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../state/AppContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { DropdownMenu } from '../components/DropdownMenu';
import { ModuleDialog } from '../components/ModuleDialog';
import type { Module } from '../types';
import {
  cn,
  formatNumber,
  formatRelativeTime,
  getGreeting,
  todayLabel,
} from '../utils';

const TIPS = [
  '先做一个 30 秒就能玩完的原型，再考虑美术。',
  '如果一条玩法解释超过三句话，它可能还不够小。',
  '把「不会做」拆成三个「今天能查明白」的问题。',
  '先做完一个垂直切片：一个场景、一个角色、一个循环。',
  '每天结束时留一句明天从哪里继续，比写长总结更有用。',
  '素材先找免费的占位图，玩法验证之前不要沉迷画图。',
  '让一个陌生人玩 5 分钟，比你改 5 天更有信息量。',
];

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
  }>({
    open: false,
    module: null,
  });
  const [tipIndex, setTipIndex] = useState(0);
  const pages = data?.pages || [];
  const pagesByModule = useMemo(() => {
    const map = new Map<string, typeof pages>();
    for (const page of pages) {
      const list = map.get(page.moduleId) || [];
      list.push(page);
      map.set(page.moduleId, list);
    }
    return map;
  }, [pages]);

  if (!data) return null;

  const modules = [...data.modules].sort((a, b) => a.sortOrder - b.sortOrder);
  const topModules = modules.filter((module) => !module.parentId);
  const recent = data.recent;
  const modulesById = new Map(modules.map((module) => [module.id, module]));

  const maxChars = Math.max(1, ...modules.map((module) => (
    (pagesByModule.get(module.id) || []).reduce((sum, page) => sum + page.chars, 0)
  )));

  const continuePage = recent[0] || pages[0] || null;
  const continueModule = continuePage ? modulesById.get(continuePage.moduleId) : null;
  const monthProgress = Math.min(100, Math.round((data.stats.chars / 12000) * 100));

  async function addPage(moduleId: string) {
    try {
      const result = await api.createPage({
        moduleId,
        title: '未命名页面',
        icon: '📄',
      });
      await refresh();
      navigate(`/page/${result.page.id}`);
      toast('新页面已创建。', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '创建失败', 'error');
    }
  }

  async function deleteModule(module: Module) {
    const count = (pagesByModule.get(module.id) || []).length;
    const ok = await confirm({
      title: `删除「${module.title}」？`,
      message: count > 0
        ? `模块里的 ${count} 个页面也会一起删除，且不能撤销。建议先在设置里导出备份。`
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
        <button type="button" className="btn btn-primary">
          <Plus size={17} /> 新建页面
        </button>
      )}
      items={modules.map((module) => ({
        label: `${module.icon}  ${module.title}`,
        onSelect: () => { void addPage(module.id); },
      }))}
    />
  ) : (
    <button type="button" className="btn btn-primary" onClick={() => setModuleDialog({ open: true, module: null })}>
      <Plus size={17} /> 新建模块
    </button>
  );

  return (
    <div className="dashboard">
      <section className="dash-hero">
        <div className="hero-grid-deco" aria-hidden="true" />
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <Sparkles size={13} /> {todayLabel()}
          </div>
          <h1>
            {getGreeting()}，<span>开发者</span><i>.</i>
          </h1>
          <p>把想做的游戏，拆成今天能完成的一步。</p>
          <div className="hero-actions">
            {newPageMenu}
            <button type="button" className="btn btn-ghost" onClick={() => setModuleDialog({ open: true, module: null })}>
              <FolderPlus size={16} /> 新建模块
            </button>
          </div>
          <div className="hero-footnote">
            <span><i className="status-dot" /> 自动保存已开启</span>
            <span>SQLITE · {data.system.databaseBytes ? `${(data.system.databaseBytes / 1024).toFixed(0)} KB` : 'READY'}</span>
          </div>
        </div>

        <div className="hero-panel">
          <div className="hero-panel-head">
            <span>CONTINUE WHERE YOU LEFT</span>
            <span className="hero-panel-index">01</span>
          </div>
          {continuePage ? (
            <button type="button" className="focus-card" onClick={() => navigate(`/page/${continuePage.id}`)}>
              <span className="focus-label">继续上次</span>
              <span className="focus-icon">{continuePage.icon}</span>
              <strong>{continuePage.title}</strong>
              <span className="focus-meta">
                {continueModule?.title || '模块'} · {formatRelativeTime(continuePage.updatedAt)}
              </span>
              <span className="focus-cta">继续编辑 <ArrowUpRight size={15} /></span>
            </button>
          ) : (
            <div className="focus-card is-empty">
              <span className="focus-label">空白画布</span>
              <span className="focus-icon">✨</span>
              <strong>从第一张页面开始</strong>
              <span className="focus-meta">新建一个模块，然后把想法写进去。</span>
            </div>
          )}
          <div className="hero-meter">
            <div className="hero-meter-label">
              <span>累计内容</span>
              <strong>{formatNumber(data.stats.chars)} <em>字</em></strong>
            </div>
            <div className="meter-track"><span style={{ width: `${Math.max(4, monthProgress)}%` }} /></div>
            <div className="hero-meter-foot">
              <span>{data.stats.pageCount} 张页面</span>
              <span>{monthProgress}% / 12k</span>
            </div>
          </div>
        </div>
      </section>

      <section className="stat-grid">
        <StatCard label="学习模块" value={data.stats.moduleCount} suffix="个" foot="文件夹" />
        <StatCard label="页面总数" value={data.stats.pageCount} suffix="张" foot="自由搭建" />
        <StatCard label="累计字数" value={formatNumber(data.stats.chars)} suffix="字" foot="不含空格" />
        <StatCard label="最近更新" value={formatRelativeTime(data.stats.updatedAt)} suffix="" foot="自动保存" small />
      </section>

      <div className="dash-columns">
        <section className="dash-section modules-section">
          <div className="section-head">
            <div>
              <span className="eyebrow">MODULES / 学习模块</span>
              <h2>你的开发地图</h2>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModuleDialog({ open: true, module: null })}>
              <Plus size={15} /> 新建
            </button>
          </div>

          {modules.length === 0 ? (
            <div className="module-empty">
              <div className="module-empty-art"><FolderPlus size={30} /></div>
              <h3>还没有模块</h3>
              <p>模块是学习的文件夹。先建一个「Godot 入门」，或者任何你正在研究的方向。</p>
              <button type="button" className="btn btn-primary" onClick={() => setModuleDialog({ open: true, module: null })}>
                <Plus size={16} /> 创建第一个模块
              </button>
            </div>
          ) : (
            <div className="module-grid">
              {topModules.map((module) => {
                const modulePages = pagesByModule.get(module.id) || [];
                const chars = modulePages.reduce((sum, page) => sum + page.chars, 0);
                const todoTotal = modulePages.reduce((sum, page) => sum + page.todoTotal, 0);
                const todoDone = modulePages.reduce((sum, page) => sum + page.todoDone, 0);
                const completion = todoTotal ? Math.round((todoDone / todoTotal) * 100) : null;
                const pct = completion ?? Math.max(4, Math.round((chars / maxChars) * 100));
                const last = modulePages.reduce<string | null>((latest, page) => (
                  !latest || page.updatedAt > latest ? page.updatedAt : latest
                ), null);
                return (
                  <article
                    key={module.id}
                    className="module-card"
                    style={{ '--module-accent': module.accent } as CSSProperties}
                    onClick={() => navigate(`/module/${module.id}`)}
                  >
                    <div className="module-card-head">
                      <span className="module-icon">{module.icon}</span>
                      <DropdownMenu
                        trigger={(
                          <button type="button" className="icon-btn module-menu-btn" aria-label="模块菜单">
                            <MoreHorizontal size={16} />
                          </button>
                        )}
                        items={[
                          { label: '打开模块', icon: ArrowRight, onSelect: () => navigate(`/module/${module.id}`) },
                          { label: '新建子模块', icon: FolderPlus, onSelect: () => setModuleDialog({ open: true, module: null, parentId: module.id, parentTitle: module.title }) },
                          { label: '新建页面', icon: FilePlus2, onSelect: () => { void addPage(module.id); } },
                          { label: '编辑模块', icon: Pencil, onSelect: () => setModuleDialog({ open: true, module }) },
                          {
                            label: module.isPublic ? '设为私密' : '公开到网站',
                            icon: module.isPublic ? Lock : Globe2,
                            onSelect: () => { void togglePublic(module); },
                          },
                          { label: '', separator: true, onSelect: () => undefined },
                          { label: '删除模块', icon: Trash2, danger: true, onSelect: () => { void deleteModule(module); } },
                        ]}
                      />
                    </div>
                    <h3>{module.title}</h3>
                    <div className="module-card-meta">
                      <span className={cn('module-visibility', module.isPublic ? 'is-public' : 'is-private')}>
                        {module.isPublic ? '公开' : '私密'}
                      </span>
                      <span>{modulePages.length} 张页面</span>
                      <span>{formatNumber(chars)} 字</span>
                      {todoTotal ? <span className="module-todo-meta">✓ {todoDone}/{todoTotal}</span> : null}
                    </div>
                    <div className={cn('module-track', completion === 100 && 'is-complete')}><span style={{ width: `${pct}%` }} /></div>
                    <div className="module-card-foot">
                      <span>{last ? `更新于 ${formatRelativeTime(last)}` : '还没有页面'}</span>
                      <span className="module-open">打开 <ArrowRight size={14} /></span>
                    </div>
                  </article>
                );
              })}
              <button
                type="button"
                className="module-card module-card-new"
                onClick={() => setModuleDialog({ open: true, module: null })}
              >
                <span className="module-new-plus"><Plus size={20} /></span>
                <strong>新建模块</strong>
                <span>为下一个学习方向留个位置</span>
              </button>
            </div>
          )}
        </section>

        <aside className="dash-side">
          <section className="dash-section recent-section">
            <div className="section-head compact">
              <div>
                <span className="eyebrow">RECENT / 最近</span>
                <h2>刚刚动过</h2>
              </div>
              <span className="section-count">{recent.length}</span>
            </div>
            {recent.length === 0 ? (
              <div className="recent-empty">
                <p>还没有编辑记录。</p>
                <span>打开一张页面，写下一句话。</span>
              </div>
            ) : (
              <div className="recent-list">
                {recent.map((page) => {
                  const module = modulesById.get(page.moduleId);
                  return (
                    <button
                      key={page.id}
                      type="button"
                      className="recent-row"
                      onClick={() => navigate(`/page/${page.id}`)}
                    >
                      <span className="recent-icon">{page.icon || '📄'}</span>
                      <span className="recent-main">
                        <strong>{page.title}</strong>
                        <span>{module?.title || '模块'} · {formatRelativeTime(page.updatedAt)}</span>
                      </span>
                      <ArrowUpRight size={15} className="recent-arrow" />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="tip-card">
            <div className="tip-head">
              <span className="eyebrow"><Lightbulb size={13} /> FIELD NOTE</span>
              <button
                type="button"
                className="icon-btn tip-refresh"
                onClick={() => setTipIndex((value) => (value + 1) % TIPS.length)}
                aria-label="换一条建议"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <p>{TIPS[tipIndex]}</p>
            <span className="tip-index">NOTE {String(tipIndex + 1).padStart(2, '0')} / {String(TIPS.length).padStart(2, '0')}</span>
          </section>
        </aside>
      </div>

      <footer className="dash-footer">
        <span>DEVFORGE / BUILD {data.system.version}</span>
        {data.system.icp?.number ? (
          <a href={data.system.icp.link || 'https://beian.miit.gov.cn/'} target="_blank" rel="noreferrer">
            {data.system.icp.number}
          </a>
        ) : null}
        <span>做小，做完，再做下一个。</span>
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

function StatCard({
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
    <div className={cn('stat-card', small && 'is-small')}>
      <span className="stat-label">{label}</span>
      <div className="stat-value">
        <strong>{value}</strong>
        {suffix ? <em>{suffix}</em> : null}
      </div>
      <span className="stat-foot">{foot}</span>
      <span className="stat-corner" />
    </div>
  );
}
