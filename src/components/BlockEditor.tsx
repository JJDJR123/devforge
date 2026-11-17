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
import { api, saveContentKeepalive } from '../api';
import type { BlockRecord, Page } from '../types';
import { extractPlainText, countTodos, getErrorMessage } from '../utils';
import { useToast } from './Toast';
import { useApp } from '../state/AppContext';
import { EmbedBlock } from './EmbedBlock';

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
  const { theme } = useApp();
  const [status, setStatus] = useState<SaveStatus>('saved');
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

  return (
    <div className="editor-wrap">
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
            ],
            query,
          )}
        />
      </BlockNoteView>
    </div>
  );
}
