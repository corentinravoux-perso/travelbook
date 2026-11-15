import type { BrowserWindow, IpcMain, IpcMainEvent } from 'electron';
import { CLOSE_REPLY_CHANNEL, CLOSE_REQUEST_CHANNEL } from '../shared/channels';

/** How long main waits for the renderer to save before it treats the save as failed. */
export const CLOSE_FLUSH_TIMEOUT_MS = 5000;

/** The renderer saved (`ok`), or could not: it said so (`failed`) or never answered (`timeout`). */
export type FlushOutcome = { ok: true } | { ok: false; reason: 'failed' | 'timeout' };

/** What the user picks when saving before close failed. */
export type CloseChoice = 'retry' | 'quit' | 'cancel';

export interface FlushBroker {
  /** Ask the renderer to save; settles with its answer, or `timeout` after `timeoutMs`. */
  request(): Promise<FlushOutcome>;
  /** Feed an answer from the renderer. Answers to unknown or finished requests are ignored. */
  reply(id: number, ok: boolean): void;
}

/**
 * The request/response half of the close handshake, free of Electron: `send` delivers a request
 * id to the renderer; its answer comes back through `reply`.
 */
export function createFlushBroker(opts: {
  send(id: number): void;
  timeoutMs: number;
}): FlushBroker {
  let next = 0;
  const pending = new Map<number, (outcome: FlushOutcome) => void>();
  return {
    request() {
      const id = ++next;
      return new Promise<FlushOutcome>((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ ok: false, reason: 'timeout' });
        }, opts.timeoutMs);
        pending.set(id, (outcome) => {
          clearTimeout(timer);
          resolve(outcome);
        });
        opts.send(id);
      });
    },
    reply(id, ok) {
      const settle = pending.get(id);
      if (!settle) return;
      pending.delete(id);
      settle(ok ? { ok: true } : { ok: false, reason: 'failed' });
    },
  };
}

/**
 * Ask the renderer to save until it succeeds or the user decides. Resolves to true when the
 * window may close (saved, or the user chose to quit without saving), false when the user cancels.
 */
export async function runCloseHandshake(deps: {
  requestFlush(): Promise<FlushOutcome>;
  askUser(reason: 'failed' | 'timeout'): Promise<CloseChoice>;
}): Promise<boolean> {
  for (;;) {
    const outcome = await deps.requestFlush();
    if (outcome.ok) return true;
    const choice = await deps.askUser(outcome.reason);
    if (choice === 'quit') return true;
    if (choice === 'cancel') return false;
  }
}

/**
 * Make `win` save before it closes (closing the last window quits the app, so this covers both).
 * The first `close` is cancelled; once the handshake allows it, the window closes for real.
 */
export function guardWindowClose(
  win: BrowserWindow,
  deps: {
    ipcMain: Pick<IpcMain, 'on' | 'removeListener'>;
    isTrusted(event: IpcMainEvent): boolean;
    askUser(win: BrowserWindow, reason: 'failed' | 'timeout'): Promise<CloseChoice>;
  },
): void {
  const broker = createFlushBroker({
    send: (id) => win.webContents.send(CLOSE_REQUEST_CHANNEL, id),
    timeoutMs: CLOSE_FLUSH_TIMEOUT_MS,
  });
  const onReply = (event: IpcMainEvent, id: unknown, ok: unknown): void => {
    if (event.sender !== win.webContents || !deps.isTrusted(event)) return;
    if (typeof id === 'number' && typeof ok === 'boolean') broker.reply(id, ok);
  };
  deps.ipcMain.on(CLOSE_REPLY_CHANNEL, onReply);
  win.once('closed', () => deps.ipcMain.removeListener(CLOSE_REPLY_CHANNEL, onReply));

  let allowed = false;
  let running = false;
  win.on('close', (event) => {
    if (allowed) return;
    // A page that crashed or is gone cannot save anything: do not hold the window open for it.
    if (win.webContents.isDestroyed() || win.webContents.isCrashed()) return;
    event.preventDefault();
    if (running) return;
    running = true;
    void runCloseHandshake({
      requestFlush: () => broker.request(),
      askUser: (reason) => deps.askUser(win, reason),
    })
      .then((ok) => {
        if (ok && !win.isDestroyed()) {
          allowed = true;
          win.close();
        }
      })
      .finally(() => {
        running = false;
      });
  });
}
