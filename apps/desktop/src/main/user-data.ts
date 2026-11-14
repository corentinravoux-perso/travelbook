let injectedDir: string | null = null;

/**
 * Point everything that lives in the user's data folder (recent projects, the user library) at a
 * directory (tests). Pass null to use Electron's userData again.
 */
export function setUserDataDir(dir: string | null): void {
  injectedDir = dir;
}

/** The folder app data lives in: the injected one, or Electron's `userData`. */
export async function userDataDir(): Promise<string> {
  if (injectedDir !== null) return injectedDir;
  // Loaded lazily so that importing this module never requires Electron (unit tests).
  const { app } = await import('electron');
  return app.getPath('userData');
}
