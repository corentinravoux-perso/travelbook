import {
  bakeGeometry,
  type MapElement,
  type MapGeometry,
  type MapTopology,
} from '@travelbook/core';

/** What the preview bakes, besides the large files (which the worker keeps between jobs). */
export interface BakeInput {
  base: MapTopology;
  pack: MapTopology | null;
  world: MapTopology | null;
  subject: MapElement['subject'];
  projection: MapElement['projection'];
  rough: { seed: number; roughness: number } | null;
  detail: number;
}

/** A message to the worker: `base`, `pack` and `world` are present only when they changed. */
export type BakeRequest = {
  id: number;
  subject: MapElement['subject'];
  projection: MapElement['projection'];
  rough: { seed: number; roughness: number } | null;
  detail: number;
  base?: MapTopology;
  pack?: MapTopology | null;
  world?: MapTopology | null;
};

export type BakeReply =
  { id: number; ok: true; geometry: MapGeometry } | { id: number; ok: false; error: string };

/** How long to wait after the last change before baking: a worker is free, the main thread is not. */
export const DEBOUNCE_WORKER_MS = 150;
export const DEBOUNCE_MAIN_MS = 300;

let worker: Worker | null = null;
/** Set once the worker could not start or died: baking then runs on the main thread. */
let broken = typeof Worker === 'undefined';
let nextId = 0;
let sent: { base: MapTopology | null; pack: MapTopology | null; world: MapTopology | null } = {
  base: null,
  pack: null,
  world: null,
};
const pending = new Map<number, { resolve(g: MapGeometry): void; reject(e: Error): void }>();

/** Whether bakes run in a Web Worker (else on the main thread, which the preview debounces more). */
export const bakesInWorker = (): boolean => !broken;

export const debounceMs = (): number => (broken ? DEBOUNCE_MAIN_MS : DEBOUNCE_WORKER_MS);

function giveUp(error: Error): void {
  broken = true;
  worker?.terminate();
  worker = null;
  for (const job of [...pending.values()]) job.reject(error);
  pending.clear();
  waiting?.reject(error);
  waiting = null;
}

function start(): Worker | null {
  if (broken) return null;
  if (worker) return worker;
  try {
    const w = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (event: MessageEvent<BakeReply>) => {
      const job = pending.get(event.data.id);
      if (!job) return;
      pending.delete(event.data.id);
      if (event.data.ok) job.resolve(event.data.geometry);
      else job.reject(new Error(event.data.error));
    };
    // a worker that cannot load (policy, packaging) or crashes: the main thread takes over
    w.onerror = () => giveUp(new Error('The map worker failed'));
    sent = { base: null, pack: null, world: null };
    worker = w;
    return w;
  } catch {
    broken = true;
    return null;
  }
}

function bakeHere(input: BakeInput): MapGeometry {
  return bakeGeometry(
    input.base,
    input.pack,
    input.subject,
    input.projection,
    input.rough,
    input.detail,
    input.world,
  );
}

interface Job {
  input: BakeInput;
  resolve(g: MapGeometry): void;
  reject(e: Error): void;
}

/** The job the worker is on, and the newest one waiting behind it (older waiting jobs are dropped). */
let running: Job | null = null;
let waiting: Job | null = null;

function dispatch(w: Worker, job: Job): void {
  const { input } = job;
  const id = ++nextId;
  const request: BakeRequest = {
    id,
    subject: input.subject,
    projection: input.projection,
    rough: input.rough,
    detail: input.detail,
  };
  if (sent.base !== input.base) request.base = input.base;
  if (sent.pack !== input.pack) request.pack = input.pack;
  if (sent.world !== input.world) request.world = input.world;
  sent = { base: input.base, pack: input.pack, world: input.world };
  running = job;
  pending.set(id, {
    resolve: (g) => {
      pending.delete(id);
      running = null;
      job.resolve(g);
      next(w);
    },
    reject: (e) => {
      pending.delete(id);
      running = null;
      job.reject(e);
      next(w);
    },
  });
  w.postMessage(request);
}

/** Start the waiting job, if any, once the worker is free. */
function next(w: Worker): void {
  if (running || !waiting || worker !== w) return;
  const job = waiting;
  waiting = null;
  dispatch(w, job);
}

/**
 * Bake a geometry off the main thread when a worker is available. One job runs at a time; a job
 * still waiting when a newer one arrives is dropped (it rejects with "Superseded"). A worker that
 * fails falls back to the main thread for this job and every later one.
 */
export async function bake(input: BakeInput): Promise<MapGeometry> {
  const w = start();
  if (!w) return bakeHere(input);
  try {
    return await new Promise<MapGeometry>((resolve, reject) => {
      waiting?.reject(new Error('Superseded'));
      waiting = { input, resolve, reject };
      next(w);
    });
  } catch (error) {
    // the worker died under this job: a failed bake is the worker's, not the data's
    if (broken && !(error instanceof Error && error.message === 'Superseded')) {
      return bakeHere(input);
    }
    throw error;
  }
}

/** Stop the worker and forget what it holds (the dialog closed). */
export function stopBakeWorker(): void {
  worker?.terminate();
  worker = null;
  for (const job of [...pending.values()]) job.reject(new Error('Closed'));
  pending.clear();
  waiting?.reject(new Error('Closed'));
  waiting = null;
  running = null;
}
