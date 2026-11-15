import { useEffect, useRef, useState } from 'react';
import { editorStore, useEditor, type Guides } from '../store/editor';
import { fr } from '../strings/fr';

const ENTRIES: (keyof Guides)[] = ['bleed', 'trim', 'safe', 'gutter'];

/**
 * The View menu: one checkbox per print overlay of the canvas. An in-app menu, not the Electron
 * application menu: the app has no menu bar, labels stay in `fr.ts`, and it works the same on
 * every platform.
 */
export function ViewMenu() {
  const [open, setOpen] = useState(false);
  const guides = useEditor((s) => s.guides);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="view-menu" ref={root}>
      <button
        type="button"
        className="icon-button view-menu__button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {fr.canvas.view}
      </button>
      {open && (
        <div className="view-menu__list" role="menu" aria-label={fr.canvas.viewMenu}>
          {ENTRIES.map((key) => (
            <button
              key={key}
              type="button"
              role="menuitemcheckbox"
              aria-checked={guides[key]}
              className="view-menu__item"
              onClick={() => editorStore.getState().setGuide(key, !guides[key])}
            >
              <span className="view-menu__check" aria-hidden="true">
                {guides[key] ? '✓' : ''}
              </span>
              {fr.canvas[key]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
