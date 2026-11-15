import type { TextElement } from '@travelbook/core';
import type { Quality } from '../types';
import { useMemo, type CSSProperties, type ReactElement } from 'react';
import { validColor } from '../cssValues';
import '../text.css';
import { textShadowIsNative } from '../shadows';
import { textHtml } from '../textHtml';
import { mm, round } from '../units';
import { elementBoxStyle } from './boxStyle';

const V_ALIGN = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

/**
 * Inline style of a text box: its place on the spread plus the custom properties `text.css` reads.
 * The editor mounts its host with the same style, so both lay text out the same way.
 */
export function textBoxStyle(el: TextElement, quality?: Quality): CSSProperties {
  const { style, outline, shadow } = el;
  const vars: Record<string, string> = {
    '--tb-text-padding': mm(el.box.padding),
    '--tb-text-family': style.fontFamily,
    '--tb-text-size': `${round(style.fontSizePt)}pt`,
    ...(validColor(style.color) ? { '--tb-text-color': validColor(style.color) as string } : {}),
    '--tb-text-line-height': `${round(style.lineHeight)}`,
    '--tb-text-letter-spacing': `${round(style.letterSpacing)}em`,
    '--tb-text-align': el.align,
    '--tb-text-valign': V_ALIGN[el.vAlign],
  };
  const fill = validColor(el.box.fill);
  const outlineColor = outline ? validColor(outline.color) : null;
  const shadowColor = shadow ? validColor(shadow.color) : null;
  return {
    ...elementBoxStyle(el),
    ...vars,
    background: fill ?? undefined,
    // Inside the box, like the stroke of a shape.
    outline: outline && outlineColor ? `${mm(outline.width)} solid ${outlineColor}` : undefined,
    outlineOffset: outline && outlineColor ? mm(-outline.width) : undefined,
    ...(shadow && shadowColor ? shadowStyle(el, shadowColor, quality) : {}),
  };
}

function shadowStyle(el: TextElement, color: string, quality: Quality | undefined): CSSProperties {
  const { dx, dy, blur } = el.shadow as NonNullable<TextElement['shadow']>;
  if (quality === 'export' && textShadowIsNative(el)) {
    // `drop-shadow` takes a standard deviation, `text-shadow` and `box-shadow` a blur radius: twice it.
    const value = `${mm(dx)} ${mm(dy)} ${mm(2 * blur)}`;
    return validColor(el.box.fill)
      ? { boxShadow: `${value} ${color}` }
      : { textShadow: `${value} ${color}` };
  }
  return { filter: `drop-shadow(${mm(dx)} ${mm(dy)} ${mm(blur)} ${color})` };
}

/** A text element, drawn as static HTML. The font families it names must be loaded by the caller. */
export function TextView({ el, quality }: { el: TextElement; quality?: Quality }): ReactElement {
  const html = useMemo(() => textHtml(el.doc), [el.doc]);
  return (
    <div
      className="tb-text"
      data-element-id={el.id}
      data-element-type="text"
      style={textBoxStyle(el, quality)}
    >
      <div className="tb-text__content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
