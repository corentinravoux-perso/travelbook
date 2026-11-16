import {
  addElement,
  bakeGeometry,
  updateElements,
  type Book,
  type MapElement,
  type MapTopology,
  newId,
} from '@travelbook/core';
import { withAssets } from '../editor/photoImport';
import { editorStore } from '../store/editor';
import { fr } from '../strings/fr';
import {
  closeMapDialog,
  mapDialogStore,
  newMapBox,
  type MapDialogState,
  type PackFallback,
  type MapSpec,
} from './dialogModel';
import { geometryCache } from './geometryCache';
import { getSubject, loadSubjectIndex, loadTopology } from './subjects';

/** The shared coarse world land (far context), read once. A failed read is retried next time. */
let world: Promise<MapTopology | null> | null = null;
const worldLand = (): Promise<MapTopology | null> => {
  world ??= loadTopology('world.topo.json').catch(() => {
    world = null;
    return null;
  });
  return world;
};

/** Forget the cached world file (tests). */
export function resetWorldCache(): void {
  world = null;
}

/**
 * The fine pack of a subject, or `null` with the reason it is not used: apply never fails for
 * want of it, the base file alone is baked.
 */
async function finePack(
  subjectId: string,
): Promise<{ pack: MapTopology | null; fallback: PackFallback | null }> {
  try {
    const result = await window.tb.maps.loadPack(subjectId);
    if (!result.ok) return { pack: null, fallback: result.reason };
    return { pack: JSON.parse(result.json) as MapTopology, fallback: null };
  } catch {
    return { pack: null, fallback: 'offline' };
  }
}

const findElement = (book: Book, spreadId: string, elementId: string) =>
  [book.cover, ...book.spreads]
    .find((s) => s.id === spreadId)
    ?.elements.find((e) => e.id === elementId);

/**
 * Make the map of the dialog: bake its geometry (the base file, the fine pack when there is one,
 * the world as far context), keep it as an album asset, then change the book in ONE
 * `editorStore.apply` (one undo step). A new map goes on the page in view, as large as the page
 * inside the safe margins and centred; a reopened map is replaced in place and keeps its box,
 * rotation, opacity and group. On success the dialog closes. On failure it stays open with
 * `status: 'failed'`, the book is unchanged and a notice shows over the canvas.
 */
export async function applyMap(state: MapDialogState): Promise<void> {
  const { spec, target, name } = state;
  if (!spec || state.status === 'applying') return;
  const store = editorStore.getState();
  if (store.book === null) return;
  mapDialogStore.setState({ status: 'applying', error: null });
  try {
    // let the dialog show "applying" before the bake takes the thread
    await new Promise((resolve) => setTimeout(resolve, 0));
    const subject = getSubject(spec.subject.id, await loadSubjectIndex());
    if (!subject) throw new Error(`Unknown map subject "${spec.subject.id}"`);
    const [base, fine, far] = await Promise.all([
      loadTopology(subject.file),
      finePack(subject.id),
      worldLand(),
    ]);
    mapDialogStore.setState({ packFallback: fine.fallback });
    const geometry = bakeGeometry(
      base,
      fine.pack,
      spec.subject,
      spec.projection,
      spec.style.rough,
      spec.style.outline.detail,
      far,
    );
    const title = name.trim() || subject.name;
    const asset = await window.tb.maps.saveGeometry(JSON.stringify(geometry), { name: title });
    // a re-bake keeps the id when the geometry is the same, and a failed read may be cached
    geometryCache.invalidate(asset.id);

    const { currentSpreadId, activePage } = editorStore.getState();
    const created = { id: '' as string };
    editorStore.getState().apply(
      (book) => {
        const withAsset = withAssets(book, [asset]);
        const old = target ? findElement(book, target.spreadId, target.elementId) : undefined;
        if (target && old?.type === 'map') {
          return updateElements(withAsset, target.spreadId, [old.id], mapFields(spec, asset.id));
        }
        const box = currentSpreadId === null ? null : newMapBox(book, currentSpreadId, activePage);
        if (!box) throw new Error('No page to put the map on');
        const el: MapElement = {
          id: newId(),
          ...box,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          name: title,
          type: 'map',
          ...mapFields(spec, asset.id),
        };
        created.id = el.id;
        return addElement(withAsset, currentSpreadId!, el);
      },
      target ? fr.maps.undoUpdate : fr.maps.undoCreate,
    );
    if (created.id) editorStore.getState().select([created.id]);
    closeMapDialog();
  } catch (error) {
    console.error('Applying a map failed', error);
    mapDialogStore.setState({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    editorStore.getState().notify(fr.maps.applyFailed);
  }
}

/** The fields of a map element the dialog owns. */
function mapFields(spec: MapSpec, geometryAssetId: string) {
  return structuredClone({ ...spec, geometryAssetId });
}
