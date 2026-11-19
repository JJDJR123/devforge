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
import { useToast } from './Toast';
import { useApp } from '../state/AppContext';
import { EmbedBlock } from './EmbedBlock';
import { LinkPicker } from './LinkPicker';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

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
}: {
  page: Page;
  onSaved?: (updatedAt: string, chars: number, todoTotal: number, todoDone: number) => void;
  onStatusChange?: (status: SaveStatus) => void;
  onDocumentChange?: (blocks: BlockRecord[]) => void;
}) {
  const { toast } = useToast();
  const { theme, data } = useApp();
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const latest = useRef<any[]>(page.blocks);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const pageIdRef = useRef(page.id);
  pageIdRef.current = page.id;

  const editor = useCreateBlockNote({
    schema,
    dictionary: zh,
    initialContent: page.blocks.length ? (page.blocks as unknown as PartialBlock[]) : undefined,
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

  async function saveNow() {
    if (!dirty.current) return;
    if (inFlight.current) {
      pending.current = true;
      return;
    }

    const snapshot = latest.current;
    const searchText = extractPlainText(snapshot);
    const todo = countTodos(snapshot);
    inFlight.current = true;
    changeStatus('saving');
    try {
      const result = await api.saveContent(pageIdRef.current, snapshot, searchText);
      if (latest.current === snapshot) {
        dirty.current = false;
        changeStatus('saved');
      } else {
        pending.current = true;
      }
      onSaved?.(result.updatedAt, searchText.replace(/\s/g, '').length, todo.total, todo.done);
    } catch {
      changeStatus('error');
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
      if (!dirty.current) return;
      saveContentKeepalive(
        pageIdRef.current,
        latest.current,
        extractPlainText(latest.current),
      );
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current) {
        saveContentKeepalive(
          pageIdRef.current,
          latest.current,
          extractPlainText(latest.current),
        );
      }
    };
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

  function insertWikiLink(kind: 'page' | 'module', title: string) {
    const text = kind === 'module' ? `[[模块:${title}]]` : `[[${title}]]`;
    setLinkPickerOpen(false);
    try {
      editor.insertInlineContent([{ type: 'text', text, styles: {} }]);
      editor.focus();
    } catch {
      try {
        const fallbackBlock = {
          type: 'paragraph',
          content: [{ type: 'text', text, styles: {} }],
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
    <div className="editor-wrap">
      <div className="editor-link-bar">
        <button type="button" className="editor-link-launch" onClick={() => setLinkPickerOpen(true)}>
          <Link2 size={14} /> 关联笔记
        </button>
        <span>搜索页面或模块，选中后插入到光标</span>
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
        onChange={(instance) => {
          latest.current = instance.document;
          onDocumentChange?.(instance.document as unknown as BlockRecord[]);
          if (!mounted.current) return;
          dirty.current = true;
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
    </div>
  );
}
