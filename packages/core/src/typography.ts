/** Narrow no-break space: goes before ; ! ? and », the way French print sets them. */
const NNBSP = '\u202F';
/** No-break space: goes before : and after «. */
const NBSP = '\u00A0';

/** Plain, no-break and narrow no-break space: the spaces this module replaces. */
const SPACES = '[ \\u00A0\\u202F]*';

const BEFORE_NARROW = new RegExp(`${SPACES}([;!?»])`, 'g');
const BEFORE_COLON = new RegExp(`${SPACES}(:)`, 'g');
const AFTER_OPENING = new RegExp(`«${SPACES}`, 'g');

/** Odd items of a split on this are web addresses; they must keep their `?` and `:` as typed. */
const WEB_ADDRESS = /((?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S*)/i;

/** After one of these a mark opens a run of marks or stands at the start of a line: no space is added. */
const NO_ADDED_SPACE_AFTER = /[\s;!?:«]/;
const DIGIT = /\d/;

/**
 * A space already there is replaced by the right one. Where none is, one is added, unless
 * the mark starts the text or a line, follows another mark (`?!`), or the colon sits between
 * two digits (`7:45`, `1:2`).
 */
function spaceBefore(space: string, isColon: boolean) {
  return (match: string, mark: string, at: number, whole: string): string => {
    if (match.length > mark.length) return space + mark;
    const before = whole[at - 1];
    if (before === undefined || NO_ADDED_SPACE_AFTER.test(before)) return mark;
    const after = whole[at + 1];
    if (isColon && DIGIT.test(before) && after !== undefined && DIGIT.test(after)) return mark;
    return space + mark;
  };
}

/** Same rule after «: nothing is added at the end of the text or before a line break. */
function spaceAfterOpening(match: string, at: number, whole: string): string {
  const after = whole[at + match.length];
  const hasSpace = match.length > 1;
  return hasSpace || (after !== undefined && !/\s/.test(after)) ? `«${NBSP}` : '«';
}

function spaceSegment(text: string): string {
  return text
    .replace(BEFORE_NARROW, spaceBefore(NNBSP, false))
    .replace(BEFORE_COLON, spaceBefore(NBSP, true))
    .replace(AFTER_OPENING, spaceAfterOpening);
}

/**
 * French spacing: a narrow no-break space (U+202F) before `;` `!` `?` and `»`, a no-break space
 * (U+00A0) before `:` and after `«`. Spaces already at those positions are replaced and
 * missing ones added, so applying it twice changes nothing. Web addresses are left alone.
 */
export function frenchSpacing(text: string): string {
  return text
    .split(WEB_ADDRESS)
    .map((part, i) => (i % 2 === 1 ? part : spaceSegment(part)))
    .join('');
}
