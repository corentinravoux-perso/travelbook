import { ICONS, type IconName } from './icons';

/**
 * A Tabler icon as inline SVG in `currentColor`, sized by `--icon`. Decorative: the button or
 * label around it carries the accessible name.
 */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      // A fixed string from icons.ts, generated from the pinned Tabler package.
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
