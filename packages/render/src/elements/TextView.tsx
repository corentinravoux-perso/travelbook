import type { TextElement } from '@travelbook/core';
import { useMemo, type CSSProperties, type ReactElement } from 'react';
import '../text.css';
import { textHtml } from '../textHtml';
import { mm, round } from '../units';
import { elementBoxStyle } from './boxStyle';

const V_ALIGN = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

/**
 * Inline style of a text box: its place on the spread plus the custom properties `text.css` reads.
 * The editor mounts its host with the same style, so both lay text out the same way.
 */
export function textBoxStyle(el: TextElement): CSSProperties {
  const { style, outline, shadow } = el;
  const vars: Record<string, string> = {
    '--tb-text-padding': mm(el.box.padding),
    '--tb-text-family': style.fontFamily,
    '--tb-text-size': `${round(style.fontSizePt)}pt`,
    '--tb-text-color': style.color,
    '--tb-text-line-height': `${round(style.lineHeight)}`,
    '--tb-text-letter-spacing': `${round(style.letterSpacing)}em`,
    '--tb-text-align': el.align,
    '--tb-text-valign': V_ALIGN[el.vAlign],
  };
  return {
    ...elementBoxStyle(el),
    ...vars,
    background: el.box.fill ?? undefined,
    // Inside the box, like the stroke of a shape.
    outline: outline ? `${mm(outline.width)} solid ${outline.color}` : undefined,
    outlineOffset: outline ? mm(-outline.width) : undefined,
    filter: shadow
      ? `drop-shadow(${mm(shadow.dx)} ${mm(shadow.dy)} ${mm(shadow.blur)} ${shadow.color})`
      : undefined,
  };
}

/** A text element, drawn as static HTML. The font families it names must be loaded by the caller. */
export function TextView({ el }: { el: TextElement }): ReactElement {
  const html = useMemo(() => textHtml(el.doc), [el.doc]);
  return (
    <div
      className="tb-text"
      data-element-id={el.id}
      data-element-type="text"
      style={textBoxStyle(el)}
    >
      <div className="tb-text__content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
