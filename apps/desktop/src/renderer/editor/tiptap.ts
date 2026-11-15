import { Extension, InputRule, type AnyExtension } from '@tiptap/core';
import { TextAlign } from '@tiptap/extension-text-align';
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style';
import StarterKit from '@tiptap/starter-kit';
import { frenchSpacing } from '@travelbook/core';

/** A mark that `frenchSpacing` spaces: it is typed after a word, with or without a space. */
const MARK_BEFORE = /[ \u00A0\u202F]*[;!?:»]$/;
/** `«` followed by a typed space: the space becomes a no-break one. */
const OPENING_SPACE = /«[ \u00A0]$/;
/** A scheme whose colon was spaced as French asks, followed by the first slash of `//`. */
const SCHEME_AFTER_COLON = /([a-z][a-z0-9+.-]*)\u00A0:\/$/i;
/** The word being typed is a web address: its `?` and `:` stay as typed. */
const WEB_ADDRESS = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S*$/i;

/**
 * Input rules that set French spacing as the user types (spec §7.3): the same replacements as
 * `frenchSpacing`, applied at the cursor. A colon after a digit is left alone (`7:45`).
 */
export const FrenchTypography = Extension.create({
  name: 'frenchTypography',
  addInputRules() {
    return [
      new InputRule({
        find: MARK_BEFORE,
        handler: ({ state, range, match }) => {
          const typed = match[0];
          const mark = typed[typed.length - 1] as string;
          const block = state.doc.resolve(range.from).parent;
          const upTo = block.textBetween(
            0,
            state.doc.resolve(range.from).parentOffset,
            undefined,
            '\uFFFC',
          );
          if (WEB_ADDRESS.test(upTo)) return null;
          const before = upTo.slice(-1);
          if (mark === ':' && /\d/.test(before)) return null;
          const replacement = frenchSpacing(before + typed).slice(before.length);
          if (replacement === typed) return null;
          state.tr.insertText(replacement, range.from, range.to);
        },
      }),
      new InputRule({
        // `https :` became a URL scheme once its first slash is typed: take the space back.
        find: SCHEME_AFTER_COLON,
        handler: ({ state, range, match }) => {
          state.tr.insertText(`${match[1]}:/`, range.from, range.to);
        },
      }),
      new InputRule({
        find: OPENING_SPACE,
        handler: ({ state, range }) => {
          state.tr.insertText('«\u00A0', range.from, range.to);
        },
      }),
    ];
  },
});

/**
 * The Tiptap extensions of a text box: exactly the nodes, marks and attributes the static
 * serializer (`textHtml`, Task 4.2) lets through. The French input rules are only added when the
 * book asks for French typography.
 */
export function textExtensions(frenchTypography: boolean): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: false,
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      dropcursor: false,
      gapcursor: false,
      trailingNode: false,
    }),
    TextStyle,
    FontFamily,
    FontSize,
    Color,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ...(frenchTypography ? [FrenchTypography] : []),
  ];
}
