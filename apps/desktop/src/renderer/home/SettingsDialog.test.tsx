// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StickerSourceInfo } from '../../shared/api';
import { fr } from '../strings/fr';
import { SettingsDialog } from './SettingsDialog';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});
afterEach(cleanup);

const source = (over: Partial<StickerSourceInfo>): StickerSourceInfo => ({
  id: 'iconify',
  label: 'Iconify',
  needsKey: false,
  backgrounds: false,
  hasKey: false,
  ...over,
});

function mock(
  sources: StickerSourceInfo[],
  setKey = vi.fn(() => Promise.resolve()),
  menu: { language?: 'fr' | 'en'; set?: ReturnType<typeof vi.fn> } = {},
) {
  (window as unknown as { tb: unknown }).tb = {
    library: { stickers: { sources: () => Promise.resolve(sources), setKey } },
    settings: {
      menuLanguage: () => Promise.resolve(menu.language ?? 'fr'),
      setMenuLanguage: menu.set ?? vi.fn(() => Promise.resolve()),
    },
  };
  return setKey;
}

describe('SettingsDialog', () => {
  it('shows an empty state while no source asks for a key', async () => {
    mock([source({}), source({ id: 'commons', label: 'Commons' })]);
    render(<SettingsDialog onClose={() => undefined} />);
    await screen.findByText(fr.settings.noKeys);
    expect(screen.queryByLabelText(/Clé de/)).toBeNull();
  });

  it('gives one optional key field to a source that needs one, and saves it', async () => {
    const setKey = mock([source({}), source({ id: 'pexels', label: 'Pexels', needsKey: true })]);
    render(<SettingsDialog onClose={() => undefined} />);
    const field = await screen.findByLabelText(fr.settings.keyLabel('Pexels'));
    expect(screen.queryByLabelText(fr.settings.keyLabel('Iconify'))).toBeNull();
    fireEvent.change(field, { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: fr.settings.save }));
    await waitFor(() => expect(setKey).toHaveBeenCalledWith('pexels', 'secret'));
  });

  it('says so when the key cannot be saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mock(
      [source({ id: 'pexels', label: 'Pexels', needsKey: true })],
      vi.fn(() => Promise.reject(new Error('x'))),
    );
    render(<SettingsDialog onClose={() => undefined} />);
    await screen.findByLabelText(fr.settings.keyLabel('Pexels'));
    fireEvent.click(screen.getByRole('button', { name: fr.settings.save }));
    await screen.findByText(fr.settings.keyFailed);
  });

  it('offers the menu language, French selected by default, and saves a change at once', async () => {
    const set = vi.fn(() => Promise.resolve());
    mock([], undefined, { set });
    render(<SettingsDialog onClose={() => undefined} />);
    const select = (await screen.findByLabelText(fr.settings.menuLanguage)) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('fr'));
    expect([...select.options].map((o) => o.textContent)).toEqual(['Français', 'English']);
    fireEvent.change(select, { target: { value: 'en' } });
    await waitFor(() => expect(set).toHaveBeenCalledWith('en'));
    expect(select.value).toBe('en');
  });

  it('shows the stored language', async () => {
    mock([], undefined, { language: 'en' });
    render(<SettingsDialog onClose={() => undefined} />);
    const select = (await screen.findByLabelText(fr.settings.menuLanguage)) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('en'));
  });
});
