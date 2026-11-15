import { useCallback, useEffect, useRef, useState } from 'react';
import type { StickerHit, StickerSearchResult } from '../../../shared/api';
import { SEARCH_DEBOUNCE_MS, sourceMessage } from './model';

export interface OnlineSearch {
  text: string;
  setText(text: string): void;
  items: StickerHit[];
  hasMore: boolean;
  status: 'idle' | 'loading' | 'error' | 'done';
  /** French message of the last failure; `null` otherwise. */
  error: string | null;
  more(): void;
  retry(): void;
}

interface Answer {
  /** The search (`key` and text) this answer belongs to. */
  of: string;
  items: StickerHit[];
  hasMore: boolean;
  status: OnlineSearch['status'];
  error: string | null;
  page: number;
}

/**
 * A search box over a paged source: it waits `SEARCH_DEBOUNCE_MS` after the last keystroke, then
 * asks page 1; `more` appends the next page. An answer that arrives after the text or the key
 * changed is dropped, and the results on screen are those of the current search only. A failure
 * keeps the results already shown and gives a French message.
 */
export function useOnlineSearch(
  /** What a search depends on besides the text (source, filters): a new key starts over. `undefined` searches nothing. */
  key: string | undefined,
  search: (q: string, page: number) => Promise<StickerSearchResult>,
  options: { allowEmpty?: boolean; debounceMs?: number } = {},
): OnlineSearch {
  const { allowEmpty = false, debounceMs = SEARCH_DEBOUNCE_MS } = options;
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const token = `${key ?? ''}\u0000${text}`;
  const searchable = key !== undefined && (allowEmpty || text.trim() !== '');

  const searchRef = useRef(search);
  const tokenRef = useRef(token);
  useEffect(() => {
    searchRef.current = search;
    tokenRef.current = token;
  });
  /** The call that failed last, for `retry`. */
  const failed = useRef<{ of: string; q: string; at: number; append: boolean } | null>(null);

  const run = useCallback((of: string, q: string, at: number, append: boolean) => {
    failed.current = null;
    setAnswer((old) => {
      const mine = old?.of === of ? old : null;
      return {
        of,
        items: append && mine ? mine.items : [],
        hasMore: false,
        status: 'loading',
        error: null,
        page: mine?.page ?? 1,
      };
    });
    searchRef.current(q, at).then(
      (result) => {
        if (tokenRef.current !== of) return;
        setAnswer((old) => ({
          of,
          items: append && old?.of === of ? [...old.items, ...result.items] : result.items,
          hasMore: result.hasMore,
          status: 'done',
          error: null,
          page: at,
        }));
      },
      (failure: unknown) => {
        if (tokenRef.current !== of) return;
        console.error('Search failed', failure);
        failed.current = { of, q, at, append };
        setAnswer((old) => ({
          of,
          items: old?.of === of ? old.items : [],
          hasMore: false,
          status: 'error',
          error: sourceMessage(failure),
          page: old?.of === of ? old.page : 1,
        }));
      },
    );
  }, []);

  useEffect(() => {
    if (!searchable) return;
    const timer = setTimeout(() => run(token, text, 1, false), debounceMs);
    return () => clearTimeout(timer);
  }, [searchable, token, text, debounceMs, run]);

  const current = answer?.of === token ? answer : null;
  const more = useCallback(() => {
    if (current !== null) run(token, text, current.page + 1, true);
  }, [current, run, token, text]);
  const retry = useCallback(() => {
    const last = failed.current;
    if (last !== null && last.of === tokenRef.current) run(last.of, last.q, last.at, last.append);
  }, [run]);

  return {
    text,
    setText,
    items: current?.items ?? [],
    hasMore: current?.hasMore ?? false,
    // Between a keystroke and the answer the search is pending.
    status: !searchable ? 'idle' : (current?.status ?? 'loading'),
    error: current?.error ?? null,
    more,
    retry,
  };
}
