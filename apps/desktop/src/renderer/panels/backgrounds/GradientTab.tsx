import { useRef, useState } from 'react';
import { fr } from '../../strings/fr';
import { splitColor } from '../../editor/inspector/color';
import { SliderField } from '../../editor/inspector/controls';
import { Icon } from '../../theme/Icon';
import {
  DEFAULT_GRADIENT,
  GRADIENT_PRESETS,
  MAX_STOPS,
  MIN_STOPS,
  addStop,
  moveStop,
  removeStop,
  type GradientBackground,
} from './model';
import type { TabProps } from './types';

const t = fr.backgrounds;

/** The CSS a gradient swatch is drawn with. */
export function gradientCss(g: GradientBackground): string {
  const stops = g.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ');
  return g.type === 'linear'
    ? `linear-gradient(${Math.round(g.angle)}deg, ${stops})`
    : `radial-gradient(ellipse at center, ${stops})`;
}

let gestures = 0;
const gestureKey = (): string => `bg:grad:${++gestures}`;

/** One stop: its colour, its place on the line, and a button to take it away. */
function StopRow({
  n,
  color,
  offset,
  removable,
  onColor,
  onOffset,
  onRemove,
}: {
  n: number;
  color: string;
  offset: number;
  removable: boolean;
  onColor(hex: string, gesture: string): void;
  onOffset(offset: number, gesture: string): void;
  onRemove(): void;
}) {
  const gesture = useRef('');
  const begin = (): void => {
    gesture.current = gestureKey();
  };
  const key = (): string => {
    if (gesture.current === '') begin();
    return gesture.current;
  };
  return (
    <li className="bg-stop">
      <input
        type="color"
        className="bg-stop__color"
        aria-label={t.stopColor(n)}
        value={splitColor(color).hex}
        onPointerDown={begin}
        onFocus={begin}
        onChange={(e) => onColor(e.target.value, key())}
      />
      <input
        type="range"
        className="bg-stop__offset"
        aria-label={t.stopOffset(n)}
        min={0}
        max={100}
        step={1}
        value={Math.round(offset * 100)}
        onPointerDown={begin}
        onFocus={begin}
        onChange={(e) => onOffset(Number(e.target.value) / 100, key())}
      />
      <output className="bg-stop__value">{t.percent(offset)}</output>
      <button
        type="button"
        className="icon-button"
        aria-label={t.stopRemove(n)}
        title={t.stopRemove(n)}
        disabled={!removable}
        onClick={onRemove}
      >
        <Icon name="x" />
      </button>
    </li>
  );
}

/**
 * "Dégradé": 26 presets of our own and an editor (linear or radial, angle, two to five stops).
 * The editor works on the gradient the target has, or on the last one chosen; every change is
 * applied at once.
 */
export function GradientTab({ current, apply }: TabProps) {
  const [last, setLast] = useState<GradientBackground>(DEFAULT_GRADIENT);
  const gradient = current?.kind === 'gradient' ? current : last;

  const change = (next: GradientBackground, mergeKey?: string, label?: string): void => {
    setLast(next);
    apply(next, {
      ...(mergeKey === undefined ? {} : { mergeKey }),
      ...(label === undefined ? {} : { label }),
    });
  };
  const edit = (patch: Partial<GradientBackground>, mergeKey?: string): void =>
    change({ ...gradient, ...patch }, mergeKey, t.undoEdit);

  return (
    <div className="bg-tab">
      <section className="bg-block" aria-label={t.presets}>
        <h3 className="bg-block__title">{t.presets}</h3>
        <div className="bg-grid bg-grid--presets" role="group" aria-label={t.presets}>
          {GRADIENT_PRESETS.map(({ id, gradient: preset }) => (
            <button
              key={id}
              type="button"
              className="bg-swatch"
              style={{ background: gradientCss(preset) }}
              aria-label={t.gradientNames[id]}
              title={t.gradientNames[id]}
              data-preset={id}
              onClick={() => change(preset)}
            />
          ))}
        </div>
      </section>

      <section className="bg-block" aria-label={t.editor}>
        <h3 className="bg-block__title">{t.editor}</h3>
        <div
          className="bg-preview"
          style={{ background: gradientCss(gradient) }}
          aria-hidden="true"
        />
        <div className="seg" role="group" aria-label={t.gradientType}>
          {(
            [
              ['linear', t.linear],
              ['radial', t.radial],
            ] as const
          ).map(([type, label]) => (
            <button
              key={type}
              type="button"
              aria-pressed={gradient.type === type}
              onClick={() => edit({ type })}
            >
              {label}
            </button>
          ))}
        </div>
        {gradient.type === 'linear' && (
          <SliderField
            label={t.angle}
            value={Math.round(gradient.angle)}
            min={0}
            max={360}
            step={1}
            display={t.angleValue(Math.round(gradient.angle))}
            onChange={(angle, gesture) => edit({ angle }, `bg:${gesture}`)}
          />
        )}
        <ul className="bg-stops" aria-label={t.stops}>
          {gradient.stops.map((stop, i) => (
            <StopRow
              // The order of stops is fixed while they are edited, so the index names a stop.
              key={i}
              n={i + 1}
              color={stop.color}
              offset={stop.offset}
              removable={gradient.stops.length > MIN_STOPS}
              onColor={(color, gesture) =>
                edit(
                  { stops: gradient.stops.map((s, j) => (j === i ? { ...s, color } : s)) },
                  gesture,
                )
              }
              onOffset={(offset, gesture) =>
                edit({ stops: moveStop(gradient.stops, i, offset) }, gesture)
              }
              onRemove={() => edit({ stops: removeStop(gradient.stops, i) })}
            />
          ))}
        </ul>
        <button
          type="button"
          className="button button--small"
          disabled={gradient.stops.length >= MAX_STOPS}
          onClick={() => edit({ stops: addStop(gradient.stops) })}
        >
          <Icon name="plus" />
          {t.stopAdd}
        </button>
      </section>
    </div>
  );
}
