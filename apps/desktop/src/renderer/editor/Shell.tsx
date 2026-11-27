import { useEffect, useState, type CSSProperties } from 'react';
import { PANELS, useEditor, editorStore, type PanelId } from '../store/editor';
import { installBookFonts } from '../fonts/bookFonts';
import { fontListStore } from '../fonts/fontList';
import { startFontSync } from './fontSync';
import { projectStore } from '../store/project';
import { ImportStatus } from '../panels/ImportStatus';
import { PhotosPanel } from '../panels/PhotosPanel';
import { BackgroundsPanel } from '../panels/BackgroundsPanel';
import { StickersPanel } from '../panels/StickersPanel';
import { TemplatesPanel } from '../panels/TemplatesPanel';
import { ShapesPanel } from '../panels/ShapesPanel';
import { MapsPanel } from '../panels/MapsPanel';
import { MapDialog } from '../maps/MapDialog';
import { TextPanel } from '../panels/TextPanel';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import type { IconName } from '../theme/icons';
import {
  FOLDED_INSPECTOR_W,
  readFolded,
  readWidths,
  writeFolded,
  writeWidths,
  type PanelSide,
  type PanelWidths,
  type PanelsFolded,
} from './layout';
import { AlbumTitle } from './AlbumTitle';
import { BookSettings } from './BookSettings';
import { Canvas } from './Canvas';
import { PosterDialog } from '../posters/PosterDialog';
import { CreditsDialog, CreditsEntry } from './CreditsDialog';
import { CoverStage } from './CoverStage';
import { Overview } from './Overview';
import { ExportDialog } from '../export/ExportDialog';
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
  maps: 'map',
};

/**
 * The editor's frame (spec §8): top bar, rail, panel, canvas, inspector and spreads strip. The
 * panel and inspector widths are the user's, kept across sessions. Later tasks fill the regions.
 */
export function Shell() {
  // The book's fonts are declared as soon as an album is open: text is drawn with them.
  useEffect(() => installBookFonts(), []);
  // The list of fonts, and the album carrying the user fonts its text uses.
  useEffect(() => {
    void fontListStore.getState().load();
    return startFontSync();
  }, []);
  const [widths, setWidths] = useState<PanelWidths>(() => readWidths(localStorage));
  useEffect(() => writeWidths(localStorage, widths), [widths]);
  const resize = (side: PanelSide) => (width: number) =>
    setWidths((w) => (w[side] === width ? w : { ...w, [side]: width }));

  const [folded, setFolded] = useState<PanelsFolded>(() => readFolded(localStorage));
  useEffect(() => writeFolded(localStorage, folded), [folded]);
  const fold = (side: PanelSide, on: boolean) =>
    setFolded((f) => (f[side] === on ? f : { ...f, [side]: on }));

  const style = {
    '--panel-w': folded.panel ? '0px' : `${widths.panel}px`,
    '--inspector-w': folded.inspector ? `${FOLDED_INSPECTOR_W}px` : `${widths.inspector}px`,
  } as CSSProperties;

  const overview = useEditor((s) => s.overview);
  const preview = useEditor((s) => s.preview);

  return (
    <>
      <div className="shell" style={style} inert={overview || preview || undefined}>
        <TopBar />
        <Rail folded={folded.panel} onFold={(on) => fold('panel', on)} />
        <Panel
          width={widths.panel}
          onResize={resize('panel')}
          folded={folded.panel}
          onFold={() => fold('panel', true)}
        />
        <Canvas />
        <aside
          id="shell-inspector"
          className="shell-inspector"
          aria-label={fr.shell.inspector}
          data-folded={folded.inspector || undefined}
        >
          {folded.inspector ? (
            <button
              type="button"
              className="icon-button shell-unfold"
              aria-label={fr.shell.unfoldInspector}
              title={fr.shell.unfoldInspector}
              aria-expanded={false}
              aria-controls="shell-inspector"
              onClick={() => fold('inspector', false)}
            >
              <Icon name="layout-sidebar-right-expand" />
            </button>
          ) : (
            <>
              <ResizeHandle
                side="inspector"
                width={widths.inspector}
                label={fr.shell.resizeInspector}
                controls="shell-inspector"
                onResize={resize('inspector')}
              />
              <Inspector onFold={() => fold('inspector', true)} />
            </>
          )}
        </aside>
        <SpreadStrip />
        <CoverStage />
      </div>
      <CreditsDialog />
      <PosterDialog />
      <MapDialog />
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
  const [exportOpen, setExportOpen] = useState(false);

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
          <AlbumTitle title={title} />
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
          <button
            type="button"
            className="button button--primary"
            disabled={book === null}
            onClick={() => setExportOpen(true)}
          >
            <Icon name="file-export" />
            {fr.shell.export}
          </button>
          <span className="shell-sep" />
        </>
      )}
      <ThemeToggle />
      {settingsOpen && book !== null && (
        <BookSettings book={book} onClose={() => setSettingsOpen(false)} />
      )}
      {exportOpen && book !== null && (
        <ExportDialog book={book} onClose={() => setExportOpen(false)} />
      )}
    </header>
  );
}

/**
 * The tools. A click on a tool opens its panel, and unfolds the panel if it was folded; it never
 * folds it (a click to make sure a panel is open must not hide it). The panel's own button folds.
 */
function Rail({ folded, onFold }: { folded: boolean; onFold(on: boolean): void }) {
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
          data-folded={(panel === id && folded) || undefined}
          title={panel === id && folded ? fr.shell.unfoldPanel : undefined}
          onClick={() => {
            setPanel(id);
            onFold(false);
          }}
        >
          <Icon name={PANEL_ICONS[id]} />
          {fr.panels[id]}
        </button>
      ))}
    </nav>
  );
}

function Panel({
  width,
  onResize,
  folded,
  onFold,
}: {
  width: number;
  onResize(width: number): void;
  folded: boolean;
  onFold(): void;
}) {
  const panel = useEditor((s) => s.panel);
  const name = fr.panels[panel];
  return (
    <section
      id="shell-panel"
      className="shell-panel"
      aria-label={fr.shell.panel(name)}
      hidden={folded}
    >
      <div className="shell-panel__head">
        <h2 className="shell-panel__title">{name}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={fr.shell.foldPanel}
          title={fr.shell.foldPanel}
          aria-expanded={true}
          aria-controls="shell-panel"
          onClick={onFold}
        >
          <Icon name="layout-sidebar-left-collapse" />
        </button>
      </div>
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
      ) : panel === 'maps' ? (
        <MapsPanel />
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
