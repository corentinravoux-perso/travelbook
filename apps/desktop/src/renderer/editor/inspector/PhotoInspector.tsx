import {
  defaultCrop,
  updateElements,
  type Book,
  type Element,
  type PhotoElement,
} from '@travelbook/core';
import type { CSSProperties } from 'react';
import { editorStore } from '../../store/editor';
import { fr } from '../../strings/fr';
import { Icon } from '../../theme/Icon';
import { photoResolution, type Resolution } from '../dpi';
import { joinColor, splitColor } from './color';
import { ColorField, NumberField, Section, SliderField } from './controls';
import { MaskShapes } from './MaskShapes';
import { PhotoLook } from './PhotoLook';
import './Inspector.css';

const t = fr.photoInspector;

type Mask = PhotoElement['mask'];
/** The five adjustments of the "Ajustements" section; the vignette has its own slider in "Style". */
type Adjust = Omit<PhotoElement['adjust'], 'vignette'>;

const MASKS: [Mask['kind'], string][] = [
  ['rect', t.maskRect],
  ['rounded', t.maskRounded],
  ['ellipse', t.maskEllipse],
];

/** What a new border or shadow starts as, when the user turns it on. */
const NEW_BORDER = { width: 2, color: '#ffffff' };
const NEW_SHADOW = { dx: 1.5, dy: 1.5, blur: 3, color: '#00000066' };
const DEFAULT_RADIUS = 6;
const NEUTRAL: Adjust = { brightness: 1, contrast: 1, saturation: 1, grayscale: 0, sepia: 0 };

const ADJUSTMENTS: { key: keyof Adjust; label: string; min: number; max: number }[] = [
  { key: 'brightness', label: t.brightness, min: 0, max: 2 },
  { key: 'contrast', label: t.contrast, min: 0, max: 2 },
  { key: 'saturation', label: t.saturation, min: 0, max: 2 },
  { key: 'grayscale', label: t.grayscale, min: 0, max: 1 },
  { key: 'sepia', label: t.sepia, min: 0, max: 1 },
];

const percent = (v: number): string => `${Math.round(v * 100)} ${t.percent}`;

/** Where the marker of the resolution meter sits (0..1) on a scale that ends well past "good". */
function meterScale(book: Book): { max: number; low: number; good: number } {
  const { dpiLow, dpiGood } = book.settings;
  const max = Math.max(400, Math.ceil(dpiGood * 1.6));
  return { max, low: dpiLow / max, good: dpiGood / max };
}

function ResolutionSection({ book, resolution }: { book: Book; resolution: Resolution }) {
  const { dpi, level } = resolution;
  const scale = meterScale(book);
  return (
    <Section title={t.resolution}>
      <div className="insp-res" data-level={level}>
        <strong className="insp-res__value">
          {dpi} {fr.dpi.unit}
        </strong>
        <span className="insp-res__level">{fr.dpi.levels[level]}</span>
      </div>
      <div
        className="insp-meter"
        style={
          {
            '--meter-low': `${scale.low * 100}%`,
            '--meter-good': `${scale.good * 100}%`,
          } as CSSProperties
        }
      >
        <i
          className="insp-meter__marker"
          style={{ left: `${Math.min(dpi / scale.max, 1) * 100}%` }}
        />
      </div>
      <div className="insp-meter__scale">
        <span>{fr.dpi.levels.low}</span>
        <span>{book.settings.dpiLow}</span>
        <span>{book.settings.dpiGood}</span>
        <span>{fr.dpi.levels.good}</span>
      </div>
      <p className="insp-advice">{fr.dpi.advice[level]}</p>
    </Section>
  );
}

/**
 * The inspector of one selected photo frame: its photo and resolution, replace and remove, the
 * mask, the look (presets, vignette, soft edge), border, shadow, flip and the five adjustments.
 * Every change is one `updateElements` (or `applyLook`) through the store, so it is undoable; a
 * slider drag is one step.
 */
export function PhotoInspector({
  book,
  spreadId,
  element,
}: {
  book: Book;
  spreadId: string;
  element: PhotoElement;
}) {
  const asset = element.assetId === null ? undefined : book.assets[element.assetId];
  const resolution = photoResolution(book, element);
  const empty = element.assetId === null;

  const change = (patch: Partial<Element>, label: string, mergeKey?: string) =>
    editorStore
      .getState()
      .apply((b) => updateElements(b, spreadId, [element.id], patch), label, mergeKey);

  const { mask, border, shadow, adjust } = element;
  const shadowColor = shadow ? splitColor(shadow.color) : null;
  const adjusted = ADJUSTMENTS.some(({ key }) => adjust[key] !== NEUTRAL[key]);

  return (
    <div className="inspector" data-testid="photo-inspector">
      <Section>
        <h2 className="insp-title">{t.title}</h2>
        <p className="insp-file">
          {asset ? t.file(asset.originalName, asset.pixel?.w ?? 0, asset.pixel?.h ?? 0) : t.empty}
        </p>
        <div className="insp-actions">
          <button
            type="button"
            className="button"
            disabled={empty}
            onClick={() => editorStore.getState().enterCrop(element.id)}
          >
            <Icon name="crop" />
            {t.crop}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => editorStore.getState().openPicker(element.id)}
          >
            <Icon name="arrows-exchange" />
            {empty ? t.choose : t.replace}
          </button>
          <button
            type="button"
            className="button"
            disabled={empty}
            onClick={() => change({ assetId: null, crop: defaultCrop() }, t.undoRemove)}
          >
            <Icon name="photo-off" />
            {t.remove}
          </button>
        </div>
        {!empty && <p className="insp-hint">{t.swapHint}</p>}
      </Section>

      {resolution && <ResolutionSection book={book} resolution={resolution} />}

      <Section title={t.mask}>
        <div className="seg" role="group" aria-label={t.mask}>
          {MASKS.map(([kind, text]) => (
            <button
              key={kind}
              type="button"
              aria-pressed={mask.kind === kind}
              onClick={() => {
                if (mask.kind === kind) return;
                const next: Mask =
                  kind === 'rounded' ? { kind, radius: mask.radius ?? DEFAULT_RADIUS } : { kind };
                change({ mask: next }, t.undoMask);
              }}
            >
              {text}
            </button>
          ))}
        </div>
        {mask.kind === 'rounded' && (
          <NumberField
            label={t.radius}
            unit={t.mm}
            value={mask.radius ?? DEFAULT_RADIUS}
            min={0}
            max={100}
            onCommit={(radius) => change({ mask: { kind: 'rounded', radius } }, t.undoMask)}
          />
        )}
        <MaskShapes
          mask={mask}
          onPick={(preset) => {
            if (mask.kind === 'preset' && mask.preset === preset) return;
            change({ mask: { kind: 'preset', preset } }, t.undoMask);
          }}
        />
      </Section>

      <PhotoLook spreadId={spreadId} element={element} />

      <Section title={t.border}>
        <NumberField
          label={t.borderWidth}
          unit={t.mm}
          value={border?.width ?? 0}
          min={0}
          max={20}
          onCommit={(width) =>
            change(
              { border: width === 0 ? null : { color: border?.color ?? NEW_BORDER.color, width } },
              t.undoBorder,
            )
          }
        />
        {border && (
          <ColorField
            label={t.color}
            value={splitColor(border.color).hex}
            onChange={(hex, gesture) =>
              change({ border: { width: border.width, color: hex } }, t.undoBorder, gesture)
            }
          />
        )}
      </Section>

      <Section title={t.shadow}>
        <label className="insp-check">
          <input
            type="checkbox"
            checked={shadow !== null}
            onChange={(e) =>
              change({ shadow: e.target.checked ? { ...NEW_SHADOW } : null }, t.undoShadow)
            }
          />
          {t.shadowOn}
        </label>
        {shadow && shadowColor && (
          <>
            <div className="insp-pair">
              <NumberField
                label={t.shadowX}
                unit={t.mm}
                value={shadow.dx}
                min={-20}
                max={20}
                onCommit={(dx) => change({ shadow: { ...shadow, dx } }, t.undoShadow)}
              />
              <NumberField
                label={t.shadowY}
                unit={t.mm}
                value={shadow.dy}
                min={-20}
                max={20}
                onCommit={(dy) => change({ shadow: { ...shadow, dy } }, t.undoShadow)}
              />
            </div>
            <NumberField
              label={t.shadowBlur}
              unit={t.mm}
              value={shadow.blur}
              min={0}
              max={30}
              onCommit={(blur) => change({ shadow: { ...shadow, blur } }, t.undoShadow)}
            />
            <ColorField
              label={t.color}
              value={shadowColor.hex}
              onChange={(hex, gesture) =>
                change(
                  { shadow: { ...shadow, color: joinColor(hex, shadowColor.alpha) } },
                  t.undoShadow,
                  gesture,
                )
              }
            />
            <SliderField
              label={t.shadowOpacity}
              value={shadowColor.alpha}
              min={0}
              max={1}
              step={0.05}
              display={percent(shadowColor.alpha)}
              onChange={(alpha, gesture) =>
                change(
                  { shadow: { ...shadow, color: joinColor(shadowColor.hex, alpha) } },
                  t.undoShadow,
                  gesture,
                )
              }
            />
          </>
        )}
      </Section>

      <Section title={t.flip}>
        <div className="insp-actions">
          <button
            type="button"
            className="icon-button insp-toggle"
            aria-label={t.flipH}
            title={t.flipH}
            aria-pressed={element.flipH}
            onClick={() => change({ flipH: !element.flipH }, t.undoFlip)}
          >
            <Icon name="flip-horizontal" />
          </button>
          <button
            type="button"
            className="icon-button insp-toggle"
            aria-label={t.flipV}
            title={t.flipV}
            aria-pressed={element.flipV}
            onClick={() => change({ flipV: !element.flipV }, t.undoFlip)}
          >
            <Icon name="flip-vertical" />
          </button>
        </div>
      </Section>

      <Section title={t.adjust}>
        {ADJUSTMENTS.map(({ key, label, min, max }) => (
          <SliderField
            key={key}
            label={label}
            value={adjust[key]}
            min={min}
            max={max}
            step={0.01}
            display={percent(adjust[key])}
            onChange={(value, gesture) =>
              change({ adjust: { ...adjust, [key]: value } }, t.undoAdjust, gesture)
            }
          />
        ))}
        <button
          type="button"
          className="button button--small insp-reset"
          disabled={!adjusted}
          onClick={() => change({ adjust: { ...adjust, ...NEUTRAL } }, t.undoAdjust)}
        >
          {t.resetAdjust}
        </button>
      </Section>
    </div>
  );
}
