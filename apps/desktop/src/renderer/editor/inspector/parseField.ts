/**
 * A number typed in an inspector field: a comma is a decimal mark, and a minus sign (the keyboard's
 * hyphen or the typographic one) makes it negative. `null` when it is not a number or lies outside
 * `[min, max]`.
 */
export function parseField(text: string, min: number, max: number): number | null {
  const normal = text.trim().replace(',', '.').replace('−', '-');
  if (!/^-?\d+(\.\d+)?$/.test(normal)) return null;
  const value = Number(normal);
  return value >= min && value <= max ? value : null;
}
