import { BookSchema, type Book } from './schema';

export class BookFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookFormatError';
  }
}

/** Validate a raw document and bring it to the current schema version. */
export function migrate(raw: unknown): Book {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new BookFormatError("Fichier d'album illisible : ce n'est pas un objet JSON.");
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== 'number') {
    throw new BookFormatError("Fichier d'album invalide : numéro de version absent.");
  }
  if (version > 1) {
    throw new BookFormatError(
      `Cet album a été créé avec une version plus récente de Travelbook (format ${version}). Mettez l'application à jour pour l'ouvrir.`,
    );
  }
  if (version !== 1) {
    throw new BookFormatError(`Version de format inconnue : ${version}.`);
  }
  const parsed = BookSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue ? issue.path.join('.') : '';
    throw new BookFormatError(
      `Fichier d'album invalide${where ? ` (${where})` : ''} : ${issue?.message ?? 'erreur inconnue'}.`,
    );
  }
  return parsed.data;
}
