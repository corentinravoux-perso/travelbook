import type { TextElement } from '@travelbook/core';
import type { ReactElement } from 'react';
import { elementBoxStyle } from './boxStyle';

/**
 * A text element until Task 4.2 draws it for real: an empty box with a hairline outline, so that
 * it is there to be found and moved but shows no text and takes no typographic decision.
 */
export function TextPlaceholder({ el }: { el: TextElement }): ReactElement {
  return (
    <div
      data-element-id={el.id}
      data-element-type="text"
      data-placeholder=""
      style={{
        ...elementBoxStyle(el),
        outline: '0.2mm dashed rgba(90, 90, 100, 0.45)',
        outlineOffset: '-0.2mm',
      }}
    />
  );
}
