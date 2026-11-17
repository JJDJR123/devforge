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
    tagline: '深色 · 荧光绿',
    accent: '#c8f76a',
    colors: ['#0a0d0b', '#141b15', '#c8f76a'],
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
  '#c8f76a',
  '#5eead4',
  '#67e8f9',
  '#a5b4fc',
  '#d8b4fe',
  '#f9a8d4',
  '#ff9d5c',
  '#fbbf24',
  '#fb7185',
  '#94a3b8',
];

export const THEME_DEFAULTS: Theme = {
  preset: 'forge',
  accent: '#c8f76a',
  radius: 14,
  fontScale: 100,
  density: 'comfortable',
  grid: true,
  glow: true,
};

export function normalizeTheme(value: Partial<Theme> | null | undefined): Theme {
  const preset = THEME_PRESETS.some((item) => item.id === value?.preset)
    ? String(value?.preset)
    : THEME_DEFAULTS.preset;
  const accent = /^#[0-9a-fA-F]{6}$/.test(String(value?.accent || ''))
    ? String(value?.accent).toLowerCase()
    : THEME_DEFAULTS.accent;
  const radius = Math.min(28, Math.max(4, Number(value?.radius ?? THEME_DEFAULTS.radius) || THEME_DEFAULTS.radius));
  const fontScale = Math.min(120, Math.max(85, Number(value?.fontScale ?? THEME_DEFAULTS.fontScale) || 100));
  return {
    preset,
    accent,
    radius,
    fontScale,
    density: value?.density === 'compact' ? 'compact' : 'comfortable',
    grid: value?.grid !== false,
    glow: value?.glow !== false,
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full = value.length === 3
    ? value.split('').map((char) => char + char).join('')
    : value;
  const number = Number.parseInt(full, 16);
  if (!Number.isFinite(number)) return [200, 247, 106];
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
  root.dataset.grid = normalized.grid ? 'on' : 'off';
  root.dataset.glow = normalized.glow ? 'on' : 'off';
  root.style.setProperty('--accent', normalized.accent);
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--accent-ink', accentInk(normalized.accent));
  root.style.setProperty('--radius', `${normalized.radius}px`);
  root.style.setProperty('--font-scale', String(normalized.fontScale / 100));
}

export function presetAccent(id: string): string {
  return THEME_PRESETS.find((item) => item.id === id)?.accent || THEME_DEFAULTS.accent;
}
