// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newBook } from '@travelbook/core';
import type { RecentProject } from '../../shared/api';
import { projectStore } from '../store/project';
import { fr } from '../strings/fr';
import { Home } from './Home';

afterEach(cleanup);

const album = (title: string, dir: string): RecentProject => ({
  dir,
  title,
  openedAt: '2026-11-15T10:00:00.000Z',
});

describe('Home: duplicate an album', () => {
  let list: RecentProject[];
  let duplicate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    list = [album('Islande', '/albums/islande.travelbook')];
    duplicate = vi.fn((dir: string) => {
      list = [album('Islande (copie)', `${dir}-copie`), ...list];
      return Promise.resolve({ dir: `${dir}-copie`, book: newBook({ title: 'Islande (copie)' }) });
    });
    (window as unknown as { tb: unknown }).tb = {
      project: { recent: () => Promise.resolve(list), duplicate },
    };
    projectStore.setState({
      recent: [],
      busy: false,
      duplicating: null,
      error: null,
      view: 'home',
    });
  });

  it('calls the IPC and shows the copy in the list without opening it', async () => {
    render(<Home />);
    await screen.findByText('Islande');
    fireEvent.click(screen.getByRole('button', { name: fr.home.duplicate('Islande') }));
    await screen.findByText('Islande (copie)');
    expect(duplicate).toHaveBeenCalledWith('/albums/islande.travelbook');
    expect(projectStore.getState().view).toBe('home');
  });

  it('shows "Duplication…" on the album being copied and disables every "Dupliquer"', async () => {
    list = [...list, album('Japon', '/albums/japon.travelbook')];
    let finish: () => void = () => undefined;
    duplicate.mockImplementation(
      (dir: string) =>
        new Promise((resolve) => {
          finish = () =>
            resolve({ dir: `${dir}-copie`, book: newBook({ title: 'Islande (copie)' }) });
        }),
    );
    render(<Home />);
    await screen.findByText('Japon');
    const islande = screen.getByRole('button', { name: fr.home.duplicate('Islande') });
    const japon = screen.getByRole('button', { name: fr.home.duplicate('Japon') });
    fireEvent.click(islande);
    await waitFor(() => expect(islande.textContent).toBe(fr.home.duplicating));
    expect(japon.textContent).toBe(fr.home.duplicateLabel);
    expect((islande as HTMLButtonElement).disabled).toBe(true);
    expect((japon as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(japon);
    expect(duplicate).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await waitFor(() => expect(islande.textContent).toBe(fr.home.duplicateLabel));
    expect((japon as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows an error when the copy fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    duplicate.mockRejectedValue(new Error('disk full'));
    render(<Home />);
    await screen.findByText('Islande');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: fr.home.duplicate('Islande') }));
    });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(fr.home.duplicateFailed),
    );
  });
});

describe('Home: delete an album', () => {
  let list: RecentProject[];
  let remove: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  beforeEach(() => {
    list = [
      album('Islande', '/albums/islande.travelbook'),
      album('Japon', '/albums/japon.travelbook'),
    ];
    remove = vi.fn((dir: string) => {
      list = list.filter((p) => p.dir !== dir);
      return Promise.resolve();
    });
    (window as unknown as { tb: unknown }).tb = {
      project: { recent: () => Promise.resolve(list), delete: remove },
    };
    projectStore.setState({
      recent: [],
      busy: false,
      duplicating: null,
      error: null,
      view: 'home',
    });
  });

  const ask = async (title: string) => {
    render(<Home />);
    await screen.findByText(title);
    fireEvent.click(screen.getByRole('button', { name: fr.home.delete(title) }));
    return screen.getByRole('dialog', { name: fr.home.deleteTitle(title) });
  };

  it('asks first; "Annuler" deletes nothing and has the focus', async () => {
    const dialog = await ask('Islande');
    const cancel = within(dialog).getByRole('button', { name: fr.home.deleteCancel });
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByText('Islande')).toBeTruthy();
  });

  it('moves the album to the trash once confirmed and takes it out of the list', async () => {
    const dialog = await ask('Islande');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: fr.home.deleteConfirm }));
    });
    expect(remove).toHaveBeenCalledExactlyOnceWith('/albums/islande.travelbook');
    await waitFor(() => expect(screen.queryByText('Islande')).toBeNull());
    expect(screen.getByText('Japon')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the dialog open with an error when the trash fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    remove.mockRejectedValue(new Error('no trash'));
    const dialog = await ask('Islande');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: fr.home.deleteConfirm }));
    });
    await waitFor(() =>
      expect(within(dialog).getByRole('alert').textContent).toBe(fr.home.deleteFailed),
    );
    expect(screen.getByText('Islande')).toBeTruthy();
  });
});
