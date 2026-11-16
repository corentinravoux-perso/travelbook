import { MM_TO_PX, spreadSize } from '@travelbook/core';
import { SpreadView } from '@travelbook/render';
import { useEffect, useRef } from 'react';
import { assetUrl } from './assetUrl';
import { coverThumbs } from '../store/project';
import { stage, useStage, type StageRequest } from './coverThumb';
import { preloadMapGeometries, useMapGeometryLookup } from '../maps/geometryCache';

/** Long edge of the cover as drawn for the capture, in CSS px: the thumbnail's long edge. */
const STAGE_EDGE = 320;
/**
 * Give up waiting for the images after this long and capture what is there. It leaves the rest of
 * `CAPTURE_BUDGET_MS` for two frames and the capture itself.
 */
const IMAGES_TIMEOUT_MS = 700;

const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()));

/** Resolves when every image under `root` has loaded (or failed), or after the timeout. */
async function imagesReady(root: HTMLElement): Promise<void> {
  const loaded = Promise.all(
    [...root.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)),
  );
  await Promise.race([loaded, new Promise((done) => setTimeout(done, IMAGES_TIMEOUT_MS))]);
}

/**
 * Where the cover thumbnail is drawn from. Only `SpreadView` turns a document into pixels, and
 * main can capture only what the window shows: so the cover is drawn at thumbnail size, in the
 * top layer (above any dialog), for the few frames a capture takes (`CAPTURE_BUDGET_MS` at most).
 * It is never interactive. Always mounted in the editor; renders nothing until
 * `captureCoverThumb` asks.
 */
export function CoverStage() {
  const request = useStage((s) => s.request);
  useEffect(() => {
    stage.mounted = true;
    void coverThumbs.buildIfMissing(); // an album without a thumbnail gets one as it opens
    return () => {
      stage.mounted = false;
    };
  }, []);
  return request === null ? null : <Shot request={request} />;
}

function Shot({ request }: { request: StageRequest }) {
  const mapGeometry = useMapGeometryLookup();
  const { book } = request;
  const ref = useRef<HTMLDivElement>(null);
  const size = spreadSize(book, book.cover);
  const scale = STAGE_EDGE / (Math.max(size.w, size.h) * MM_TO_PX);
  const width = Math.round(size.w * MM_TO_PX * scale);
  const height = Math.round(size.h * MM_TO_PX * scale);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const run = async () => {
      try {
        try {
          if (typeof el.showPopover === 'function' && !el.matches(':popover-open'))
            el.showPopover();
        } catch {
          // Not shown in the top layer: it is still drawn, only a dialog could hide it.
        }
        await preloadMapGeometries(book.cover);
        await frame();
        await imagesReady(el);
        await document.fonts?.ready;
        await frame();
        await frame();
        if (cancelled) return;
        await request.shoot({ x: 0, y: 0, width, height });
        if (!cancelled) request.resolve();
      } catch (error) {
        if (!cancelled) request.reject(error);
      }
      // A run that was cancelled (the effect ran again) leaves the request to the run that follows.
      if (!cancelled) useStage.setState({ request: null });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [request, width, height, book]);

  return (
    <div
      ref={ref}
      className="cover-stage"
      popover="manual"
      aria-hidden="true"
      inert
      style={{ width, height }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <SpreadView
          book={book}
          spread={book.cover}
          quality="thumb"
          assetUrl={assetUrl}
          mapGeometry={mapGeometry}
        />
      </div>
    </div>
  );
}
