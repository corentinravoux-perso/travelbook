import { updateElements, type Book, type Element, type StickerElement } from '@travelbook/core';
import { editorStore } from '../../store/editor';
import { fr } from '../../strings/fr';
import { Icon } from '../../theme/Icon';
import { CreditsMenuButton } from '../CreditsDialog';
import { splitColor } from './color';
import { ColorField, Section } from './controls';

const t = fr.stickerInspector;

/** The tint a sticker gets when the user switches it on. */
const NEW_TINT = '#3d3d3d';

/**
 * The sections of the inspector for one sticker: flip, and a tint for single-colour pictograms.
 * Opacity is in the common section. The tint paints the sticker's silhouette in one colour, so it
 * is offered for SVG stickers (a coloured one becomes a silhouette: the user's choice).
 */
export function StickerInspector({
  book,
  spreadId,
  element,
}: {
  book: Book;
  spreadId: string;
  element: StickerElement;
}) {
  const change = (patch: Partial<Element>, label: string, mergeKey?: string) =>
    editorStore
      .getState()
      .apply((b) => updateElements(b, spreadId, [element.id], patch), label, mergeKey);
  const asset = book.assets[element.assetId];
  const tintable = asset !== undefined && /\.svg$/i.test(asset.file);

  return (
    <>
      <Section title={t.flip}>
        <div className="insp-actions">
          <button
            type="button"
            className="icon-button insp-toggle"
            aria-label={t.flipH}
            title={t.flipH}
            aria-pressed={element.flipH}
            onClick={() => change({ flipH: !element.flipH }, fr.stickers.undoFlip)}
          >
            <Icon name="flip-horizontal" />
          </button>
          <button
            type="button"
            className="icon-button insp-toggle"
            aria-label={t.flipV}
            title={t.flipV}
            aria-pressed={element.flipV}
            onClick={() => change({ flipV: !element.flipV }, fr.stickers.undoFlip)}
          >
            <Icon name="flip-vertical" />
          </button>
        </div>
      </Section>

      {(tintable || element.tint !== null) && (
        <Section title={t.tint}>
          <label className="insp-check" title={t.tintHelp}>
            <input
              type="checkbox"
              checked={element.tint !== null}
              onChange={(e) =>
                change({ tint: e.target.checked ? NEW_TINT : null }, fr.stickers.undoTint)
              }
            />
            {t.tintOn}
          </label>
          {element.tint !== null && (
            <ColorField
              label={t.tintColor}
              value={splitColor(element.tint).hex}
              onChange={(hex, gesture) => change({ tint: hex }, fr.stickers.undoTint, gesture)}
            />
          )}
        </Section>
      )}

      {asset?.licence !== undefined && (
        <Section title={t.licence}>
          <p className="insp-note">
            {fr.credits.entry(
              asset.originalName.replace(/\.[A-Za-z0-9]{1,5}$/, ''),
              asset.licence.author,
              asset.licence.licence,
              asset.licence.source,
            )}
          </p>
          <CreditsMenuButton />
        </Section>
      )}
    </>
  );
}
