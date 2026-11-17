import type { MapGeometry, MapTopology } from '@travelbook/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BakeInput, BakeRequest } from './bakeClient';

const MAIN_THREAD = { marker: 'main thread' } as unknown as MapGeometry;
vi.mock('@travelbook/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@travelbook/core')>()),
  bakeGeometry: vi.fn(() => MAIN_THREAD),
}));

class FakeWorker {
  static all: FakeWorker[] = [];
  posted: BakeRequest[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    readonly url: URL,
    readonly options: unknown,
  ) {
    FakeWorker.all.push(this);
  }
  postMessage(m: BakeRequest) {
    this.posted.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  reply(id: number, geometry: MapGeometry) {
    this.onmessage?.({ data: { id, ok: true, geometry } } as MessageEvent);
  }
  fail(id: number, error: string) {
    this.onmessage?.({ data: { id, ok: false, error } } as MessageEvent);
  }
}

const topo = (name: string) => ({ name }) as unknown as MapTopology;
const geometry = (name: string) => ({ name }) as unknown as MapGeometry;
const subject = {
  id: 'TH',
  regions: [],
  showRegions: true,
  showNeighbours: true,
  showLakes: true,
  includeRemote: false,
};
const input = (patch: Partial<BakeInput> = {}): BakeInput => ({
  base: topo('base'),
  pack: null,
  world: topo('world'),
  subject,
  projection: 'auto',
  rough: null,
  detail: 1,
  ...patch,
});

let client: typeof import('./bakeClient');
beforeEach(async () => {
  FakeWorker.all = [];
  vi.resetModules();
  vi.stubGlobal('Worker', FakeWorker);
  client = await import('./bakeClient');
});
afterEach(() => vi.unstubAllGlobals());

const worker = () => FakeWorker.all.at(-1)!;
/** Let the awaited promise chains of `bake` run. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('bakeClient with a worker', () => {
  it('starts a module worker and answers with its geometry', async () => {
    const job = client.bake(input());
    await tick();
    expect(worker().options).toEqual({ type: 'module' });
    expect(client.bakesInWorker()).toBe(true);
    expect(client.debounceMs()).toBe(client.DEBOUNCE_WORKER_MS);
    worker().reply(worker().posted[0]!.id, geometry('a'));
    await expect(job).resolves.toEqual(geometry('a'));
  });

  it('sends each large file once and then only what changed', async () => {
    const base = topo('base');
    const world = topo('world');
    const first = client.bake(input({ base, world }));
    await tick();
    const [r1] = worker().posted;
    expect(r1).toMatchObject({ base, world });
    // no pack is what the worker holds at the start: nothing to send
    expect('pack' in r1!).toBe(false);
    worker().reply(r1!.id, geometry('1'));
    await first;

    const second = client.bake(input({ base, world, detail: 0.5 }));
    await tick();
    const r2 = worker().posted[1]!;
    expect('base' in r2).toBe(false);
    expect('world' in r2).toBe(false);
    expect('pack' in r2).toBe(false);
    expect(r2.detail).toBe(0.5);
    worker().reply(r2.id, geometry('2'));
    await second;

    const pack = topo('pack');
    const third = client.bake(input({ base, world, pack }));
    await tick();
    const r3 = worker().posted[2]!;
    expect(r3.pack).toBe(pack);
    expect('base' in r3).toBe(false);
    worker().reply(r3.id, geometry('3'));
    await third;
  });

  it('rejects with the worker message when the bake throws, and keeps the worker', async () => {
    const job = client.bake(input());
    await tick();
    worker().fail(worker().posted[0]!.id, 'No base file');
    await expect(job).rejects.toThrow('No base file');
    expect(client.bakesInWorker()).toBe(true);
    expect(worker().terminated).toBe(false);
  });

  it('runs only the latest of the jobs queued behind the one in flight', async () => {
    const one = client.bake(input({ detail: 1 }));
    await tick();
    const two = client.bake(input({ detail: 0.8 }));
    const superseded = expect(two).rejects.toThrow('Superseded');
    const three = client.bake(input({ detail: 0.6 }));
    await tick();
    expect(worker().posted).toHaveLength(1);
    await superseded;
    worker().reply(worker().posted[0]!.id, geometry('1'));
    await one;
    await tick();
    expect(worker().posted).toHaveLength(2);
    expect(worker().posted[1]!.detail).toBe(0.6);
    worker().reply(worker().posted[1]!.id, geometry('3'));
    await expect(three).resolves.toEqual(geometry('3'));
  });

  it('a worker error falls back to the main thread, for this job and the next ones', async () => {
    const job = client.bake(input());
    await tick();
    worker().onerror?.();
    await expect(job).resolves.toBe(MAIN_THREAD);
    expect(worker().terminated).toBe(true);
    expect(client.bakesInWorker()).toBe(false);
    expect(client.debounceMs()).toBe(client.DEBOUNCE_MAIN_MS);
    const count = FakeWorker.all.length;
    await expect(client.bake(input())).resolves.toBe(MAIN_THREAD);
    expect(FakeWorker.all).toHaveLength(count);
  });

  it('stopBakeWorker terminates the worker and rejects what was waiting', async () => {
    const job = client.bake(input());
    await tick();
    const w = worker();
    client.stopBakeWorker();
    await expect(job).rejects.toThrow('Closed');
    expect(w.terminated).toBe(true);
    // a later bake starts a fresh worker and sends the files again
    const next = client.bake(input());
    await tick();
    expect(FakeWorker.all).toHaveLength(2);
    expect(worker().posted[0]).toHaveProperty('base');
    worker().reply(worker().posted[0]!.id, geometry('x'));
    await next;
  });
});

describe('bakeClient without Worker', () => {
  it('bakes on the main thread with the long debounce', async () => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.stubGlobal('Worker', undefined);
    const bare = await import('./bakeClient');
    expect(bare.bakesInWorker()).toBe(false);
    expect(bare.debounceMs()).toBe(bare.DEBOUNCE_MAIN_MS);
    await expect(bare.bake(input())).resolves.toBe(MAIN_THREAD);
  });
});
