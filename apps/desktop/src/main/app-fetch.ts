/**
 * The `fetch` every online source of the app uses: Electron's `net.fetch` (Chromium's network
 * stack) when running in Electron, else the global one (unit tests).
 *
 * Why not Node's `fetch`: inside Electron, Wikimedia's edge throttles it. On 2026-11-15, 20
 * Commons thumbnails asked two at a time got sixteen 429s through the main process's global
 * `fetch`, and none through `net.fetch` or a stand-alone Node, from the same machine, with the
 * same headers. `net.fetch` also follows the system's proxy settings.
 */
export async function appFetch(): Promise<typeof fetch> {
  try {
    // Loaded lazily so that importing this module never requires Electron (unit tests).
    const electron = (await import('electron')) as Partial<typeof import('electron')>;
    const net = electron.net;
    if (net !== undefined && typeof net.fetch === 'function') {
      return ((input: string | URL | Request, init?: RequestInit) =>
        net.fetch(input instanceof URL ? input.href : input, init)) as typeof fetch;
    }
  } catch {
    // Not in Electron.
  }
  return fetch;
}
