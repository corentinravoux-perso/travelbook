// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FontFamily } from '../../shared/api';
import { fontListStore } from '../fonts/fontList';
import { fr } from '../strings/fr';
import { SEARCH_DEBOUNCE_MS } from './stickers/model';
import { FontsDialog } from './FontsDialog';

const t = fr.fonts;
const bitter: FontFamily = {
  family: 'Bitter',
  category: 'serif',
  origin: 'library',
  faces: [],
  licence: {
    source: 'Fontsource',
    licence: 'OFL-1.1',
    url: 'https://x.org',
    requiresAttribution: false,
  },
};

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});

const fonts = {
  searchCatalogue: vi.fn(),
  addFromCatalogue: vi.fn(),
  pickFile: vi.fn(),
  importFile: vi.fn(),
  list: vi.fn(async () => [bitter]),
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  for (const fn of Object.values(fonts)) fn.mockReset();
  fonts.list.mockResolvedValue([bitter]);
  (window as unknown as { tb: unknown }).tb = {
    library: { fonts },
    photos: { pathForFile: () => '' },
  };
  fontListStore.setState({ status: 'ready', families: [] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const type = async (value: string) => {
  fireEvent.change(screen.getByLabelText(t.searchLabel), { target: { value } });
  await act(async () => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 1));
};

describe('FontsDialog', () => {
  it('asks for a name first, then searches 400 ms after typing and lists the answer', async () => {
    fonts.searchCatalogue.mockResolvedValue([
      { id: 'bitter', family: 'Bitter', category: 'serif' },
    ]);
    render(<FontsDialog onClose={() => undefined} />);
    expect(screen.getByText(t.idle)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(t.searchLabel), { target: { value: 'bit' } });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(fonts.searchCatalogue).not.toHaveBeenCalled();
    expect(screen.getByText(t.searching)).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(101));
    expect(fonts.searchCatalogue).toHaveBeenCalledWith('bit');
    expect(screen.getByText('Bitter')).toBeTruthy();
    expect(screen.getByText(t.category.serif)).toBeTruthy();
  });

  it('says nothing matches, and gives the French message of a failed search', async () => {
    fonts.searchCatalogue.mockResolvedValueOnce([]);
    render(<FontsDialog onClose={() => undefined} />);
    await type('zzz');
    expect(screen.getByText(t.noResult)).toBeTruthy();
    fonts.searchCatalogue.mockRejectedValueOnce(new Error('Error: SourceError:offline'));
    await type('zzzz');
    expect(screen.getByText(fr.stickers.error.offline)).toBeTruthy();
  });

  it('adds a family, refreshes the font list and marks the entry as added', async () => {
    fonts.searchCatalogue.mockResolvedValue([
      { id: 'bitter', family: 'Bitter', category: 'serif' },
    ]);
    fonts.addFromCatalogue.mockResolvedValue(bitter);
    render(<FontsDialog onClose={() => undefined} />);
    await type('bit');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.add }));
    });
    expect(fonts.addFromCatalogue).toHaveBeenCalledWith('bitter');
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole('button', { name: t.added })).toBeTruthy();
    expect((screen.getByRole('button', { name: t.added }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(fonts.list).toHaveBeenCalled();
    expect(screen.getByText(t.imported('Bitter'))).toBeTruthy();
  });

  it('says why an add failed', async () => {
    fonts.searchCatalogue.mockResolvedValue([
      { id: 'bitter', family: 'Bitter', category: 'serif' },
    ]);
    fonts.addFromCatalogue.mockRejectedValue(new Error('SourceError:rateLimited'));
    render(<FontsDialog onClose={() => undefined} />);
    await type('bit');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.add }));
    });
    expect(screen.getByText(`${t.addFailed} ${fr.stickers.error.rateLimited}`)).toBeTruthy();
    expect((screen.getByRole('button', { name: t.add }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('imports the file the dialog picks, and does nothing when it is cancelled', async () => {
    render(<FontsDialog onClose={() => undefined} />);
    fonts.pickFile.mockResolvedValueOnce(null);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.importFile }));
    });
    expect(fonts.importFile).not.toHaveBeenCalled();
    fonts.pickFile.mockResolvedValueOnce('/home/me/Carnet.ttf');
    fonts.importFile.mockResolvedValue({ ...bitter, family: 'Carnet' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.importFile }));
    });
    expect(fonts.importFile).toHaveBeenCalledWith('/home/me/Carnet.ttf');
    expect(screen.getByText(t.imported('Carnet'))).toBeTruthy();
  });

  it('says so when a file is not a usable font', async () => {
    render(<FontsDialog onClose={() => undefined} />);
    fonts.pickFile.mockResolvedValueOnce('/home/me/x.ttf');
    fonts.importFile.mockRejectedValue(new Error('x.ttf: Not a usable font file'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.importFile }));
    });
    expect(screen.getByText(t.importFailed)).toBeTruthy();
  });
});
