import { useEffect, useState, type CSSProperties } from 'react';
import { PANELS, useEditor, editorStore, type PanelId } from '../store/editor';
import { installBookFonts } from '../fonts/bookFonts';
import { projectStore } from '../store/project';
import { ImportStatus } from '../panels/ImportStatus';
import { PhotosPanel } from '../panels/PhotosPanel';
import { BackgroundsPanel } from '../panels/BackgroundsPanel';
import { StickersPanel } from '../panels/StickersPanel';
import { TemplatesPanel } from '../panels/TemplatesPanel';
import { ShapesPanel } from '../panels/ShapesPanel';
import { TextPanel } from '../panels/TextPanel';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import type { IconName } from '../theme/icons';
import { readWidths, writeWidths, type PanelSide, type PanelWidths } from './layout';
import { BookSettings } from './BookSettings';
import { Canvas } from './Canvas';
import { CreditsDialog, CreditsEntry } from './CreditsDialog';
import { CoverStage } from './CoverStage';
import { Overview } from './Overview';
import { Preview } from '../preview/Preview';
import { Inspector } from './inspector/Inspector';
import { ResizeHandle } from './ResizeHandle';
import { SaveIndicator } from './SaveIndicator';
import { SpreadStrip } from './SpreadStrip';
import { ThemeToggle } from './ThemeToggle';
import { ViewMenu } from './ViewMenu';
import { ZoomControls } from './ZoomControls';
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
  // The book's fonts are declared as soon as an album is open: text is drawn with them.
  useEffect(() => installBookFonts(), []);
  const [widths, setWidths] = useState<PanelWidths>(() => readWidths(localStorage));
  useEffect(() => writeWidths(localStorage, widths), [widths]);
  const resize = (side: PanelSide) => (width: number) =>
    setWidths((w) => (w[side] === width ? w : { ...w, [side]: width }));

  const style = {
    '--panel-w': `${widths.panel}px`,
    '--inspector-w': `${widths.inspector}px`,
  } as CSSProperties;

  const overview = useEditor((s) => s.overview);
  const preview = useEditor((s) => s.preview);

  return (
    <>
      <div className="shell" style={style} inert={overview || preview || undefined}>
        <TopBar />
        <Rail />
        <Panel width={widths.panel} onResize={resize('panel')} />
        <Canvas />
        <aside id="shell-inspector" className="shell-inspector" aria-label={fr.shell.inspector}>
          <ResizeHandle
            side="inspector"
            width={widths.inspector}
            label={fr.shell.resizeInspector}
            controls="shell-inspector"
            onResize={resize('inspector')}
          />
          <Inspector />
        </aside>
        <SpreadStrip />
        <CoverStage />
      </div>
      <CreditsDialog />
      {overview && <Overview />}
      {preview && <Preview />}
    </>
  );
}

function TopBar() {
  const title = useEditor((s) => s.book?.title);
  const format = useEditor((s) => s.book?.format);
  const { canUndo, canRedo } = useEditor((s) => s.history);
  const { undo, redo } = editorStore.getState();
  const book = useEditor((s) => s.book);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="shell-top" aria-label={fr.shell.topBar}>
      <button
        type="button"
        className="icon-button"
        aria-label={fr.shell.home}
        title={fr.shell.home}
        onClick={() => void projectStore.getState().goHome()}
      >
        <Icon name="home" />
      </button>
      <h1 className="shell-top__mark">{fr.app.name}</h1>
      {title !== undefined && (
        <>
          <span className="shell-sep" />
          <span className="shell-top__title">{title}</span>
          {format !== undefined && (
            <span className="shell-top__format">
              {fr.shell.formatCaption(format.width, format.height)}
            </span>
          )}
        </>
      )}
      <span className="shell-top__grow" />
      {title !== undefined && (
        <>
          <SaveIndicator />
          <span className="shell-sep" />
        </>
      )}
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
      {book !== null && (
        <>
          <button
            type="button"
            className="icon-button"
            aria-label={fr.shell.overview}
            title={fr.shell.overview}
            onClick={() => editorStore.getState().setOverview(true)}
          >
            <Icon name="layout-grid" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={fr.shell.bookSettings}
            title={fr.shell.bookSettings}
            onClick={() => setSettingsOpen(true)}
          >
            <Icon name="settings" />
          </button>
          <span className="shell-sep" />
        </>
      )}
      {title !== undefined && (
        <>
          <ViewMenu />
          <CreditsEntry />
          <ZoomControls />
          <span className="shell-sep" />
          <button
            type="button"
            className="button"
            disabled={book === null}
            onClick={() => editorStore.getState().setPreview(true)}
          >
            <Icon name="eye" />
            {fr.shell.preview}
          </button>
          <span className="shell-sep" />
        </>
      )}
      <ThemeToggle />
      {settingsOpen && book !== null && (
        <BookSettings book={book} onClose={() => setSettingsOpen(false)} />
      )}
    </header>
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
  const panel = useEditor((s) => s.panel);
  const name = fr.panels[panel];
  return (
    <section id="shell-panel" className="shell-panel" aria-label={fr.shell.panel(name)}>
      <h2 className="shell-panel__title">{name}</h2>
      <ImportStatus />
      {panel === 'photos' ? (
        <PhotosPanel />
      ) : panel === 'templates' ? (
        <TemplatesPanel />
      ) : panel === 'text' ? (
        <TextPanel />
      ) : panel === 'shapes' ? (
        <ShapesPanel />
      ) : panel === 'backgrounds' ? (
        <BackgroundsPanel />
      ) : panel === 'stickers' ? (
        <StickersPanel />
      ) : (
        <p className="shell-empty">{fr.shell.panelEmpty}</p>
      )}
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
