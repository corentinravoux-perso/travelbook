import { fileURLToPath } from 'node:url';

const APP_DIR = fileURLToPath(new URL('../../', import.meta.url));

/** Absolute path of a file or directory relative to `apps/desktop/`. */
export const appFileUrl = (relative: string): string => `${APP_DIR}${relative}`;
