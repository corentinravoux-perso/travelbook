/**
 * The arithmetic of the rulers round the canvas: which ticks to draw at a zoom, where, and which
 * carry a number. Pure functions of numbers, so they are tested without a canvas.
 */

/** Steps between two small ticks, in mm: the first one at least `MIN_TICK_PX` apart wins. */
const TICK_STEPS = [1, 2, 5, 10, 20, 50, 100];
/** Steps between two numbers, in mm: the first one at least `MIN_LABEL_PX` apart wins. */
const LABEL_STEPS = [5, 10, 20, 50, 100, 200, 500];

/** Small ticks closer than this, in px, would merge into a grey band. */
export const MIN_TICK_PX = 5;
/** Numbers closer than this, in px, would overlap ("420" is about 18 px wide at 10 px). */
export const MIN_LABEL_PX = 42;

export interface RulerSteps {
  /** mm between two small ticks. */
  tick: number;
  /** mm between two numbers; always a multiple of `tick`. */
  label: number;
}

/** Tick and number steps for `scale` px per mm. */
export function rulerSteps(scale: number): RulerSteps {
  const pick = (steps: number[], minPx: number) =>
    steps.find((step) => step * scale >= minPx) ?? (steps.at(-1) as number);
  const label = pick(LABEL_STEPS, MIN_LABEL_PX);
  let tick = pick(TICK_STEPS, MIN_TICK_PX);
  // A number must sit on a tick: 2 mm ticks with 5 mm numbers would miss half of them.
  while (label % tick !== 0) tick = TICK_STEPS[TICK_STEPS.indexOf(tick) - 1] ?? 1;
  return { tick, label };
}

export type TickKind = 'small' | 'half' | 'label';

export interface Tick {
  /** Position on the ruler, in mm (spread coordinates). */
  mm: number;
  /** Position on the ruler, in px from its start. */
  px: number;
  kind: TickKind;
}

/**
 * The ticks visible on a ruler `length` px long whose 0 mm sits at `origin` px, at `scale` px
 * per mm. Numbers fall on multiples of `steps.label`, a longer tick halfway between two of them.
 */
export function rulerTicks(
  origin: number,
  scale: number,
  length: number,
  steps: RulerSteps,
): Tick[] {
  if (!(scale > 0) || length <= 0) return [];
  const first = Math.ceil(-origin / scale / steps.tick) * steps.tick;
  const last = (length - origin) / scale;
  const ticks: Tick[] = [];
  // Counted in whole ticks, so 0.1 + 0.2 never drifts.
  for (let i = 0; ; i++) {
    const mm = Math.round((first + i * steps.tick) * 1000) / 1000;
    if (mm > last) break;
    const kind: TickKind =
      mm % steps.label === 0 ? 'label' : (2 * mm) % steps.label === 0 ? 'half' : 'small';
    ticks.push({ mm, px: origin + mm * scale, kind });
  }
  return ticks;
}

/** A ruler guide is placed on whole half-millimetres. */
export function guidePosition(mm: number): number {
  return Math.round(mm * 2) / 2;
}

/** How a ruler number reads: whole millimetres, a minus sign before the spread. */
export function rulerLabel(mm: number): string {
  return String(Math.round(mm)).replace('-', '−');
}
