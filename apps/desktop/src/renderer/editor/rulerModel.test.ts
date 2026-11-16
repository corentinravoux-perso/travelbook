import { describe, expect, it } from 'vitest';
import {
  MIN_LABEL_PX,
  MIN_TICK_PX,
  guidePosition,
  rulerLabel,
  rulerSteps,
  rulerTicks,
} from './rulerModel';

describe('rulerSteps', () => {
  it('shows every millimetre and a number every 10 mm at 100 %', () => {
    // 100 % is 96 / 25.4 = 3.78 px per mm.
    expect(rulerSteps(3.78)).toEqual({ tick: 2, label: 20 });
    expect(rulerSteps(6)).toEqual({ tick: 1, label: 10 });
  });

  it('thins out as the zoom goes down', () => {
    expect(rulerSteps(1.5)).toEqual({ tick: 5, label: 50 });
    expect(rulerSteps(0.5)).toEqual({ tick: 10, label: 100 });
  });

  it('keeps ticks and numbers far enough apart, numbers always on a tick', () => {
    for (let scale = 0.1; scale < 40; scale *= 1.13) {
      const { tick, label } = rulerSteps(scale);
      expect(label % tick).toBe(0);
      if (tick > 1) expect(tick * scale).toBeGreaterThanOrEqual(MIN_TICK_PX - 1e-9);
      if (label < 500) expect(label * scale).toBeGreaterThanOrEqual(MIN_LABEL_PX - 1e-9);
    }
  });
});

describe('rulerTicks', () => {
  it('starts at the first tick in view and marks numbers and halves', () => {
    const ticks = rulerTicks(-15, 1, 30, { tick: 5, label: 20 });
    expect(ticks.map((t) => t.mm)).toEqual([15, 20, 25, 30, 35, 40, 45]);
    expect(ticks.map((t) => t.kind)).toEqual([
      'small',
      'label',
      'small',
      'half',
      'small',
      'label',
      'small',
    ]);
    expect(ticks[0]!.px).toBe(0);
  });

  it('covers negative positions before the spread', () => {
    const ticks = rulerTicks(30, 2, 50, { tick: 5, label: 10 });
    expect(ticks[0]).toEqual({ mm: -15, px: 0, kind: 'half' });
    expect(ticks.find((t) => t.mm === 0)?.px).toBe(30);
  });

  it('draws nothing on an empty ruler', () => {
    expect(rulerTicks(0, 1, 0, { tick: 1, label: 10 })).toEqual([]);
    expect(rulerTicks(0, 0, 100, { tick: 1, label: 10 })).toEqual([]);
  });
});

describe('guides and labels', () => {
  it('places a guide on a whole half-millimetre', () => {
    expect(guidePosition(12.26)).toBe(12.5);
    expect(guidePosition(12.24)).toBe(12);
  });

  it('writes whole millimetres with a true minus sign', () => {
    expect(rulerLabel(209.6)).toBe('210');
    expect(rulerLabel(-10)).toBe('−10');
  });
});
