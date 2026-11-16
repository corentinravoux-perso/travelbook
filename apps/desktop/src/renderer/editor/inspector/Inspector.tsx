import { useState } from 'react';
import { findSpread, useEditor } from '../../store/editor';
import { fr } from '../../strings/fr';
import { Icon } from '../../theme/Icon';
import { HistoryPanel } from '../HistoryPanel';
import { LayersPanel } from '../LayersPanel';
import { CommonSection } from './CommonSection';
import { PageInspector } from './PageInspector';
import { PhotoInspector } from './PhotoInspector';
import { ShapeInspector } from './ShapeInspector';
import { StickerInspector } from './StickerInspector';
import { TextInspector } from './TextInspector';
import './Inspector.css';

type Tab = 'properties' | 'layers' | 'history';

const TABS: [Tab, string][] = [
  ['properties', fr.inspector.properties],
  ['layers', fr.inspector.layers],
  ['history', fr.inspector.history],
];

/** The properties tab: the page when nothing is selected, else the selection's own sections. */
function Properties() {
  const book = useEditor((s) => s.book);
  const spreadId = useEditor((s) => s.currentSpreadId);
  const selection = useEditor((s) => s.selection);
  const spread = findSpread(book, spreadId);
  if (book === null || spread === undefined) {
    return <p className="shell-empty">{fr.shell.noAlbum}</p>;
  }
  const selected = spread.elements.filter((el) => selection.includes(el.id));
  const only = selected.length === 1 ? selected[0] : undefined;
  if (selected.length === 0) {
    return (
      <div className="inspector">
        <PageInspector book={book} spread={spread} />
      </div>
    );
  }
  // One instance per element: a field's unsaved text must never follow the selection to the next
  // element and be committed there when it loses focus.
  const key = only?.id ?? 'selection';
  return (
    <div className="inspector">
      <CommonSection key={`common:${key}`} spreadId={spread.id} elements={selected} />
      {only?.type === 'photo' && (
        <PhotoInspector key={`type:${key}`} book={book} spreadId={spread.id} element={only} />
      )}
      {only?.type === 'text' && (
        <TextInspector key={`type:${key}`} spreadId={spread.id} element={only} />
      )}
      {only?.type === 'sticker' && (
        <StickerInspector key={`type:${key}`} book={book} spreadId={spread.id} element={only} />
      )}
      {only?.type === 'shape' && (
        <ShapeInspector key={`type:${key}`} spreadId={spread.id} element={only} />
      )}
    </div>
  );
}

/**
 * The inspector (spec §8): three tabs. Properties shows the selected element (common section,
 * then the sections of its kind) or the page; Layers the stack of the spread; History the
 * snapshots of the project.
 */
export function Inspector({ onFold }: { onFold?(): void } = {}) {
  const [tab, setTab] = useState<Tab>('properties');
  return (
    <div className="insp-pane">
      <div className="insp-head">
        <div className="insp-tabs" role="tablist" aria-label={fr.inspector.tabs}>
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`insp-tab-${id}`}
              className="insp-tab"
              aria-selected={tab === id}
              aria-controls="insp-tabpanel"
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {onFold && (
          <button
            type="button"
            className="icon-button insp-fold"
            aria-label={fr.shell.foldInspector}
            title={fr.shell.foldInspector}
            aria-expanded={true}
            aria-controls="shell-inspector"
            onClick={onFold}
          >
            <Icon name="layout-sidebar-right-collapse" />
          </button>
        )}
      </div>
      <div
        id="insp-tabpanel"
        className="insp-pane"
        role="tabpanel"
        aria-labelledby={`insp-tab-${tab}`}
      >
        {tab === 'properties' && <Properties />}
        {tab === 'layers' && <LayersPanel />}
        {tab === 'history' && <HistoryPanel />}
      </div>
    </div>
  );
}
