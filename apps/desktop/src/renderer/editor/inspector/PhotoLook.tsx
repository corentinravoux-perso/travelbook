import { LOOK_PRESETS, applyLook, updateElements, type PhotoElement } from '@travelbook/core';
import { adjustFilter, vignetteGradient } from '@travelbook/render';
import { editorStore } from '../../store/editor';
import { fr } from '../../strings/fr';
import { assetUrl } from '../assetUrl';
import { Section, SliderField, formatNumber } from './controls';

const t = fr.photoInspector;

/** The widest soft edge the slider offers; 0 is a sharp edge. */
const MAX_FEATHER = 15;

type Adjust = PhotoElement['adjust'];

const sameLook = (a: Adjust, b: Adjust): boolean =>
  (Object.keys(b) as (keyof Adjust)[]).every((key) => a[key] === b[key]);

/**
 * The look of one photo: a row of one-click presets (each shown on the photo itself), the
 * vignette and the soft edge. A preset is one undo step, a slider drag is one.
 */
export function PhotoLook({ spreadId, element }: { spreadId: string; element: PhotoElement }) {
  const { adjust, assetId } = element;
  const change = (patch: Partial<PhotoElement>, label: string, gesture: string) =>
    editorStore
      .getState()
      .apply((b) => updateElements(b, spreadId, [element.id], patch), label, gesture);
  const feather = element.edge?.feather ?? 0;

  return (
    <Section title={t.look}>
      <div className="look-grid" role="group" aria-label={t.lookPresets}>
        {LOOK_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="look-tile"
            data-look={preset.id}
            aria-pressed={sameLook(adjust, preset.adjust)}
            onClick={() =>
              editorStore
                .getState()
                .apply((b) => applyLook(b, spreadId, [element.id], preset.id), t.undoLook)
            }
          >
            <span className="look-tile__image">
              {assetId === null ? (
                <i className="look-tile__swatch" style={{ filter: adjustFilter(preset.adjust) }} />
              ) : (
                <img
                  src={assetUrl(assetId, 'thumb')}
                  alt=""
                  draggable={false}
                  style={{ filter: adjustFilter(preset.adjust) }}
                />
              )}
              {preset.adjust.vignette > 0 && (
                <i
                  className="look-tile__vignette"
                  style={{ backgroundImage: vignetteGradient(preset.adjust.vignette) }}
                />
              )}
            </span>
            <span className="look-tile__name">{preset.name}</span>
          </button>
        ))}
      </div>
      <SliderField
        label={t.vignette}
        value={adjust.vignette}
        min={0}
        max={1}
        step={0.01}
        display={`${Math.round(adjust.vignette * 100)} ${t.percent}`}
        onChange={(vignette, gesture) =>
          change({ adjust: { ...adjust, vignette } }, t.undoVignette, gesture)
        }
      />
      <SliderField
        label={t.feather}
        value={feather}
        min={0}
        max={MAX_FEATHER}
        step={0.5}
        display={`${formatNumber(feather)} ${t.mm}`}
        onChange={(value, gesture) =>
          change({ edge: value === 0 ? null : { feather: value } }, t.undoFeather, gesture)
        }
      />
    </Section>
  );
}
