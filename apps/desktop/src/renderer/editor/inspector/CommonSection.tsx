import {
  alignElements,
  distributeElements,
  transformElements,
  updateElements,
  type AlignEdge,
  type Element,
} from '@travelbook/core';
import { useState } from 'react';
import { editorStore } from '../../store/editor';
import { fr } from '../../strings/fr';
import { Icon } from '../../theme/Icon';
import type { IconName } from '../../theme/icons';
import { NumberField, Section, SliderField } from './controls';

const t = fr.inspector;

/** Values are shown to a hundredth of a unit: the stored ones carry no more than a micrometre. */
const shown = (v: number): number => Math.round(v * 100) / 100;

const ALIGN_BUTTONS: [AlignEdge, IconName, string][] = [
  ['left', 'layout-align-left', t.alignLeft],
  ['centerX', 'layout-align-center', t.alignCenterX],
  ['right', 'layout-align-right', t.alignRight],
  ['top', 'layout-align-top', t.alignTop],
  ['centerY', 'layout-align-middle', t.alignCenterY],
  ['bottom', 'layout-align-bottom', t.alignBottom],
];

/**
 * The part of the inspector every element has: its place, size and rotation (one element), its
 * opacity and lock, and the align and distribute buttons. Align takes the page for one element
 * and the selection or the page for several; distribute needs three. Each change is one
 * `store.apply`; a slider drag is one step.
 */
export function CommonSection({ spreadId, elements }: { spreadId: string; elements: Element[] }) {
  const [relativeTo, setRelativeTo] = useState<'selection' | 'page'>('selection');
  const single = elements.length === 1 ? elements[0]! : null;
  const apply = editorStore.getState().apply;
  const ids = elements.map((e) => e.id);
  const free = elements.filter((e) => !e.locked).map((e) => e.id);
  const allLocked = elements.every((e) => e.locked);
  const rel = single ? 'page' : relativeTo;

  const geometry = (
    patch: { x?: number; y?: number; w?: number; h?: number; rotation?: number },
    label: string,
  ) => {
    if (single) apply((b) => transformElements(b, spreadId, [{ id: single.id, ...patch }]), label);
  };
  const patchAll = (patch: Partial<Element>, label: string, mergeKey?: string) =>
    apply((b) => updateElements(b, spreadId, ids, patch), label, mergeKey);

  return (
    <>
      <Section>
        <h2 className="insp-title">
          {single ? t.typeNames[single.type] : t.selection(elements.length)}
        </h2>
        {allLocked && <p className="insp-hint">{t.lockedHint}</p>}
      </Section>

      {single && (
        <Section title={t.position}>
          <NumberField
            label={t.x}
            unit={t.mm}
            value={shown(single.x)}
            min={-2000}
            max={4000}
            disabled={single.locked}
            onCommit={(x) => geometry({ x }, t.undoMove)}
          />
          <NumberField
            label={t.y}
            unit={t.mm}
            value={shown(single.y)}
            min={-2000}
            max={4000}
            disabled={single.locked}
            onCommit={(y) => geometry({ y }, t.undoMove)}
          />
          <NumberField
            label={t.width}
            unit={t.mm}
            value={shown(single.w)}
            min={0}
            max={4000}
            disabled={single.locked}
            onCommit={(w) => geometry({ w }, t.undoResize)}
          />
          <NumberField
            label={t.height}
            unit={t.mm}
            value={shown(single.h)}
            min={0}
            max={4000}
            disabled={single.locked}
            onCommit={(h) => geometry({ h }, t.undoResize)}
          />
          <NumberField
            label={t.rotation}
            unit={t.degree}
            value={shown(single.rotation)}
            min={-360}
            max={360}
            disabled={single.locked}
            onCommit={(rotation) => geometry({ rotation }, t.undoRotate)}
          />
        </Section>
      )}

      <Section>
        <SliderField
          label={t.opacity}
          value={elements[0]!.opacity}
          min={0}
          max={1}
          step={0.01}
          display={`${Math.round(elements[0]!.opacity * 100)} ${t.percent}`}
          onChange={(opacity, gesture) => patchAll({ opacity }, t.undoOpacity, gesture)}
        />
        <button
          type="button"
          className="button insp-lock"
          aria-pressed={allLocked}
          onClick={() => patchAll({ locked: !allLocked }, allLocked ? t.undoUnlock : t.undoLock)}
        >
          <Icon name={allLocked ? 'lock' : 'lock-open'} />
          {allLocked ? t.unlock : t.lock}
        </button>
      </Section>

      <Section title={t.align}>
        {!single && (
          <div className="seg" role="group" aria-label={t.alignTo}>
            {(['selection', 'page'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={relativeTo === value}
                onClick={() => setRelativeTo(value)}
              >
                {value === 'selection' ? t.toSelection : t.toPage}
              </button>
            ))}
          </div>
        )}
        <div className="insp-actions insp-align">
          {ALIGN_BUTTONS.map(([edge, icon, label]) => (
            <button
              key={edge}
              type="button"
              className="icon-button insp-toggle"
              data-align={edge}
              aria-label={label}
              title={label}
              disabled={free.length === 0}
              onClick={() => apply((b) => alignElements(b, spreadId, free, edge, rel), t.undoAlign)}
            >
              <Icon name={icon} />
            </button>
          ))}
          {(['x', 'y'] as const).map((axis) => (
            <button
              key={axis}
              type="button"
              className="icon-button insp-toggle"
              data-distribute={axis}
              aria-label={axis === 'x' ? t.distributeX : t.distributeY}
              title={axis === 'x' ? t.distributeX : t.distributeY}
              disabled={free.length < 3}
              onClick={() =>
                apply((b) => distributeElements(b, spreadId, free, axis), t.undoDistribute)
              }
            >
              <Icon
                name={axis === 'x' ? 'layout-distribute-horizontal' : 'layout-distribute-vertical'}
              />
            </button>
          ))}
        </div>
        {!single && free.length < 3 && <p className="insp-hint">{t.distributeHint}</p>}
      </Section>
    </>
  );
}
