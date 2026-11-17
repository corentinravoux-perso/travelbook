// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotInfo } from '../../shared/api';
import { newBook } from '@travelbook/core';
import { geometryCache } from '../maps/geometryCache';
import { editorStore } from '../store/editor';
import { HistoryPanel, formatWhen } from './HistoryPanel';

const snap = (at: string, label: SnapshotInfo['label'], pages: number): SnapshotInfo => ({
  id: `${at}-${label}`,
  at,
  label,
  pages,
});

describe('formatWhen', () => {
  it('writes the date and time in French', () => {
    expect(formatWhen('2026-11-14T10:30:00.000Z')).toMatch(/14 novembre 2026/);
  });
});

describe('HistoryPanel', () => {
  const listSnapshots = vi.fn<() => Promise<SnapshotInfo[]>>();
  beforeEach(() => {
    vi.stubGlobal('tb', { project: { listSnapshots, readSnapshot: vi.fn() } });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    listSnapshots.mockReset();
  });

  it('lists the snapshots newest first, with how each was taken and its pages', async () => {
    listSnapshots.mockResolvedValue([
      snap('2026-11-14T09:00:00.000Z', 'auto', 24),
      snap('2026-11-14T11:00:00.000Z', 'manual', 1),
    ]);
    render(<HistoryPanel />);
    const rows = await screen.findAllByText(/novembre 2026/);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.closest('li')!.textContent).toContain('Manuelle · 1 page');
    expect(rows[1]!.closest('li')!.textContent).toContain('Automatique · 24 pages');
    expect(screen.getAllByRole('button', { name: 'Restaurer' })).toHaveLength(2);
  });

  it('says so when there is no snapshot yet', async () => {
    listSnapshots.mockResolvedValue([]);
    render(<HistoryPanel />);
    expect(await screen.findByText(/Aucune version pour l'instant/)).toBeTruthy();
  });

  it('reports a failure to read the list, and tries again on request', async () => {
    listSnapshots.mockRejectedValueOnce(new Error('disk')).mockResolvedValue([]);
    render(<HistoryPanel />);
    expect((await screen.findByRole('alert')).textContent).toContain('pas pu être lue');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(listSnapshots).toHaveBeenCalledTimes(2);
  });
});

describe('HistoryPanel and the map geometry cache', () => {
  const GEOMETRY = {
    version: 1,
    projection: { kind: 'mercator', rotate: [0, 0, 0], k: 600, tx: 500, ty: 300 },
    bounds: [
      [0, 0],
      [1000, 600],
    ],
    remoteBounds: [
      [0, 0],
      [1000, 600],
    ],
    paths: { land: '', outline: '', regions: '', selected: '', neighbours: '', lakes: '' },
  };
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    geometryCache.clear();
  });

  it('forgets a cached failure after a snapshot read, and again at the restore', async () => {
    let served = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        served ? new Response(JSON.stringify(GEOMETRY)) : new Response('', { status: 404 }),
      ),
    );
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
    expect(await geometryCache.load('map-0123456789abcdef')).toBe('missing');
    served = true; // the snapshot read re-indexed the asset
    const book = newBook({ title: 'Old' });
    vi.stubGlobal('tb', {
      project: {
        listSnapshots: vi.fn(async () => [snap('2026-11-14T09:00:00.000Z', 'manual', 1)]),
        readSnapshot: vi.fn(async () => book),
      },
    });
    const apply = vi.spyOn(editorStore.getState(), 'apply').mockImplementation(() => undefined);
    render(<HistoryPanel />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Restaurer' }))[0]!);
    await waitFor(() => expect(geometryCache.peek('map-0123456789abcdef')).not.toBe('missing'));
    expect(await geometryCache.load('map-0123456789abcdef')).toMatchObject({ version: 1 });
    apply.mockRestore();
  });
});
