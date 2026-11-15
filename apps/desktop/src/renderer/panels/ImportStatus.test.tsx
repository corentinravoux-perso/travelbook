// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { trayStore } from '../store/tray';
import { ImportStatus } from './ImportStatus';

const tray = () => trayStore.getState();

describe('ImportStatus', () => {
  beforeEach(() => {
    tray().setProgress(null);
    tray().setFailures([]);
    tray().setRestored([]);
  });
  afterEach(cleanup);

  it('shows nothing while no import runs and nothing failed', () => {
    const { container } = render(<ImportStatus />);
    expect(container.textContent).toBe('');
  });

  it('shows the progress bar of a running import, then takes it away', () => {
    render(<ImportStatus />);
    act(() => tray().setProgress({ done: 0, total: 0 }));
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByText('Préparation…')).toBeTruthy();
    act(() => tray().setProgress({ done: 3, total: 10 }));
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('aria-valuemax')).toBe('10');
    expect(screen.getByText('3 sur 10')).toBeTruthy();
    act(() => tray().setProgress(null));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('names the originals that came back, in French, and can be dismissed', () => {
    render(<ImportStatus />);
    act(() => tray().setRestored(['IMG_0001.jpg']));
    const note = screen.getByRole('status');
    expect(note.textContent).toContain("1 original est de nouveau dans l'album");
    expect(note.textContent).toContain('IMG_0001.jpg');
    act(() => tray().setRestored(['IMG_0001.jpg', 'IMG_0002.jpg']));
    expect(screen.getByRole('status').textContent).toContain(
      "2 originaux sont de nouveau dans l'album",
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fermer ce message' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('names every file that failed, in French, and can be dismissed', () => {
    render(<ImportStatus />);
    act(() =>
      tray().setFailures([
        { name: 'notes.txt', reason: 'format non pris en charge' },
        { name: 'cassée.jpg', reason: 'fichier illisible ou abîmé' },
      ]),
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain("2 fichiers n'ont pas pu être importés");
    expect(alert.textContent).toContain('notes.txt : format non pris en charge');
    expect(alert.textContent).toContain('cassée.jpg : fichier illisible ou abîmé');
    fireEvent.click(screen.getByRole('button', { name: 'Fermer ce message' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so when the whole import failed', () => {
    render(<ImportStatus />);
    act(() => tray().setFailures([{ name: null, reason: "L'importation a échoué. Réessayez." }]));
    expect(screen.getByRole('alert').textContent).toContain("L'importation a échoué. Réessayez.");
  });

  it('forgets the failures of an earlier album when it is mounted for another', () => {
    tray().setFailures([{ name: 'old.png', reason: 'format non pris en charge' }]);
    render(<ImportStatus />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(tray().failures).toEqual([]);
  });
});
