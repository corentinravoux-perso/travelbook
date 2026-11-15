import { Component, type ReactNode } from 'react';
import { editorStore } from './store/editor';
import { fr } from './strings/fr';

/**
 * Catches a render error anywhere below it. Without it React unmounts the whole tree and the
 * window turns white; with it the user reads what happened and reloads. The book lives in the
 * editor store, outside this tree: it is saved at once, and again before the reload.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error('Render error', error);
    void editorStore
      .getState()
      .flush()
      .catch(() => undefined);
  }

  private reload = () => {
    void editorStore
      .getState()
      .flush()
      .catch(() => undefined)
      .finally(() => location.reload());
  };

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ padding: 32, maxWidth: 480, margin: '15vh auto' }}>
        <h1>{fr.crash.title}</h1>
        <p>{fr.crash.body}</p>
        <button type="button" onClick={this.reload}>
          {fr.crash.reload}
        </button>
      </div>
    );
  }
}
