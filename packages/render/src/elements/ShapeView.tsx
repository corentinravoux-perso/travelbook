import { MM_TO_PX, type ShapeElement } from '@travelbook/core';
import type { ReactElement } from 'react';
import { round } from '../units';
import { elementBoxStyle } from './boxStyle';

/** Inner radius of a star, as a fraction of its outer radius. */
const STAR_INNER_RATIO = 0.5;

/** Corners of a regular polygon or star inscribed in the ellipse (cx, cy, rx, ry), tip up. */
function corners(
  count: number,
  [cx, cy, rx, ry]: [number, number, number, number],
  star: boolean,
): string {
  const total = star ? 2 * count : count;
  return Array.from({ length: total }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / total;
    const k = star && i % 2 === 1 ? STAR_INNER_RATIO : 1;
    return `${round(cx + k * rx * Math.cos(angle))},${round(cy + k * ry * Math.sin(angle))}`;
  }).join(' ');
}

export interface ShapeViewProps {
  el: ShapeElement;
}

/**
 * One SVG per shape, drawn in mm (the group scales user units to CSS px, so a box of height 0 still
 * draws). The stroke is kept inside the box: its outline is inset by half the stroke width.
 */
export function ShapeView({ el }: ShapeViewProps): ReactElement {
  const { w, h, stroke } = el;
  const sw = stroke?.width ?? 0;
  const paint = {
    fill: el.fill ?? 'none',
    stroke: stroke ? stroke.color : 'none',
    strokeWidth: stroke ? sw : undefined,
  };
  const inset = Math.min(sw / 2, w / 2, h / 2);
  const ellipse: [number, number, number, number] = [w / 2, h / 2, w / 2 - inset, h / 2 - inset];

  let drawing: ReactElement | null = null;
  switch (el.shape) {
    case 'rect': {
      const rx = Math.max(0, Math.min(el.radius, w / 2, h / 2) - inset);
      drawing = (
        <rect
          x={inset}
          y={inset}
          width={w - 2 * inset}
          height={h - 2 * inset}
          rx={round(rx)}
          {...paint}
        />
      );
      break;
    }
    case 'ellipse':
      drawing = (
        <ellipse cx={ellipse[0]} cy={ellipse[1]} rx={ellipse[2]} ry={ellipse[3]} {...paint} />
      );
      break;
    case 'line':
    case 'arrow': {
      // A line or an arrow is a stroke: without one there is nothing to draw.
      if (!stroke) break;
      const head = el.shape === 'arrow' ? Math.min(w, h) : 0;
      drawing = (
        <>
          <line
            x1={0}
            y1={h / 2}
            x2={w - head}
            y2={h / 2}
            stroke={stroke.color}
            strokeWidth={stroke.width}
            strokeLinecap="butt"
          />
          {head > 0 ? (
            <polygon points={`${w},${h / 2} ${w - head},0 ${w - head},${h}`} fill={stroke.color} />
          ) : null}
        </>
      );
      break;
    }
    case 'polygon':
    case 'star':
      drawing = <polygon points={corners(el.points, ellipse, el.shape === 'star')} {...paint} />;
      break;
  }

  return (
    <div data-element-id={el.id} data-element-type="shape" style={elementBoxStyle(el)}>
      <svg
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
        }}
      >
        <g transform={`scale(${MM_TO_PX})`}>{drawing}</g>
      </svg>
    </div>
  );
}
