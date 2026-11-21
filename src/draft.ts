const DRAFT_PREFIX = 'devforge:draft:';

export type PageDraft = {
  at: number;
  blocks: unknown[];
};

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function key(pageId: string) {
  return `${DRAFT_PREFIX}${pageId}`;
}

/** 读取比服务端更新时间更新的本地草稿；旧草稿自动丢弃。 */
export function readPageDraft(pageId: string, serverUpdatedAt: string): PageDraft | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key(pageId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PageDraft;
    if (!parsed || !Array.isArray(parsed.blocks) || typeof parsed.at !== 'number') {
      store.removeItem(key(pageId));
      return null;
    }
    const serverTime = Date.parse(serverUpdatedAt || '');
    if (Number.isFinite(serverTime) && parsed.at <= serverTime) {
      store.removeItem(key(pageId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** 本地草稿是服务端保存失败/切页丢失时的最后一道兜底。 */
export function writePageDraft(pageId: string, blocks: unknown[]) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(key(pageId), JSON.stringify({ at: Date.now(), blocks }));
    return true;
  } catch {
    // 超出 localStorage 配额时不要影响编辑器本身。
    return false;
  }
}

export function clearPageDraft(pageId: string) {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key(pageId));
  } catch {
    // ignore
  }
}
