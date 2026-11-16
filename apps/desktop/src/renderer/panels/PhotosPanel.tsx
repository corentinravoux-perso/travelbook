import { assetUsage, removePhotos, type AssetRef, type Book } from '@travelbook/core';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { PHOTO_DRAG_TYPE, encodePhotoDrag } from '../editor/PhotoDrop';
import { droppedPaths, photoImporter } from '../editor/photoImport';
import { isOnSpread, togglePhotoOnPage } from '../editor/trayToggle';
import { editorStore, useEditor } from '../store/editor';
import { trayStore, useTray } from '../store/tray';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import { PhotoGrid } from './PhotoGrid';
import { PhotoPicker } from './PhotoPicker';
import { PhotoViewer } from './PhotoViewer';
import { PhotoThumb } from './PhotoThumb';
import {
  NO_DATE,
  dayLabel,
  dayState,
  trayGroups,
  type PhotoGroup,
  type SortKey,
  type UsageFilter,
} from './trayModel';
import './Photos.css';

const SORTS: [SortKey, string][] = [
  ['date', fr.photos.sortDate],
  ['name', fr.photos.sortName],
];
const FILTERS: [UsageFilter, string][] = [
  ['all', fr.photos.all],
  ['used', fr.photos.used],
  ['unused', fr.photos.unused],
];

/** A segmented control: one pressed entry, the only inverted fill of its group. */
function Segments<T extends string>({
  label,
  caption,
  entries,
  value,
  onChange,
}: {
  label: string;
  caption: string;
  entries: [T, string][];
  value: T;
  onChange(value: T): void;
}) {
  return (
    <div className="photos__row">
      <span className="photos__caption">{caption}</span>
      <div className="seg" role="group" aria-label={label}>
        {entries.map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            onClick={() => onChange(key)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The checkbox of a day: ticks every photo of the group; half-ticked when only some are. */
function DayHeader({ group, selected }: { group: PhotoGroup; selected: ReadonlySet<string> }) {
  const box = useRef<HTMLInputElement>(null);
  const state = dayState(selected, group.photos);
  useEffect(() => {
    if (box.current) box.current.indeterminate = state === 'some';
  }, [state]);
  const label = group.key === NO_DATE ? fr.photos.noDate : dayLabel(group.key);
  const name = group.key === NO_DATE ? fr.photos.selectNoDate : fr.photos.selectDay(label);
  return (
    <div className="photo-day" data-day={group.key}>
      <label className="photo-day__check">
        <input
          ref={box}
          type="checkbox"
          checked={state === 'all'}
          aria-label={name}
          onChange={(e) =>
            trayStore.getState().setMany(
              group.photos.map((p) => p.id),
              e.target.checked,
            )
          }
        />
        <span className="photo-day__label">{label}</span>
      </label>
      <span className="photo-day__count">{group.photos.length}</span>
    </div>
  );
}

/** Longest wait between the two clicks of a double-click, in ms. */
const DOUBLE_CLICK_MS = 250;

const carriesFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer.types).includes('Files');

/**
 * The tray (spec §8, §9.1): the book's photos as thumbnails grouped by capture day, each marked
 * with how many times it is placed. Photos are dragged from here onto the page; image files and
 * folders are dropped here, or on the page, to import them.
 */
export function PhotosPanel() {
  const book = useEditor((s) => s.book);
  if (book === null) return <p className="shell-empty">{fr.shell.panelEmpty}</p>;
  return <Tray book={book} />;
}

function Tray({ book }: { book: Book }) {
  const sort = useTray((s) => s.sort);
  const filter = useTray((s) => s.filter);
  const selectedIds = useTray((s) => s.selected);
  const pickerOpen = useEditor((s) => s.pickerId !== null);
  const [dropping, setDropping] = useState(false);
  const spreadId = useEditor((s) => s.currentSpreadId);
  /** The photo shown large (a double-click), or `null`. */
  const [viewing, setViewing] = useState<string | null>(null);
  const clickTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(clickTimer.current), []);
  /** Photos waiting for the confirmation of their removal, or `null`. */
  const [removing, setRemoving] = useState<string[] | null>(null);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const groups = useMemo(() => trayGroups(book, { sort, filter }), [book, sort, filter]);
  const usage = useMemo(() => assetUsage(book), [book]);
  const shown = groups.reduce((n, g) => n + g.photos.length, 0);
  const total = Object.values(book.assets).filter((a) => a.kind === 'photo').length;

  // A photo that left the book (undo of an import) cannot stay ticked.
  useEffect(() => {
    const gone = selectedIds.filter((id) => book.assets[id] === undefined);
    if (gone.length > 0) trayStore.getState().setMany(gone, false);
  }, [book, selectedIds]);

  // A photo that left the book (an undo of its import) cannot wait for its removal either.
  const asking = useMemo(() => {
    const left = removing?.filter((id) => book.assets[id] !== undefined) ?? [];
    return left.length > 0 ? left : null;
  }, [book, removing]);

  const cancelRemove = useCallback(() => setRemoving(null), []);
  const ordered = useMemo(() => groups.flatMap((g) => g.photos), [groups]);

  /**
   * A click puts the photo on the page in view or takes it off; it waits for a possible second
   * click, which opens the photo instead. Ctrl or Shift + click ticks it. The keys act at once.
   */
  const activate = (asset: AssetRef) => (e: MouseEvent | KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      trayStore.getState().pick(asset.id, true);
      return;
    }
    window.clearTimeout(clickTimer.current);
    if (e.type !== 'click') {
      togglePhotoOnPage(asset.id);
      return;
    }
    if ((e as MouseEvent).detail > 1) return;
    clickTimer.current = window.setTimeout(() => togglePhotoOnPage(asset.id), DOUBLE_CLICK_MS);
  };
  const open = (asset: AssetRef) => {
    window.clearTimeout(clickTimer.current);
    setViewing(asset.id);
  };
  const remove = (ids: string[]) => {
    editorStore.getState().apply((b) => removePhotos(b, ids), fr.photos.undoRemove);
    trayStore.getState().setMany(ids, false);
    setRemoving(null);
    editorStore.getState().notify(fr.photos.removed(ids.length));
  };

  const importFiles = async () => {
    const paths = await window.tb.photos.pick();
    if (paths.length > 0) await photoImporter.importPaths(paths);
  };

  const dragStart = (asset: AssetRef) => (e: DragEvent) => {
    // Dragging a ticked photo takes the whole selection, in the order of the tray.
    const ticked = groups.flatMap((g) => g.photos).filter((p) => selected.has(p.id));
    const ids = selected.has(asset.id) ? ticked.map((p) => p.id) : [asset.id];
    e.dataTransfer.setData(PHOTO_DRAG_TYPE, encodePhotoDrag(ids));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onFileDrag = (e: DragEvent) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropping(true);
  };
  const onFileLeave = (e: DragEvent) => {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    setDropping(false);
  };
  const onFileDrop = (e: DragEvent) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    setDropping(false);
    // The file list is only readable during the event: take the paths now.
    const paths = droppedPaths(e.dataTransfer.files, (file) => window.tb.photos.pathForFile(file));
    if (paths.length > 0) void photoImporter.importPaths(paths);
  };

  return (
    <div
      className="photos"
      onDragEnter={onFileDrag}
      onDragOver={onFileDrag}
      onDragLeave={onFileLeave}
      onDrop={onFileDrop}
    >
      <button
        type="button"
        className="button button--primary photos__import"
        onClick={() => void importFiles()}
      >
        <Icon name="photo-plus" />
        {fr.photos.import}
      </button>

      <div className="photos__controls">
        <Segments
          label={fr.photos.sortLabel}
          caption={fr.photos.sort}
          entries={SORTS}
          value={sort}
          onChange={(v) => trayStore.getState().setSort(v)}
        />
        <Segments
          label={fr.photos.filterLabel}
          caption={fr.photos.filter}
          entries={FILTERS}
          value={filter}
          onChange={(v) => trayStore.getState().setFilter(v)}
        />
        <p className="photos__count" aria-live="polite">
          {fr.photos.count(shown)}
        </p>
        {shown > 0 && <p className="photos__hint">{fr.photos.trayHint}</p>}
      </div>

      {shown > 0 ? (
        <PhotoGrid
          groups={groups}
          header={(group) => <DayHeader group={group} selected={selected} />}
          thumb={(asset) => (
            <div className="photo-cell">
              <PhotoThumb
                asset={asset}
                uses={usage[asset.id] ?? 0}
                selected={selected.has(asset.id)}
                onPage={isOnSpread(book, spreadId, asset.id)}
                onActivate={activate(asset)}
                onOpen={() => open(asset)}
                onDragStart={dragStart(asset)}
              />
              {/* A shortcut for the pointer; the keyboard ticks photos and uses the bar below. */}
              <button
                type="button"
                className="photo-cell__remove"
                tabIndex={-1}
                aria-label={fr.photos.removeOne(asset.originalName)}
                title={fr.photos.removeTitle}
                onClick={() => setRemoving([asset.id])}
              >
                <Icon name="trash" />
              </button>
            </div>
          )}
        />
      ) : (
        <div className="photos__empty">
          {total === 0 ? (
            <>
              <Icon name="photo-plus" />
              <p className="photos__empty-title">{fr.photos.emptyTitle}</p>
              <p>{fr.photos.emptyHint}</p>
            </>
          ) : (
            <p>{filter === 'used' ? fr.photos.noMatchUsed : fr.photos.noMatchUnused}</p>
          )}
        </div>
      )}

      {(asking !== null || selectedIds.length > 0) && (
        <SelectionBar
          book={book}
          usage={usage}
          selected={selectedIds}
          removing={asking}
          onAsk={() => setRemoving(selectedIds)}
          onCancel={cancelRemove}
          onConfirm={remove}
        />
      )}

      {dropping && (
        <div className="photos__drop" aria-hidden="true">
          {fr.photos.dropHere}
        </div>
      )}
      {pickerOpen && <PhotoPicker book={book} />}
      {viewing !== null && book.assets[viewing] !== undefined && (
        <PhotoViewer
          book={book}
          photos={ordered.some((p) => p.id === viewing) ? ordered : [book.assets[viewing]!]}
          start={viewing}
          usage={usage}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

/**
 * Under the tray while photos are ticked: how many, and the way to take them out of the album.
 * Removing asks first, in place, and says what happens to the frames that show them.
 */
function SelectionBar({
  book,
  usage,
  selected,
  removing,
  onAsk,
  onCancel,
  onConfirm,
}: {
  book: Book;
  usage: Record<string, number>;
  selected: string[];
  removing: string[] | null;
  onAsk(): void;
  onCancel(): void;
  onConfirm(ids: string[]): void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const asking = removing !== null;
  useEffect(() => {
    if (!asking) return;
    confirmRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [asking, onCancel]);

  if (removing !== null) {
    const placed = removing.filter((id) => (usage[id] ?? 0) > 0).length;
    const name = removing.length === 1 ? book.assets[removing[0]!]?.originalName : undefined;
    return (
      <div
        className="photos__selection photos__selection--asking"
        role="alertdialog"
        aria-label={fr.photos.removeQuestion(removing.length)}
      >
        <p className="photos__selection-text">
          <strong>{fr.photos.removeQuestion(removing.length)}</strong>
          {name !== undefined && <span className="photos__selection-name">{name}</span>}
          <span>
            {fr.photos.removeUsed(removing.length, placed)}
            {fr.photos.removeSafe}
          </span>
        </p>
        <div className="photos__selection-actions">
          <button type="button" className="button" onClick={onCancel}>
            {fr.photos.removeCancel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="button button--danger"
            onClick={() => onConfirm(removing)}
          >
            <Icon name="trash" />
            {fr.photos.removeConfirm}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="photos__selection" role="region" aria-label={fr.photos.selectionBar}>
      <span className="photos__selection-count" aria-live="polite">
        {fr.photos.selectedCount(selected.length)}
      </span>
      <div className="photos__selection-actions">
        <button
          type="button"
          className="button button--quiet"
          onClick={() => trayStore.getState().clearSelection()}
        >
          {fr.photos.clearSelection}
        </button>
        <button type="button" className="button button--danger-outline" onClick={onAsk}>
          <Icon name="trash" />
          {fr.photos.remove}
        </button>
      </div>
    </div>
  );
}
