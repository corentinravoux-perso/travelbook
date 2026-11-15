import { setBackground, type Background, type Side } from '@travelbook/core';
import { useCallback, useEffect, useState } from 'react';
import { withAssets } from '../editor/photoImport';
import { findSpread, editorStore, useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import type { BundledBackground } from '../../shared/api';
import { ColourTab } from './backgrounds/ColourTab';
import { GradientTab } from './backgrounds/GradientTab';
import { MineTab, PhotoTab, TextureTab } from './backgrounds/ImageTabs';
import { OnlineBackgroundsTab } from './backgrounds/OnlineTab';
import { PatternTab } from './backgrounds/PatternTab';
import { availableTargets, resolveTarget, targetLabel, type Target } from './backgrounds/model';
import type { ApplyOptions, TabProps } from './backgrounds/types';
import './Backgrounds.css';

const t = fr.backgrounds;

type TabKey = 'color' | 'gradient' | 'pattern' | 'texture' | 'photo' | 'mine' | 'online';

const TABS: [TabKey, string, (p: TabProps) => React.ReactElement][] = [
  ['color', t.tab.color, ColourTab],
  ['gradient', t.tab.gradient, GradientTab],
  ['pattern', t.tab.pattern, PatternTab],
  ['texture', t.tab.texture, TextureTab],
  ['photo', t.tab.photo, PhotoTab],
  ['mine', t.tab.mine, MineTab],
  ['online', t.tab.online, OnlineBackgroundsTab],
];

/**
 * The "Fonds" panel: six kinds of background for a page or for the double page. Every change is
 * one `store.apply` of the core `setBackground` (with the assets it needs), so it is undoable
 * and saved like any other.
 */
export function BackgroundsPanel() {
  const book = useEditor((s) => s.book);
  const spreadId = useEditor((s) => s.currentSpreadId);
  const activePage = useEditor((s) => s.activePage);
  const [tab, setTab] = useState<TabKey>('color');
  const [chosen, setChosen] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bundled, setBundled] = useState<BundledBackground[] | null>(null);
  const [bundledFailed, setBundledFailed] = useState(false);

  useEffect(() => {
    let live = true;
    window.tb.library.bundledBackgrounds().then(
      (list) => {
        if (live) setBundled(list);
      },
      (e: unknown) => {
        console.error('Bundled backgrounds failed', e);
        if (live) setBundledFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const fail = useCallback((e: unknown): void => {
    console.error('Background failed', e);
    setError(t.failed);
  }, []);

  const spread = findSpread(book, spreadId);
  if (book === null || spread === undefined) {
    return <p className="shell-empty">{fr.shell.panelEmpty}</p>;
  }

  const available = availableTargets(book, spread);
  const target = resolveTarget(chosen, available, activePage);
  const current = spread.background[target];
  const pages = available.length - 1;
  const spreadId0 = spread.id;

  const apply = (bg: Background, options: ApplyOptions = {}): void => {
    setError(null);
    try {
      editorStore
        .getState()
        .apply(
          (b) => setBackground(withAssets(b, options.assets ?? []), spreadId0, target, bg),
          options.label ?? t.undoSet,
          options.mergeKey,
        );
    } catch (e) {
      fail(e);
    }
  };
  const remove = (): void => {
    setError(null);
    try {
      editorStore.getState().apply((b) => setBackground(b, spreadId0, target, null), t.undoRemove);
    } catch (e) {
      fail(e);
    }
  };

  const props: TabProps = {
    book,
    spread,
    target,
    current,
    bundled: bundled ?? [],
    apply,
    fail,
  };
  const Active = TABS.find(([key]) => key === tab)?.[2] ?? ColourTab;
  const needsBundled = tab === 'pattern' || tab === 'texture';

  return (
    <div className="bg-panel">
      <div className="bg-target">
        <span className="bg-target__caption" id="bg-target-label">
          {t.target}
        </span>
        <div className="seg" role="group" aria-labelledby="bg-target-label">
          {available.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={target === key}
              data-target={key}
              onClick={() => {
                setChosen(key);
                if (key !== 'spread') editorStore.getState().setActivePage(key as Side);
              }}
            >
              {targetLabel(spread, key, pages)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="button button--small"
          disabled={current === undefined}
          onClick={remove}
        >
          {t.remove}
        </button>
      </div>

      <div
        className="bg-tabs"
        role="tablist"
        aria-label={t.tabs}
        onKeyDown={(e) => {
          const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (step === 0) return;
          const at = TABS.findIndex(([key]) => key === tab);
          const next = TABS[(at + step + TABS.length) % TABS.length];
          if (next === undefined) return;
          setTab(next[0]);
          e.currentTarget
            .querySelectorAll<HTMLElement>('[role="tab"]')
            [TABS.indexOf(next)]?.focus();
        }}
      >
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            className="bg-tab-button"
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            data-tab={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error !== null && (
        <p className="bg-error" role="alert">
          {error}
        </p>
      )}

      <div className="bg-body" role="tabpanel" aria-label={TABS.find(([k]) => k === tab)?.[1]}>
        {needsBundled && bundled === null ? (
          <p className="bg-hint" role={bundledFailed ? 'alert' : 'status'}>
            {bundledFailed ? t.loadFailed : t.loading}
          </p>
        ) : (
          <Active {...props} />
        )}
      </div>
    </div>
  );
}
