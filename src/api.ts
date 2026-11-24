import type {
  AuthStatus,
  AIChatResponse,
  AIConversation,
  AIMessage,
  AIStatus,
  AssetPurpose,
  AssetsDeleteResult,
  AssetsResponse,
  BlockRecord,
  Bootstrap,
  Breadcrumb,
  MemberAsset,
  MemberKbDoc,
  ChatMessage,
  Suggestion,
  InviteCode,
  Module,
  Page,
  PageLinks,
  PageMeta,
  PublicBootstrap,
  RegistrationRequest,
  SearchResult,
  SiteSettings,
  Theme,
  UploadResult,
  User,
} from './types';
import { compressImageForUpload } from './imageCompression';

export const UNAUTHORIZED_EVENT = 'devforge:unauthorized';

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown };

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 0, code = 'UNKNOWN') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  let body = options.body;
  if (body !== undefined && body !== null && !(body instanceof FormData) && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      body: body as BodyInit | undefined,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('网络连接失败，请检查网络后重试。', 0, 'NETWORK_ERROR');
  }

  if (response.status === 401 && !path.startsWith('/api/auth/')) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  if (!response.ok) {
    let message = '请求失败，请稍后再试。';
    let code = 'REQUEST_FAILED';
    try {
      const data = await response.json() as { error?: string; message?: string };
      message = data.message || message;
      code = data.error || code;
    } catch {
      // Non-JSON failures (proxy, HTML error page) keep the generic message.
    }
    throw new ApiError(message, response.status, code);
  }

  if (response.status === 204) return undefined as T;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) return (await response.text()) as unknown as T;
  return response.json() as Promise<T>;
}

export const api = {
  status: () => request<AuthStatus>('/api/auth/status'),

  setup: (input: { token: string; username: string; password: string }) =>
    request<{ user: User; setupRequired: boolean }>('/api/auth/setup', {
      method: 'POST',
      body: input,
    }),

  login: (input: { username: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', { method: 'POST', body: input }),

  register: (input: { username: string; password: string; reason?: string; contact?: string; website?: string; inviteCode?: string }) =>
    request<{ ok: true; message: string; activated?: boolean; user?: User }>('/api/register', { method: 'POST', body: input }),

  chatMessages: () => request<{ messages: ChatMessage[] }>('/api/chat/messages'),

  sendChatMessage: (body: string) =>
    request<{ message: ChatMessage }>('/api/chat/messages', { method: 'POST', body: { body } }),

  mailboxMine: () => request<{ messages: Suggestion[] }>('/api/mailbox/mine'),

  sendSuggestion: (body: string) =>
    request<{ message: Suggestion }>('/api/mailbox', { method: 'POST', body: { body } }),

  adminMailbox: (status = '') =>
    request<{ messages: Suggestion[] }>(`/api/admin/mailbox?status=${encodeURIComponent(status)}`),

  markSuggestionRead: (id: string) =>
    request<{ ok: true }>(`/api/admin/mailbox/${encodeURIComponent(id)}/read`, { method: 'POST', body: {} }),

  replySuggestion: (id: string, body: string) =>
    request<{ message: Suggestion }>(`/api/admin/mailbox/${encodeURIComponent(id)}/reply`, {
      method: 'POST',
      body: { body },
    }),

  invites: () => request<{ codes: InviteCode[] }>('/api/admin/invites'),

  generateInvites: (count = 10) =>
    request<{ codes: InviteCode[] }>('/api/admin/invites', { method: 'POST', body: { count } }),

  registrations: (status = 'pending') =>
    request<{ requests: RegistrationRequest[] }>(`/api/admin/registrations?status=${encodeURIComponent(status)}`),

  approveRegistration: (id: string) =>
    request<{ ok: true; user: User }>(`/api/admin/registrations/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: {},
    }),

  rejectRegistration: (id: string) =>
    request<{ ok: true }>(`/api/admin/registrations/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: {},
    }),

  memberKb: (q = '') =>
    request<{ docs: MemberKbDoc[] }>(`/api/member/kb?q=${encodeURIComponent(q)}`),

  memberAssets: () =>
    request<{ assets: MemberAsset[] }>('/api/member/assets'),

  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST', body: {} }),

  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    request<{ ok: true }>('/api/auth/password', { method: 'POST', body: input }),

  updateAccount: (input: { username: string; currentPassword: string }) =>
    request<{ user: User }>('/api/auth/account', { method: 'PATCH', body: input }),

  updateSite: (input: SiteSettings) =>
    request<{ site: SiteSettings }>('/api/settings/site', { method: 'PUT', body: input }),

  bootstrap: () => request<Bootstrap>('/api/bootstrap'),

  aiStatus: () => request<AIStatus>('/api/ai/status'),

  setAIModel: (model: string) =>
    request<AIStatus>('/api/ai/model', { method: 'PUT', body: { model } }),

  aiConversations: () => request<{ conversations: AIConversation[] }>('/api/ai/conversations'),

  aiConversation: (id: string) =>
    request<{ conversation: AIConversation; messages: AIMessage[] }>(
      `/api/ai/conversations/${encodeURIComponent(id)}`,
    ),

  deleteAIConversation: (id: string) =>
    request<{ ok: boolean }>(`/api/ai/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  aiChat: (input: { message: string; pageId?: string | null; conversationId?: string | null }) =>
    request<AIChatResponse>('/api/ai/chat', { method: 'POST', body: input }),

  publicBootstrap: () => request<PublicBootstrap>('/api/public/bootstrap'),

  publicPage: (id: string) =>
    request<{ page: Page; breadcrumb: Breadcrumb }>(`/api/public/pages/${encodeURIComponent(id)}`),

  publicPageLinks: (id: string) =>
    request<PageLinks>(`/api/public/pages/${encodeURIComponent(id)}/links`),

  publicSearch: (q: string) =>
    request<{ query: string; results: SearchResult[] }>(`/api/public/search?q=${encodeURIComponent(q)}`),

  getPage: (id: string) =>
    request<{ page: Page; breadcrumb: Breadcrumb }>(`/api/pages/${encodeURIComponent(id)}`),

  pageLinks: (id: string) =>
    request<PageLinks>(`/api/pages/${encodeURIComponent(id)}/links`),

  createPage: (input: { moduleId: string; parentId?: string | null; title?: string; icon?: string }) =>
    request<{ page: Page }>('/api/pages', { method: 'POST', body: input }),

  updatePageMeta: (id: string, input: { title?: string; icon?: string }) =>
    request<{ page: PageMeta }>(`/api/pages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
    }),

  deletePage: (id: string) =>
    request<{ ok: true }>(`/api/pages/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  saveContent: (id: string, blocks: BlockRecord[] | unknown[], searchText: string) =>
    request<{ ok: true; updatedAt: string; todoTotal: number; todoDone: number }>(
      `/api/pages/${encodeURIComponent(id)}/content`,
      {
        method: 'PUT',
        body: { blocks, searchText },
      },
    ),

  createModule: (input: { title: string; icon: string; iconUrl?: string; accent: string; isPublic?: boolean; parentId?: string | null }) =>
    request<{ module: Module }>('/api/modules', { method: 'POST', body: input }),

  updateModule: (id: string, input: { title?: string; icon?: string; iconUrl?: string; accent?: string; isPublic?: boolean; parentId?: string | null }) =>
    request<{ module: Module }>(`/api/modules/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
    }),

  deleteModule: (id: string) =>
    request<{ ok: true; deletedPages: number; deletedModules?: number }>(`/api/modules/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  reorderModules: (ids: string[]) =>
    request<{ ok: true; modules: Module[] }>('/api/modules/reorder', {
      method: 'POST',
      body: { ids },
    }),

  reorderPages: (input: { ids: string[]; moduleId: string; parentId?: string | null }) =>
    request<{ ok: true }>('/api/pages/reorder', { method: 'POST', body: input }),

  saveTheme: (theme: Theme) =>
    request<{ theme: Theme }>('/api/settings/theme', { method: 'PUT', body: { theme } }),

  search: (q: string) =>
    request<{ query: string; results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`),

  upload: async (file: File, purpose: AssetPurpose = 'note') => {
    const prepared = await compressImageForUpload(file);
    const form = new FormData();
    form.append('file', prepared);
    return request<UploadResult>(`/api/uploads?purpose=${encodeURIComponent(purpose)}`, { method: 'POST', body: form });
  },

  assets: () => request<AssetsResponse>('/api/assets'),

  deleteAssets: (ids: string[]) =>
    request<AssetsDeleteResult>('/api/assets/delete', { method: 'POST', body: { ids } }),

  downloadExport: async () => {
    const response = await fetch('/api/export', { credentials: 'include' });
    if (!response.ok) throw new ApiError('导出失败，请稍后再试。', response.status, 'EXPORT_FAILED');
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    const filename = match?.[1] || `devforge-export-${new Date().toISOString().slice(0, 10)}.json`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  },
};

export function saveContentKeepalive(id: string, blocks: unknown[], searchText: string) {
  try {
    fetch(`/api/pages/${encodeURIComponent(id)}/content`, {
      method: 'PUT',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks, searchText }),
    });
  } catch {
    // Best effort on page unload.
  }
}

export function saveMetaKeepalive(id: string, title: string, icon?: string) {
  try {
    fetch(`/api/pages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, ...(icon ? { icon } : {}) }),
    });
  } catch {
    // Best effort on page unload.
  }
}

/* ------------------------------------------------------------------ */
/* AI 知识库                                                            */
/* ------------------------------------------------------------------ */

export type KbListParams = { status?: string; kind?: string; q?: string; limit?: number };

export const kbApi = {
  list: (params: KbListParams = {}) => {
    const search = new URLSearchParams();
    if (params.status) search.set('status', params.status);
    if (params.kind) search.set('kind', params.kind);
    if (params.q) search.set('q', params.q);
    if (params.limit) search.set('limit', String(params.limit));
    const qs = search.toString();
    return request<{ docs: import('./types').KbDoc[]; stats: import('./types').KbStats; kinds: string[]; statuses: string[] }>(
      `/api/kb${qs ? `?${qs}` : ''}`,
    );
  },
  get: (id: string) => request<{ doc: import('./types').KbDoc }>(`/api/kb/${encodeURIComponent(id)}`),
  create: (input: Partial<import('./types').KbDoc> & { title: string }) =>
    request<{ doc: import('./types').KbDoc }>('/api/kb', { method: 'POST', body: input }),
  update: (id: string, input: Partial<import('./types').KbDoc>) =>
    request<{ doc: import('./types').KbDoc }>(`/api/kb/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),
  setStatus: (id: string, status: string) =>
    request<{ doc: import('./types').KbDoc }>(`/api/kb/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: { status },
    }),
  remove: (id: string) =>
    request<{ ok: true }>(`/api/kb/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  stats: () => request<{ stats: import('./types').KbStats }>('/api/kb/stats'),
  token: () => request<{ token: string }>('/api/kb/token'),
  rotateToken: () => request<{ token: string }>('/api/kb/token', { method: 'POST', body: {} }),
  search: (q: string, kind = '', limit = 8) =>
    request<{ query: string; results: import('./types').KbSearchHit[] }>(
      `/api/kb/search?q=${encodeURIComponent(q)}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}&limit=${limit}`,
    ),
};
