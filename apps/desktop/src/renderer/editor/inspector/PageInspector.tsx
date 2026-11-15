import { type Background, type Book, type Spread } from '@travelbook/core';
import { editorStore, useEditor, type Guides } from '../../store/editor';
import { fr } from '../../strings/fr';
import { spreadName } from '../pages';
import { Section } from './controls';

const t = fr.pageInspector;

const GUIDES: (keyof Guides)[] = ['bleed', 'trim', 'safe', 'gutter'];

/** One line about a background, as the user would say it. */
function describe(background: Background): string {
  switch (background.kind) {
    case 'color':
      return t.color(background.color);
    case 'gradient':
      return t.gradient;
    case 'pattern':
      return t.pattern;
    case 'image':
      return t.image;
  }
}

/**
 * What the inspector shows when nothing is selected: the page being edited, its background in a
 * line per layer, the template in use, and the guides of the canvas (the same switches as the
 * View menu).
 */
export function PageInspector({ book, spread }: { book: Book; spread: Spread }) {
  const guides = useEditor((s) => s.guides);
  const layers = (
    [
      ['spread', t.spreadLayer],
      ['left', t.leftLayer],
      ['right', t.rightLayer],
    ] as const
  ).flatMap(([key, label]) => {
    const background = spread.background[key];
    return background ? [{ key, label, text: describe(background) }] : [];
  });

  return (
    <div data-testid="page-inspector">
      <Section>
        <h2 className="insp-title">{t.title}</h2>
        <p className="insp-file">{spreadName(book, spread)}</p>
        <p className="insp-hint">
          {t.sizeValue(book.format.width, book.format.height)} ·{' '}
          {t.elements(spread.elements.length)}
        </p>
      </Section>

      <Section title={t.background}>
        {layers.length === 0 ? (
          <p className="insp-hint">{t.noBackground}</p>
        ) : (
          <dl className="insp-summary">
            {layers.map(({ key, label, text }) => (
              <div key={key} className="insp-summary__row">
                <dt>{label}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      <Section title={t.template}>
        <p className="insp-hint">{t.noTemplate}</p>
      </Section>

      <Section title={t.guides}>
        {GUIDES.map((key) => (
          <label key={key} className="insp-check">
            <input
              type="checkbox"
              checked={guides[key]}
              onChange={(e) => editorStore.getState().setGuide(key, e.target.checked)}
            />
            {fr.canvas[key]}
          </label>
        ))}
      </Section>
    </div>
  );
}
