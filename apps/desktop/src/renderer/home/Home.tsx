import { useEffect, useState } from 'react';
import type { RecentProject } from '../../shared/api';
import { projectStore, useProject } from '../store/project';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import { ThemeToggle } from '../editor/ThemeToggle';
import { NewProjectDialog } from './NewProjectDialog';
import { SettingsDialog } from './SettingsDialog';
import './Home.css';

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
  const error = useProject((s) => s.error);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { refreshRecent, openProject, createProject } = projectStore.getState();

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

        {recent.length === 0 ? (
          <div className="home__empty">
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
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

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
