export type User = {
  id: string;
  username: string;
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
  grid: boolean;
  glow: boolean;
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
