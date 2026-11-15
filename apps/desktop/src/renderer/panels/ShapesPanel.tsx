import { useEditor, editorStore, type ShapeKind } from '../store/editor';
import { SHAPE_KINDS } from '../editor/shapeActions';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import type { IconName } from '../theme/icons';
import './ShapesPanel.css';

const ICONS: Record<ShapeKind, IconName> = {
  rect: 'square',
  ellipse: 'circle',
  line: 'minus',
  arrow: 'arrow-narrow-right',
  polygon: 'hexagon',
  star: 'star',
};

/**
 * The "Formes" panel: the six kinds of shape. Choosing one arms the shape tool; the next drag on
 * the page draws it (two points for a line or an arrow). Choosing it again puts the tool away.
 */
export function ShapesPanel() {
  const tool = useEditor((s) => s.tool);
  const kind = useEditor((s) => s.shapeKind);
  return (
    <div className="shapes-panel">
      <p className="shapes-panel__hint">{fr.shapes.panelHint}</p>
      <div className="shapes-panel__grid" role="group" aria-label={fr.shapes.kinds}>
        {SHAPE_KINDS.map((k) => {
          const active = tool === 'shape' && kind === k;
          return (
            <button
              key={k}
              type="button"
              className="shapes-panel__tile"
              data-shape={k}
              aria-pressed={active}
              onClick={() => editorStore.getState().setTool(active ? 'select' : 'shape', k)}
            >
              <Icon name={ICONS[k]} />
              {fr.shapes[k]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
