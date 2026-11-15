import { useEffect, useRef, useState } from 'react';
import { fr } from '../../strings/fr';
import { ColorField } from '../../editor/inspector/controls';
import { FALLBACK_HEX, splitColor } from '../../editor/inspector/color';
import { loadRecent, pushRecent, saveRecent, spreadPhotoIds } from './model';
import type { TabProps } from './types';

const t = fr.backgrounds;

/** A row of colour swatches; each one applies its colour. */
function Swatches({
  colors,
  current,
  label,
  onPick,
}: {
  colors: string[];
  current: string | null;
  label: string;
  onPick(color: string): void;
}) {
  return (
    <div className="bg-swatches" role="group" aria-label={label}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className="bg-swatch bg-swatch--color"
          style={{ background: color }}
          aria-label={t.swatch(color)}
          aria-pressed={current?.toLowerCase() === color.toLowerCase()}
          title={color}
          onClick={() => onPick(color)}
        />
      ))}
    </div>
  );
}

/**
 * "Couleur": the system colour input, the colours chosen lately (kept across albums) and the
 * dominant colours of the photos on the spread in view.
 */
export function ColourTab({ spread, current, apply }: TabProps) {
  const [recent, setRecent] = useState<string[]>(() => loadRecent(localStorage));
  // The palette of the photos last asked for; it counts only while it is that of the spread in view.
  const [answer, setAnswer] = useState<{ key: string; colors: string[]; failed: boolean } | null>(
    null,
  );
  const photos = spreadPhotoIds(spread);
  const key = photos.join(',');
  const color = current?.kind === 'color' ? current.color : null;
  const fresh = key !== '' && answer?.key === key ? answer : null;
  const palette = fresh?.colors ?? [];
  const paletteFailed = fresh?.failed ?? false;

  // The palette follows the photos on the spread: a request that comes back late is dropped.
  useEffect(() => {
    if (key === '') return;
    let live = true;
    window.tb.assets.palette(key.split(',')).then(
      (colors) => {
        if (live) setAnswer({ key, colors, failed: false });
      },
      (error: unknown) => {
        console.error('Palette failed', error);
        if (live) setAnswer({ key, colors: [], failed: true });
      },
    );
    return () => {
      live = false;
    };
  }, [key]);

  // A colour is kept as a recent one once it has stood for a moment, not on every step of a drag.
  const settled = useRef<string | null>(null);
  useEffect(() => {
    if (color === null || color === settled.current) return;
    const timer = setTimeout(() => {
      settled.current = color;
      setRecent((list) => {
        const next = pushRecent(list, color);
        saveRecent(localStorage, next);
        return next;
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [color]);

  const pick = (hex: string, gesture?: string): void => {
    apply(
      { kind: 'color', color: hex },
      gesture === undefined ? {} : { mergeKey: `bg:${gesture}` },
    );
  };

  return (
    <div className="bg-tab">
      <ColorField
        label={t.colorLabel}
        value={color !== null ? splitColor(color).hex : FALLBACK_HEX}
        onChange={(hex, gesture) => pick(hex, gesture)}
      />
      <section className="bg-block" aria-label={t.recent}>
        <h3 className="bg-block__title">{t.recent}</h3>
        {recent.length === 0 ? (
          <p className="bg-hint">{t.noRecent}</p>
        ) : (
          <Swatches colors={recent} current={color} label={t.recent} onPick={(c) => pick(c)} />
        )}
      </section>
      <section className="bg-block" aria-label={t.palette}>
        <h3 className="bg-block__title">{t.palette}</h3>
        {paletteFailed ? (
          <p className="bg-hint" role="status">
            {t.paletteFailed}
          </p>
        ) : palette.length === 0 ? (
          <p className="bg-hint">{t.noPalette}</p>
        ) : (
          <Swatches colors={palette} current={color} label={t.palette} onPick={(c) => pick(c)} />
        )}
      </section>
    </div>
  );
}
