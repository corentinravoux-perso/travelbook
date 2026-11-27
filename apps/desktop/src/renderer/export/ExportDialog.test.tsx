// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { newBook, type PreflightIssue } from '@travelbook/core';
import { mapElement } from '@travelbook/core/src/map/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportApi, ExportReport } from '../../shared/api';
import { editorStore } from '../store/editor';
import { ExportDialog } from './ExportDialog';

const book = newBook({ title: 'Test', innerSpreads: 4 });
const report: ExportReport = { files: ['/out/a.pdf'], pages: 2, seconds: 1.5, warnings: [] };

const calls: string[] = [];
let run: ReturnType<typeof vi.fn<ExportApi['run']>>;
let flush: ReturnType<typeof vi.fn<() => Promise<void>>>;

function stubTb() {
  run = vi.fn<ExportApi['run']>(async () => {
    calls.push('run');
    return report;
  });
  vi.stubGlobal('tb', {
    exporter: {
      run,
      cancel: vi.fn(async () => undefined),
      onProgress: () => () => undefined,
      preflight: vi.fn(async () => []),
      reveal: vi.fn(async () => undefined),
      presets: {
        list: vi.fn(async () => []),
        save: vi.fn(),
        delete: vi.fn(),
      },
    },
    project: { pickFolder: vi.fn(async () => null) },
  });
}

beforeEach(() => {
  calls.length = 0;
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  flush = vi.fn(async () => {
    calls.push('flush');
  });
  editorStore.setState({ flush, saveStatus: 'saved' });
  stubTb();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = async (outDir = '/out', ready = 'Rien à signaler.') => {
  localStorage.setItem('travelbook.export.outDir', outDir);
  render(<ExportDialog book={book} onClose={() => undefined} />);
  await screen.findByText(ready);
  calls.length = 0;
};

describe('ExportDialog start', () => {
  it('saves the album before it asks main to export', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Exporter' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(['flush', 'run']);
    expect(run.mock.calls[0]![0]).toMatchObject({ route: 'pdf', outDir: '/out', cropMarks: true });
    expect(await screen.findByRole('button', { name: 'Ouvrir le dossier' })).toBeTruthy();
  });

  it('exports the cover as first and last pages when its box is ticked, and greys it without the cover', async () => {
    await open();
    const box = screen.getByRole('checkbox', { name: /Couverture en première et dernière pages/ });
    expect((box as HTMLInputElement).checked).toBe(false);
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: 'Exporter' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0]![0]).toMatchObject({ includeCover: true, coverAsPages: true });
    cleanup();
    await open();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Inclure la couverture' }));
    const greyed = screen.getByRole('checkbox', { name: /Couverture en première/ });
    expect((greyed as HTMLInputElement).disabled).toBe(true);
  });

  it('refuses to start when the album cannot be saved, and says so', async () => {
    flush.mockRejectedValue(new Error('disk full'));
    await open('/out', 'La vérification n’a pas pu être faite.');
    fireEvent.click(screen.getByRole('button', { name: 'Exporter' }));
    expect(await screen.findByText(/n’a pas pu être enregistré/)).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses to start while the last save is still in error after the retry', async () => {
    editorStore.setState({ saveStatus: 'error' });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Exporter' }));
    await waitFor(() => expect(flush).toHaveBeenCalled());
    expect(await screen.findAllByText(/n’a pas pu être enregistré/)).not.toHaveLength(0);
    expect(run).not.toHaveBeenCalled();
  });

  it('needs a destination folder', async () => {
    await open('');
    expect((screen.getByRole('button', { name: 'Exporter' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('shows an export that failed and lets the user try again', async () => {
    await open();
    run.mockRejectedValueOnce(
      new Error("Error invoking remote method 'export:run': Error: Photo plage.jpg introuvable."),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Exporter' }));
    expect(await screen.findByText(/Photo plage.jpg introuvable/)).toBeTruthy();
    expect(screen.queryByText(/Error invoking/)).toBeNull();
    expect((screen.getByRole('button', { name: 'Exporter' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

describe('ExportDialog pre-flight', () => {
  it('warns of a missing map, with a way to see it, and still lets the user export', async () => {
    const map = { ...mapElement(), id: 'the-map' };
    const spread = book.spreads[1]!;
    const withMap = {
      ...book,
      spreads: book.spreads.map((s) => (s === spread ? { ...s, elements: [map] } : s)),
    };
    const issue: PreflightIssue = { kind: 'missingMap', spreadId: spread.id, elementId: 'the-map' };
    (
      window as unknown as { tb: { exporter: { preflight: ReturnType<typeof vi.fn> } } }
    ).tb.exporter.preflight.mockResolvedValueOnce([issue]);
    localStorage.setItem('travelbook.export.outDir', '/out');
    render(<ExportDialog book={withMap} onClose={() => undefined} />);
    expect(await screen.findByText('Carte introuvable, pages 2 et 3.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Voir : Carte introuvable/ })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Exporter' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
