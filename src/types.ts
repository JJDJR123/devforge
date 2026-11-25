export type User = {
  id: string;
  username: string;
  role: 'admin' | 'reader';
};

export type AdminUser = {
  id: string;
  username: string;
  role: 'admin' | 'reader';
  status: 'active' | 'suspended';
  note: string;
  createdAt: string;
};

export type PortfolioItem = {
  id: string;
  title: string;
  description: string;
  originalName: string;
  mime: string;
  size: number;
  visible: boolean;
  createdAt: string;
  downloadUrl: string;
  previewUrl: string | null;
};

export type RegistrationRequest = {
  id: string;
  username: string;
  reason: string;
  contact: string;
  status: 'pending' | 'approved' | 'rejected';
  ip: string;
  userAgent: string;
  createdAt: string;
  reviewedAt: string | null;
};

export type MemberKbDoc = {
  id: string;
  title: string;
  kind: string;
  summary: string;
  bodyMd: string;
  tool: string;
  prompt: string;
  tags: string[];
  updatedAt: string;
};

export type MemberAsset = {
  id: string;
  url: string;
  name: string;
  mime: string;
  size: number;
  pageTitle: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  userId: string;
  username: string;
  role: 'admin' | 'reader';
  body: string;
  createdAt: string;
  note?: string;
};

export type Suggestion = {
  id: string;
  userId: string;
  username: string;
  body: string;
  status: 'unread' | 'read';
  createdAt: string;
  readAt: string | null;
  reply: string;
  repliedAt: string | null;
  repliedBy: string | null;
};

export type InviteCode = {
  id: string;
  code: string;
  createdAt: string;
  usedAt: string | null;
  usedBy: string | null;
  used: boolean;
};

export type FriendUser = {
  id: string;
  username: string;
  role: 'admin' | 'reader';
  status: 'active' | 'suspended';
  note: string;
};

export type FriendItem = {
  friendshipId: string;
  user: FriendUser;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type FriendData = {
  friends: FriendItem[];
  incoming: FriendItem[];
  outgoing: FriendItem[];
  blocked: FriendItem[];
};

export type DmAttachment = {
  id: string;
  url: string;
  name: string;
  mime: string;
  size: number;
  cleared: boolean;
};

export type DmMessage = {
  id: string;
  conversationKey: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  attachment: DmAttachment | null;
  attachmentCleared: boolean;
};

export type DmConversation = {
  key: string;
  user: FriendUser;
  lastMessage: string;
  lastAt: string;
  unread: number;
};

export type AdminDmConversation = {
  key: string;
  users: FriendUser[];
  lastMessage: string;
  lastAt: string;
};

export type AIStatus = {
  configured: boolean;
  model: string;
  models: string[];
  provider: string;
};

export type AISource = {
  id: string;
  title: string;
  icon: string;
  type?: 'page' | 'kb';
};

export type AIConversation = {
  id: string;
  title: string;
  pageId: string | null;
  summary: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AIMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  sources: AISource[];
  createdAt: string;
};

export type AIChatResponse = {
  conversationId: string;
  answer: string;
  sources: AISource[];
  model?: string;
  summary?: string;
};

export type Theme = {
  preset: string;
  accent: string;
  radius: number;
  fontScale: number;
  density: 'comfortable' | 'compact';
};

export type SiteSettings = {
  name: string;
  tagline: string;
  logoUrl: string;
};

export type Module = {
  id: string;
  parentId: string | null;
  title: string;
  icon: string;
  iconUrl: string;
  accent: string;
  isPublic: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PageMeta = {
  id: string;
  moduleId: string;
  parentId: string | null;
  title: string;
  icon: string;
  sortOrder: number;
  chars: number;
  todoTotal: number;
  todoDone: number;
  createdAt: string;
  updatedAt: string;
};

export type BlockRecord = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content?: unknown;
  children?: BlockRecord[];
};

export type Page = PageMeta & {
  blocks: BlockRecord[];
};

export type PageLink = {
  id: string;
  targetPageId: string | null;
  targetModuleId: string | null;
  targetType: 'page' | 'module' | 'unresolved';
  targetTitle: string;
  rawTitle: string;
  alias: string | null;
  icon: string;
  resolved: boolean;
  context: string;
};

export type PageBacklink = {
  id: string;
  sourcePageId: string;
  sourceTitle: string;
  icon: string;
  alias: string | null;
  context: string;
};

export type PageLinks = {
  outgoing: PageLink[];
  backlinks: PageBacklink[];
};

export type Breadcrumb = {
  module: { id: string; title: string; icon: string; iconUrl?: string } | null;
  moduleChain?: { id: string; title: string; icon: string; iconUrl?: string }[];
  pages: { id: string; title: string; icon: string }[];
};

export type Bootstrap = {
  user: User;
  site: SiteSettings;
  theme: Theme;
  modules: Module[];
  pages: PageMeta[];
  recent: PageMeta[];
  stats: {
    moduleCount: number;
    pageCount: number;
    chars: number;
    todoTotal: number;
    todoDone: number;
    updatedAt: string | null;
  };
  system: {
    version: string;
    databaseBytes: number;
    setupComplete: boolean;
    icp: {
      number: string;
      link: string;
    };
  };
};

export type AuthStatus = {
  setupRequired: boolean;
  authenticated: boolean;
  user: User | null;
  icp?: {
    number: string;
    link: string;
  };
};

export type PublicBootstrap = {
  site: SiteSettings;
  theme: Theme;
  modules: Module[];
  pages: PageMeta[];
  recent: PageMeta[];
  stats: {
    moduleCount: number;
    pageCount: number;
    chars: number;
    todoTotal: number;
    todoDone: number;
    updatedAt: string | null;
  };
  icp?: {
    number: string;
    link: string;
  };
};

export type SearchResult = {
  id: string;
  moduleId: string;
  parentId: string | null;
  title: string;
  icon: string;
  updatedAt: string;
  snippet: string;
  titleMatch: boolean;
};

export type UploadResult = {
  id: string;
  url: string;
  name: string;
  mime: string;
  size: number;
  purpose?: AssetPurpose;
};

export type AssetPurpose = 'note' | 'module_icon' | 'site_logo' | 'unknown';
export type AssetCategory = 'note' | 'module_icon' | 'site_logo' | 'orphan';

export type AssetItem = {
  id: string;
  url: string;
  name: string;
  mime: string;
  size: number;
  purpose: AssetPurpose;
  category: AssetCategory;
  createdAt: string;
  usedBy: {
    site: boolean;
    modules: string[];
    pages: string[];
  };
};

export type AssetsResponse = {
  assets: AssetItem[];
  counts: Partial<Record<AssetCategory, number>>;
};

export type AssetsDeleteResult = {
  deleted: string[];
  skipped: Array<{
    id: string;
    reason: 'NOT_FOUND' | 'IN_USE';
    usedBy?: AssetItem['usedBy'];
  }>;
};

export type ApiErrorBody = {
  error?: string;
  message?: string;
};

export type KbKind = 'recipe' | 'rule' | 'fact' | 'reference';
export type KbStatus = 'draft' | 'published' | 'archived';

export type KbDoc = {
  id: string;
  title: string;
  kind: KbKind;
  status: KbStatus;
  visibility: 'admin' | 'members';
  summary: string;
  bodyMd: string;
  tool: string;
  prompt: string;
  tags: string[];
  source: string;
  sourceRef: string;
  version: number;
  supersedesId: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KbStats = {
  draft: number;
  published: number;
  archived: number;
  total: number;
  byKind: { kind: string; n: number }[];
};

export type KbSearchHit = {
  id: string;
  title: string;
  kind: KbKind;
  summary: string;
  body: string;
  tool: string;
  prompt: string;
  tags: string[];
  verifiedAt: string | null;
  updatedAt: string;
};
