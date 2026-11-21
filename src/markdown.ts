import type { BlockRecord } from './types';

type Inline = {
  type: 'text' | 'link';
  text?: string;
  href?: string;
  styles?: Record<string, unknown>;
  content?: Inline[];
};

type ImportedBlock = BlockRecord;

const TEXT_STYLES = {} as const;

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `md-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function block(type: string, props: Record<string, unknown> = {}, content?: unknown, children?: ImportedBlock[]): ImportedBlock {
  return {
    id: makeId(),
    type,
    props,
    ...(content !== undefined ? { content } : {}),
    ...(children?.length ? { children } : {}),
  };
}

function text(value: string, styles: Record<string, unknown> = TEXT_STYLES): Inline {
  return { type: 'text', text: value, styles: { ...styles } };
}

export function parseInlineMarkdown(value: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|~~[^~]+~~|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const pushText = (raw: string) => {
    if (!raw) return;
    out.push(text(raw));
  };
  while ((match = pattern.exec(value))) {
    pushText(value.slice(last, match.index));
    const token = match[0];
    if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      out.push(text(token.slice(2, -2), { bold: true }));
    } else if (token.startsWith('`') && token.endsWith('`')) {
      out.push(text(token.slice(1, -1), { code: true }));
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      out.push(text(token.slice(2, -2), { strike: true }));
    } else if (token.startsWith('*') && token.endsWith('*')) {
      out.push(text(token.slice(1, -1), { italic: true }));
    } else if (token.startsWith('_') && token.endsWith('_')) {
      out.push(text(token.slice(1, -1), { italic: true }));
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        out.push({ type: 'link', href: link[2].trim(), content: [text(link[1])] });
      } else {
        out.push(text(token));
      }
    }
    last = pattern.lastIndex;
  }
  pushText(value.slice(last));
  return out.length ? out : [text('')];
}

function plainInline(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function imageBlock(line: string): ImportedBlock | null {
  const match = line.match(/^\s*!\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)\s*$/);
  if (!match) return null;
  return block('image', { url: match[2], caption: match[1] || '图片', name: match[1] || '图片' });
}

function isDivider(line: string) {
  return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

function isFence(line: string) {
  return /^\s*(```|~~~)(.*)$/.test(line);
}

function isHeading(line: string) {
  return /^\s{0,3}#{1,6}\s+/.test(line);
}

function isQuote(line: string) {
  return /^\s{0,3}>\s?/.test(line);
}

function isListItem(line: string) {
  return /^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line);
}

function isTableStart(lines: string[], index: number) {
  if (index + 1 >= lines.length) return false;
  if (!/^\s*\|?.+\|.+\|?\s*$/.test(lines[index])) return false;
  const cells = splitTableRow(lines[index + 1]);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitTableRow(line: string): string[] {
  let value = line.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|')) value = value.slice(0, -1);
  return value.split('|').map((cell) => cell.trim());
}

function tableBlock(lines: string[], start: number): { block: ImportedBlock; next: number } | null {
  const header = splitTableRow(lines[start]);
  const rows: Inline[][][] = [header.map((cell) => parseInlineMarkdown(cell))];
  let index = start + 2;
  while (index < lines.length && /^\s*\|?.+\|.+\|?\s*$/.test(lines[index])) {
    rows.push(splitTableRow(lines[index]).map((cell) => parseInlineMarkdown(cell)));
    index += 1;
  }
  if (!rows.length) return null;
  return {
    block: block('table', {}, { type: 'tableContent', rows: rows.map((cells) => ({ cells })) }),
    next: index,
  };
}

/**
 * 把常见 Markdown 转成 BlockNote 的 block 结构。
 * 支持标题、段落、列表、任务列表、引用、代码块、分割线、图片、表格、基础行内样式。
 */
export function markdownToBlocks(markdown: string, fallbackTitle = '导入的笔记'): {
  title: string;
  blocks: ImportedBlock[];
} {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  let index = 0;
  let title = '';
  let titleConsumed = false;

  // YAML front matter：跳过，但允许 title 作为页面标题。
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
    if (end > 0) {
      for (const line of lines.slice(1, end)) {
        const match = line.match(/^title\s*:\s*(.+)$/i);
        if (match) title = match[1].replace(/^['"]|['"]$/g, '').trim();
      }
      index = end + 1;
    }
  }

  const blocks: ImportedBlock[] = [];
  let listStack: Array<{ indent: number; block: ImportedBlock }> = [];

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      listStack = [];
      index += 1;
      continue;
    }

    // fenced code
    const fence = line.match(/^\s*(```|~~~)\s*([\w-]*)\s*$/);
    if (fence) {
      const marker = fence[1];
      const language = fence[2] || 'text';
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].match(new RegExp(`^\\s*${marker}\\s*$`))) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      listStack = [];
      blocks.push(block('codeBlock', { language }, parseInlineMarkdown(code.join('\n'))));
      continue;
    }

    // heading
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(6, heading[1].length);
      const headingText = heading[2].replace(/\s+#+\s*$/, '').trim();
      listStack = [];
      if (level === 1 && !titleConsumed) {
        titleConsumed = true;
        title = title || plainInline(headingText);
        index += 1;
        continue;
      }
      blocks.push(block('heading', { level }, parseInlineMarkdown(headingText)));
      index += 1;
      continue;
    }

    // horizontal rule
    if (isDivider(line)) {
      listStack = [];
      blocks.push(block('divider'));
      index += 1;
      continue;
    }

    // image
    const image = imageBlock(line);
    if (image) {
      listStack = [];
      blocks.push(image);
      index += 1;
      continue;
    }

    // table
    if (isTableStart(lines, index)) {
      const table = tableBlock(lines, index);
      if (table) {
        listStack = [];
        blocks.push(table.block);
        index = table.next;
        continue;
      }
    }

    // blockquote：把连续引用合成一段
    if (isQuote(line)) {
      listStack = [];
      const quoteLines: string[] = [];
      while (index < lines.length && isQuote(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s{0,3}>\s?/, ''));
        index += 1;
      }
      blocks.push(block('quote', {}, parseInlineMarkdown(quoteLines.join('\n'))));
      continue;
    }

    // lists
    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (listMatch) {
      const indent = listMatch[1].replace(/\t/g, '    ').length;
      const marker = listMatch[2];
      let content = listMatch[3];
      let checklist: boolean | null = null;
      const check = content.match(/^\[([ xX])\]\s+(.*)$/);
      if (check) {
        checklist = check[1].toLowerCase() === 'x';
        content = check[2];
      }
      const type = checklist !== null ? 'checkListItem' : /^\d/.test(marker) ? 'numberedListItem' : 'bulletListItem';
      const item = block(type, checklist !== null ? { checked: checklist } : {}, parseInlineMarkdown(content));
      while (listStack.length && indent <= listStack[listStack.length - 1].indent) listStack.pop();
      const parent = listStack[listStack.length - 1]?.block;
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(item);
      } else {
        blocks.push(item);
      }
      listStack.push({ indent, block: item });
      index += 1;
      continue;
    }

    // paragraph：一直收集到空行或另一个块
    listStack = [];
    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length) {
      const next = lines[index];
      if (!next.trim() || isFence(next) || isHeading(next) || isDivider(next) || isQuote(next) || isListItem(next) || imageBlock(next) || isTableStart(lines, index)) {
        break;
      }
      paragraph.push(next.trim());
      index += 1;
    }
    const paragraphText = paragraph.join(' ');
    if (paragraphText) blocks.push(block('paragraph', {}, parseInlineMarkdown(paragraphText)));
  }

  if (!blocks.length) blocks.push(block('paragraph', {}, [text('')]));

  return {
    title: (title || fallbackTitle || '导入的笔记').slice(0, 160),
    blocks,
  };
}
