import { editorStore, useEditor } from '../store/editor';
import { fr } from '../strings/fr';

/** Zoom percentage, minus, plus and fit, in the top bar. */
export function ZoomControls() {
  const zoom = useEditor((s) => s.zoom);
  const fit = useEditor((s) => s.fit);
  const { zoomBy, fitSpread } = editorStore.getState();
  return (
    <div className="zoom-controls" role="group" aria-label={fr.canvas.zoom}>
      <button
        type="button"
        className="icon-button"
        aria-label={fr.canvas.zoomOut}
        title={fr.canvas.zoomOut}
        onClick={() => zoomBy(0.8)}
      >
        −
      </button>
      <output className="zoom-controls__value" aria-label={fr.canvas.zoom}>
        {fr.canvas.zoomValue(Math.round(zoom * 100))}
      </output>
      <button
        type="button"
        className="icon-button"
        aria-label={fr.canvas.zoomIn}
        title={fr.canvas.zoomIn}
        onClick={() => zoomBy(1.25)}
      >
        +
      </button>
      <button
        type="button"
        className="icon-button zoom-controls__fit"
        aria-label={fr.canvas.zoomFit}
        title={fr.canvas.zoomFit}
        aria-pressed={fit}
        onClick={fitSpread}
      >
        {fr.canvas.zoomFitLabel}
      </button>
    </div>
  );
}
