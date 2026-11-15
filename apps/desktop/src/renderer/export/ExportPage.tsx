import { SpreadView, type AssetUrl } from '@travelbook/render';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { ExportPageHandle, ExportPageJob } from '../../shared/exportPage';
import { BOOK_FONTS, bookFontsReady } from '../fonts/bookFonts';

/**
 * The page the hidden export window loads (`#export`): it draws one page at a time, by the same
 * `SpreadView` as the editor at `export` quality, from what main hands `show`. It has no API of
 * its own to call: main drives it and fetches the result with a DevTools capture.
 */

declare global {
  interface Window {
    __tbExport?: ExportPageHandle;
  }
}

/** Derivative of a photo element, original of everything else (stickers, backgrounds). */
function assetUrlOf(job: ExportPageJob): AssetUrl {
  return (assetId, _quality, el) => {
    const derivative = el !== undefined && el.type === 'photo' ? job.derivatives[el.id] : undefined;
    return derivative !== undefined
      ? `tb://export/${job.token}/${encodeURIComponent(derivative)}`
      : `tb://export/${job.token}/original/${encodeURIComponent(assetId)}`;
  };
}

/** Every `url(...)` the computed styles of the page load: backgrounds, textures and masks. */
function cssImageUrls(root: HTMLElement): string[] {
  const urls = new Set<string>();
  for (const node of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    const style = getComputedStyle(node);
    for (const value of [style.backgroundImage, style.maskImage, style.webkitMaskImage]) {
      for (const match of value.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/g)) {
        const url = match[2];
        if (url && !url.startsWith('data:')) urls.add(url);
      }
    }
  }
  return [...urls];
}

async function decode(src: string, image: HTMLImageElement): Promise<void> {
  try {
    await image.decode();
  } catch {
    throw new Error(`Image illisible : ${src.slice(0, 200)}`);
  }
}

/** Resolves once every image the page draws is decoded; rejects naming the first that is not. */
async function imagesReady(root: HTMLElement): Promise<void> {
  const loading: Promise<void>[] = [];
  for (const img of root.querySelectorAll('img'))
    loading.push(decode(img.currentSrc || img.src, img));
  for (const url of cssImageUrls(root)) {
    const image = new Image();
    image.src = url;
    loading.push(decode(url, image));
  }
  await Promise.all(loading);
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    // A window that is not shown may not run animation frames: do not wait for one forever.
    const timer = setTimeout(resolve, 100);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
  });

export function installExportPage(host: HTMLElement): void {
  // No scrollbar may be drawn over the page the capture takes.
  document.documentElement.style.overflow = 'hidden';
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  host.style.display = 'inline-block';
  const root = createRoot(host);
  window.__tbExport = {
    show: async (job) => {
      flushSync(() =>
        root.render(
          <SpreadView
            book={job.book}
            spread={job.spread}
            quality="export"
            clip={job.clip}
            assetUrl={assetUrlOf(job)}
          />,
        ),
      );
      await bookFontsReady(BOOK_FONTS.map((f) => f.family));
      await imagesReady(host);
      await nextFrame();
      await nextFrame();
    },
  };
}
