import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { PANELS, useEditor, editorStore, type PanelId } from '../store/editor';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import type { IconName } from '../theme/icons';
import { currentTheme, setTheme, subscribeTheme } from '../theme/theme';
import { readWidths, writeWidths, type PanelSide, type PanelWidths } from './layout';
import { ResizeHandle } from './ResizeHandle';
import './Shell.css';

const PANEL_ICONS: Record<PanelId, IconName> = {
  photos: 'photo',
  templates: 'layout',
  stickers: 'sticker',
  backgrounds: 'background',
  text: 'letter-t',
  shapes: 'triangle-square-circle',
};

/**
 * The editor's frame (spec §8): top bar, rail, panel, canvas, inspector and spreads strip. The
 * panel and inspector widths are the user's, kept across sessions. Later tasks fill the regions.
 */
export function Shell() {
  const [widths, setWidths] = useState<PanelWidths>(() => readWidths(localStorage));
  useEffect(() => writeWidths(localStorage, widths), [widths]);
  const resize = (side: PanelSide) => (width: number) =>
    setWidths((w) => (w[side] === width ? w : { ...w, [side]: width }));

  const style = {
    '--panel-w': `${widths.panel}px`,
    '--inspector-w': `${widths.inspector}px`,
  } as CSSProperties;

  return (
    <div className="shell" style={style}>
      <TopBar />
      <Rail />
      <Panel width={widths.panel} onResize={resize('panel')} />
      <main className="shell-canvas" aria-label={fr.shell.canvas}>
        <p className="shell-canvas__empty">{fr.shell.noAlbum}</p>
      </main>
      <aside id="shell-inspector" className="shell-inspector" aria-label={fr.shell.inspector}>
        <ResizeHandle
          side="inspector"
          width={widths.inspector}
          label={fr.shell.resizeInspector}
          controls="shell-inspector"
          onResize={resize('inspector')}
        />
        <p className="shell-empty">{fr.shell.inspectorEmpty}</p>
      </aside>
      <nav className="shell-strip" aria-label={fr.shell.spreads}>
        <p className="shell-empty">{fr.shell.spreadsEmpty}</p>
      </nav>
    </div>
  );
}

function TopBar() {
  const title = useEditor((s) => s.book?.title);
  const { canUndo, canRedo } = useEditor((s) => s.history);
  const theme = useSyncExternalStore(subscribeTheme, currentTheme);
  const { undo, redo } = editorStore.getState();

  return (
    <header className="shell-top" aria-label={fr.shell.topBar}>
      <h1 className="shell-top__mark">{fr.app.name}</h1>
      {title !== undefined && (
        <>
          <span className="shell-sep" />
          <span className="shell-top__title">{title}</span>
        </>
      )}
      <span className="shell-top__grow" />
      <button
        type="button"
        className="icon-button"
        aria-label={fr.shell.undo}
        title={fr.shell.undo}
        disabled={!canUndo}
        onClick={undo}
      >
        <Icon name="arrow-back-up" />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={fr.shell.redo}
        title={fr.shell.redo}
        disabled={!canRedo}
        onClick={redo}
      >
        <Icon name="arrow-forward-up" />
      </button>
      <span className="shell-sep" />
      <ThemeToggle theme={theme} />
    </header>
  );
}

function ThemeToggle({ theme }: { theme: 'light' | 'dark' }) {
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? fr.shell.themeToDark : fr.shell.themeToLight;
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      <Icon name={next === 'dark' ? 'moon' : 'sun'} />
    </button>
  );
}

function Rail() {
  const panel = useEditor((s) => s.panel);
  const { setPanel } = editorStore.getState();
  return (
    <nav className="shell-rail" aria-label={fr.shell.rail}>
      {PANELS.map((id) => (
        <button
          key={id}
          type="button"
          className="shell-rail__item"
          aria-pressed={panel === id}
          aria-controls="shell-panel"
          onClick={() => setPanel(id)}
        >
          <Icon name={PANEL_ICONS[id]} />
          {fr.panels[id]}
        </button>
      ))}
    </nav>
  );
}

function Panel({ width, onResize }: { width: number; onResize(width: number): void }) {
  const name = fr.panels[useEditor((s) => s.panel)];
  return (
    <section id="shell-panel" className="shell-panel" aria-label={fr.shell.panel(name)}>
      <h2 className="shell-panel__title">{name}</h2>
      <p className="shell-empty">{fr.shell.panelEmpty}</p>
      <ResizeHandle
        side="panel"
        width={width}
        label={fr.shell.resizePanel}
        controls="shell-panel"
        onResize={onResize}
      />
    </section>
  );
}
