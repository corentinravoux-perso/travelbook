/**
 * Widths of the two resizable columns of the editor shell, in CSS px. The user's widths are kept
 * in renderer storage across sessions, always clamped to these bounds.
 */
export const PANEL_BOUNDS = {
  panel: { min: 200, max: 440, initial: 272 },
  inspector: { min: 220, max: 400, initial: 264 },
} as const;

export type PanelSide = keyof typeof PANEL_BOUNDS;
export type PanelWidths = Record<PanelSide, number>;

export const WIDTHS_KEY = 'travelbook.panelWidths';

/** `width` rounded and kept within the side's bounds; the initial width if it is not a number. */
export function clampWidth(side: PanelSide, width: unknown): number {
  const { min, max, initial } = PANEL_BOUNDS[side];
  if (typeof width !== 'number' || !Number.isFinite(width)) return initial;
  return Math.min(max, Math.max(min, Math.round(width)));
}

/** The stored widths, or the initial ones where nothing valid is stored. */
export function readWidths(storage: Pick<Storage, 'getItem'>): PanelWidths {
  let saved: Partial<Record<PanelSide, unknown>> = {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(WIDTHS_KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') saved = parsed;
  } catch {
    // Unreadable storage or JSON: start from the initial widths.
  }
  return {
    panel: clampWidth('panel', saved.panel),
    inspector: clampWidth('inspector', saved.inspector),
  };
}

export function writeWidths(storage: Pick<Storage, 'setItem'>, widths: PanelWidths): void {
  try {
    storage.setItem(WIDTHS_KEY, JSON.stringify(widths));
  } catch {
    // Storage refused (quota, policy): the widths still apply for this session.
  }
}

/** Which of the two side columns are folded away. Kept across sessions like the widths. */
export type PanelsFolded = Record<PanelSide, boolean>;

export const FOLDED_KEY = 'travelbook.panelsFolded';

/** Width of a folded inspector: a strip with the button that opens it again, in CSS px. */
export const FOLDED_INSPECTOR_W = 36;

export function readFolded(storage: Pick<Storage, 'getItem'>): PanelsFolded {
  let saved: Partial<Record<PanelSide, unknown>> = {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(FOLDED_KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') saved = parsed;
  } catch {
    // Unreadable: both columns open.
  }
  return { panel: saved.panel === true, inspector: saved.inspector === true };
}

export function writeFolded(storage: Pick<Storage, 'setItem'>, folded: PanelsFolded): void {
  try {
    storage.setItem(FOLDED_KEY, JSON.stringify(folded));
  } catch {
    // Storage refused: the columns stay as they are for this session.
  }
}
