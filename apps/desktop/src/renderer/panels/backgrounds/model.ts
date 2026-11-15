import {
  pageBox,
  type AssetRef,
  type Background,
  type Book,
  type Side,
  type Spread,
} from '@travelbook/core';
import type { BundledBackground } from '../../../shared/api';
import { fr } from '../../strings/fr';

export type Target = Side | 'spread';

export type GradientBackground = Extract<Background, { kind: 'gradient' }>;
export type PatternBackground = Extract<Background, { kind: 'pattern' }>;
export type ImageBackground = Extract<Background, { kind: 'image' }>;
export type Stop = GradientBackground['stops'][number];

/** The pages of `spread` the background can go on, then the whole spread. */
export function availableTargets(book: Book, spread: Spread): Target[] {
  const pages = (['left', 'right'] as const).filter((side) => pageBox(book, spread, side) !== null);
  return [...pages, 'spread'];
}

/**
 * Where a background goes: the target the user chose if the spread still has it, otherwise the
 * page last pointed at (`activePage`), otherwise the page the spread has.
 */
export function resolveTarget(
  chosen: Target | null,
  available: readonly Target[],
  activePage: Side,
): Target {
  if (chosen !== null && available.includes(chosen)) return chosen;
  if (available.includes(activePage)) return activePage;
  return available.find((t) => t !== 'spread') ?? 'spread';
}

/** The label of a target, in French; the cover calls its pages the back and the front. */
export function targetLabel(spread: Spread, target: Target, pages: number): string {
  const t = fr.backgrounds;
  if (target === 'spread') return spread.kind === 'cover' ? t.cover : t.spread;
  if (spread.kind === 'cover') return target === 'left' ? t.back : t.front;
  if (pages === 1) return t.onePage;
  return target === 'left' ? t.left : t.right;
}

// ---------- colours ----------

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (value: string): boolean => HEX.test(value);

const channels = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** The colour halfway between two `#rrggbb` colours; `a` when one of them is not that. */
export function mixHex(a: string, b: string, t = 0.5): string {
  if (!isHex(a) || !isHex(b)) return a;
  const [ca, cb] = [channels(a), channels(b)];
  return `#${ca
    .map((v, i) => Math.round(v + ((cb[i] as number) - v) * t))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

export const RECENT_KEY = 'travelbook.recentColours';
export const RECENT_MAX = 12;

/** `colour` first, the others after it (no repeat), at most `RECENT_MAX`. */
export function pushRecent(list: readonly string[], colour: string): string[] {
  if (!isHex(colour)) return [...list];
  const lower = colour.toLowerCase();
  return [lower, ...list.filter((c) => c !== lower)].slice(0, RECENT_MAX);
}

/** The recent colours kept in `storage`; empty when there are none or they are unreadable. */
export function loadRecent(storage: Pick<Storage, 'getItem'>): string[] {
  try {
    const raw: unknown = JSON.parse(storage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter((c): c is string => typeof c === 'string' && isHex(c)).slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

export function saveRecent(storage: Pick<Storage, 'setItem'>, list: readonly string[]): void {
  try {
    storage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Recent colours are a convenience: a full or blocked storage only loses them.
  }
}

/** The photos of the spread, once each: the colours of the palette come from these. */
export function spreadPhotoIds(spread: Spread): string[] {
  const ids = new Set<string>();
  for (const el of spread.elements) {
    if (el.type === 'photo' && el.assetId !== null) ids.add(el.assetId);
  }
  return [...ids];
}

// ---------- gradients ----------

export const MAX_STOPS = 5;
export const MIN_STOPS = 2;

const linear = (angle: number, ...colors: string[]): GradientBackground => ({
  kind: 'gradient',
  type: 'linear',
  angle,
  stops: colors.map((color, i) => ({ offset: i / (colors.length - 1), color })),
});
const radial = (...colors: string[]): GradientBackground => ({
  ...linear(0, ...colors),
  type: 'radial',
});

/** Our own presets, soft ones first (an album page is mostly looked past), then deep ones. */
export const GRADIENT_PRESETS: readonly {
  id: keyof typeof fr.backgrounds.gradientNames;
  gradient: GradientBackground;
}[] = [
  { id: 'aube', gradient: linear(180, '#fde2c8', '#f9b9a1') },
  { id: 'brume', gradient: linear(180, '#f4f5f6', '#c9cfd6') },
  { id: 'champagne', gradient: linear(90, '#fbf3e2', '#e9d3a3') },
  { id: 'sable', gradient: linear(135, '#f7ecd8', '#d9b98a') },
  { id: 'lavande', gradient: linear(135, '#ece4f6', '#b6a0d8') },
  { id: 'rose', gradient: linear(135, '#fbe9ea', '#e8a9b3') },
  { id: 'menthe', gradient: linear(90, '#e4f5ee', '#8fcfb4') },
  { id: 'ciel', gradient: linear(180, '#e7f2fb', '#8fbfe6') },
  { id: 'bleute', gradient: linear(135, '#e8eef5', '#b7c7da') },
  { id: 'gris', gradient: linear(180, '#f2f2f2', '#7a7a7a') },
  { id: 'ocean', gradient: linear(180, '#bfe3ee', '#4c91b5') },
  { id: 'foret', gradient: linear(160, '#dbe8d0', '#5f8a63') },
  { id: 'terre', gradient: linear(160, '#e6d2b8', '#9c6b4a') },
  { id: 'glacier', gradient: linear(135, '#f1fbff', '#a9d6e8', '#5b9db8') },
  { id: 'prairie', gradient: linear(180, '#f3f7d9', '#bcd68a', '#6a9a52') },
  { id: 'aurore', gradient: linear(120, '#a6e3d1', '#b8b5ee', '#f3b4d0') },
  { id: 'couchant', gradient: linear(180, '#f6d365', '#f09c6b', '#b8527a') },
  { id: 'braise', gradient: linear(180, '#f6c177', '#c4472f') },
  { id: 'crepuscule', gradient: linear(180, '#2b2d5e', '#8e4a7e', '#f2a07b') },
  { id: 'ardoise', gradient: linear(180, '#4b5360', '#232830') },
  { id: 'nuit', gradient: linear(180, '#10131f', '#2a3558') },
  { id: 'lueur', gradient: radial('#fffaf0', '#f1d9a8') },
  { id: 'halo', gradient: radial('#ffffff', '#cfd6dd') },
  { id: 'vignette', gradient: radial('#f7f3ea', '#d8cdb8', '#a89a80') },
  { id: 'lagon', gradient: radial('#dff6f4', '#5cb7b5', '#2b6f7a') },
  { id: 'soleil', gradient: radial('#fff3b0', '#f6a04d', '#d9573b') },
];

/** The gradient the editor starts from when the page has none. */
export const DEFAULT_GRADIENT: GradientBackground = (
  GRADIENT_PRESETS[0] as (typeof GRADIENT_PRESETS)[number]
).gradient;

/** A new stop in the widest gap, coloured halfway between its neighbours. At most `MAX_STOPS`. */
export function addStop(stops: readonly Stop[]): Stop[] {
  if (stops.length >= MAX_STOPS) return [...stops];
  let at = 0;
  for (let i = 1; i < stops.length; i++) {
    const gap = (stops[i] as Stop).offset - (stops[i - 1] as Stop).offset;
    if (gap > (stops[at + 1] as Stop).offset - (stops[at] as Stop).offset) at = i - 1;
  }
  const a = stops[at] as Stop;
  const b = stops[at + 1] as Stop;
  const added = {
    offset: Math.round(((a.offset + b.offset) / 2) * 100) / 100,
    color: mixHex(a.color, b.color),
  };
  return [...stops.slice(0, at + 1), added, ...stops.slice(at + 1)];
}

/** Without stop `index`, unless that would leave fewer than `MIN_STOPS`. */
export function removeStop(stops: readonly Stop[], index: number): Stop[] {
  return stops.length <= MIN_STOPS ? [...stops] : stops.filter((_, i) => i !== index);
}

/** Stop `index` moved to `offset`, kept between its neighbours so the order never changes. */
export function moveStop(stops: readonly Stop[], index: number, offset: number): Stop[] {
  const lo = index === 0 ? 0 : (stops[index - 1] as Stop).offset;
  const hi = index === stops.length - 1 ? 1 : (stops[index + 1] as Stop).offset;
  const clamped = Math.min(hi, Math.max(lo, offset));
  return stops.map((s, i) => (i === index ? { ...s, offset: clamped } : s));
}

// ---------- images, patterns, textures ----------

export const DEFAULT_PATTERN_COLORS = { fg: '#9aa5b1', bg: '#f5f5f2' } as const;

/** An image background with the plain settings: filled, opaque, sharp, untinted. */
export function plainImage(assetId: string): ImageBackground {
  return { kind: 'image', assetId, fit: 'cover', opacity: 1, blur: 0, tint: null };
}

/** The `tb://resource/` address of a bundled file. */
export const resourceUrl = (file: string): string => `tb://resource/${file}`;

/** The bundled pattern or texture an asset of the book was copied from, by its name. */
export function bundledOf(
  asset: AssetRef | undefined,
  bundled: readonly BundledBackground[],
): BundledBackground | undefined {
  if (asset === undefined || (asset.kind !== 'pattern' && asset.kind !== 'background'))
    return undefined;
  const kind = asset.kind === 'pattern' ? 'pattern' : 'texture';
  return bundled.find(
    (b) =>
      b.kind === kind &&
      asset.originalName === `${b.title}${b.file.slice(b.file.lastIndexOf('.'))}`,
  );
}

/** Which tab an image background belongs to: a photo, a bundled texture, or one of the user's. */
export function imageOrigin(
  bg: ImageBackground,
  assets: Record<string, AssetRef>,
  bundled: readonly BundledBackground[],
): 'photo' | 'texture' | 'mine' | null {
  const asset = assets[bg.assetId];
  if (asset === undefined) return null;
  if (asset.kind === 'photo') return 'photo';
  return bundledOf(asset, bundled)?.kind === 'texture' ? 'texture' : 'mine';
}
