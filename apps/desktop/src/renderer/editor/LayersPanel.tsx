import {
  removeElements,
  updateElements,
  type Book,
  type Element,
  type Spread,
} from '@travelbook/core';
import { useMemo, useState, type DragEvent } from 'react';
import { editorStore, findSpread, useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import type { IconName } from '../theme/icons';
import { dropIndex, layerName, layerRows, moveToIndex, type LayerRow } from './layers';
import './LayersPanel.css';

const t = fr.layers;

const TYPE_ICON: Record<Element['type'], IconName> = {
  photo: 'photo',
  text: 'letter-t',
  shape: 'triangle-square-circle',
  sticker: 'sticker',
};

/** Where a dragged layer would land: on a row, in its upper or lower half. */
interface DropTarget {
  id: string;
  above: boolean;
}

/** Delete elements of the spread, in one undo step named `label`. */
function remove(spreadId: string, ids: string[], label: string) {
  editorStore.getState().apply((b) => removeElements(b, spreadId, ids), label);
  const { select, selection } = editorStore.getState();
  select(selection.filter((id) => !ids.includes(id)));
}

/** The bin at the end of a row: deletes what the row stands for. */
function RemoveButton({ label, onClick }: { label: string; onClick(): void }) {
  return (
    <button
      type="button"
      className="icon-button layer__toggle layer__remove"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon name="trash" />
    </button>
  );
}

/** One state change of an element, undoable, named `label`. */
function change(spreadId: string, id: string, patch: Partial<Element>, label: string) {
  editorStore.getState().apply((b) => updateElements(b, spreadId, [id], patch), label);
}

function Toggle({
  icon,
  label,
  pressed,
  onClick,
}: {
  icon: IconName;
  label: string;
  pressed: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className="icon-button layer__toggle"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

/** A layer's name, which turns into a field on double-click (or F2) and commits on Enter. */
function LayerName({ book, spreadId, el }: { book: Book; spreadId: string; el: Element }) {
  const [draft, setDraft] = useState<string | null>(null);
  const name = layerName(book, el);
  const finish = (commit: boolean) => {
    const value = (draft ?? '').trim();
    setDraft(null);
    if (!commit || value === (el.name ?? '')) return;
    // An emptied field gives the automatic name back.
    change(spreadId, el.id, { name: value === '' ? undefined : value }, t.undoRename);
  };
  if (draft !== null) {
    return (
      <input
        className="layer__rename"
        aria-label={t.renameField}
        value={draft}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(true);
          if (e.key === 'Escape') {
            e.stopPropagation();
            finish(false);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className="layer__name"
      title={t.rename}
      onDoubleClick={() => setDraft(el.name ?? name)}
      onKeyDown={(e) => {
        if (e.key === 'F2') setDraft(el.name ?? name);
      }}
    >
      {name}
    </button>
  );
}

/**
 * The Layers tab: the stack of the current spread, the top layer first. A click selects (Shift
 * adds), the eye hides, the padlock locks, the bin deletes (a group's bin, the whole group), a
 * double-click renames, a drag moves a layer in the stack with the core reorder op, and a group
 * folds away. Everything is one undo step.
 */
export function LayersPanel() {
  const book = useEditor((s) => s.book);
  const spreadId = useEditor((s) => s.currentSpreadId);
  const selection = useEditor((s) => s.selection);
  const spread: Spread | undefined = findSpread(book, spreadId);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const rows = useMemo(() => (spread ? layerRows(spread, collapsed) : []), [spread, collapsed]);

  if (!book || !spread) return <p className="shell-empty">{fr.shell.noAlbum}</p>;
  if (spread.elements.length === 0) return <p className="shell-empty">{t.empty}</p>;

  const select = (ids: string[], additive: boolean) => {
    const { select: set, selection: now } = editorStore.getState();
    if (!additive) return set(ids);
    const all = ids.every((id) => now.includes(id));
    set(all ? now.filter((id) => !ids.includes(id)) : [...new Set([...now, ...ids])]);
  };

  const toggleGroup = (groupId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(groupId)) next.add(groupId);
      return next;
    });

  const end = () => {
    setDragId(null);
    setTarget(null);
  };
  const over = (e: DragEvent<HTMLLIElement>, id: string) => {
    if (dragId === null || dragId === id) return;
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    const above = e.clientY < box.top + box.height / 2;
    if (target?.id !== id || target.above !== above) setTarget({ id, above });
  };
  const drop = (e: DragEvent<HTMLLIElement>) => {
    e.preventDefault();
    if (dragId !== null && target !== null) {
      const index = dropIndex(spread, dragId, target.id, target.above);
      const id = dragId;
      editorStore.getState().apply((b) => moveToIndex(b, spread.id, id, index), t.undoReorder);
    }
    end();
  };

  const row = (r: LayerRow) => {
    if (r.kind === 'group') {
      const members = spread.elements.filter((el) => el.groupId === r.groupId).map((el) => el.id);
      return (
        <li key={`g:${r.groupId}`} className="layer layer--group" data-group={r.groupId}>
          <button
            type="button"
            className="icon-button layer__fold"
            aria-expanded={!r.collapsed}
            aria-label={r.collapsed ? t.expand : t.collapse}
            title={r.collapsed ? t.expand : t.collapse}
            onClick={() => toggleGroup(r.groupId)}
          >
            <Icon name={r.collapsed ? 'chevron-right' : 'chevron-down'} />
          </button>
          <button
            type="button"
            className="layer__name"
            onClick={(e) => select(members, e.shiftKey)}
          >
            {t.group(r.count)}
          </button>
          <RemoveButton
            label={t.removeGroup}
            onClick={() => remove(spread.id, members, t.undoRemoveGroup)}
          />
        </li>
      );
    }
    const { el } = r;
    const picked = selection.includes(el.id);
    const drops = target?.id === el.id ? (target.above ? 'above' : 'below') : undefined;
    return (
      <li
        key={el.id}
        className="layer"
        data-layer={el.id}
        data-selected={picked || undefined}
        data-hidden={el.hidden || undefined}
        data-drop={drops}
        data-dragging={dragId === el.id || undefined}
        data-in-group={r.inGroup || undefined}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', el.id);
          setDragId(el.id);
        }}
        onDragOver={(e) => over(e, el.id)}
        onDrop={drop}
        onDragEnd={end}
        onClick={(e) => {
          // The eye and the padlock are not the row's: they do their own thing.
          if ((e.target as HTMLElement).closest('.layer__toggle, input') === null) {
            select([el.id], e.shiftKey);
          }
        }}
      >
        <span className="layer__type" aria-hidden="true">
          <Icon name={TYPE_ICON[el.type]} />
        </span>
        <span className="layer__label">
          <LayerName book={book} spreadId={spread.id} el={el} />
        </span>
        <Toggle
          icon={el.hidden ? 'eye-off' : 'eye'}
          label={el.hidden ? t.show : t.hide}
          pressed={el.hidden}
          onClick={() =>
            change(spread.id, el.id, { hidden: !el.hidden }, el.hidden ? t.undoShow : t.undoHide)
          }
        />
        <Toggle
          icon={el.locked ? 'lock' : 'lock-open'}
          label={el.locked ? t.unlock : t.lock}
          pressed={el.locked}
          onClick={() =>
            change(spread.id, el.id, { locked: !el.locked }, el.locked ? t.undoUnlock : t.undoLock)
          }
        />
        <RemoveButton
          label={t.remove(layerName(book, el))}
          onClick={() => remove(spread.id, [el.id], t.undoRemove)}
        />
      </li>
    );
  };

  return (
    <div className="layers" data-testid="layers">
      <p className="layers__hint">{t.hint}</p>
      <ul className="layers__list" aria-label={t.title}>
        {rows.map(row)}
      </ul>
    </div>
  );
}
