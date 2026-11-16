import { normalizeStyle } from './map/style';
import { BookSchema, type Book } from './schema';

/** The newest album format this release reads. */
const NEWEST_VERSION = 2;

export class BookFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookFormatError';
  }
}

/**
 * The format version to write for `book`: 2 when a spread (the cover included) holds a map
 * element, else 1, so an album without a map still opens in a release that predates maps. It
 * follows the document as it is now, never what it once held: delete the last map and the next
 * save is 1 again.
 */
export function bookSchemaVersion(book: Book): 1 | 2 {
  return [book.cover, ...book.spreads].some((s) => s.elements.some((e) => e.type === 'map'))
    ? 2
    : 1;
}

/**
 * The book as it goes to disk: the geometry assets of maps that are no longer in the album are
 * left out, and `schemaVersion` is `bookSchemaVersion` of what is left. Deleting a map keeps its
 * geometry asset in the document (undo restores both), and a map baked again leaves the old one
 * behind; written out, such an asset would make a release without maps refuse a file that holds
 * no map. Returns a copy: the document in memory, and so the undo history, is never changed.
 * Files on disk are not touched.
 */
export function bookForSave(book: Book): Book {
  const used = new Set<string>();
  for (const spread of [book.cover, ...book.spreads]) {
    for (const el of spread.elements) if (el.type === 'map') used.add(el.geometryAssetId);
  }
  const assets = Object.fromEntries(
    Object.entries(book.assets).filter(([id, asset]) => asset.kind !== 'map' || used.has(id)),
  );
  const pruned: Book = { ...book, assets };
  return { ...pruned, schemaVersion: bookSchemaVersion(pruned) };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `raw` with the style of every map element completed from the defaults; `raw` itself is not edited. */
function withNormalizedMapStyles(raw: Record<string, unknown>): Record<string, unknown> {
  const spread = (value: unknown): unknown => {
    if (!isRecord(value) || !Array.isArray(value['elements'])) return value;
    const elements = value['elements'].map((el: unknown) =>
      isRecord(el) && el['type'] === 'map' ? { ...el, style: normalizeStyle(el['style']) } : el,
    );
    return { ...value, elements };
  };
  const out = { ...raw };
  if ('cover' in raw) out['cover'] = spread(raw['cover']);
  if (Array.isArray(raw['spreads'])) out['spreads'] = raw['spreads'].map(spread);
  return out;
}

/**
 * Validate a raw document and bring it to the current schema version. The style of every map is
 * normalised first (spec 7.9): an album saved with an older or newer set of style tokens still
 * opens, its missing tokens filled from the defaults and the unknown ones dropped.
 */
export function migrate(raw: unknown): Book {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new BookFormatError("Fichier d'album illisible : ce n'est pas un objet JSON.");
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== 'number') {
    throw new BookFormatError("Fichier d'album invalide : numéro de version absent.");
  }
  if (version > NEWEST_VERSION) {
    throw new BookFormatError(
      `Cet album a été créé avec une version plus récente de Travelbook (format ${version}). Mettez l'application à jour pour l'ouvrir.`,
    );
  }
  if (version !== 1 && version !== 2) {
    throw new BookFormatError(`Version de format inconnue : ${version}.`);
  }
  const parsed = BookSchema.safeParse(withNormalizedMapStyles(raw as Record<string, unknown>));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue ? issue.path.join('.') : '';
    throw new BookFormatError(
      `Fichier d'album invalide${where ? ` (${where})` : ''} : ${issue?.message ?? 'erreur inconnue'}.`,
    );
  }
  return parsed.data;
}
