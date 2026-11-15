// @vitest-environment jsdom
import { newBook, type AssetRef } from '@travelbook/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StickerHit } from '../../../shared/api';
import { fr } from '../../strings/fr';
import { SEARCH_DEBOUNCE_MS } from '../stickers/model';
import { OnlineBackgroundsTab } from './OnlineTab';
import type { TabProps } from './types';

const hit: StickerHit = {
  source: 'openverse-photos',
  id: 'p1',
  title: 'Montagne',
  thumbUrl: 'tb://remote-thumb/' + 'a'.repeat(32),
  fileUrl: '',
  format: 'jpg',
  licence: {
    source: 'Openverse (flickr)',
    author: 'Ada',
    licence: 'CC-BY-4.0',
    url: 'https://x.org',
    requiresAttribution: true,
  },
  mono: false,
};
const asset: AssetRef = {
  id: 'background-abc',
  kind: 'background',
  file: 'assets/abc.jpg',
  originalName: 'Montagne.jpg',
  sha256: 'abc',
  licence: hit.licence,
};

const stickers = {
  sources: vi.fn(),
  search: vi.fn(),
  add: vi.fn(),
};
const fromLibrary = vi.fn();

function props(over: Partial<TabProps> = {}): TabProps {
  const book = newBook({ title: 'T', innerSpreads: 2 });
  return {
    book,
    spread: book.spreads[1]!,
    target: 'spread',
    current: undefined,
    bundled: [],
    apply: vi.fn(),
    fail: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  stickers.sources.mockResolvedValue([
    { id: 'openverse', label: 'Openverse', needsKey: false, backgrounds: false, hasKey: false },
    {
      id: 'openverse-photos',
      label: 'Openverse',
      needsKey: false,
      backgrounds: true,
      hasKey: false,
    },
  ]);
  stickers.search.mockResolvedValue({ items: [hit], hasMore: false });
  stickers.add.mockResolvedValue({ id: 'background-abc' });
  fromLibrary.mockResolvedValue(asset);
  (window as unknown as { tb: unknown }).tb = {
    library: { stickers },
    assets: { fromLibrary },
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const search = async (text: string) => {
  fireEvent.change(screen.getByLabelText(fr.backgrounds.onlineSearch), { target: { value: text } });
  await act(async () => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 1));
};

describe('OnlineBackgroundsTab', () => {
  it('searches the photographs source (not the stickers one) 400 ms after typing', async () => {
    render(<OnlineBackgroundsTab {...props()} />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    await search('montagne');
    expect(stickers.search).toHaveBeenCalledWith({
      source: 'openverse-photos',
      q: 'montagne',
      page: 1,
    });
    const thumb = screen.getByRole('button', { name: 'Montagne' });
    expect(thumb.querySelector('img')?.getAttribute('src')).toMatch(/^tb:\/\/remote-thumb\//);
    expect(screen.getByText('CC BY')).toBeTruthy();
  });

  it('keeps the chosen photo as a background item with its licence and applies it with its asset', async () => {
    const p = props();
    render(<OnlineBackgroundsTab {...p} />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    await search('montagne');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Montagne' }));
    });
    expect(stickers.add).toHaveBeenCalledWith({ source: 'openverse-photos', id: 'p1' });
    expect(fromLibrary).toHaveBeenCalledWith('background-abc');
    expect(p.apply).toHaveBeenCalledTimes(1);
    expect(p.apply).toHaveBeenCalledWith(
      { kind: 'image', assetId: 'background-abc', fit: 'cover', opacity: 1, blur: 0, tint: null },
      { assets: [asset] },
    );
  });

  it('says in French that there is no connection, and retries', async () => {
    stickers.search.mockRejectedValueOnce(new Error('Error: SourceError:offline'));
    render(<OnlineBackgroundsTab {...props()} />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    await search('mer');
    expect(screen.getByText(fr.stickers.error.offline)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: fr.stickers.retry }));
    });
    expect(screen.getByRole('button', { name: 'Montagne' })).toBeTruthy();
  });

  it('reports a failure of main while the photo is kept', async () => {
    fromLibrary.mockRejectedValueOnce(new Error('disk'));
    const p = props();
    render(<OnlineBackgroundsTab {...p} />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    await search('x');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Montagne' }));
    });
    expect(p.fail).toHaveBeenCalled();
    expect(p.apply).not.toHaveBeenCalled();
  });
});
