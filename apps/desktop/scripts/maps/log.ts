/**
 * Progress lines for a long run: `[01:02:03] packs 12/274 FR-MET ...`. The clock counts from the
 * start of the process, so `tail -f` on the log of a background run tells how far it is and how
 * long each step takes. Plain lines on stdout, no cursor tricks: they read the same in a file.
 */
export function clock(seconds: number = process.uptime()): string {
  const s = Math.floor(seconds);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export const progressLine = (step: string, done: number, total: number, text: string): string =>
  `[${clock()}] ${step} ${done}/${total} ${text}`;
