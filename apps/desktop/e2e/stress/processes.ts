/**
 * Memory of the app while it works, read from `/proc` (Linux only: the stress run is a
 * measurement on the PC, not a test that has to run everywhere).
 *
 * Electron is a tree of processes: the main process (`browser`), one renderer per window (the
 * editor, and the hidden windows of an export), the GPU process and a few utility ones. Their
 * resident sizes overlap (the shared libraries are counted in each), so the proportional set size
 * (PSS: shared pages divided among the processes that map them) is the honest total; the
 * resident set size (RSS) is what a task manager shows per process.
 */
import { readFile, readdir } from 'node:fs/promises';

export type ProcKind = 'browser' | 'renderer' | 'gpu' | 'utility' | 'other';

export interface ProcSample {
  pid: number;
  kind: ProcKind;
  rssKb: number;
  pssKb: number;
  /** The most the process ever held resident (`VmHWM`). */
  peakRssKb: number;
  /** Processor time used since it started, in seconds (all its threads, user and system). */
  cpuSeconds: number;
}

/** Clock ticks a second: 100 on every Linux the app runs on. */
const TICKS_PER_SECOND = 100;

/** Parent of every process, from `/proc/<pid>/stat` (the command may contain spaces and brackets). */
async function parents(): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = await readFile(`/proc/${name}/stat`, 'utf8');
      const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      map.set(Number(name), Number(rest[1]));
    } catch {
      // The process ended between the listing and the read.
    }
  }
  return map;
}

const kb = (text: string, key: string): number => {
  const match = new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(text);
  return match ? Number(match[1]) : 0;
};

function kindOf(cmdline: string, isRoot: boolean): ProcKind {
  if (isRoot) return 'browser';
  const type = /--type=([\w-]+)/.exec(cmdline)?.[1];
  if (type === 'renderer') return 'renderer';
  if (type === 'gpu-process') return 'gpu';
  if (type === 'utility') return 'utility';
  return 'other';
}

/** Every process of the tree under `rootPid` (the root included), with its memory right now. */
export async function sampleTree(rootPid: number): Promise<ProcSample[]> {
  const parent = await parents();
  const tree = new Set([rootPid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [pid, ppid] of parent) {
      if (tree.has(ppid) && !tree.has(pid)) {
        tree.add(pid);
        grew = true;
      }
    }
  }
  const samples: ProcSample[] = [];
  for (const pid of tree) {
    try {
      const [rollup, status, cmdline, stat] = await Promise.all([
        readFile(`/proc/${pid}/smaps_rollup`, 'utf8'),
        readFile(`/proc/${pid}/status`, 'utf8'),
        readFile(`/proc/${pid}/cmdline`, 'utf8'),
        readFile(`/proc/${pid}/stat`, 'utf8'),
      ]);
      // Fields 14 and 15 of `stat` (user and system time), counted from the one after the command.
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      samples.push({
        pid,
        kind: kindOf(cmdline, pid === rootPid),
        rssKb: kb(rollup, 'Rss'),
        pssKb: kb(rollup, 'Pss'),
        peakRssKb: kb(status, 'VmHWM'),
        cpuSeconds: (Number(fields[11]) + Number(fields[12])) / TICKS_PER_SECOND,
      });
    } catch {
      // Gone, or not ours to read.
    }
  }
  return samples;
}

const mb = (kilobytes: number): number => Math.round(kilobytes / 1024);

export interface MemoryRow {
  /** PSS of the whole tree, in MB. */
  totalMb: number;
  mainMb: number;
  rendererMb: number;
  gpuMb: number;
  otherMb: number;
}

/** The tree's memory in MB: PSS in total, and RSS of each kind of process. */
export function summarise(samples: readonly ProcSample[]): MemoryRow {
  const rss = (kind: ProcKind): number =>
    mb(samples.filter((s) => s.kind === kind).reduce((n, s) => n + s.rssKb, 0));
  return {
    totalMb: mb(samples.reduce((n, s) => n + s.pssKb, 0)),
    mainMb: rss('browser'),
    rendererMb: rss('renderer'),
    gpuMb: rss('gpu'),
    otherMb: rss('utility') + rss('other'),
  };
}

/** Processor time of the processes of `kind` that are in both samples, in seconds between them. */
export function cpuBetween(
  before: readonly ProcSample[],
  after: readonly ProcSample[],
  kind: ProcKind,
): number {
  const was = new Map(before.map((s) => [s.pid, s.cpuSeconds]));
  return after
    .filter((s) => s.kind === kind && was.has(s.pid))
    .reduce((n, s) => n + (s.cpuSeconds - (was.get(s.pid) as number)), 0);
}

export interface MemoryPeaks {
  /** Largest PSS of the whole tree at one moment, in MB. */
  totalMb: number;
  /** Largest RSS of the main process; exact (`VmHWM`), not sampled. */
  mainMb: number;
  /** Largest sum of the renderers' RSS at one moment (the editor and any export windows). */
  rendererMb: number;
  samples: number;
}

/** Samples the tree every `everyMs` until `stop`, and keeps the peaks. */
export class PeakSampler {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private total = 0;
  private main = 0;
  private renderer = 0;
  private count = 0;

  constructor(
    private readonly rootPid: number,
    private readonly everyMs = 250,
  ) {}

  start(): void {
    this.running = true;
    const tick = async (): Promise<void> => {
      await this.sample();
      if (this.running) this.timer = setTimeout(() => void tick(), this.everyMs);
    };
    void tick();
  }

  private async sample(): Promise<void> {
    const samples = await sampleTree(this.rootPid);
    const row = summarise(samples);
    this.total = Math.max(this.total, row.totalMb);
    this.renderer = Math.max(this.renderer, row.rendererMb);
    const main = samples.find((s) => s.kind === 'browser');
    if (main) this.main = Math.max(this.main, mb(main.peakRssKb));
    this.count++;
  }

  async stop(): Promise<MemoryPeaks> {
    this.running = false;
    clearTimeout(this.timer);
    await this.sample();
    return {
      totalMb: this.total,
      mainMb: this.main,
      rendererMb: this.renderer,
      samples: this.count,
    };
  }
}
