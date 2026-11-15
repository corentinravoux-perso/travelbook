import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { polygonPoints, type Thumb, type ThumbDecoration, type ThumbSlot } from './thumbModel';

const turn = (b: { x: number; y: number; w: number; h: number; rotation: number }) =>
  b.rotation === 0 ? undefined : `rotate(${b.rotation} ${b.x + b.w / 2} ${b.y + b.h / 2})`;

function Decoration({ d }: { d: ThumbDecoration }) {
  const paint = {
    fill: d.fill ?? 'none',
    stroke: d.stroke?.color ?? 'none',
    strokeWidth: d.stroke?.width,
    opacity: d.opacity,
    transform: turn(d),
  };
  switch (d.shape) {
    case 'rect':
      return <rect x={d.x} y={d.y} width={d.w} height={d.h} {...paint} />;
    case 'ellipse':
      return <ellipse cx={d.x + d.w / 2} cy={d.y + d.h / 2} rx={d.w / 2} ry={d.h / 2} {...paint} />;
    case 'line':
    case 'arrow':
      return d.stroke ? (
        <line x1={d.x} y1={d.y + d.h / 2} x2={d.x + d.w} y2={d.y + d.h / 2} {...paint} />
      ) : null;
    case 'polygon':
    case 'star':
      return <polygon points={polygonPoints(d)} {...paint} />;
  }
}

function Slot({ s }: { s: ThumbSlot }) {
  if (s.kind === 'text') {
    const thick = s.textRole === 'title';
    return (
      <g transform={turn(s)} className="tpl-thumb__text" data-thick={thick || undefined}>
        {s.lines.map((y, i) => (
          <line
            key={i}
            x1={s.x}
            x2={s.x + s.w * (thick || i < s.lines.length - 1 ? 1 : 0.6)}
            y1={y}
            y2={y}
          />
        ))}
      </g>
    );
  }
  return s.round ? (
    <ellipse
      className="tpl-thumb__photo"
      cx={s.x + s.w / 2}
      cy={s.y + s.h / 2}
      rx={s.w / 2}
      ry={s.h / 2}
      transform={turn(s)}
    />
  ) : (
    <rect
      className="tpl-thumb__photo"
      x={s.x}
      y={s.y}
      width={s.w}
      height={s.h}
      transform={turn(s)}
    />
  );
}

/** The page's own paint, or the blank paper. */
function Ground({ thumb, id }: { thumb: Thumb; id: string }) {
  const bg = thumb.background;
  if (bg?.kind === 'color') return <rect width={thumb.w} height={thumb.h} fill={bg.color} />;
  if (bg?.kind === 'gradient') {
    const a = (bg.angle * Math.PI) / 180;
    const [dx, dy] = [Math.sin(a) / 2, -Math.cos(a) / 2];
    const stops = bg.stops.map((s) => (
      <stop key={s.offset} offset={s.offset} stopColor={s.color} />
    ));
    return (
      <>
        <defs>
          {bg.type === 'linear' ? (
            <linearGradient id={id} x1={0.5 - dx} y1={0.5 - dy} x2={0.5 + dx} y2={0.5 + dy}>
              {stops}
            </linearGradient>
          ) : (
            <radialGradient id={id}>{stops}</radialGradient>
          )}
        </defs>
        <rect width={thumb.w} height={thumb.h} fill={`url(#${id})`} />
      </>
    );
  }
  return <rect width={thumb.w} height={thumb.h} className="tpl-thumb__paper" />;
}

/** One template as a drawing: the page, its decorations, and a frame for every photo and text. */
export function TemplateThumb({ thumb }: { thumb: Thumb }) {
  const id = useId();
  return (
    <svg
      className="tpl-thumb"
      viewBox={`0 0 ${thumb.w} ${thumb.h}`}
      aria-hidden="true"
      focusable="false"
    >
      <Ground thumb={thumb} id={id} />
      {thumb.decorations.map((d, i) => (
        <Decoration key={`d${i}`} d={d} />
      ))}
      {thumb.slots.map((s, i) => (
        <Slot key={`s${i}`} s={s} />
      ))}
    </svg>
  );
}

/**
 * Draws its children once the box scrolls near the viewport and keeps them: a list of a few
 * hundred templates only builds the drawings the user gets to see. Without
 * `IntersectionObserver` (a test) everything is drawn at once.
 */
export function WhenVisible({
  aspect,
  children,
}: {
  /** Width over height of what is drawn, so the box holds its place before it is. */
  aspect: number;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = box.current;
    if (seen || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [seen]);
  return (
    <div ref={box} className="tpl-box" style={{ aspectRatio: aspect } as CSSProperties}>
      {seen ? children : null}
    </div>
  );
}
