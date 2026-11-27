import { useEffect, useState } from 'react';
import type { RecentProject } from '../../shared/api';
import { projectStore, useProject } from '../store/project';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import { ThemeToggle } from '../editor/ThemeToggle';
import { DeleteAlbumDialog } from './DeleteAlbumDialog';
import { RenameAlbumDialog } from './RenameAlbumDialog';
import { NewProjectDialog } from './NewProjectDialog';
import { SettingsDialog } from './SettingsDialog';
import './Home.css';
// Four of the app's own Bohème drawings (MIT) set the scene of the empty home screen.
import valise from '../../../resources/stickers-src/boheme/carnet-valise-vintage.svg?url';
import polaroid from '../../../resources/stickers-src/boheme/carnet-polaroid.svg?url';
import billets from '../../../resources/stickers-src/boheme/carnet-billets-avion.svg?url';
import appareil from '../../../resources/stickers-src/boheme/carnet-appareil-argentique.svg?url';

const SCENE = [
  { src: valise, place: 'valise' },
  { src: polaroid, place: 'polaroid' },
  { src: billets, place: 'billets' },
  { src: appareil, place: 'appareil' },
] as const;

const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE.format(date);
}

/** A cover thumbnail is shown only if it is a `tb:` address: the page may load nothing else. */
function CoverThumb({ project }: { project: RecentProject }) {
  const src = project.coverThumb;
  return (
    <span className="cover" aria-hidden={src === undefined || !src.startsWith('tb:')}>
      {src !== undefined && src.startsWith('tb:') ? (
        <img className="cover__image" src={src} alt={fr.home.coverAlt(project.title)} />
      ) : (
        <span className="cover__blank" />
      )}
    </span>
  );
}

/** Recent albums, and the two ways to get a book on screen: a new one, or an existing folder. */
export function Home() {
  const recent = useProject((s) => s.recent);
  const busy = useProject((s) => s.busy);
  const duplicating = useProject((s) => s.duplicating);
  const error = useProject((s) => s.error);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleting, setDeleting] = useState<RecentProject | null>(null);
  const [renaming, setRenaming] = useState<RecentProject | null>(null);
  const {
    refreshRecent,
    openProject,
    createProject,
    duplicateProject,
    deleteProject,
    renameProject,
  } = projectStore.getState();

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  return (
    <div className="home">
      <header className="home__bar">
        <h1 className="shell-top__mark">{fr.app.name}</h1>
        <span className="shell-top__grow" />
        <button
          type="button"
          className="icon-button"
          aria-label={fr.settings.open}
          title={fr.settings.open}
          onClick={() => setSettingsOpen(true)}
        >
          <Icon name="settings" />
        </button>
        <ThemeToggle />
      </header>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <main className="home__main">
        <div className="home__head">
          <h2 className="home__heading">{fr.home.heading}</h2>
          <div className="home__actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void openProject()}
            >
              <Icon name="folder-open" />
              {fr.home.open}
            </button>
            <button
              type="button"
              className="button button--primary"
              disabled={busy}
              onClick={() => {
                projectStore.setState({ error: null });
                setCreating(true);
              }}
            >
              <Icon name="plus" />
              {fr.home.newBook}
            </button>
          </div>
        </div>

        {error === 'open' && (
          <p className="home__error" role="alert">
            {fr.home.openFailed}
          </p>
        )}

        {error === 'duplicate' && (
          <p className="home__error" role="alert">
            {fr.home.duplicateFailed}
          </p>
        )}

        {recent.length === 0 ? (
          <div className="home__empty">
            <div className="home__scene" aria-hidden="true">
              <span className="home__book" />
              {SCENE.map(({ src, place }) => (
                <img
                  key={place}
                  className={`home__sticker home__sticker--${place}`}
                  src={src}
                  alt=""
                  draggable={false}
                />
              ))}
            </div>
            <p className="home__empty-title">{fr.home.emptyTitle}</p>
            <p>{fr.home.emptyHint}</p>
          </div>
        ) : (
          <section aria-label={fr.home.recent}>
            <ul className="home__grid">
              {recent.map((project) => (
                <li key={project.dir}>
                  <button
                    type="button"
                    className="album"
                    disabled={busy}
                    title={project.dir}
                    onClick={() => void openProject(project.dir)}
                  >
                    <CoverThumb project={project} />
                    <span className="album__title">{project.title}</span>
                    <span className="album__date">
                      {fr.home.openedOn(formatDate(project.openedAt))}
                    </span>
                  </button>
                  <div className="album__actions">
                    <button
                      type="button"
                      className="button album__rename"
                      disabled={busy}
                      aria-label={fr.home.rename(project.title)}
                      title={fr.home.rename(project.title)}
                      onClick={() => {
                        projectStore.setState({ error: null });
                        setRenaming(project);
                      }}
                    >
                      <Icon name="pencil" />
                      {fr.home.renameLabel}
                    </button>
                    <button
                      type="button"
                      className="button album__duplicate"
                      disabled={busy}
                      aria-label={fr.home.duplicate(project.title)}
                      aria-busy={duplicating === project.dir}
                      title={fr.home.duplicate(project.title)}
                      onClick={() => void duplicateProject(project.dir)}
                    >
                      <Icon name="copy" />
                      {duplicating === project.dir ? fr.home.duplicating : fr.home.duplicateLabel}
                    </button>
                    <button
                      type="button"
                      className="button button--danger-outline album__delete"
                      disabled={busy}
                      aria-label={fr.home.delete(project.title)}
                      title={fr.home.delete(project.title)}
                      onClick={() => {
                        projectStore.setState({ error: null });
                        setDeleting(project);
                      }}
                    >
                      <Icon name="trash" />
                      {fr.home.deleteLabel}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {deleting && (
        <DeleteAlbumDialog
          project={deleting}
          busy={busy}
          failed={error === 'delete'}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            void deleteProject(deleting.dir).then((done) => {
              if (done) setDeleting(null);
            })
          }
        />
      )}

      {renaming && (
        <RenameAlbumDialog
          project={renaming}
          busy={busy}
          failed={error === 'rename'}
          onClose={() => setRenaming(null)}
          onSubmit={(title) =>
            void renameProject(renaming.dir, title).then((done) => {
              if (done) setRenaming(null);
            })
          }
        />
      )}

      {creating && (
        <NewProjectDialog
          busy={busy}
          failed={error === 'create'}
          onClose={() => setCreating(false)}
          onSubmit={(options) => void createProject(options)}
        />
      )}
    </div>
  );
}
