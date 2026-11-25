export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function getGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value || 0);
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '还没有记录';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(date);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function todayLabel(date = new Date()): string {
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date);
  const value = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
  return `${value} · ${weekday}`;
}

export function initials(name: string): string {
  const value = String(name || '').trim();
  if (!value) return 'D';
  return value.slice(0, 2).toUpperCase();
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return '出了点问题，请稍后再试。';
}

type InlineItem = {
  type?: string;
  text?: string;
  styles?: Record<string, boolean>;
  href?: string;
  content?: InlineItem[];
};

type AnyBlock = {
  type?: string;
  props?: Record<string, unknown>;
  content?: InlineItem[] | { type?: string; rows?: Array<{ cells?: InlineItem[][] }> } | string;
  children?: AnyBlock[];
};

export function extractPlainText(blocks: unknown): string {
  const out: string[] = [];
  const pushInline = (items: unknown) => {
    if (typeof items === 'string') {
      out.push(items);
      return;
    }
    if (!Array.isArray(items)) {
      if (items && typeof items === 'object' && typeof (items as { text?: unknown }).text === 'string') {
        out.push((items as { text: string }).text);
      }
      return;
    }
    for (const item of items) {
      if (item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string') {
        out.push((item as { text: string }).text);
      }
    }
  };
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      const block = raw as AnyBlock;
      if (!block || typeof block !== 'object') continue;
      if (Array.isArray(block.content)) {
        pushInline(block.content);
      } else if (block.content && typeof block.content === 'object') {
        const table = block.content as { type?: string; rows?: Array<{ cells?: unknown }> };
        if (table.type === 'tableContent' && Array.isArray(table.rows)) {
          for (const row of table.rows) {
            const cells = Array.isArray(row?.cells) ? row.cells : [];
            for (const cell of cells) {
              if (cell && typeof cell === 'object' && Array.isArray((cell as { content?: unknown }).content)) {
                pushInline((cell as { content: unknown }).content);
              } else {
                pushInline(cell);
              }
            }
          }
        }
      } else if (typeof block.content === 'string') {
        out.push(block.content);
      }
      if (Array.isArray(block.children)) walk(block.children);
    }
  };
  walk(blocks);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

export function totalChars(blocks: unknown): number {
  return extractPlainText(blocks).replace(/\s/g, '').length;
}

export function firstImageUrl(blocks: unknown): string | null {
  if (!Array.isArray(blocks)) return null;
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const record = block as { type?: string; props?: Record<string, unknown>; children?: unknown };
    if (record.type === 'image' && typeof record.props?.url === 'string') return record.props.url;
    const child = firstImageUrl(record.children);
    if (child) return child;
  }
  return null;
}

export function insertAtSelection(
  value: string,
  start: number,
  end: number,
  insert: string,
): { value: string; cursor: number } {
  const from = Math.max(0, Math.min(value.length, start));
  const to = Math.max(from, Math.min(value.length, end));
  return {
    value: `${value.slice(0, from)}${insert}${value.slice(to)}`,
    cursor: from + insert.length,
  };
}

export function moduleTreeStats(
  modules: Array<{ id: string; parentId: string | null }>,
  pages: Array<{ moduleId: string; chars: number; todoTotal: number; todoDone: number }>,
  rootId: string,
) {
  const children = new Map<string, string[]>();
  for (const module of modules) {
    if (!module.parentId) continue;
    const list = children.get(module.parentId) || [];
    list.push(module.id);
    children.set(module.parentId, list);
  }
  const pagesByModule = new Map<string, typeof pages>();
  for (const page of pages) {
    const list = pagesByModule.get(page.moduleId) || [];
    list.push(page);
    pagesByModule.set(page.moduleId, list);
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    stack.push(...(children.get(id) || []));
  }
  let pageCount = 0;
  let chars = 0;
  let todoTotal = 0;
  let todoDone = 0;
  for (const id of ids) {
    const list = pagesByModule.get(id) || [];
    pageCount += list.length;
    for (const page of list) {
      chars += page.chars;
      todoTotal += page.todoTotal;
      todoDone += page.todoDone;
    }
  }
  return {
    moduleCount: Math.max(0, ids.length - 1),
    pageCount,
    chars,
    todoTotal,
    todoDone,
  };
}

export function countTodos(blocks: unknown): { total: number; done: number } {
  let total = 0;
  let done = 0;
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      const block = raw as AnyBlock;
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'checkListItem') {
        total += 1;
        if (block.props?.checked === true) done += 1;
      }
      if (Array.isArray(block.children)) walk(block.children);
    }
  };
  walk(blocks);
  return { total, done };
}

function inlineMarkdown(content: InlineItem[] | undefined): string {
  if (!Array.isArray(content)) return '';
  return content.map((item) => {
    if (!item) return '';
    if (item.type === 'link' && item.href) {
      return `[${inlineMarkdown(item.content || [])}](${item.href})`;
    }
    let text = item.text || '';
    const styles = item.styles || {};
    if (styles.code) text = `\`${text}\``;
    if (styles.bold) text = `**${text}**`;
    if (styles.italic) text = `*${text}*`;
    if (styles.strike) text = `~~${text}~~`;
    return text;
  }).join('');
}

export function blocksToMarkdown(blocks: unknown): string {
  const lines: string[] = [];
  const walk = (list: unknown, depth = 0) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      const block = raw as AnyBlock;
      if (!block || typeof block !== 'object') continue;
      const indent = '  '.repeat(depth);
      const text = Array.isArray(block.content) ? inlineMarkdown(block.content) : '';
      switch (block.type) {
        case 'heading': {
          const level = Math.min(6, Math.max(1, Number(block.props?.level) || 1));
          lines.push(`${'#'.repeat(level)} ${text}`, '');
          break;
        }
        case 'bulletListItem':
          lines.push(`${indent}- ${text}`);
          break;
        case 'numberedListItem':
          lines.push(`${indent}1. ${text}`);
          break;
        case 'checkListItem':
          lines.push(`${indent}- [${block.props?.checked ? 'x' : ' '}] ${text}`);
          break;
        case 'quote':
          lines.push(`> ${text}`, '');
          break;
        case 'codeBlock':
          lines.push('```' + String(block.props?.language || ''), text, '```', '');
          break;
        case 'divider':
          lines.push('---', '');
          break;
        case 'image':
          lines.push(`![${String(block.props?.caption || block.props?.name || '图片')}](${String(block.props?.url || '')})`, '');
          break;
        case 'video':
          lines.push(`[视频](${String(block.props?.url || '')})`, '');
          break;
        case 'file':
          lines.push(`[文件：${String(block.props?.name || '附件')}](${String(block.props?.url || '')})`, '');
          break;
        case 'embed':
          lines.push(`[视频嵌入](${String(block.props?.url || '')})`, '');
          break;
        case 'audio':
          lines.push(`[音频](${String(block.props?.url || '')})`, '');
          break;
        case 'table': {
          const table = block.content as { rows?: Array<{ cells?: unknown }> } | undefined;
          const rows = Array.isArray(table?.rows) ? table.rows : [];
          if (rows.length) {
            const cells = rows.map((row) => {
              const rawCells = Array.isArray(row?.cells) ? row.cells : [];
              return rawCells.map((cell) => {
                const inline = Array.isArray(cell)
                  ? inlineMarkdown(cell as InlineItem[])
                  : typeof cell === 'string'
                    ? cell
                    : cell && typeof cell === 'object' && Array.isArray((cell as { content?: unknown }).content)
                      ? inlineMarkdown((cell as { content: InlineItem[] }).content)
                      : '';
                return inline.replace(/\|/g, '\\|');
              });
            });
            const width = Math.max(...cells.map((row) => row.length));
            const padded = cells.map((row) => [...row, ...Array(width - row.length).fill('')]);
            lines.push(`| ${padded[0].join(' | ')} |`);
            lines.push(`| ${Array(width).fill('---').join(' | ')} |`);
            for (const row of padded.slice(1)) lines.push(`| ${row.join(' | ')} |`);
            lines.push('');
          }
          break;
        }
        case 'paragraph':
        default:
          if (text) lines.push(text, '');
          break;
      }
      if (Array.isArray(block.children) && block.children.length) {
        walk(block.children, block.type === 'bulletListItem' || block.type === 'numberedListItem' ? depth + 1 : depth);
      }
    }
  };
  walk(blocks);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  // The Clipboard API only works in secure contexts (HTTPS/localhost) and can
  // still be denied by permission policy. Try it first, then fall back to the
  // legacy textarea copy so HTTP deployments and embedded browsers still work.
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      const permission = await navigator.permissions
        ?.query({ name: 'clipboard-write' as PermissionName })
        .catch(() => null);
      if (permission?.state !== 'denied') {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall through to the legacy path
    }
  }

  if (typeof document === 'undefined') return false;
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-9999px';
    area.style.left = '-9999px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.focus();
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function safeFilename(name: string): string {
  return String(name || 'page')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'page';
}

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}
