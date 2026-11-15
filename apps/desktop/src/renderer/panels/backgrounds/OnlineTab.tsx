import { useEffect, useState } from 'react';
import type { StickerHit } from '../../../shared/api';
import { fr } from '../../strings/fr';
import { licenceMark, sourceMessage } from '../stickers/model';
import { useOnlineSearch } from '../stickers/useOnlineSearch';
import { ImageSettings, Thumb } from './ImageTabs';
import { imageOrigin, plainImage } from './model';
import type { TabProps } from './types';

const t = fr.backgrounds;
const s = fr.stickers;

/**
 * "En ligne": Openverse photographs, without the PNG filter the stickers use. A chosen result is
 * kept in the user library as a `background` item with its licence, copied into the album, and
 * laid behind the page in one undo step (spec §9.3).
 */
export function OnlineBackgroundsTab({ book, current, bundled, apply, fail }: TabProps) {
  const [source, setSource] = useState<string | undefined>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const image = current?.kind === 'image' ? current : null;
  const origin = image === null ? null : imageOrigin(image, book.assets, bundled);

  useEffect(() => {
    let live = true;
    window.tb.library.stickers.sources().then(
      (list) => {
        if (live) setSource(list.find((x) => x.backgrounds)?.id);
      },
      (error: unknown) => {
        if (live) setLoadError(sourceMessage(error));
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const search = useOnlineSearch(source, (q, page) =>
    window.tb.library.stickers.search({ source: source as string, q, page }),
  );

  const choose = (hit: StickerHit): void => {
    setBusy(true);
    window.tb.library.stickers
      .add({ source: hit.source, id: hit.id })
      .then((item) => window.tb.assets.fromLibrary(item.id))
      .then((asset) => apply(plainImage(asset.id), { assets: [asset] }))
      .catch((error: unknown) => {
        console.error('Online background failed', error);
        fail(error);
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="bg-tab">
      <section className="bg-block" aria-label={t.onlineTitle}>
        <h3 className="bg-block__title">{t.onlineTitle}</h3>
        <input
          className="input"
          type="search"
          aria-label={t.onlineSearch}
          placeholder={t.onlinePlaceholder}
          value={search.text}
          onChange={(e) => search.setText(e.target.value)}
        />
        <p className="bg-hint">{t.onlineHelp}</p>
        {loadError !== null && (
          <p className="bg-error" role="alert">
            {loadError}
          </p>
        )}
        {search.status === 'loading' && (
          <p className="bg-hint" role="status">
            {s.loading}
          </p>
        )}
        {search.status === 'error' && search.error !== null && (
          <div role="alert">
            <p className="bg-error">{search.error}</p>
            <button type="button" className="button button--small" onClick={search.retry}>
              {s.retry}
            </button>
          </div>
        )}
        {search.status === 'done' && search.items.length === 0 && (
          <p className="bg-hint">{s.empty}</p>
        )}
        {search.items.length > 0 && (
          <div className="bg-grid bg-grid--textures" role="group" aria-label={t.onlineTitle}>
            {search.items.map((hit) => (
              <div key={`${hit.source}:${hit.id}`} className="bg-online-item">
                <Thumb
                  src={hit.thumbUrl}
                  label={hit.title}
                  pressed={false}
                  data={hit.id}
                  onClick={() => (busy ? undefined : choose(hit))}
                />
                <span
                  className="bg-online-item__licence"
                  title={s.licenceTitle(
                    hit.licence.licence,
                    hit.licence.author,
                    hit.licence.source,
                  )}
                >
                  {licenceMark(hit.licence.licence)}
                </span>
              </div>
            ))}
          </div>
        )}
        {search.status === 'done' && search.hasMore && (
          <button type="button" className="button button--small" onClick={search.more}>
            {s.more}
          </button>
        )}
      </section>
      {image !== null && origin === 'mine' && <ImageSettings image={image} apply={apply} />}
    </div>
  );
}
