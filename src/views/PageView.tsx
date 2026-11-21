import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FilePlus2,
  FileUp,
  Link2,
  Loader2,
  MoreHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { api, saveMetaKeepalive } from '../api';
import { useApp } from '../state/AppContext';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { DropdownMenu } from '../components/DropdownMenu';
import { EmojiPicker } from '../components/EmojiPicker';
import { BlockEditor, type SaveStatus } from '../components/BlockEditor';
import { WikiPreview } from '../components/WikiPreview';
import { markdownToBlocks } from '../markdown';
import type { BlockRecord, Breadcrumb, Page, PageLinks } from '../types';
import {
  blocksToMarkdown,
  cn,
  copyText,
  countTodos,
  downloadTextFile,
  extractPlainText,
  formatNumber,
  formatRelativeTime,
  getErrorMessage,
  safeFilename,
  totalChars,
} from '../utils';

export function PageView() {
  const { pageId = '' } = useParams();
  const { data, applyPageMeta, removePageLocal, refresh } = useApp();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const [page, setPage] = useState<Page | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<Breadcrumb | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [links, setLinks] = useState<PageLinks>({ outgoing: [], backlinks: [] });
  const [linksOpen, setLinksOpen] = useState(false);
  const [linksLoading, setLinksLoading] = useState(false);
  const [creatingLinkId, setCreatingLinkId] = useState('');
  const [previewHref, setPreviewHref] = useState<string | null>(null);
  const [iconOpen, setIconOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const importMode = useRef<'replace' | 'child'>('child');
  const importInputRef = useRef<HTMLInputElement>(null);
  const suppressEditorSave = useRef(false);
  const latestBlocks = useRef<BlockRecord[]>([]);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleValue = useRef('');
  const titleSaveSeq = useRef(0);
  const lastSavedTitle = useRef('');
  const iconRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const pageRef = useRef<Page | null>(null);
  pageRef.current = page;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.getPage(pageId)
      .then((result) => {
        if (cancelled) return;
        setPage(result.page);
        setBreadcrumb(result.breadcrumb);
        latestBlocks.current = result.page.blocks;
        titleValue.current = result.page.title;
        lastSavedTitle.current = result.page.title;
        titleSaveSeq.current += 1;
        setLoading(false);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(getErrorMessage(fetchError));
        setLoading(false);
      });
    return () => {
      cancelled = true;
      if (titleTimer.current) clearTimeout(titleTimer.current);
      const value = titleValue.current.trim();
      if (value) saveMetaKeepalive(pageId, value);
      else if (titleValue.current !== lastSavedTitle.current) saveMetaKeepalive(pageId, '未命名页面');
    };
  }, [pageId]);

  useEffect(() => {
    let cancelled = false;
    if (!pageId) return;
    setLinksLoading(true);
    api.pageLinks(pageId)
      .then((result) => {
        if (!cancelled) setLinks(result);
      })
      .catch(() => {
        if (!cancelled) setLinks({ outgoing: [], backlinks: [] });
      })
      .finally(() => {
        if (!cancelled) setLinksLoading(false);
      });
    return () => { cancelled = true; };
  }, [pageId, page?.updatedAt]);

  useEffect(() => {
    const element = titleRef.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.max(48, element.scrollHeight)}px`;
  }, [page?.title]);

  useEffect(() => {
    suppressEditorSave.current = false;
  }, [editorVersion]);

  useEffect(() => {
    if (!iconOpen) return;
    const handle = (event: PointerEvent) => {
      if (iconRef.current && !iconRef.current.contains(event.target as Node)) setIconOpen(false);
    };
    document.addEventListener('pointerdown', handle);
    return () => document.removeEventListener('pointerdown', handle);
  }, [iconOpen]);

  function updateTitle(value: string) {
    if (!page) return;
    titleValue.current = value;
    setPage({ ...page, title: value });
    applyPageMeta(page.id, { title: value });
    if (titleTimer.current) clearTimeout(titleTimer.current);
    const seq = ++titleSaveSeq.current;
    // 编辑过程中允许暂时为空，但不要把空标题保存到服务端。
    if (!value.trim()) return;
    titleTimer.current = setTimeout(() => {
      void persistTitle(value, seq);
    }, 550);
  }

  async function persistTitle(value: string, seq: number) {
    if (!pageRef.current || !value.trim()) return;
    try {
      const result = await api.updatePageMeta(pageRef.current.id, { title: value });
      if (seq !== titleSaveSeq.current) return;
      lastSavedTitle.current = result.page.title;
      applyPageMeta(result.page.id, { title: result.page.title, updatedAt: result.page.updatedAt });
      setPage((current) => current ? { ...current, title: result.page.title, updatedAt: result.page.updatedAt } : current);
      titleValue.current = result.page.title;
    } catch (titleError) {
      toast(getErrorMessage(titleError), 'error');
    }
  }

  function finishTitleEdit() {
    if (titleTimer.current) {
      clearTimeout(titleTimer.current);
      titleTimer.current = null;
    }
    const value = titleValue.current.trim();
    // 离开编辑状态时仍为空：明确变成“未命名页面”，不恢复旧标题。
    const next = value || '未命名页面';
    const seq = ++titleSaveSeq.current;
    titleValue.current = next;
    if (page) {
      setPage({ ...page, title: next });
      applyPageMeta(page.id, { title: next });
    }
    void persistTitle(next, seq);
  }

  function cancelTitleEdit() {
    if (titleTimer.current) {
      clearTimeout(titleTimer.current);
      titleTimer.current = null;
    }
    titleSaveSeq.current += 1;
    titleValue.current = lastSavedTitle.current;
    if (page) {
      setPage({ ...page, title: lastSavedTitle.current });
      applyPageMeta(page.id, { title: lastSavedTitle.current });
    }
    titleRef.current?.blur();
  }

  async function changeIcon(icon: string) {
    if (!page) return;
    setIconOpen(false);
    const previous = page.icon;
    setPage({ ...page, icon });
    applyPageMeta(page.id, { icon });
    try {
      const result = await api.updatePageMeta(page.id, { icon });
      applyPageMeta(page.id, { updatedAt: result.page.updatedAt });
    } catch (iconError) {
      setPage((current) => current ? { ...current, icon: previous } : current);
      applyPageMeta(page.id, { icon: previous });
      toast(getErrorMessage(iconError), 'error');
    }
  }

  async function importMarkdownFile(file: File, mode: 'replace' | 'child') {
    if (!page) return;
    if (file.size > 1_500_000) {
      toast('Markdown 文件太大了，请控制在 1.5MB 以内。', 'error');
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      if (!text.trim()) {
        toast('这个 Markdown 文件是空的。', 'error');
        return;
      }
      const fallbackTitle = file.name.replace(/\.(md|markdown)$/i, '').trim() || '导入的笔记';
      const { title, blocks } = markdownToBlocks(text, fallbackTitle);

      if (mode === 'replace') {
        const ok = await confirm({
          title: '覆盖当前页面？',
          message: `「${page.title || '未命名页面'}」里的所有内容会被这段 Markdown 替换，页面标题保留。这个操作不能撤销。`,
          confirmText: '覆盖内容',
          danger: true,
        });
        if (!ok) return;
        suppressEditorSave.current = true;
        try {
          const saved = await api.saveContent(page.id, blocks, extractPlainText(blocks));
          const chars = totalChars(blocks);
          latestBlocks.current = blocks;
          applyPageMeta(page.id, {
            chars,
            todoTotal: saved.todoTotal,
            todoDone: saved.todoDone,
            updatedAt: saved.updatedAt,
          });
          setPage((current) => current ? {
            ...current,
            blocks,
            chars,
            todoTotal: saved.todoTotal,
            todoDone: saved.todoDone,
            updatedAt: saved.updatedAt,
          } : current);
          setEditorVersion((value) => value + 1);
          toast('当前页面内容已被 Markdown 覆盖。', 'success');
          return;
        } catch (saveError) {
          suppressEditorSave.current = false;
          throw saveError;
        }
      }

      const created = await api.createPage({
        moduleId: page.moduleId,
        parentId: page.id,
        title,
        icon: '📝',
      });
      await api.saveContent(created.page.id, blocks, extractPlainText(blocks));
      await refresh();
      toast('Markdown 已导入为子页面。', 'success');
      navigate(`/page/${created.page.id}`);
    } catch (importError) {
      toast(getErrorMessage(importError), 'error');
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  async function addSubpage() {
    if (!page) return;
    try {
      const result = await api.createPage({
        moduleId: page.moduleId,
        parentId: page.id,
        title: '未命名子页面',
        icon: '📄',
      });
      await refresh();
      navigate(`/page/${result.page.id}`);
      toast('子页面已创建。', 'success');
    } catch (createError) {
      toast(getErrorMessage(createError), 'error');
    }
  }

  async function deletePage() {
    if (!page) return;
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleValue.current = '';
    const childCount = (data?.pages || []).filter((item) => item.parentId === page.id).length;
    const ok = await confirm({
      title: `删除「${page.title || '未命名页面'}」？`,
      message: childCount
        ? `它下面还有 ${childCount} 个子页面，也会一起删除。这个操作不能撤销。`
        : '页面和里面的所有块都会被删除，这个操作不能撤销。',
      confirmText: '删除页面',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deletePage(page.id);
      removePageLocal(page.id);
      await refresh();
      if (page.parentId) navigate(`/page/${page.parentId}`);
      else navigate(`/module/${page.moduleId}`);
      toast('页面已删除。', 'success');
    } catch (deleteError) {
      toast(getErrorMessage(deleteError), 'error');
    }
  }

  function exportMarkdown() {
    if (!page) return;
    const markdown = `# ${page.title || '未命名页面'}\n\n${blocksToMarkdown(latestBlocks.current)}`;
    downloadTextFile(`${safeFilename(page.title)}.md`, markdown);
    toast('Markdown 已导出。', 'success');
  }

  async function copyLink() {
    const ok = await copyText(`${window.location.origin}/page/${page?.id}`);
    toast(ok ? '页面链接已复制。' : '浏览器不允许复制，请手动复制地址栏。', ok ? 'success' : 'error');
  }

  async function createLinkedPage(link: PageLinks['outgoing'][number]) {
    if (!page || creatingLinkId) return;
    if (link.rawTitle.startsWith('模块:')) return;
    setCreatingLinkId(link.id);
    try {
      const result = await api.createPage({
        moduleId: page.moduleId,
        parentId: null,
        title: link.rawTitle,
        icon: '📄',
      });
      await refresh();
      navigate(`/page/${result.page.id}`);
      toast('已创建并打开目标页面。', 'success');
    } catch (createError) {
      toast(getErrorMessage(createError), 'error');
    } finally {
      setCreatingLinkId('');
    }
  }

  async function retrySave() {
    if (!page) return;
    setSaveStatus('saving');
    try {
      const text = extractPlainText(latestBlocks.current);
      const todo = countTodos(latestBlocks.current);
      const result = await api.saveContent(page.id, latestBlocks.current, text);
      const chars = text.replace(/\s/g, '').length;
      applyPageMeta(page.id, {
        updatedAt: result.updatedAt,
        chars,
        todoTotal: result.todoTotal ?? todo.total,
        todoDone: result.todoDone ?? todo.done,
      });
      setPage((current) => current ? {
        ...current,
        updatedAt: result.updatedAt,
        chars,
        todoTotal: result.todoTotal ?? todo.total,
        todoDone: result.todoDone ?? todo.done,
      } : current);
      setSaveStatus('saved');
      toast('已重新保存。', 'success');
    } catch (saveError) {
      setSaveStatus('error');
      toast(getErrorMessage(saveError), 'error');
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-meta" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
        <div className="skeleton skeleton-block" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="page-missing">
        <div className="page-missing-icon"><AlertCircle size={26} /></div>
        <h1>页面没有找到</h1>
        <p>{error || '它可能已经被删除，或者链接不完整。'}</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>回到总览</button>
      </div>
    );
  }

  const breadcrumbModules = breadcrumb?.moduleChain?.length
    ? breadcrumb.moduleChain
    : breadcrumb?.module
      ? [breadcrumb.module]
      : [];

  return (
    <article className="page-view">
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
        <span className="page-crumb-current">{page.title || '未命名页面'}</span>
      </div>

      <header className="page-head">
        <div className="page-icon-wrap" ref={iconRef}>
          <button
            type="button"
            className="page-icon-button"
            onClick={() => setIconOpen((value) => !value)}
            aria-label="更换页面图标"
          >
            {page.icon}
            <span className="page-icon-edit">更换</span>
          </button>
          {iconOpen ? (
            <div className="icon-popover">
              <div className="icon-popover-head">
                <span>页面图标</span>
                <button type="button" className="icon-btn" onClick={() => setIconOpen(false)} aria-label="关闭">
                  <X size={14} />
                </button>
              </div>
              <EmojiPicker value={page.icon} onChange={(icon) => { void changeIcon(icon); }} compact />
            </div>
          ) : null}
        </div>

        <div className="page-title-wrap">
          <textarea
            ref={titleRef}
            className="page-title-input"
            value={page.title}
            rows={1}
            maxLength={160}
            placeholder="未命名页面"
            onChange={(event) => updateTitle(event.target.value)}
            onBlur={finishTitleEdit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                cancelTitleEdit();
              }
            }}
            spellCheck={false}
            aria-label="页面标题"
          />
          <div className="page-submeta">
            <span>{breadcrumb?.module?.title || '模块'}</span>
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

        <div className="page-actions">
          <SaveIndicator status={saveStatus} onRetry={() => { void retrySave(); }} />
          <button type="button" className="btn btn-ghost btn-sm page-add-child" onClick={() => { void addSubpage(); }}>
            <FilePlus2 size={15} /> 子页面
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importMarkdownFile(file, importMode.current);
            }}
          />
          <DropdownMenu
            trigger={(
              <button type="button" className="icon-btn page-more" aria-label="页面菜单">
                <MoreHorizontal size={18} />
              </button>
            )}
            items={[
              { label: importing ? '正在导入…' : '导入 Markdown（覆盖本页）', icon: FileUp, danger: true, onSelect: () => { if (!importing) { importMode.current = 'replace'; importInputRef.current?.click(); } } },
              { label: importing ? '正在导入…' : '导入 Markdown（新建子页面）', icon: FileUp, onSelect: () => { if (!importing) { importMode.current = 'child'; importInputRef.current?.click(); } } },
              { label: '导出 Markdown', icon: Download, onSelect: exportMarkdown },
              { label: '复制页面链接', icon: Copy, onSelect: () => { void copyLink(); } },
              { label: '新建子页面', icon: FilePlus2, onSelect: () => { void addSubpage(); } },
              { label: '', separator: true, onSelect: () => undefined },
              { label: '删除页面', icon: Trash2, danger: true, onSelect: () => { void deletePage(); } },
            ]}
          />
        </div>
      </header>

      <div className="page-editor">
        <BlockEditor
          key={`${page.id}-${editorVersion}`}
          page={page}
          suppressUnmountSaveRef={suppressEditorSave}
          onStatusChange={setSaveStatus}
          onDocumentChange={(blocks) => { latestBlocks.current = blocks; }}
          onSaved={(updatedAt, chars, todoTotal, todoDone) => {
            applyPageMeta(page.id, { updatedAt, chars, todoTotal, todoDone });
            setPage((current) => current ? { ...current, updatedAt, chars, todoTotal, todoDone } : current);
          }}
        />
      </div>

      <section className={cn('page-links-panel', linksOpen && 'is-open')}>
        <div className="page-links-head">
          <div>
            <span className="eyebrow"><Link2 size={12} /> KNOWLEDGE LINKS</span>
            <h2>知识链接</h2>
          </div>
          <button
            type="button"
            className="page-links-toggle"
            onClick={() => setLinksOpen((value) => !value)}
            aria-expanded={linksOpen}
          >
            <span>出链 {links.outgoing.length} · 回链 {links.backlinks.length}</span>
            <ChevronDown size={15} className={cn(linksOpen && 'is-open')} />
          </button>
        </div>
        {linksOpen ? (
          linksLoading ? (
            <div className="page-links-loading"><Loader2 size={13} className="spin" /> 正在读取链接…</div>
          ) : (
            <>
              <p className="page-links-hint">点正文上方「关联笔记」选择页面或模块；也可以输入 <code>[[页面标题]]</code>。</p>
              <div className="page-links-grid">
                <div className="page-links-column">
                  <h3>出链 <span>{links.outgoing.length}</span></h3>
                  {links.outgoing.length ? links.outgoing.map((link) => (
                    (link.targetPageId || link.targetModuleId) ? (
                      <button
                        key={link.id}
                        type="button"
                        className="page-link-item"
                        onClick={() => setPreviewHref(link.targetPageId
                          ? `/page/${link.targetPageId}`
                          : `/module/${link.targetModuleId}`)}
                      >
                        <span className="page-link-icon">{link.icon}</span>
                        <span>
                          <strong>{link.alias || link.targetTitle}</strong>
                          <em>{link.targetType === 'module' ? '模块 · ' : ''}{link.context}</em>
                        </span>
                      </button>
                    ) : (
                      <div key={link.id} className="page-link-item is-unresolved">
                        <span className="page-link-icon">◌</span>
                        <span>
                          <strong>{link.alias || link.rawTitle}</strong>
                          <em>未创建 · {link.context}</em>
                        </span>
                        {link.rawTitle.startsWith('模块:') ? null : (
                          <button
                            type="button"
                            className="page-link-create"
                            onClick={() => { void createLinkedPage(link); }}
                            disabled={Boolean(creatingLinkId)}
                          >
                            {creatingLinkId === link.id ? <Loader2 size={11} className="spin" /> : <FilePlus2 size={11} />}
                            创建
                          </button>
                        )}
                      </div>
                    )
                  )) : <p className="page-links-empty">还没有出链。在正文里插入 [[页面标题]]。</p>}
                </div>
                <div className="page-links-column">
                  <h3>反向链接 <span>{links.backlinks.length}</span></h3>
                  {links.backlinks.length ? links.backlinks.map((link) => (
                    <button
                      key={link.id}
                      type="button"
                      className="page-link-item"
                      onClick={() => setPreviewHref(`/page/${link.sourcePageId}`)}
                    >
                      <span className="page-link-icon">{link.icon}</span>
                      <span>
                        <strong>{link.sourceTitle}</strong>
                        <em>{link.context}</em>
                      </span>
                    </button>
                  )) : <p className="page-links-empty">还没有其他页面提到这里。</p>}
                </div>
              </div>
            </>
          )
        ) : null}
      </section>

      <div className="page-end">
        <span className="page-end-line" />
        <span className="page-end-mark">DF</span>
        <span className="page-end-line" />
      </div>
      <div className="page-foot">
        <span>最后编辑 {formatRelativeTime(page.updatedAt)}</span>
        <button type="button" onClick={() => { void copyLink(); }}>
          复制链接 <ArrowUpRight size={13} />
        </button>
      </div>

      {data ? (
        <WikiPreview
          href={previewHref}
          mode="admin"
          pages={data.pages || []}
          modules={data.modules || []}
          theme={data.theme}
          onClose={() => setPreviewHref(null)}
        />
      ) : null}
    </article>
  );
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'saving') {
    return <span className="save-indicator is-saving"><Loader2 size={13} className="spin" /> 保存中</span>;
  }
  if (status === 'dirty') {
    return <span className="save-indicator is-dirty"><i /> 未保存</span>;
  }
  if (status === 'error') {
    return (
      <button type="button" className="save-indicator is-error" onClick={onRetry}>
        <AlertCircle size={13} /> 保存失败 · 重试
      </button>
    );
  }
  return <span className="save-indicator is-saved"><Check size={13} /> 已保存</span>;
}
