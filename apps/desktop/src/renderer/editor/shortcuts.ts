import { useEffect } from 'react';
import { editorStore } from '../store/editor';
import { leaveTextEdit } from './textActions';
import {
  clearSelection,
  copySelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  editSelectedText,
  group,
  nudge,
  pasteClipboard,
  selectAll,
  stack,
  ungroup,
} from './actions';

export type Command =
  | { kind: 'nudge'; dx: number; dy: number }
  | {
      kind:
        | 'copy'
        | 'cut'
        | 'paste'
        | 'duplicate'
        | 'delete'
        | 'group'
        | 'ungroup'
        | 'undo'
        | 'redo'
        | 'selectAll'
        | 'escape'
        | 'forward'
        | 'backward'
        | 'zoomIn'
        | 'zoomOut'
        | 'fit'
        | 'textTool'
        | 'edit';
    };

type KeyInfo = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const WITH_MOD: Record<string, Exclude<Command['kind'], 'nudge'>> = {
  c: 'copy',
  x: 'cut',
  v: 'paste',
  d: 'duplicate',
  a: 'selectAll',
  y: 'redo',
};

/**
 * What a key press asks of the canvas, or `null`. Arrows nudge by 1 mm, 10 with Shift, 0.1 with
 * Alt. The keys `[ ] + - 0` ignore the modifiers: on a French keyboard they are typed with
 * Shift or AltGr (which reports Ctrl+Alt).
 */
export function commandFor(e: KeyInfo): Command | null {
  const mod = e.ctrlKey || e.metaKey;
  const arrow = ARROWS[e.key];
  if (arrow && !mod) {
    const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    return { kind: 'nudge', dx: arrow[0] * step, dy: arrow[1] * step };
  }
  if (e.key === ']') return { kind: 'forward' };
  if (e.key === '[') return { kind: 'backward' };
  if ((e.key === '+' || e.key === '=') && !e.altKey) return { kind: 'zoomIn' };
  if (e.key === '-' && !e.altKey) return { kind: 'zoomOut' };
  if (e.key === '0' && !mod && !e.altKey) return { kind: 'fit' };
  if (e.key === 'Escape') return { kind: 'escape' };
  if (!mod && !e.altKey && e.key.toLowerCase() === 't') return { kind: 'textTool' };
  if (e.key === 'Enter' && !mod && !e.altKey) return { kind: 'edit' };
  if ((e.key === 'Delete' || e.key === 'Backspace') && !mod) return { kind: 'delete' };
  if (mod && !e.altKey) {
    const key = e.key.toLowerCase();
    if (key === 'g') return { kind: e.shiftKey ? 'ungroup' : 'group' };
    if (key === 'z') return { kind: e.shiftKey ? 'redo' : 'undo' };
    const kind = WITH_MOD[key];
    if (kind && !e.shiftKey) return { kind };
  }
  return null;
}

/** The commands that still work in crop mode: history and the canvas zoom. */
const CROP_KEYS: ReadonlySet<Command['kind']> = new Set([
  'undo',
  'redo',
  'zoomIn',
  'zoomOut',
  'fit',
]);

/** Is the event aimed at something the user types in? Shortcuts must leave it alone. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function run(command: Command): void {
  const s = editorStore.getState();
  switch (command.kind) {
    case 'nudge':
      return nudge(command.dx, command.dy);
    case 'copy':
      return void copySelection();
    case 'cut':
      return void cutSelection();
    case 'paste':
      return void pasteClipboard();
    case 'duplicate':
      return duplicateSelection();
    case 'delete':
      return deleteSelection();
    case 'group':
      return group();
    case 'ungroup':
      return ungroup();
    case 'undo':
      return s.undo();
    case 'redo':
      return s.redo();
    case 'selectAll':
      return selectAll();
    case 'escape':
      // The first Escape ends typing or drops a drawing tool, the next one the selection.
      if (s.editingId !== null) return leaveTextEdit();
      return s.tool === 'select' ? clearSelection() : s.setTool('select');
    case 'textTool':
      return s.setTool('text');
    case 'edit':
      return editSelectedText();
    case 'forward':
      return stack('forward');
    case 'backward':
      return stack('backward');
    case 'zoomIn':
      return s.zoomBy(1.25);
    case 'zoomOut':
      return s.zoomBy(0.8);
    case 'fit':
      return s.fitSpread();
  }
}

/** Shortcuts of the canvas (spec §8), active while the editor is shown and nobody is typing. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || isTypingTarget(e.target)) return;
      const state = editorStore.getState();
      if (state.book === null || state.overview || state.preview) return;
      // A dialog is modal: its keys are its own (Delete must not reach the canvas behind it).
      if (e.target instanceof Element && e.target.closest('dialog')) return;
      const command = commandFor(e);
      if (command === null) return;
      // Enter on a focused button presses it; it must not also start typing in a text.
      if (command.kind === 'edit' && e.target instanceof Element && e.target.closest('button, a')) {
        return;
      }
      // While a photo is cropped the keys that edit the selection would change the wrong thing.
      if (editorStore.getState().cropId !== null && !CROP_KEYS.has(command.kind)) return;
      e.preventDefault();
      run(command);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
