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
}: {
  blocks: BlockRecord[];
  pages: PageMeta[];
  modules: Module[];
  theme: Theme;
}) {
  const editor = useCreateBlockNote({
    schema: devforgeSchema,
    dictionary: zh,
    initialContent: blocks.length
      ? (wikiLinksToMarks(blocks, pages, modules) as unknown as PartialBlock[])
      : undefined,
  });

  return (
    <div className="public-editor-wrap">
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
