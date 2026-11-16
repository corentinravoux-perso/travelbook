import { produce } from 'immer';
import { boundingBox } from '../geometry';
import type { Book, Mm } from '../schema';
import { OpError } from './errors';

/** What the book settings dialog changes, apart from the format (see `setFormat`). */
export interface BookSettingsPatch {
  bleed?: Mm;
  coverBleed?: Mm;
  safeMargin?: Mm;
  spineWidth?: Mm;
  pageRule?: Book['pageRule'];
  settings?: Partial<Book['settings']>;
}

const nonNeg = (value: number): boolean => Number.isFinite(value) && value >= 0;
const positive = (value: number): boolean => Number.isFinite(value) && value > 0;

/**
 * Change bleeds, safe margin, spine width, page rule and the typography and dpi settings.
 * Throws `OpError` for a negative or non-finite size, a page rule that is not `multiple` 1, 2 or
 * 4 over a positive `min`, or a `dpiGood` under `dpiLow`.
 *
 * A new spine width keeps the cover's content in place on its page: what sits on the front page
 * moves with it, and what sits on the spine stays centred on the spine (spine text). Removing the
 * spine (width 0) removes what lay on it alone (a spine title, which would straddle the fold);
 * an element that runs across it, such as a wrap-around photo, stays.
 */
export function setBookSettings(book: Book, patch: BookSettingsPatch): Book {
  for (const key of ['bleed', 'coverBleed', 'safeMargin', 'spineWidth'] as const) {
    const value = patch[key];
    if (value !== undefined && !nonNeg(value)) {
      throw new OpError(`${key} must be a non-negative, finite number of mm.`);
    }
  }
  if (patch.pageRule !== undefined) {
    const { min, multiple } = patch.pageRule;
    if (!Number.isInteger(min) || min < 1 || ![1, 2, 4].includes(multiple)) {
      throw new OpError(
        'The page rule needs a positive whole minimum and a multiple of 1, 2 or 4.',
      );
    }
  }
  const settings = { ...book.settings, ...patch.settings };
  if (
    !positive(settings.dpiLow) ||
    !positive(settings.dpiGood) ||
    settings.dpiGood < settings.dpiLow
  ) {
    throw new OpError('The dpi thresholds must be positive, with dpiGood at least dpiLow.');
  }
  return produce(book, (draft) => {
    if (patch.bleed !== undefined) draft.bleed = patch.bleed;
    if (patch.coverBleed !== undefined) draft.coverBleed = patch.coverBleed;
    if (patch.safeMargin !== undefined) draft.safeMargin = patch.safeMargin;
    if (patch.pageRule !== undefined) draft.pageRule = { ...patch.pageRule };
    draft.settings = settings;
    const next = patch.spineWidth;
    if (next === undefined || next === book.spineWidth) return;
    const W = book.format.width;
    const old = book.spineWidth;
    if (next === 0) {
      draft.cover.elements = draft.cover.elements.filter((el) => {
        const box = boundingBox(el);
        const cx = box.x + box.w / 2;
        return !(cx >= W && cx < W + old && box.w <= old + 0.5);
      });
    }
    for (const el of draft.cover.elements) {
      const cx = el.x + el.w / 2;
      if (cx >= W + old) el.x += next - old;
      else if (cx >= W) el.x = W + next / 2 + (cx - (W + old / 2)) - el.w / 2;
    }
    draft.spineWidth = next;
  });
}
