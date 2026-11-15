// A colour of the document is a CSS string. The inspector's colour input speaks `#rrggbb`, so a
// translucent colour (a shadow) is kept as `#rrggbbaa` and split into the two parts here.

const HEX = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i;

/** Colour used where the stored string is not a hex colour the input can show. */
export const FALLBACK_HEX = '#000000';

/** The `#rrggbb` part and the opacity (0..1) of a stored colour; opaque black if it is not hex. */
export function splitColor(color: string): { hex: string; alpha: number } {
  const m = HEX.exec(color.trim());
  if (!m) return { hex: FALLBACK_HEX, alpha: 1 };
  return {
    hex: `#${(m[1] as string).toLowerCase()}`,
    alpha: m[2] === undefined ? 1 : Math.round((parseInt(m[2], 16) / 255) * 100) / 100,
  };
}

/** `#rrggbb` with an opacity: `#rrggbbaa`, or plain `#rrggbb` when it is opaque. */
export function joinColor(hex: string, alpha: number): string {
  const base = HEX.exec(hex)?.[1];
  const rgb = `#${(base ?? FALLBACK_HEX.slice(1)).toLowerCase()}`;
  const a = Math.min(1, Math.max(0, alpha));
  if (a >= 0.995) return rgb;
  return `${rgb}${Math.round(a * 255)
    .toString(16)
    .padStart(2, '0')}`;
}
