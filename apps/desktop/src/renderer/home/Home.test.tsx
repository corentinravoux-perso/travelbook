// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    projectStore.setState({ recent: [], busy: false, error: null, view: 'home' });
  });

  it('calls the IPC and shows the copy in the list without opening it', async () => {
    render(<Home />);
    await screen.findByText('Islande');
    fireEvent.click(screen.getByRole('button', { name: fr.home.duplicate('Islande') }));
    await screen.findByText('Islande (copie)');
    expect(duplicate).toHaveBeenCalledWith('/albums/islande.travelbook');
    expect(projectStore.getState().view).toBe('home');
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
