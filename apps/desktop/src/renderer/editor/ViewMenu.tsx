import { useEffect, useRef, useState } from 'react';
import { editorStore, useEditor, type Guides, type RulerSize } from '../store/editor';
import { fr } from '../strings/fr';

const ENTRIES: (keyof Guides)[] = ['bleed', 'trim', 'safe', 'gutter'];
const SIZES: RulerSize[] = ['small', 'medium', 'large'];

/**
 * The View menu: one checkbox per print overlay of the canvas, then the rulers and their size. An in-app menu, not the Electron
 * application menu: the app has no menu bar, labels stay in `fr.ts`, and it works the same on
 * every platform.
 */
export function ViewMenu() {
  const [open, setOpen] = useState(false);
  const guides = useEditor((s) => s.guides);
  const rulerSize = useEditor((s) => s.rulerSize);
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
          {[...ENTRIES, 'rulers' as const].map((key) => (
            <button
              key={key}
              type="button"
              role="menuitemcheckbox"
              aria-checked={guides[key]}
              className={
                key === 'rulers' ? 'view-menu__item view-menu__item--group' : 'view-menu__item'
              }
              onClick={() => editorStore.getState().setGuide(key, !guides[key])}
            >
              <span className="view-menu__check" aria-hidden="true">
                {guides[key] ? '✓' : ''}
              </span>
              {fr.canvas[key]}
            </button>
          ))}
          {guides.rulers && (
            <div className="view-menu__sizes" role="group" aria-label={fr.canvas.rulerSize}>
              <span className="view-menu__sizes-label">{fr.canvas.rulerSize}</span>
              <div className="seg">
                {SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    role="menuitemradio"
                    aria-checked={rulerSize === size}
                    aria-pressed={rulerSize === size}
                    onClick={() => editorStore.getState().setRulerSize(size)}
                  >
                    {fr.canvas.rulerSizes[size]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
