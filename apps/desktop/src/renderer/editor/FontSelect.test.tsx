// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FontFamily } from '../../shared/api';
import { fontListStore } from '../fonts/fontList';
import { fr } from '../strings/fr';
import { FontSelect } from './FontSelect';

const licence = {
  source: 'S',
  licence: 'OFL-1.1',
  url: 'https://x.org',
  requiresAttribution: false,
};
const family = (
  name: string,
  origin: FontFamily['origin'],
  category: FontFamily['category'],
): FontFamily => ({ family: name, category, origin, faces: [], licence });

const LIST = [
  family('Caveat', 'bundled', 'manuscrite'),
  family('Lora', 'bundled', 'serif'),
  family('Inter', 'bundled', 'sans'),
  family('Bitter', 'library', 'serif'),
];

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});
beforeEach(() => {
  (window as unknown as { tb: unknown }).tb = {
    library: { fonts: { list: () => Promise.resolve(LIST) } },
  };
  fontListStore.setState({ status: 'ready', families: LIST });
});
afterEach(cleanup);

describe('FontSelect', () => {
  it('lists the bundled families by category, then the user ones, each in its own face', () => {
    render(<FontSelect value="'Lora', serif" label="Police" onChange={() => undefined} />);
    const select = screen.getByLabelText('Police') as HTMLSelectElement;
    const groups = [...select.querySelectorAll('optgroup')].map((g) => g.label);
    expect(groups).toEqual([
      fr.fonts.category.manuscrite,
      fr.fonts.category.serif,
      fr.fonts.category.sans,
      fr.fonts.groupOwn,
    ]);
    const options = [...select.querySelectorAll('option')];
    expect(options.map((o) => o.textContent)).toEqual(['Caveat', 'Lora', 'Inter', 'Bitter']);
    expect(options[0]!.style.fontFamily).toContain('Caveat');
    expect(options[3]!.style.fontFamily).toContain('Bitter');
    expect(select.value).toBe("'Lora', serif");
    expect(select.style.fontFamily).toContain('Lora');
  });

  it('reports the stored value of the chosen family', () => {
    const onChange = vi.fn();
    render(<FontSelect value="'Lora', serif" label="Police" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Police'), { target: { value: "'Bitter', serif" } });
    expect(onChange).toHaveBeenCalledWith("'Bitter', serif");
  });

  it('shows the name of a font the list does not have, as a disabled entry', () => {
    render(<FontSelect value="'Mystère', serif" label="Police" onChange={() => undefined} />);
    const select = screen.getByLabelText('Police') as HTMLSelectElement;
    const first = select.querySelector('option')!;
    expect(first.textContent).toBe('Mystère');
    expect(first.disabled).toBe(true);
  });

  it('offers "Plus de polices…" only where asked, and opens the dialog', () => {
    const { rerender } = render(
      <FontSelect value="Lora" label="Police" onChange={() => undefined} />,
    );
    expect(screen.queryByRole('button', { name: fr.fonts.more })).toBeNull();
    rerender(<FontSelect value="Lora" label="Police" more onChange={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: fr.fonts.more }));
    expect(screen.getByRole('dialog', { hidden: true })).toBeTruthy();
  });
});
