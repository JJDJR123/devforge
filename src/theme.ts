import type { Theme } from './types';

export type ThemePreset = {
  id: string;
  name: string;
  tagline: string;
  accent: string;
  colors: [string, string, string];
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'forge',
    name: '锻造台',
    tagline: '深灰 · 锻造橙',
    accent: '#f16436',
    colors: ['#111111', '#191919', '#f16436'],
  },
  {
    id: 'abyss',
    name: '深海终端',
    tagline: '深蓝 · 青绿',
    accent: '#67e8f9',
    colors: ['#060d14', '#0d1a24', '#67e8f9'],
  },
  {
    id: 'ember',
    name: '余烬',
    tagline: '暖黑 · 琥珀',
    accent: '#ff9d5c',
    colors: ['#100b09', '#1b1310', '#ff9d5c'],
  },
  {
    id: 'paper',
    name: '纸间',
    tagline: '米白 · 墨绿',
    accent: '#3f7d3a',
    colors: ['#f1eee5', '#fbf9f2', '#3f7d3a'],
  },
];

export const ACCENT_SWATCHES = [
  '#f16436',
  '#ff9d5c',
  '#fbbf24',
  '#5eead4',
  '#67e8f9',
  '#a5b4fc',
  '#d8b4fe',
  '#f9a8d4',
  '#fb7185',
  '#94a3b8',
];

export const THEME_DEFAULTS: Theme = {
  preset: 'forge',
  accent: '#f16436',
  radius: 6,
  fontScale: 100,
  density: 'comfortable',
};

export function normalizeTheme(value: Partial<Theme> | null | undefined): Theme {
  const preset = THEME_PRESETS.some((item) => item.id === value?.preset)
    ? String(value?.preset)
    : THEME_DEFAULTS.preset;
  const requestedAccent = /^#[0-9a-fA-F]{6}$/.test(String(value?.accent || ''))
    ? String(value?.accent).toLowerCase()
    : '';
  // Existing installs were initialized with the old fluorescent-green Forge
  // theme. Upgrade only the accent; never silently discard a user's radius,
  // grid, or glow settings.
  const legacyForge = preset === 'forge' && requestedAccent === '#c8f76a';
  const accent = legacyForge ? '#f16436' : (requestedAccent || THEME_DEFAULTS.accent);
  const radius = Math.min(28, Math.max(4, Number(value?.radius ?? THEME_DEFAULTS.radius) || THEME_DEFAULTS.radius));
  const fontScale = Math.min(120, Math.max(85, Number(value?.fontScale ?? THEME_DEFAULTS.fontScale) || 100));
  return {
    preset,
    accent,
    radius,
    fontScale,
    density: value?.density === 'compact' ? 'compact' : 'comfortable',
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full = value.length === 3
    ? value.split('').map((char) => char + char).join('')
    : value;
  const number = Number.parseInt(full, 16);
  if (!Number.isFinite(number)) return [241, 100, 54];
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

export function accentInk(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#0c100b' : '#ffffff';
}

export function applyTheme(theme: Theme) {
  const normalized = normalizeTheme(theme);
  const root = document.documentElement;
  const [r, g, b] = hexToRgb(normalized.accent);
  root.dataset.preset = normalized.preset;
  root.dataset.density = normalized.density;
  root.style.setProperty('--accent', normalized.accent);
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--accent-ink', accentInk(normalized.accent));
  root.style.setProperty('--radius', `${normalized.radius}px`);
  root.style.setProperty('--font-scale', String(normalized.fontScale / 100));
}

export function presetAccent(id: string): string {
  return THEME_PRESETS.find((item) => item.id === id)?.accent || THEME_DEFAULTS.accent;
}
