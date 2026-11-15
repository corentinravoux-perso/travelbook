import { useState } from 'react';
import { fr } from '../strings/fr';
import { LibraryTab } from './stickers/LibraryTab';
import { MineTab } from './stickers/MineTab';
import { OnlineTab } from './stickers/OnlineTab';
import './Photos.css';
import './stickers/Stickers.css';

const t = fr.stickers;

type TabKey = 'travelbook' | 'library' | 'online' | 'mine' | 'favourites' | 'recent';

const TABS: [TabKey, string][] = [
  ['travelbook', t.tab.travelbook],
  ['library', t.tab.library],
  ['online', t.tab.online],
  ['mine', t.tab.mine],
  ['favourites', t.tab.favourites],
  ['recent', t.tab.recent],
];

/**
 * The "Stickers" panel (spec §9.2): our own drawn sets ("travelbook", first), the offline
 * library of open packs, online sources, the user's own
 * stickers, favourites and recents. Placing one (a click, or a drag onto the page) goes through
 * `placeSticker`, which copies it into the album and adds the element in one undo step.
 */
export function StickersPanel() {
  const [tab, setTab] = useState<TabKey>('travelbook');
  return (
    <div className="stk-panel">
      <div
        className="stk-tabs"
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
            className="stk-tab-button"
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            data-tab={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="stk-body" role="tabpanel" aria-label={TABS.find(([k]) => k === tab)?.[1]}>
        {tab === 'travelbook' && <LibraryTab key="travelbook" group="travelbook" />}
        {tab === 'library' && <LibraryTab key="library" group="library" />}
        {tab === 'online' && <OnlineTab />}
        {tab === 'mine' && <MineTab view="mine" />}
        {tab === 'favourites' && <MineTab view="favourites" />}
        {tab === 'recent' && <MineTab view="recent" />}
      </div>
    </div>
  );
}
