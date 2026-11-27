import {
  textLook,
  updateElements,
  withoutRunStyle,
  type Element,
  type RunStyleKey,
  type TextElement,
} from '@travelbook/core';
import { useEffect, useRef } from 'react';
import { FontSelect } from '../FontSelect';
import { editorStore } from '../../store/editor';
import { fr } from '../../strings/fr';
import { joinColor, splitColor } from './color';
import { ColorField, NumberField, Section, SliderField } from './controls';
import { growToFit } from '../textFit';

const t = fr.textInspector;

const NEW_OUTLINE = { width: 0.5, color: '#222222' };
const NEW_SHADOW = { dx: 1, dy: 1, blur: 2, color: '#00000066' };
const NEW_FILL = '#ffffff';

const ALIGNS: [TextElement['align'], string][] = [
  ['left', t.alignLeft],
  ['center', t.alignCenter],
  ['right', t.alignRight],
  ['justify', t.alignJustify],
];
const V_ALIGNS: [TextElement['vAlign'], string][] = [
  ['top', t.vTop],
  ['middle', t.vMiddle],
  ['bottom', t.vBottom],
];

let changes = 0;

/**
 * The sections of the inspector for one text element, setting its whole box: font, size, colour,
 * line height, letter spacing, alignment, fill, padding, outline and shadow. The floating toolbar
 * of the editor sets the font, size and colour of a selection of the text: the fields show what
 * the whole text has (`mixte` when its runs differ), and set it on all of it. A change that makes
 * the text need more room grows the box in the same undo step.
 */
export function TextInspector({ spreadId, element }: { spreadId: string; element: TextElement }) {
  /** Merge key of the last change, until the box has been fitted to it. */
  const pending = useRef<string | null>(null);

  const change = (patch: Partial<Element>, label: string, mergeKey?: string) => {
    const key = mergeKey ?? `text-inspector:${++changes}`;
    pending.current = key;
    editorStore
      .getState()
      .apply((b) => updateElements(b, spreadId, [element.id], patch), label, key);
  };
  const setStyle = (patch: Partial<TextElement['style']>, label: string, mergeKey?: string) =>
    change({ style: { ...element.style, ...patch } }, label, mergeKey);
  /**
   * The font, size or colour of the whole text: the box takes it, and the runs the floating
   * toolbar gave their own let go of it, so that all of the text shows it, and the toolbar too.
   */
  const setRunStyle = (
    key: RunStyleKey,
    patch: Partial<TextElement['style']>,
    label: string,
    mergeKey?: string,
  ) =>
    change(
      { style: { ...element.style, ...patch }, doc: withoutRunStyle(element.doc, key) },
      label,
      mergeKey,
    );

  // After the canvas has drawn the change: a box too short for its text grows, as part of the step.
  useEffect(() => {
    const key = pending.current;
    if (key === null) return;
    pending.current = null;
    growToFit(spreadId, element.id, t.undoSize, key);
  }, [spreadId, element]);

  const { style, box, outline, shadow } = element;
  // What the text shows, toolbar changes included: `null` where its runs differ.
  const look = textLook(element);
  const shadowColor = shadow ? splitColor(shadow.color) : null;

  return (
    <>
      <Section title={t.text}>
        <div className="insp-field">
          <label className="insp-field__label" htmlFor="text-font">
            {t.font}
          </label>
          <FontSelect
            id="text-font"
            className="input insp-select"
            label={t.font}
            value={look.fontFamily ?? style.fontFamily}
            mixed={look.fontFamily === null}
            more
            onChange={(css) => setRunStyle('fontFamily', { fontFamily: css }, t.undoFont)}
          />
        </div>
        <NumberField
          label={t.size}
          unit={fr.text.sizeUnit}
          value={look.fontSizePt ?? style.fontSizePt}
          mixed={look.fontSizePt === null}
          min={1}
          max={400}
          onCommit={(fontSizePt) => setRunStyle('fontSize', { fontSizePt }, t.undoSize)}
        />
        <ColorField
          label={t.color}
          value={splitColor(look.color ?? style.color).hex}
          onChange={(hex, gesture) => setRunStyle('color', { color: hex }, t.undoColor, gesture)}
        />
        <NumberField
          label={t.lineHeight}
          value={style.lineHeight}
          min={0.5}
          max={4}
          onCommit={(lineHeight) => setStyle({ lineHeight }, t.undoLineHeight)}
        />
        <NumberField
          label={t.letterSpacing}
          unit={t.em}
          value={style.letterSpacing}
          min={-0.2}
          max={1}
          onCommit={(letterSpacing) => setStyle({ letterSpacing }, t.undoLetterSpacing)}
        />
        <div className="insp-field">
          <span className="insp-field__label">{t.align}</span>
        </div>
        <div className="seg" role="group" aria-label={t.align}>
          {ALIGNS.map(([value, text]) => (
            <button
              key={value}
              type="button"
              aria-pressed={element.align === value}
              onClick={() => element.align !== value && change({ align: value }, t.undoAlign)}
            >
              {text}
            </button>
          ))}
        </div>
        <div className="insp-field">
          <span className="insp-field__label">{t.vAlign}</span>
        </div>
        <div className="seg" role="group" aria-label={t.vAlign}>
          {V_ALIGNS.map(([value, text]) => (
            <button
              key={value}
              type="button"
              aria-pressed={element.vAlign === value}
              onClick={() => element.vAlign !== value && change({ vAlign: value }, t.undoVAlign)}
            >
              {text}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t.box}>
        <label className="insp-check">
          <input
            type="checkbox"
            checked={box.fill !== null}
            onChange={(e) =>
              change({ box: { ...box, fill: e.target.checked ? NEW_FILL : null } }, t.undoFill)
            }
          />
          {t.fillOn}
        </label>
        {box.fill !== null && (
          <ColorField
            label={t.fill}
            value={splitColor(box.fill).hex}
            onChange={(hex, gesture) => change({ box: { ...box, fill: hex } }, t.undoFill, gesture)}
          />
        )}
        <NumberField
          label={t.padding}
          unit={t.mm}
          value={box.padding}
          min={0}
          max={50}
          onCommit={(padding) => change({ box: { ...box, padding } }, t.undoPadding)}
        />
      </Section>

      <Section title={t.outline}>
        <NumberField
          label={t.outlineWidth}
          unit={t.mm}
          value={outline?.width ?? 0}
          min={0}
          max={20}
          onCommit={(width) =>
            change(
              {
                outline: width === 0 ? null : { color: outline?.color ?? NEW_OUTLINE.color, width },
              },
              t.undoOutline,
            )
          }
        />
        {outline && (
          <ColorField
            label={t.color}
            value={splitColor(outline.color).hex}
            onChange={(hex, gesture) =>
              change({ outline: { width: outline.width, color: hex } }, t.undoOutline, gesture)
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
              display={`${Math.round(shadowColor.alpha * 100)} ${t.percent}`}
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
    </>
  );
}
