import { useEffect, useRef, useState } from 'react';
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { BlockNoteSchema, defaultBlockSpecs, filterSuggestionItems } from '@blocknote/core';
import { zh } from '@blocknote/core/locales';
import type { PartialBlock } from '@blocknote/core';
import { Link2 } from 'lucide-react';
import { api, saveContentKeepalive } from '../api';
import type { BlockRecord, Page } from '../types';
import { extractPlainText, countTodos, getErrorMessage } from '../utils';
import { clearPageDraft, readPageDraft, writePageDraft, type PageDraft } from '../draft';
import { useToast } from './Toast';
import { useApp } from '../state/AppContext';
import { EmbedBlock } from './EmbedBlock';
import { LinkPicker } from './LinkPicker';
import { WikiPreview } from './WikiPreview';
import { wikiLinksToMarks } from '../wikilinks';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

const TEXT_COLORS = [
  { value: 'default', label: '默认' },
  { value: 'gray', label: '灰色' },
  { value: 'brown', label: '棕色' },
  { value: 'red', label: '红色' },
  { value: 'orange', label: '橙色' },
  { value: 'yellow', label: '黄色' },
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
  { value: 'purple', label: '紫色' },
  { value: 'pink', label: '粉色' },
] as const;

const TEXT_COLOR_VALUES: Record<string, string> = {
  gray: '#9b9a97',
  brown: '#64473a',
  red: '#e03e3e',
  orange: '#d9730d',
  yellow: '#dfab01',
  green: '#4d6461',
  blue: '#0b6e99',
  purple: '#6940a5',
  pink: '#ad1a72',
};

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    embed: EmbedBlock(),
  },
});

export const devforgeSchema = schema;

export function BlockEditor({
  page,
  onSaved,
  onStatusChange,
  onDocumentChange,
  suppressUnmountSaveRef,
}: {
  page: Page;
  onSaved?: (updatedAt: string, chars: number, todoTotal: number, todoDone: number) => void;
  onStatusChange?: (status: SaveStatus) => void;
  onDocumentChange?: (blocks: BlockRecord[]) => void;
  suppressUnmountSaveRef?: { current: boolean };
}) {
  const { toast } = useToast();
  const { theme, data } = useApp();
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [previewHref, setPreviewHref] = useState<string | null>(null);
  const [activeTextColor, setActiveTextColor] = useState('default');
  const draftRef = useRef<PageDraft | null | undefined>(undefined);
  if (draftRef.current === undefined) {
    draftRef.current = readPageDraft(page.id, page.updatedAt);
  }
  const restoredDraft = draftRef.current;
  const initialBlocks = restoredDraft?.blocks ?? page.blocks;
  const latest = useRef<any[]>(initialBlocks);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorToastShown = useRef(false);
  const mounted = useRef(false);
  const pageIdRef = useRef(page.id);
  pageIdRef.current = page.id;

  const editor = useCreateBlockNote({
    schema,
    dictionary: zh,
    initialContent: initialBlocks.length
      ? (wikiLinksToMarks(initialBlocks as BlockRecord[], data?.pages || [], data?.modules || []) as unknown as PartialBlock[])
      : undefined,
    uploadFile: async (file: File) => {
      try {
        const result = await api.upload(file);
        return result.url;
      } catch (error) {
        toast(getErrorMessage(error), 'error');
        throw error;
      }
    },
  });

  function changeStatus(next: SaveStatus) {
    setStatus(next);
    onStatusChange?.(next);
  }

  function syncTextColor() {
    const color = editor.getActiveStyles().textColor;
    setActiveTextColor(typeof color === 'string' && color ? color : 'default');
  }

  function applyTextColor(color: string) {
    editor.focus();
    if (color === 'default') {
      editor.removeStyles({ textColor: 'default' } as never);
    } else {
      editor.addStyles({ textColor: color } as never);
    }
    syncTextColor();
  }

  function rememberDraft() {
    if (suppressUnmountSaveRef?.current) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      draftTimer.current = null;
      writePageDraft(pageIdRef.current, latest.current);
    }, 180);
  }

  async function saveNow() {
    if (suppressUnmountSaveRef?.current) return;
    if (!dirty.current) return;
    if (inFlight.current) {
      pending.current = true;
      return;
    }

    const snapshot = latest.current;
    inFlight.current = true;
    changeStatus('saving');
    try {
      const searchText = extractPlainText(snapshot);
      const todo = countTodos(snapshot);
      const result = await api.saveContent(pageIdRef.current, snapshot, searchText);
      if (latest.current === snapshot) {
        dirty.current = false;
        changeStatus('saved');
        clearPageDraft(pageIdRef.current);
        if (draftTimer.current) {
          clearTimeout(draftTimer.current);
          draftTimer.current = null;
        }
      } else {
        pending.current = true;
      }
      errorToastShown.current = false;
      onSaved?.(result.updatedAt, searchText.replace(/\s/g, '').length, todo.total, todo.done);
    } catch (error) {
      // 保存失败时先落本地草稿，下一步不会再因为切页/刷新而丢。
      writePageDraft(pageIdRef.current, snapshot);
      changeStatus('error');
      if (!errorToastShown.current) {
        errorToastShown.current = true;
        toast(`保存失败，内容已暂存在本机：${getErrorMessage(error)}`, 'error');
      }
    } finally {
      inFlight.current = false;
      if (pending.current) {
        pending.current = false;
        void saveNow();
      }
    }
  }

  function scheduleSave() {
    if (timer.current) clearTimeout(timer.current);
    changeStatus('dirty');
    timer.current = setTimeout(() => { void saveNow(); }, 700);
  }

  useEffect(() => {
    mounted.current = true;
    const handlePageHide = () => {
      if (!dirty.current || suppressUnmountSaveRef?.current) return;
      try {
        writePageDraft(pageIdRef.current, latest.current);
        saveContentKeepalive(
          pageIdRef.current,
          latest.current,
          extractPlainText(latest.current),
        );
      } catch (error) {
        console.error('DEVFORGE pagehide save failed', error);
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      if (timer.current) clearTimeout(timer.current);
      if (draftTimer.current) clearTimeout(draftTimer.current);
      if (dirty.current && !suppressUnmountSaveRef?.current) {
        try {
          writePageDraft(pageIdRef.current, latest.current);
          saveContentKeepalive(
            pageIdRef.current,
            latest.current,
            extractPlainText(latest.current),
          );
        } catch (error) {
          console.error('DEVFORGE unmount save failed', error);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!restoredDraft) return;
    dirty.current = true;
    changeStatus('dirty');
    toast('已恢复上次未保存的本地草稿，正在重新保存。', 'success');
    timer.current = setTimeout(() => { void saveNow(); }, 500);
    // restoredDraft 只在挂载时读取一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  function insertEmbedItem() {
    return {
      title: '视频嵌入',
      subtext: 'B 站 / YouTube / Vimeo / MP4',
      aliases: ['video', 'embed', 'bilibili', 'youtube', 'vimeo', '视频', '嵌入', '链接'],
      group: '媒体',
      onItemClick: () => {
        const current = editor.getTextCursorPosition().block;
        editor.insertBlocks(
          [{ type: 'embed', props: { url: '' } } as never],
          current,
          'after',
        );
      },
    };
  }

  function insertWikiLinkItem() {
    return {
      title: '关联笔记',
      subtext: '搜索页面或模块，插入双链',
      aliases: ['link', 'wiki', '关联', '双链', '页面', '模块', '链接'],
      group: '关联',
      onItemClick: () => {
        setLinkPickerOpen(true);
      },
    };
  }

  function insertWikiLink(kind: 'page' | 'module', id: string, title: string) {
    const href = kind === 'module' ? `/module/${id}` : `/page/${id}`;
    const inline = {
      type: 'link',
      href,
      content: [{ type: 'text', text: title, styles: {} }],
    } as never;
    setLinkPickerOpen(false);
    try {
      editor.insertInlineContent([inline]);
      editor.focus();
    } catch {
      try {
        const fallbackBlock = {
          type: 'paragraph',
          content: [inline],
        } as never;
        if (editor.document.length) {
          editor.insertBlocks([fallbackBlock], editor.document[editor.document.length - 1], 'after');
        } else {
          editor.replaceBlocks(editor.document, [fallbackBlock]);
        }
        editor.focus();
      } catch {
        toast('先把光标放到正文里，再点「关联笔记」。', 'error');
      }
    }
  }

  return (
    <div
      className="editor-wrap"
      onClickCapture={(event) => {
        const target = event.target as HTMLElement;
        const anchor = target.closest<HTMLAnchorElement>('a[href^="/page/"], a[href^="/module/"]');
        if (!anchor || !anchor.closest('.devforge-editor')) return;
        event.preventDefault();
        event.stopPropagation();
        setPreviewHref(anchor.getAttribute('href') || null);
      }}
      onDragStart={(event) => {
        // Edge's "Super Drag Drop" opens a search tab when selected text is
        // dragged. BlockNote's block handle must keep working, but dragging a
        // text selection inside the editor should not leave the page.
        const target = event.target as HTMLElement;
        if (target.closest('.bn-side-menu, .bn-drag-handle, [data-test="drag-handle"]')) return;
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) event.preventDefault();
      }}
    >
      <div className="editor-link-bar">
        <button type="button" className="editor-link-launch" onClick={() => setLinkPickerOpen(true)}>
          <Link2 size={14} /> 关联笔记
        </button>
        <span>搜索页面或模块，选中后插入到光标</span>
        <div className="editor-color-picker" role="group" aria-label="文字颜色">
          <span className="editor-color-label">文字颜色</span>
          {TEXT_COLORS.map((color) => {
            const swatch = TEXT_COLOR_VALUES[color.value];
            return (
              <button
                key={color.value}
                type="button"
                className={`editor-color-swatch${activeTextColor === color.value ? ' is-active' : ''}${color.value === 'default' ? ' is-default' : ''}`}
                style={swatch ? { backgroundColor: swatch } : undefined}
                title={color.label}
                aria-label={`文字颜色：${color.label}`}
                aria-pressed={activeTextColor === color.value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyTextColor(color.value)}
              />
            );
          })}
        </div>
      </div>
      <BlockNoteView
        editor={editor}
        theme={theme.preset === 'paper' ? 'light' : 'dark'}
        className="devforge-editor"
        slashMenu={false}
        formattingToolbar
        sideMenu
        linkToolbar
        filePanel
        tableHandles
        emojiPicker={false}
        onSelectionChange={syncTextColor}
        onChange={(instance) => {
          latest.current = instance.document;
          onDocumentChange?.(instance.document as unknown as BlockRecord[]);
          if (!mounted.current) return;
          dirty.current = true;
          rememberDraft();
          scheduleSave();
        }}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => filterSuggestionItems(
            [
              ...getDefaultReactSlashMenuItems(editor),
              insertEmbedItem(),
              insertWikiLinkItem(),
            ],
            query,
          )}
        />
      </BlockNoteView>
      <LinkPicker
        open={linkPickerOpen}
        pages={data?.pages || []}
        modules={data?.modules || []}
        currentPageId={page.id}
        currentModuleId={page.moduleId}
        onClose={() => setLinkPickerOpen(false)}
        onSelect={insertWikiLink}
      />
      <WikiPreview
        href={previewHref}
        mode="admin"
        pages={data?.pages || []}
        modules={data?.modules || []}
        theme={theme}
        onClose={() => setPreviewHref(null)}
      />
    </div>
  );
}
