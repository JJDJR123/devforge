export type User = {
  id: string;
  username: string;
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

export type Module = {
  id: string;
  title: string;
  icon: string;
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

export type Breadcrumb = {
  module: { id: string; title: string; icon: string } | null;
  pages: { id: string; title: string; icon: string }[];
};

export type Bootstrap = {
  user: User;
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
  site: {
    name: string;
    tagline: string;
  };
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
