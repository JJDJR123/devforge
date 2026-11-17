import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  ChevronRight,
  FilePlus2,
  FolderOpen,
  Globe2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../state/AppContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { ModuleDialog } from '../components/ModuleDialog';
import { DropdownMenu } from '../components/DropdownMenu';
import type { PageMeta } from '../types';
import { cn, formatNumber, formatRelativeTime, getErrorMessage } from '../utils';

export function ModuleView() {
  const { moduleId = '' } = useParams();
  const { data, refresh, removeModuleLocal, removePageLocal } = useApp();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const module = data?.modules.find((item) => item.id === moduleId) || null;
  const modulePages = useMemo(
    () => (data?.pages || []).filter((page) => page.moduleId === moduleId),
    [data?.pages, moduleId],
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

  if (!data) return null;

  if (!module) {
    return (
      <div className="page-missing">
        <div className="page-missing-icon"><AlertCircle size={26} /></div>
        <h1>模块没有找到</h1>
        <p>它可能已经被删除，或者链接不完整。</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>回到总览</button>
      </div>
    );
  }

  const chars = modulePages.reduce((sum, page) => sum + page.chars, 0);
  const todoTotal = modulePages.reduce((sum, page) => sum + page.todoTotal, 0);
  const todoDone = modulePages.reduce((sum, page) => sum + page.todoDone, 0);
  const completion = todoTotal ? Math.round((todoDone / todoTotal) * 100) : 0;
  const roots = pagesByParent.get('__root__') || [];
  const lastUpdated = modulePages.reduce<string | null>((latest, page) => (
    !latest || page.updatedAt > latest ? page.updatedAt : latest
  ), null);

  async function addPage(parentId?: string) {
    if (creating) return;
    setCreating(true);
    try {
      const result = await api.createPage({
        moduleId: module!.id,
        parentId: parentId || null,
        title: parentId ? '未命名子页面' : '未命名页面',
        icon: '📄',
      });
      await refresh();
      navigate(`/page/${result.page.id}`);
      toast('页面已创建。', 'success');
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    } finally {
      setCreating(false);
    }
  }

  async function deleteModule() {
    const ok = await confirm({
      title: `删除「${module!.title}」？`,
      message: modulePages.length
        ? `模块里的 ${modulePages.length} 个页面也会一起删除，且不能撤销。`
        : '这个模块会被永久删除，且不能撤销。',
      confirmText: '删除模块',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteModule(module!.id);
      removeModuleLocal(module!.id);
      await refresh();
      navigate('/');
      toast('模块已删除。', 'success');
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }

  async function togglePublic() {
    try {
      await api.updateModule(module!.id, { isPublic: !module!.isPublic });
      await refresh();
      toast(module!.isPublic ? '模块已设为私密。' : '模块已公开到网站。', 'success');
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }

  async function deletePage(page: PageMeta) {
    const ok = await confirm({
      title: `删除「${page.title}」？`,
      message: '页面里的所有块都会被删除，子页面也会一起删除。这个操作不能撤销。',
      confirmText: '删除页面',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deletePage(page.id);
      removePageLocal(page.id);
      await refresh();
      toast('页面已删除。', 'success');
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }

  async function movePage(page: PageMeta, direction: -1 | 1) {
    const siblings = (pagesByParent.get(page.parentId || '__root__') || [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex((item) => item.id === page.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    const next = [...siblings];
    [next[index], next[target]] = [next[target], next[index]];
    try {
      await api.reorderPages({
        ids: next.map((item) => item.id),
        moduleId: module!.id,
        parentId: page.parentId,
      });
      await refresh();
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }

  function renderPage(page: PageMeta, depth = 0) {
    const children = pagesByParent.get(page.id) || [];
    const siblings = (pagesByParent.get(page.parentId || '__root__') || [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex((item) => item.id === page.id);
    return (
      <div key={page.id} className="module-page-branch">
        <div className="module-page-row" style={{ paddingLeft: 18 + depth * 26 }}>
          <button type="button" className="module-page-main" onClick={() => navigate(`/page/${page.id}`)}>
            <span className="module-page-icon">{page.icon}</span>
            <span className="module-page-text">
              <strong>{page.title}</strong>
              <span>{formatNumber(page.chars)} 字{page.todoTotal ? ` · 待办 ${page.todoDone}/${page.todoTotal}` : ''} · {formatRelativeTime(page.updatedAt)}</span>
            </span>
            {children.length ? <em className="module-page-childcount">{children.length} 子页</em> : null}
            <ArrowUpRight size={15} className="module-page-arrow" />
          </button>
          <DropdownMenu
            trigger={(
              <button type="button" className="icon-btn module-page-menu" aria-label="页面菜单">
                <MoreHorizontal size={15} />
              </button>
            )}
            items={[
              { label: '打开页面', icon: ArrowUpRight, onSelect: () => navigate(`/page/${page.id}`) },
              { label: '新建子页面', icon: FilePlus2, onSelect: () => { void addPage(page.id); } },
              { label: '', separator: true, onSelect: () => undefined },
              { label: '上移', icon: ArrowUp, disabled: index <= 0, onSelect: () => { void movePage(page, -1); } },
              { label: '下移', icon: ArrowDown, disabled: index < 0 || index >= siblings.length - 1, onSelect: () => { void movePage(page, 1); } },
              { label: '', separator: true, onSelect: () => undefined },
              { label: '删除页面', icon: Trash2, danger: true, onSelect: () => { void deletePage(page); } },
            ]}
          />
        </div>
        {children.map((child) => renderPage(child, depth + 1))}
      </div>
    );
  }

  return (
    <div className="module-view">
      <div className="page-crumb">
        <button type="button" onClick={() => navigate('/')}>
          <FolderOpen size={13} /> 全部模块
        </button>
        <ChevronRight size={13} />
        <span className="page-crumb-current">{module.title}</span>
      </div>

      <header className="module-hero" style={{ '--module-accent': module.accent } as CSSProperties}>
        <div className="module-hero-glow" aria-hidden="true" />
        <div className="module-hero-main">
          <span className="module-hero-icon">{module.icon}</span>
          <div>
            <span className="eyebrow">MODULE / 学习模块</span>
            <h1>{module.title} <span className={cn('module-public-state', module.isPublic ? 'is-public' : 'is-private')}>{module.isPublic ? '公开' : '私密'}</span></h1>
            <p>{modulePages.length} 张页面 · {formatNumber(chars)} 字 · {lastUpdated ? `更新于 ${formatRelativeTime(lastUpdated)}` : '还没有内容'}</p>
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
        <div className="module-hero-actions">
          <button type="button" className="btn btn-primary" onClick={() => { void addPage(); }} disabled={creating}>
            {creating ? <span className="mini-spinner" /> : <Plus size={16} />} 新建页面
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setEditOpen(true)}>
            <Pencil size={15} /> 编辑
          </button>
          <DropdownMenu
            trigger={(
              <button type="button" className="icon-btn module-hero-more" aria-label="模块菜单">
                <MoreHorizontal size={18} />
              </button>
            )}
            items={[
              { label: '编辑模块', icon: Pencil, onSelect: () => setEditOpen(true) },
              { label: '新建页面', icon: FilePlus2, onSelect: () => { void addPage(); } },
              {
                label: module.isPublic ? '设为私密' : '公开到网站',
                icon: module.isPublic ? Lock : Globe2,
                onSelect: () => { void togglePublic(); },
              },
              { label: '', separator: true, onSelect: () => undefined },
              { label: '删除模块', icon: Trash2, danger: true, onSelect: () => { void deleteModule(); } },
            ]}
          />
        </div>
      </header>

      <section className="module-pages-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">PAGES / 页面</span>
            <h2>这个模块里的内容</h2>
          </div>
          <span className="section-count">{modulePages.length}</span>
        </div>

        {roots.length ? (
          <div className="module-page-list">
            {roots.map((page) => renderPage(page))}
          </div>
        ) : (
          <div className="module-pages-empty">
            <div className="module-empty-art"><FilePlus2 size={28} /></div>
            <h3>这个模块还是空的</h3>
            <p>新建一张页面，写下第一个概念、第一条笔记，或者一张参考图。</p>
            <button type="button" className="btn btn-primary" onClick={() => { void addPage(); }}>
              <Plus size={16} /> 创建第一张页面
            </button>
          </div>
        )}
      </section>

      <div className="module-view-foot">
        <button type="button" className="link-button" onClick={() => navigate('/')}>
          <ArrowLeft size={14} /> 返回总览
        </button>
        <span>MODULE ID / {module.id.slice(0, 8).toUpperCase()}</span>
      </div>

      <ModuleDialog
        open={editOpen}
        module={module}
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}
