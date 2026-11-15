import { MASK_PRESETS, maskCss } from '@travelbook/render';
import type { PhotoElement } from '@travelbook/core';
import { fr } from '../../strings/fr';

const t = fr.photoInspector;

/** The frame every shape is drawn in for its button: the same on all, so they compare by shape. */
const TILE = { w: 40, h: 30 };

/** One button per preset mask (the round, the irregular...), drawn as the shape itself. */
export function MaskShapes({
  mask,
  onPick,
}: {
  mask: PhotoElement['mask'];
  onPick(preset: string): void;
}) {
  return (
    <div className="shape-grid" role="group" aria-label={t.shapes}>
      {MASK_PRESETS.map((preset) => {
        const name = t.shapeNames[preset] ?? preset;
        return (
          <button
            key={preset}
            type="button"
            className="shape-tile"
            data-shape={preset}
            aria-label={name}
            title={name}
            aria-pressed={mask.kind === 'preset' && mask.preset === preset}
            onClick={() => onPick(preset)}
          >
            <svg viewBox={`0 0 ${TILE.w} ${TILE.h}`} aria-hidden="true">
              <path d={maskCss({ kind: 'preset', preset }, TILE).outline} />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
