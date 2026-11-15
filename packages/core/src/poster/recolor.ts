/** The two colour roles a poster illustration can change, by class name on its shapes. */
export const ROLE_MAIN = 'tb-main';
export const ROLE_SHADE = 'tb-shade';

const OPEN_TAG = /<([A-Za-z][\w:-]*)(\s[^<>]*?)?(\/?)>/g;
const CLASS_ATTR = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/;
const FILL_ATTR = /(\sfill\s*=\s*)(?:"[^"]*"|'[^']*')/;

/**
 * The illustration with the fill of every `tb-main` shape set to `main` and every `tb-shade`
 * shape set to `shade` (inserted when the shape has none). Everything else is left byte for
 * byte. Works on the markup with regular expressions, so it runs in Node and in the renderer.
 */
export function recolorIllustration(svg: string, colors: { main: string; shade: string }): string {
  return svg.replace(OPEN_TAG, (tag, name: string, attrs: string | undefined, close: string) => {
    if (!attrs) return tag;
    const cls = CLASS_ATTR.exec(attrs);
    if (!cls) return tag;
    const tokens = (cls[1] ?? cls[2] ?? '').split(/\s+/);
    const fill = tokens.includes(ROLE_MAIN)
      ? colors.main
      : tokens.includes(ROLE_SHADE)
        ? colors.shade
        : null;
    if (fill === null) return tag;
    const next = FILL_ATTR.test(attrs)
      ? attrs.replace(FILL_ATTR, (_m, lead: string) => `${lead}"${fill}"`)
      : `${attrs} fill="${fill}"`;
    return `<${name}${next}${close}>`;
  });
}
