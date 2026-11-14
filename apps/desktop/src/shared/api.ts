// TbApi and all IPC payload types live here.
export interface TbApi {
  /** Placeholder marker proving the sandboxed preload ran. */
  readonly ready: true;
}

/** One entry of a project's `history/` folder. */
export interface SnapshotInfo {
  /** File name without `.json`: `<ISO timestamp with - instead of : and .>-<label>`. */
  id: string;
  /** ISO 8601 creation time. */
  at: string;
  label: 'auto' | 'manual';
  pages: number;
}
