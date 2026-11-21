import type { BlockRecord, Module, PageMeta } from './types';

const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g;

type Target = { kind: 'page' | 'module'; id: string; title: string };

function resolveTarget(raw: string, pages: PageMeta[], modules: Module[]): Target | null {
  const value = raw.trim();
  const moduleMatch = value.match(/^模块[:：]\s*(.+)$/);
  if (moduleMatch) {
    const title = moduleMatch[1].trim().toLowerCase();
    const found = modules.find((module) => module.title.trim().toLowerCase() === title);
    return found ? { kind: 'module', id: found.id, title: found.title } : null;
  }
  const found = pages.find((page) => page.title.trim().toLowerCase() === value.toLowerCase());
  return found ? { kind: 'page', id: found.id, title: found.title } : null;
}

function convertTextItem(
  item: Record<string, unknown>,
  pages: PageMeta[],
  modules: Module[],
): Record<string, unknown>[] {
  const text = typeof item.text === 'string' ? item.text : '';
  if (!text || !text.includes('[[')) return [item];
  const styles = item.styles && typeof item.styles === 'object' ? item.styles : {};

  const result: Record<string, unknown>[] = [];
  let cursor = 0;
  WIKI_LINK_RE.lastIndex = 0;
  let match;
  while ((match = WIKI_LINK_RE.exec(text)) !== null) {
    if (match.index > cursor) {
      result.push({ ...item, text: text.slice(cursor, match.index) });
    }
    const target = resolveTarget(match[1], pages, modules);
    if (target) {
      result.push({
        type: 'link',
        href: target.kind === 'module' ? `/module/${target.id}` : `/page/${target.id}`,
        content: [{ type: 'text', text: target.title, styles }],
      });
    } else {
      result.push({ ...item, text: match[0] });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) result.push({ ...item, text: text.slice(cursor) });
  return result.length ? result : [item];
}

function convertContent(
  content: unknown,
  pages: PageMeta[],
  modules: Module[],
): unknown {
  if (Array.isArray(content)) {
    return content.flatMap((item) => {
      if (!item || typeof item !== 'object') return [item];
      const record = item as Record<string, unknown>;
      if (record.type === 'text') return convertTextItem(record, pages, modules);
      return [record];
    });
  }
  return content;
}

function normalizeInlineItems(items: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      out.push({ type: 'text', text: item, styles: {} });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (record.type === 'text' || record.type === 'link') {
      out.push(record);
      continue;
    }
    if (typeof record.text === 'string') {
      out.push({ type: 'text', text: record.text, styles: record.styles || {} });
      continue;
    }
    out.push({ type: 'text', text: '[图片]', styles: {} });
  }
  return out.length ? out : [{ type: 'text', text: '', styles: {} }];
}

function normalizeTableCell(
  cell: unknown,
  pages: PageMeta[],
  modules: Module[],
): unknown[] {
  if (Array.isArray(cell)) {
    return normalizeInlineItems(convertContent(cell, pages, modules) as unknown[]);
  }
  if (typeof cell === 'string') {
    // Older imports occasionally stored PowerShell-style strings such as
    // "@{type=text; text=模块; styles=}" in table cells. Recover the text
    // instead of crashing BlockNote's table renderer.
    const match = cell.match(/(?:^|[;{]\s*)text=([^;}]*)/);
    return [{ type: 'text', text: (match?.[1] || cell).trim(), styles: {} }];
  }
  if (cell && typeof cell === 'object') {
    const record = cell as Record<string, unknown>;
    if (record.type === 'text' || record.type === 'link') return [record];
    if (typeof record.text === 'string') return [{ type: 'text', text: record.text, styles: {} }];
  }
  return [{ type: 'text', text: '[图片]', styles: {} }];
}

function convertBlock(block: BlockRecord, pages: PageMeta[], modules: Module[]): BlockRecord {
  if (!block || typeof block !== 'object') return block;
  if ((block as { type?: string }).type === 'codeBlock') return block;

  const next = { ...block } as Record<string, unknown>;
  if (Array.isArray(next.content)) {
    next.content = convertContent(next.content, pages, modules);
  } else if (next.content && typeof next.content === 'object') {
    const content = next.content as Record<string, unknown>;
    if (content.type === 'tableContent' && Array.isArray(content.rows)) {
      next.content = {
        ...content,
        rows: content.rows.map((row: unknown) => {
          const cells = (row as { cells?: unknown }).cells;
          if (!Array.isArray(cells)) return row;
          return {
            ...(row as Record<string, unknown>),
            cells: cells.map((cell) => normalizeTableCell(cell, pages, modules)),
          };
        }),
      };
    }
  }
  if (Array.isArray(next.children)) {
    next.children = (next.children as BlockRecord[]).map((child) => convertBlock(child, pages, modules));
  }
  return next as unknown as BlockRecord;
}

/** Turn literal [[wiki links]] into native BlockNote link marks for display. */
export function wikiLinksToMarks(
  blocks: BlockRecord[],
  pages: PageMeta[],
  modules: Module[],
): BlockRecord[] {
  return blocks.map((block) => convertBlock(block, pages, modules));
}
