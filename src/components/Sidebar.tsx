import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Cloud,
  FilePlus2,
  FolderPlus,
  Globe2,
  Images,
  LayoutDashboard,
  Lock,
  LogOut,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api';
import { useApp } from '../state/AppContext';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { BrandLockup } from './BrandMark';
import { ModuleIconContent } from './ModuleIcon';
import { Avatar } from './Avatar';
import { DropdownMenu, type MenuItem } from './DropdownMenu';
import { ModuleDialog } from './ModuleDialog';
import { UpdateModal } from './UpdateModal';
import { hasUnseenUpdates, markUpdatesSeen } from '../updates';
import type { Module, PageMeta } from '../types';
import { cn, getErrorMessage, isApplePlatform } from '../utils';

const COLLAPSE_KEY = 'devforge.collapsed';

function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

export function Sidebar({
  open,
  onClose,
  onOpenSearch,
}: {
  open: boolean;
  onClose: () => void;
  onOpenSearch: () => void;
}) {
  const { data, logout, refresh, removeModuleLocal } = useApp();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [updateUnread, setUpdateUnread] = useState(() => hasUnseenUpdates('admin'));
  const searchShortcut = isApplePlatform() ? '⌘ K' : 'Ctrl K';
  const [moduleDialog, setModuleDialog] = useState<{
    open: boolean;
    module: Module | null;
    parentId?: string | null;
    parentTitle?: string;
  }>({
    open: false,
    module: null,
  });

  const modules = useMemo(
    () => [...(data?.modules || [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [data?.modules],
  );

  const modulesByParent = useMemo(() => {
    const map = new Map<string, Module[]>();
    for (const module of modules) {
      const key = module.parentId || 'root';
      const list = map.get(key) || [];
      list.push(module);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [modules]);

  const topModules = modulesByParent.get('root') || [];

  const pagesByParent = useMemo(() => {
    const map = new Map<string, PageMeta[]>();
    for (const page of data?.pages || []) {
      const key = page.parentId || `module:${page.moduleId}`;
      const list = map.get(key) || [];
      list.push(page);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [data?.pages]);

  const activePageId = location.pathname.startsWith('/page/')
    ? decodeURIComponent(location.pathname.slice('/page/'.length).split('/')[0] || '')
    : '';

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed])); } catch { /* ignore */ }
  }, [collapsed]);

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function go(path: string) {
    navigate(path);
    onClose();
  }

  async function addPage(moduleId: string, parentId?: string | null) {
    try {
      const result = await api.createPage({
        moduleId,
        parentId: parentId || null,
        title: '未命名页面',
        icon: '📄',
      });
      if (parentId) setCollapsed((prev) => { const next = new Set(prev); next.delete(`page:${parentId}`); return next; });
      await refresh();
      go(`/page/${result.page.id}`);
      toast('页面已创建，直接开始写吧。', 'success');
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }

  async function moveModule(module: Module, direction: -1 | 1, siblings: Module[]) {
    const index = siblings.findIndex((item) => item.id === module.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    const next = [...siblings];
    [next[index], next[target]] = [next[target], next[index]];
    try {
      await api.reorderModules(next.map((item) => item.id));
      await refresh();
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }

  async function togglePublic(module: Module) {
    try {
      await api.updateModule(module.id, { isPublic: !module.isPublic });
      await refresh();
      toast(module.isPublic ? '模块已设为私密，公开站点将隐藏它。' : '模块已公开，访客现在可以浏览。', 'success');
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }

  async function deleteModule(module: Module) {
    const ids = new Set<string>([module.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of modules) {
        if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
          ids.add(item.id);
          changed = true;
        }
      }
    }
    const count = (data?.pages || []).filter((page) => ids.has(page.moduleId)).length;
    const childCount = ids.size - 1;
    const ok = await confirm({
      title: `删除「${module.title}」？`,
      message: count > 0 || childCount > 0
        ? `模块里的 ${count} 个页面${childCount > 0 ? `、${childCount} 个子模块` : ''}也会一起删除。这个操作不能撤销，建议先导出备份。`
        : '这个模块会被永久删除，这个操作不能撤销。',
      confirmText: '删除模块',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteModule(module.id);
      removeModuleLocal(module.id);
      await refresh();
      if (location.pathname.startsWith('/page/')) {
        const current = data?.pages.find((page) => page.id === activePageId);
        if (current && ids.has(current.moduleId)) navigate('/');
      }
      if (location.pathname.startsWith('/module/')) {
        const currentModuleId = decodeURIComponent(location.pathname.slice('/module/'.length).split('/')[0] || '');
        if (ids.has(currentModuleId)) navigate('/');
      }
      toast('模块已删除。', 'success');
    } catch (error) {
      toast(getErrorMessage(error), 'error');
    }
  }

  async function handleLogout() {
    const ok = await confirm({
      title: '退出登录？',
      message: '数据已经保存在服务器上，下次用账号密码登录即可。',
      confirmText: '退出登录',
    });
    if (ok) {
      await logout();
      navigate('/');
    }
  }

  function moduleMenu(module: Module, siblings: Module[]): MenuItem[] {
    const index = siblings.findIndex((item) => item.id === module.id);
    return [
      { label: '新建子模块', icon: FolderPlus, onSelect: () => setModuleDialog({ open: true, module: null, parentId: module.id, parentTitle: module.title }) },
      { label: '新建页面', icon: FilePlus2, onSelect: () => { void addPage(module.id); } },
      { label: '编辑模块', icon: Pencil, onSelect: () => setModuleDialog({ open: true, module }) },
      {
        label: module.isPublic ? '设为私密' : '公开到网站',
        icon: module.isPublic ? Lock : Globe2,
        onSelect: () => { void togglePublic(module); },
      },
      { label: '', separator: true, onSelect: () => undefined },
      { label: '上移', icon: ArrowUp, disabled: index <= 0, onSelect: () => { void moveModule(module, -1, siblings); } },
      { label: '下移', icon: ArrowDown, disabled: index >= siblings.length - 1, onSelect: () => { void moveModule(module, 1, siblings); } },
      { label: '', separator: true, onSelect: () => undefined },
      { label: '删除模块', icon: Trash2, danger: true, onSelect: () => { void deleteModule(module); } },
    ];
  }

  return (
    <>
      <aside className={cn('sidebar', open && 'is-open')}>
        <div className="sidebar-head">
          <button type="button" className="brand-button" onClick={() => go('/')} aria-label="回到总览">
            <BrandLockup
              name={data?.site.name}
              tagline={data?.site.tagline}
              logoUrl={data?.site.logoUrl}
            />
          </button>
          <button type="button" className="icon-btn sidebar-close" onClick={onClose} aria-label="关闭侧栏">
            <X size={18} />
          </button>
        </div>

        <div className="sidebar-actions">
          <button type="button" className="search-box" onClick={onOpenSearch}>
            <Search size={16} />
            <span>搜索页面、块内容…</span>
            <kbd>{searchShortcut}</kbd>
          </button>
          <button type="button" className="btn btn-primary btn-new-page" onClick={() => setModuleDialog({ open: true, module: null })}>
            <Plus size={17} />
            新建模块
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="主导航">
          <button
            type="button"
            className={cn('nav-item', location.pathname === '/' && 'is-active')}
            onClick={() => go('/')}
          >
            <LayoutDashboard size={17} />
            <span>总览</span>
          </button>
          <button
            type="button"
            className={cn('nav-item', location.pathname.startsWith('/settings') && 'is-active')}
            onClick={() => go('/settings')}
          >
            <Settings size={17} />
            <span>设置</span>
          </button>
          <button
            type="button"
            className="nav-item nav-item-update"
            onClick={() => {
              setUpdatesOpen(true);
              setUpdateUnread(false);
              markUpdatesSeen('admin');
            }}
          >
            <Megaphone size={17} />
            <span>更新公告</span>
            {updateUnread ? <em>NEW</em> : null}
          </button>
          <button
            type="button"
            className={cn('nav-item', location.pathname.startsWith('/kb') && 'is-active')}
            onClick={() => go('/kb')}
          >
            <BookOpen size={17} />
            <span>知识库</span>
          </button>
          <button
            type="button"
            className={cn('nav-item', location.pathname.startsWith('/assets') && 'is-active')}
            onClick={() => go('/assets')}
          >
            <Images size={17} />
            <span>素材库</span>
          </button>
          <button
            type="button"
            className={cn('nav-item', location.pathname.startsWith('/accounts') && 'is-active')}
            onClick={() => go('/accounts')}
          >
            <Users size={17} />
            <span>账号管理</span>
          </button>
          <button
            type="button"
            className={cn('nav-item', location.pathname.startsWith('/chat') && 'is-active')}
            onClick={() => go('/chat')}
          >
            <MessageCircle size={17} />
            <span>聊天室</span>
          </button>
          <button
            type="button"
            className={cn('nav-item', location.pathname.startsWith('/friends') && 'is-active')}
            onClick={() => go('/friends')}
          >
            <UserRound size={17} />
            <span>好友</span>
          </button>
        </nav>

        <div className="sidebar-tree-head">
          <span>学习模块</span>
          <span className="tree-count">{modules.length}</span>
        </div>

        <div className="sidebar-tree">
          {topModules.length === 0 ? (
            <div className="sidebar-empty">
              <FolderPlus size={22} />
              <p>还没有模块</p>
              <button type="button" onClick={() => setModuleDialog({ open: true, module: null, parentId: null })}>
                创建第一个模块
              </button>
            </div>
          ) : topModules.map((module) => (
            <ModuleNode
              key={module.id}
              module={module}
              depth={0}
              siblings={topModules}
              modulesByParent={modulesByParent}
              pagesByParent={pagesByParent}
              activePageId={activePageId}
              collapsed={collapsed}
              onToggle={toggle}
              onNavigate={go}
              onAddPage={(moduleId) => { void addPage(moduleId); }}
              onMenu={moduleMenu}
            />
          ))}
        </div>

        <div className="sidebar-foot">
          <div className="sync-badge">
            <Cloud size={13} />
            <span>私有服务器</span>
            <i className="status-dot" />
          </div>
          <DropdownMenu
            align="start"
            trigger={(
              <button type="button" className="user-chip" aria-label="账户菜单">
                <Avatar name="ADMIN" size={32} />
                <span className="user-chip-text">
                  <strong>管理员</strong>
                  <small>学习舱管理员</small>
                </span>
                <MoreHorizontal size={15} />
              </button>
            )}
            items={[
              { label: '账户与设置', icon: Settings, onSelect: () => go('/settings') },
              { label: '', separator: true, onSelect: () => undefined },
              { label: '退出登录', icon: LogOut, danger: true, onSelect: () => { void handleLogout(); } },
            ]}
          />
        </div>
      </aside>

      <ModuleDialog
        open={moduleDialog.open}
        module={moduleDialog.module}
        parentId={moduleDialog.parentId ?? null}
        parentTitle={moduleDialog.parentTitle}
        onClose={() => setModuleDialog({ open: false, module: null })}
        onSaved={(saved) => { go(`/module/${saved.id}`); }}
      />

      <UpdateModal open={updatesOpen} role="admin" onClose={() => setUpdatesOpen(false)} />
    </>
  );
}

function ModuleNode({
  module,
  depth,
  siblings,
  modulesByParent,
  pagesByParent,
  activePageId,
  collapsed,
  onToggle,
  onNavigate,
  onAddPage,
  onMenu,
}: {
  module: Module;
  depth: number;
  siblings: Module[];
  modulesByParent: Map<string, Module[]>;
  pagesByParent: Map<string, PageMeta[]>;
  activePageId: string;
  collapsed: Set<string>;
  onToggle: (key: string) => void;
  onNavigate: (path: string) => void;
  onAddPage: (moduleId: string) => void;
  onMenu: (module: Module, siblings: Module[]) => MenuItem[];
}) {
  const key = `module:${module.id}`;
  const isCollapsed = collapsed.has(key);
  const pages = pagesByParent.get(key) || [];
  const children = modulesByParent.get(module.id) || [];
  const hasChildren = pages.length > 0 || children.length > 0;
  return (
    <div className="side-module" style={depth > 0 ? { marginLeft: 10 + depth * 4 } : undefined}>
      <div className="side-module-head">
        <button
          type="button"
          className="side-collapse"
          onClick={() => onToggle(key)}
          aria-label={isCollapsed ? '展开模块' : '收起模块'}
          style={{ opacity: hasChildren ? 1 : 0.35 }}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <button type="button" className="side-module-link" onClick={() => onToggle(key)}>
          <span className="side-module-icon" style={{ backgroundColor: `${module.accent}1a`, color: module.accent }}>
            <ModuleIconContent module={module} />
          </span>
          <span className="side-module-name">{module.title}</span>
          {!module.isPublic ? <Lock size={10} className="side-private-mark" aria-label="私密模块" /> : null}
          <span className="side-module-count">{pages.length + children.length}</span>
        </button>
        <button
          type="button"
          className="icon-btn side-mini-btn"
          onClick={() => onAddPage(module.id)}
          aria-label={`在 ${module.title} 中新建页面`}
          title="新建页面"
        >
          <Plus size={14} />
        </button>
        <DropdownMenu
          trigger={(
            <button type="button" className="icon-btn side-mini-btn" aria-label="模块菜单">
              <MoreHorizontal size={15} />
            </button>
          )}
          items={onMenu(module, siblings)}
        />
      </div>
      {!isCollapsed ? (
        <div className="side-pages">
          {pages.length === 0 ? (
            <button type="button" className="side-page-empty" onClick={() => onAddPage(module.id)}>
              添加第一张页面
            </button>
          ) : pages.map((page) => (
            <PageNode
              key={page.id}
              page={page}
              depth={depth}
              activeId={activePageId}
              pagesByParent={pagesByParent}
              collapsed={collapsed}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
          {children.map((child) => (
            <ModuleNode
              key={child.id}
              module={child}
              depth={depth + 1}
              siblings={children}
              modulesByParent={modulesByParent}
              pagesByParent={pagesByParent}
              activePageId={activePageId}
              collapsed={collapsed}
              onToggle={onToggle}
              onNavigate={onNavigate}
              onAddPage={onAddPage}
              onMenu={onMenu}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PageNode({
  page,
  depth,
  activeId,
  pagesByParent,
  collapsed,
  onToggle,
  onNavigate,
}: {
  page: PageMeta;
  depth: number;
  activeId: string;
  pagesByParent: Map<string, PageMeta[]>;
  collapsed: Set<string>;
  onToggle: (key: string) => void;
  onNavigate: (path: string) => void;
}) {
  const children = pagesByParent.get(page.id) || [];
  const key = `page:${page.id}`;
  const isCollapsed = collapsed.has(key);
  return (
    <>
      <div className={cn('side-page-row', activeId === page.id && 'is-active')} style={{ paddingLeft: 12 + depth * 14 }}>
        {children.length ? (
          <button
            type="button"
            className="side-collapse page-collapse"
            onClick={() => onToggle(key)}
            aria-label={isCollapsed ? '展开子页面' : '收起子页面'}
          >
            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
        ) : <span className="page-indent" />}
        <button type="button" className="side-page-link" onClick={() => onNavigate(`/page/${page.id}`)}>
          <span className="side-page-icon">{page.icon}</span>
          <span className="side-page-title">{page.title || '未命名页面'}</span>
        </button>
      </div>
      {!isCollapsed && children.length ? (
        children.map((child) => (
          <PageNode
            key={child.id}
            page={child}
            depth={depth + 1}
            activeId={activeId}
            pagesByParent={pagesByParent}
            collapsed={collapsed}
            onToggle={onToggle}
            onNavigate={onNavigate}
          />
        ))
      ) : null}
    </>
  );
}
