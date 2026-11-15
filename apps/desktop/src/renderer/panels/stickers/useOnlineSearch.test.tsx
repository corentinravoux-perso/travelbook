// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StickerHit, StickerSearchResult } from '../../../shared/api';
import { fr } from '../../strings/fr';
import { SEARCH_DEBOUNCE_MS } from './model';
import { useOnlineSearch } from './useOnlineSearch';

const hit = (id: string): StickerHit => ({
  source: 'openverse',
  id,
  title: id,
  thumbUrl: `tb://remote-thumb/${id}`,
  fileUrl: '',
  format: 'png',
  licence: { source: 'O', licence: 'CC0-1.0', url: 'https://x.org', requiresAttribution: false },
  mono: false,
});
const result = (ids: string[], hasMore = false): StickerSearchResult => ({
  items: ids.map(hit),
  hasMore,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const flush = () => act(async () => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 1));

describe('useOnlineSearch', () => {
  it('waits 400 ms after the last keystroke and then asks once', async () => {
    const search = vi.fn(async () => result(['a']));
    const { result: hook } = renderHook(() => useOnlineSearch('openverse', search));
    act(() => hook.current.setText('a'));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    act(() => hook.current.setText('av'));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(search).not.toHaveBeenCalled();
    expect(hook.current.status).toBe('loading');
    await act(async () => vi.advanceTimersByTimeAsync(101));
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('av', 1);
    expect(hook.current.items.map((i) => i.id)).toEqual(['a']);
    expect(hook.current.status).toBe('done');
  });

  it('stays idle on an empty text', async () => {
    const search = vi.fn(async () => result([]));
    const { result: hook } = renderHook(() => useOnlineSearch('openverse', search));
    await flush();
    expect(hook.current.status).toBe('idle');
    expect(search).not.toHaveBeenCalled();
  });

  it('pages: more appends the next page', async () => {
    const search = vi.fn(async (_q: string, page: number) =>
      page === 1 ? result(['a', 'b'], true) : result(['c'], false),
    );
    const { result: hook } = renderHook(() => useOnlineSearch('openverse', search));
    act(() => hook.current.setText('x'));
    await flush();
    expect(hook.current.hasMore).toBe(true);
    await act(async () => hook.current.more());
    expect(search).toHaveBeenLastCalledWith('x', 2);
    expect(hook.current.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(hook.current.hasMore).toBe(false);
  });

  it('maps the failure of a source to a French message and retries the same call', async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(
        new Error('Error invoking remote method: Error: SourceError:rateLimited'),
      )
      .mockResolvedValueOnce(result(['a']));
    const { result: hook } = renderHook(() => useOnlineSearch('openverse', search));
    act(() => hook.current.setText('x'));
    await flush();
    expect(hook.current.status).toBe('error');
    expect(hook.current.error).toBe(fr.stickers.error.rateLimited);
    await act(async () => hook.current.retry());
    expect(hook.current.status).toBe('done');
    expect(hook.current.error).toBeNull();
    expect(hook.current.items).toHaveLength(1);
  });

  it('says offline for a network failure', async () => {
    const search = vi.fn().mockRejectedValue(new Error('SourceError:offline'));
    const { result: hook } = renderHook(() => useOnlineSearch('openverse', search));
    act(() => hook.current.setText('x'));
    await flush();
    expect(hook.current.error).toBe(fr.stickers.error.offline);
  });

  it('drops the answer of an older search', async () => {
    let first!: (r: StickerSearchResult) => void;
    const search = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<StickerSearchResult>((resolve) => (first = resolve)),
      )
      .mockResolvedValueOnce(result(['new']));
    const { result: hook } = renderHook(() => useOnlineSearch('openverse', search));
    act(() => hook.current.setText('old'));
    await flush();
    act(() => hook.current.setText('new'));
    await flush();
    await act(async () => first(result(['old'])));
    expect(hook.current.items.map((i) => i.id)).toEqual(['new']);
  });

  it('starts over when the key (the source) changes', async () => {
    const search = vi.fn(async () => result(['a']));
    const { result: hook, rerender } = renderHook(({ k }) => useOnlineSearch(k, search), {
      initialProps: { k: 'openverse' },
    });
    act(() => hook.current.setText('x'));
    await flush();
    expect(hook.current.items).toHaveLength(1);
    rerender({ k: 'commons' });
    expect(hook.current.items).toHaveLength(0);
    await flush();
    expect(search).toHaveBeenCalledTimes(2);
  });
});
