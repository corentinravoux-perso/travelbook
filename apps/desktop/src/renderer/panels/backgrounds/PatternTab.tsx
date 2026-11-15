import { useState } from 'react';
import { fr } from '../../strings/fr';
import { ColorField } from '../../editor/inspector/controls';
import { splitColor } from '../../editor/inspector/color';
import { SliderField } from '../../editor/inspector/controls';
import { DEFAULT_PATTERN_COLORS, bundledOf, resourceUrl, type PatternBackground } from './model';
import type { TabProps } from './types';

const t = fr.backgrounds;

const SCALE = { min: 0.25, max: 4, step: 0.05 } as const;

/**
 * "Motif": the bundled tiles drawn in the two colours below. A tile is a stencil: the renderer
 * paints it with the pattern colour over the background colour, so recolouring is only a change
 * of the two colours of the background in the document. The colours and the scale apply to the
 * pattern the target has, or to the next one chosen.
 */
export function PatternTab({ book, current, bundled, apply, fail }: TabProps) {
  const [draft, setDraft] = useState<{ fg: string; bg: string; scale: number }>({
    ...DEFAULT_PATTERN_COLORS,
    scale: 1,
  });
  const pattern = current?.kind === 'pattern' ? current : null;
  const values = pattern ?? draft;
  const patterns = bundled.filter((b) => b.kind === 'pattern');
  const chosen = pattern === null ? undefined : bundledOf(book.assets[pattern.assetId], bundled);

  const edit = (
    patch: Partial<Pick<PatternBackground, 'fg' | 'bg' | 'scale'>>,
    gesture?: string,
  ) => {
    setDraft({ fg: values.fg, bg: values.bg, scale: values.scale, ...patch });
    if (pattern !== null) {
      apply(
        { ...pattern, ...patch },
        { label: t.undoEdit, ...(gesture === undefined ? {} : { mergeKey: `bg:${gesture}` }) },
      );
    }
  };

  const choose = (file: string): void => {
    window.tb.assets.fromBundled(file).then(
      (asset) =>
        apply(
          {
            kind: 'pattern',
            assetId: asset.id,
            fg: values.fg,
            bg: values.bg,
            scale: values.scale,
          },
          { assets: [asset] },
        ),
      fail,
    );
  };

  return (
    <div className="bg-tab">
      <div className="bg-colors">
        <ColorField
          label={t.patternColor}
          value={splitColor(values.fg).hex}
          onChange={(fg, gesture) => edit({ fg }, gesture)}
        />
        <ColorField
          label={t.patternBack}
          value={splitColor(values.bg).hex}
          onChange={(bg, gesture) => edit({ bg }, gesture)}
        />
      </div>
      <SliderField
        label={t.scale}
        value={values.scale}
        min={SCALE.min}
        max={SCALE.max}
        step={SCALE.step}
        display={t.scaleValue(values.scale)}
        onChange={(scale, gesture) => edit({ scale }, gesture)}
      />
      <section className="bg-block" aria-label={t.patterns}>
        <h3 className="bg-block__title">{t.patterns}</h3>
        <div className="bg-grid" role="group" aria-label={t.patterns}>
          {patterns.map((p) => (
            <button
              key={p.file}
              type="button"
              className="bg-swatch bg-swatch--pattern"
              style={{ backgroundColor: values.bg }}
              aria-label={p.title}
              aria-pressed={chosen?.file === p.file}
              title={p.title}
              data-file={p.file}
              onClick={() => choose(p.file)}
            >
              <span
                className="bg-swatch__tile"
                style={{
                  backgroundColor: values.fg,
                  maskImage: `url("${resourceUrl(p.file)}")`,
                  WebkitMaskImage: `url("${resourceUrl(p.file)}")`,
                }}
              />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
