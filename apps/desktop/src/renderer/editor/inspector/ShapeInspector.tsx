import { updateElements, type Element, type ShapeElement } from '@travelbook/core';
import { editorStore } from '../../store/editor';
import { fr } from '../../strings/fr';
import { splitColor } from './color';
import { ColorField, NumberField, Section } from './controls';

const t = fr.shapeInspector;

const NEW_FILL = '#8fa3b5';
const NEW_STROKE = { width: 1, color: '#222222' };

/** The sections of the inspector for one shape: fill, stroke, and what its kind has (corners, sides). */
export function ShapeInspector({ spreadId, element }: { spreadId: string; element: ShapeElement }) {
  const change = (patch: Partial<Element>, label: string, mergeKey?: string) =>
    editorStore
      .getState()
      .apply((b) => updateElements(b, spreadId, [element.id], patch), label, mergeKey);

  const segment = element.shape === 'line' || element.shape === 'arrow';
  const { stroke } = element;

  return (
    <>
      {!segment && (
        <Section title={t.fill}>
          <label className="insp-check">
            <input
              type="checkbox"
              checked={element.fill !== null}
              onChange={(e) => change({ fill: e.target.checked ? NEW_FILL : null }, t.undoFill)}
            />
            {t.fillOn}
          </label>
          {element.fill !== null && (
            <ColorField
              label={t.color}
              value={splitColor(element.fill).hex}
              onChange={(hex, gesture) => change({ fill: hex }, t.undoFill, gesture)}
            />
          )}
        </Section>
      )}

      <Section title={t.stroke}>
        <NumberField
          label={t.strokeWidth}
          unit={t.mm}
          value={stroke?.width ?? 0}
          min={0}
          max={50}
          onCommit={(width) =>
            change(
              { stroke: width === 0 ? null : { color: stroke?.color ?? NEW_STROKE.color, width } },
              t.undoStroke,
            )
          }
        />
        {stroke && (
          <ColorField
            label={t.color}
            value={splitColor(stroke.color).hex}
            onChange={(hex, gesture) =>
              change({ stroke: { width: stroke.width, color: hex } }, t.undoStroke, gesture)
            }
          />
        )}
      </Section>

      {element.shape === 'rect' && (
        <Section>
          <NumberField
            label={t.radius}
            unit={t.mm}
            value={element.radius}
            min={0}
            max={200}
            onCommit={(radius) => change({ radius }, t.undoRadius)}
          />
        </Section>
      )}

      {(element.shape === 'polygon' || element.shape === 'star') && (
        <Section>
          <NumberField
            label={element.shape === 'star' ? t.pointsStar : t.points}
            value={element.points}
            min={3}
            max={24}
            onCommit={(points) => change({ points: Math.round(points) }, t.undoPoints)}
          />
        </Section>
      )}
    </>
  );
}
