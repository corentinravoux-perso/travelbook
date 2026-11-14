/** CSS values taken from a document: each is checked here before it reaches a style. */

const NUMBER = String.raw`[+-]?\d*\.?\d+%?`;
const COLOR_FUNCTION = new RegExp(
  String.raw`^(?:rgba?|hsla?)\(\s*${NUMBER}(?:deg)?(?:\s*[, /]\s*${NUMBER}(?:deg)?){2,3}\s*\)$`,
  'i',
);

/** A hex, `rgb()`, `hsl()` or keyword colour, or null. */
export function validColor(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const c = v.trim();
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c)) return c;
  if (COLOR_FUNCTION.test(c)) return c;
  if (/^[a-z]{3,24}$/i.test(c)) return c;
  return null;
}
