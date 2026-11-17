import type { MapElement } from '@travelbook/core';
import { openMapDialog } from '../maps/dialogModel';
import { editorStore, useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import './MapsPanel.css';

const t = fr.maps;

/**
 * The "Cartes" panel: the button of the map dialog and the maps already in the album (a click
 * goes to the map and opens it).
 */
export function MapsPanel() {
  const book = useEditor((s) => s.book);
  const maps = book
    ? [book.cover, ...book.spreads].flatMap((spread) =>
        spread.elements
          .filter((el): el is MapElement => el.type === 'map')
          .map((el) => ({ spreadId: spread.id, el })),
      )
    : [];
  return (
    <div className="maps-panel">
      <p className="maps-panel__hint">{t.panelHint}</p>
      <button type="button" className="button button--primary" onClick={() => void openMapDialog()}>
        <Icon name="map" />
        {t.open}
      </button>
      <h3 className="maps-panel__title">{t.panelList}</h3>
      {maps.length === 0 ? (
        <p className="maps-panel__hint">{t.panelEmpty}</p>
      ) : (
        <ul className="maps-panel__list">
          {maps.map(({ spreadId, el }) => (
            <li key={el.id}>
              <button
                type="button"
                className="maps-panel__item"
                onClick={() => {
                  const store = editorStore.getState();
                  store.goToSpread(spreadId);
                  store.select([el.id]);
                  void openMapDialog({ spreadId, elementId: el.id });
                }}
              >
                {el.name || el.subject.id}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
