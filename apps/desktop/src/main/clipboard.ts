import { mkdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { AssetRefSchema, ElementSchema } from '@travelbook/core';
import { z } from 'zod';
import type { ClipboardPayload } from '../shared/api';
import { copyFileVerified } from './photos/import';
import { projectFilePath } from './protocol';
import { recordAssets, type Session } from './session';

/** The format that carries elements between spreads and albums. */
export const CLIPBOARD_FORMAT = 'application/x-travelbook';
/**
 * How the system clipboard names it: Chromium-based clipboards only keep custom formats under a
 * `web ` prefix (checked against Electron 45: the bare name is dropped on write).
 */
export const CLIPBOARD_TYPE = `web ${CLIPBOARD_FORMAT}`;

/** The clipboard, as far as this module needs it (Electron's `clipboard` in the app). */
export interface ClipboardHost {
  write(type: string, data: string): Promise<void>;
  /** The data of that type, or `null` when the clipboard holds none. */
  read(type: string): Promise<string | null>;
}

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

/** What is stored: the payload plus the folder of the album it was copied from. */
const stored = z.strictObject({
  version: z.literal(1),
  sourceDir: z.string().min(1).max(4096),
  origin: z.strictObject({ bookId: z.string(), spreadId: z.string() }),
  elements: z.array(ElementSchema).max(2000),
  assets: z.array(AssetRefSchema.extend({ id: identifier })).max(2000),
});

export const clipboardPayload = z.strictObject({
  origin: z.strictObject({ bookId: z.string().max(200), spreadId: z.string().max(200) }),
  elements: z.array(ElementSchema).max(2000),
  assets: z.array(AssetRefSchema.extend({ id: identifier })).max(2000),
});

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

/** Put elements on the system clipboard, with the folder their files can be fetched from. */
export async function writeElements(
  clipboard: ClipboardHost,
  session: Session,
  payload: ClipboardPayload,
): Promise<void> {
  const data = { version: 1, sourceDir: session.dir, ...payload };
  await clipboard.write(CLIPBOARD_TYPE, JSON.stringify(data));
}

/**
 * Elements on the clipboard, or `null` when there are none (or the data is not ours). The files
 * of assets the open project does not hold yet are copied in from the album the elements came
 * from: each must lie in that album's `originals/` or `assets/`, and must match its recorded
 * hash. The clipboard is another program's input too, so nothing in it is trusted. The returned
 * assets are all present in the project; the caller records them in its book.
 */
export async function readElements(
  clipboard: ClipboardHost,
  session: Session,
): Promise<ClipboardPayload | null> {
  const raw = await clipboard.read(CLIPBOARD_TYPE);
  if (raw === null || raw.length === 0) return null;
  let parsed: z.infer<typeof stored>;
  try {
    const result = stored.safeParse(JSON.parse(raw));
    if (!result.success) return null;
    parsed = result.data;
  } catch {
    return null;
  }
  const { sourceDir } = parsed;
  const assets = [];
  for (const asset of parsed.assets) {
    if (!session.assets.has(asset.id)) {
      const target = projectFilePath(session.dir, asset.file);
      const source = isAbsolute(sourceDir) ? projectFilePath(sourceDir, asset.file) : null;
      if (target === null || source === null || !(await exists(source))) {
        throw new Error(`The file of asset ${asset.id} cannot be copied from the source album`);
      }
      if (!(await exists(target))) {
        await mkdir(dirname(target), { recursive: true });
        await copyFileVerified(source, target, asset.sha256);
      }
      recordAssets(session, [asset]);
    }
    assets.push(session.assets.get(asset.id) ?? asset);
  }
  return { origin: parsed.origin, elements: parsed.elements, assets };
}
