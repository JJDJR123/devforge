import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { zh } from '@blocknote/core/locales';
import type { PartialBlock } from '@blocknote/core';
import type { BlockRecord, Module, PageMeta, Theme } from '../types';
import { devforgeSchema } from '../components/BlockEditor';
import { wikiLinksToMarks } from '../wikilinks';

export function PublicBlockEditor({
  blocks,
  pages,
  modules,
  theme,
  onLinkClick,
}: {
  blocks: BlockRecord[];
  pages: PageMeta[];
  modules: Module[];
  theme: Theme;
  onLinkClick?: (href: string) => void;
}) {
  const editor = useCreateBlockNote({
    schema: devforgeSchema,
    dictionary: zh,
    initialContent: blocks.length
      ? (wikiLinksToMarks(blocks, pages, modules) as unknown as PartialBlock[])
      : undefined,
  });

  return (
    <div
      className="public-editor-wrap"
      onClickCapture={(event) => {
        if (!onLinkClick) return;
        const target = event.target as HTMLElement;
        const anchor = target.closest<HTMLAnchorElement>('a[href^="/page/"], a[href^="/module/"]');
        if (!anchor || !anchor.closest('.public-editor')) return;
        event.preventDefault();
        event.stopPropagation();
        onLinkClick(anchor.getAttribute('href') || '');
      }}
      onDragStart={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('.bn-side-menu, .bn-drag-handle, [data-test="drag-handle"]')) return;
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) event.preventDefault();
      }}
    >
      <BlockNoteView
        editor={editor}
        editable={false}
        theme={theme.preset === 'paper' ? 'light' : 'dark'}
        className="devforge-editor public-editor"
        slashMenu={false}
        formattingToolbar={false}
        sideMenu={false}
        linkToolbar={false}
        filePanel={false}
        tableHandles={false}
        emojiPicker={false}
      />
    </div>
  );
}
