import { useEffect, useRef, useState } from 'react';
import { MAX_TITLE_LENGTH } from '../home/RenameAlbumDialog';
import { editorStore } from '../store/editor';
import { fr } from '../strings/fr';

/**
 * The album title in the top bar; a click turns it into a field to rename the album. Enter or
 * leaving the field keeps the new title (one undo step, saved like any edit), Escape drops it. A
 * blank title, or the same one, changes nothing.
 */
export function AlbumTitle({ title }: { title: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  // Enter ends the edit, and the field then leaves the page: its blur must not end it again.
  const editing = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const open = draft !== null;

  useEffect(() => {
    if (open) input.current?.select();
  }, [open]);

  const start = () => {
    editing.current = true;
    setDraft(title);
  };
  const finish = (keep: boolean) => {
    if (!editing.current) return;
    editing.current = false;
    const next = (input.current?.value ?? '').trim();
    setDraft(null);
    if (keep && next !== '' && next !== title) {
      editorStore.getState().apply((book) => ({ ...book, title: next }), fr.shell.undoRename);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="shell-top__title"
        title={fr.shell.renameHint(title)}
        aria-label={fr.shell.rename(title)}
        onClick={start}
      >
        {title}
      </button>
    );
  }
  return (
    <input
      ref={input}
      className="input shell-top__title-input"
      type="text"
      aria-label={fr.shell.titleField}
      value={draft}
      maxLength={MAX_TITLE_LENGTH}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}
