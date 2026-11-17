import {
  DEFAULT_MAP_STYLE,
  type MapLegMode,
  type MapMarker,
  type MapPlaceKind,
  type MapStyle,
} from '@travelbook/core';
import { fr } from '../strings/fr';

const t = fr.maps.style;

/** Where a token lives in a `MapStyle`: `['land', 'fill']`. */
export type TokenPath = readonly string[];

/** One control of the style editor. `label` is what the control is called for the user. */
export type StyleControl = { path: TokenPath; label: string } & (
  | { kind: 'color'; nullable: boolean }
  | { kind: 'number'; min: number; max: number; step: number }
  | { kind: 'slider'; min: number; max: number; step: number }
  | { kind: 'select'; options: { value: string; label: string }[] }
  | { kind: 'bool' }
  | { kind: 'font' }
  | { kind: 'dash' }
);

export interface StyleGroup {
  id: string;
  title: string;
  controls: StyleControl[];
}

const WIDTH = { min: 0, max: 5, step: 0.05 } as const;
const MARKERS: MapPlaceKind[] = ['capital', 'city', 'sight', 'custom'];
const MODES: MapLegMode[] = ['voiture', 'bus', 'train', 'avion', 'bateau', 'pied'];
const MARKER_KINDS: MapMarker[] = ['point', 'pin', 'flag', 'badge', 'star', 'icon'];
const WEIGHTS = [400, 700];

const weightOptions = WEIGHTS.map((w) => ({ value: String(w), label: t.weights[w] ?? String(w) }));

/** Land, regions, neighbours, lakes and outline are each a few paint and width tokens. */
const paintGroup = (id: 'land' | 'neighbours' | 'lakes', title: string): StyleGroup => ({
  id,
  title,
  controls: [
    { path: [id, 'fill'], label: `${title} : ${t.fill}`, kind: 'color', nullable: true },
    { path: [id, 'stroke'], label: `${title} : ${t.stroke}`, kind: 'color', nullable: true },
    { path: [id, 'width'], label: `${title} : ${t.width}`, kind: 'number', ...WIDTH },
  ],
});

/** Every token of `MapStyle` (but `styleVersion`, and the hand-drawn `rough`, see `RoughControl`). */
export const STYLE_GROUPS: StyleGroup[] = [
  {
    id: 'sizes',
    title: t.groups.sizes,
    controls: [
      {
        path: ['sizes', 'marker'],
        label: t.sizeMarker,
        kind: 'slider',
        min: 1,
        max: 20,
        step: 0.5,
      },
      { path: ['sizes', 'badge'], label: t.sizeBadge, kind: 'slider', min: 1, max: 20, step: 0.5 },
      {
        path: ['sizes', 'vehicle'],
        label: t.sizeVehicle,
        kind: 'slider',
        min: 1,
        max: 20,
        step: 0.5,
      },
    ],
  },
  paintGroup('land', t.groups.land),
  {
    id: 'regions',
    title: t.groups.regions,
    controls: [
      {
        path: ['regions', 'stroke'],
        label: `${t.groups.regions} : ${t.stroke}`,
        kind: 'color',
        nullable: true,
      },
      {
        path: ['regions', 'width'],
        label: `${t.groups.regions} : ${t.width}`,
        kind: 'number',
        ...WIDTH,
      },
      { path: ['regions', 'dash'], label: `${t.groups.regions} : ${t.dash}`, kind: 'dash' },
    ],
  },
  paintGroup('neighbours', t.groups.neighbours),
  paintGroup('lakes', t.groups.lakes),
  {
    id: 'outline',
    title: t.groups.outline,
    controls: [
      {
        path: ['outline', 'color'],
        label: `${t.groups.outline} : ${t.color}`,
        kind: 'color',
        nullable: true,
      },
      {
        path: ['outline', 'width'],
        label: `${t.groups.outline} : ${t.width}`,
        kind: 'number',
        ...WIDTH,
      },
      { path: ['outline', 'detail'], label: t.detail, kind: 'slider', min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'label',
    title: t.groups.label,
    controls: [
      { path: ['label', 'font'], label: t.font, kind: 'font' },
      { path: ['label', 'weight'], label: t.weight, kind: 'select', options: weightOptions },
      { path: ['label', 'italicSights'], label: t.italicSights, kind: 'bool' },
      { path: ['label', 'sizePt'], label: t.sizePt, kind: 'number', min: 4, max: 40, step: 0.5 },
      {
        path: ['label', 'color'],
        label: `${t.groups.label} : ${t.color}`,
        kind: 'color',
        nullable: false,
      },
      {
        path: ['label', 'case'],
        label: t.case,
        kind: 'select',
        options: [
          { value: 'none', label: t.cases.none },
          { value: 'upper', label: t.cases.upper },
          { value: 'lower', label: t.cases.lower },
        ],
      },
      {
        path: ['label', 'letterSpacingEm'],
        label: t.letterSpacing,
        kind: 'number',
        min: -0.1,
        max: 1,
        step: 0.01,
      },
      {
        path: ['label', 'wordSpacingEm'],
        label: t.wordSpacing,
        kind: 'number',
        min: -0.3,
        max: 1,
        step: 0.01,
      },
      {
        path: ['label', 'halo', 'color'],
        label: `${t.halo} : ${t.color}`,
        kind: 'color',
        nullable: false,
      },
      {
        path: ['label', 'halo', 'width'],
        label: `${t.halo} : ${t.width}`,
        kind: 'number',
        ...WIDTH,
      },
    ],
  },
  ...MARKERS.map((kind): StyleGroup => ({
    id: `marker-${kind}`,
    title: t.markerGroup(t.markerKinds[kind] ?? kind),
    controls: [
      {
        path: ['markers', kind, 'kind'],
        label: `${t.markerKinds[kind]} : ${t.markerShape}`,
        kind: 'select',
        options: MARKER_KINDS.map((k) => ({ value: k, label: t.shapes[k] ?? k })),
      },
      {
        path: ['markers', kind, 'color'],
        label: `${t.markerKinds[kind]} : ${t.color}`,
        kind: 'color',
        nullable: false,
      },
      {
        path: ['markers', kind, 'stroke'],
        label: `${t.markerKinds[kind]} : ${t.stroke}`,
        kind: 'color',
        nullable: true,
      },
      {
        path: ['markers', kind, 'scale'],
        label: `${t.markerKinds[kind]} : ${t.scale}`,
        kind: 'number',
        min: 0.2,
        max: 4,
        step: 0.1,
      },
    ],
  })),
  ...MODES.map((mode): StyleGroup => ({
    id: `route-${mode}`,
    title: t.routeGroup(fr.maps.route.modes[mode]),
    controls: [
      {
        path: ['route', mode, 'color'],
        label: `${fr.maps.route.modes[mode]} : ${t.color}`,
        kind: 'color',
        nullable: false,
      },
      {
        path: ['route', mode, 'width'],
        label: `${fr.maps.route.modes[mode]} : ${t.width}`,
        kind: 'number',
        ...WIDTH,
      },
      {
        path: ['route', mode, 'dash'],
        label: `${fr.maps.route.modes[mode]} : ${t.dash}`,
        kind: 'dash',
      },
    ],
  })),
  {
    id: 'badge',
    title: t.groups.badge,
    controls: [
      {
        path: ['badge', 'fill'],
        label: `${t.groups.badge} : ${t.fill}`,
        kind: 'color',
        nullable: false,
      },
      {
        path: ['badge', 'text'],
        label: `${t.groups.badge} : ${t.text}`,
        kind: 'color',
        nullable: false,
      },
      {
        path: ['badge', 'stroke'],
        label: `${t.groups.badge} : ${t.stroke}`,
        kind: 'color',
        nullable: true,
      },
      { path: ['badge', 'font'], label: `${t.groups.badge} : ${t.font}`, kind: 'font' },
      {
        path: ['badge', 'weight'],
        label: `${t.groups.badge} : ${t.weight}`,
        kind: 'select',
        options: weightOptions,
      },
    ],
  },
  {
    id: 'medallion',
    title: t.groups.medallion,
    controls: [
      {
        path: ['medallion', 'ringColor'],
        label: `${t.groups.medallion} : ${t.color}`,
        kind: 'color',
        nullable: false,
      },
      {
        path: ['medallion', 'ringWidth'],
        label: `${t.groups.medallion} : ${t.width}`,
        kind: 'number',
        ...WIDTH,
      },
    ],
  },
];

/** The dash patterns offered; a style may carry another, which the select then keeps as is. */
export const DASHES: { id: string; dash: number[] | null }[] = [
  { id: 'solid', dash: null },
  { id: 'dashed', dash: [2.2, 1.5] },
  { id: 'dotted', dash: [0.5, 1] },
  { id: 'fine', dash: [0.01, 1.7] },
];

export const dashId = (dash: number[] | null): string =>
  DASHES.find((d) => JSON.stringify(d.dash) === JSON.stringify(dash))?.id ?? 'custom';

export function getToken(style: MapStyle, path: TokenPath): unknown {
  let node: unknown = style;
  for (const key of path) node = (node as Record<string, unknown> | undefined)?.[key];
  return node;
}

/** A copy of `style` with the token at `path` set; `style` is not touched. */
export function setToken(style: MapStyle, path: TokenPath, value: unknown): MapStyle {
  const next = structuredClone(style) as unknown as Record<string, unknown>;
  let node = next;
  for (const key of path.slice(0, -1)) node = node[key] as Record<string, unknown>;
  node[path[path.length - 1]!] = value;
  return next as unknown as MapStyle;
}

/** The leaf tokens of the default style that no control reaches, as dotted paths (a test guard). */
export function uncoveredTokens(): string[] {
  const covered = new Set(STYLE_GROUPS.flatMap((g) => g.controls.map((c) => c.path.join('.'))));
  const leaves: string[] = [];
  const walk = (node: unknown, path: string[]) => {
    const isObj = typeof node === 'object' && node !== null && !Array.isArray(node);
    // a dash list and the rough object are one token each
    if (isObj && path.join('.') !== 'rough') {
      for (const [k, v] of Object.entries(node)) walk(v, [...path, k]);
    } else leaves.push(path.join('.'));
  };
  walk(DEFAULT_MAP_STYLE, []);
  return leaves.filter((p) => p !== 'styleVersion' && p !== 'rough' && !covered.has(p));
}
