// @vitest-environment jsdom
import { newBook } from '@travelbook/core';
import { mapElement } from '@travelbook/core/src/map/test-helpers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExportPageJob } from '../../shared/exportPage';
import { imagesReady, installExportPage } from './ExportPage';

const renders: { mapGeometry?: (id: string) => unknown }[] = [];
/** The families each `whenFontsReady` call waited for. */
const awaitedFonts: string[][] = [];
vi.mock('@travelbook/render', () => ({
  SpreadView: (props: { mapGeometry?: (id: string) => unknown }) => {
    renders.push(props);
    return null;
  },
  fontFaceCss: (files: { family: string; url: string }[]) =>
    files.map((f) => `@font-face{font-family:"${f.family}";src:url("${f.url}")}`).join('\n'),
  projectFontFiles: () => [],
  whenFontsReady: async (families: string[]) => {
    awaitedFonts.push(families);
  },
}));
vi.mock('../fonts/bookFonts', () => ({
  BOOK_FONTS: [{ family: 'Inter' }],
  installBookFonts: () => undefined,
}));

afterEach(() => vi.unstubAllGlobals());

describe('imagesReady', () => {
  it('waits for the href of an SVG <image> and rejects when it cannot be decoded', async () => {
    const decodes: { src: string; settle(ok: boolean): void }[] = [];
    class FakeImage {
      src = '';
      decode() {
        return new Promise<void>((resolve, reject) =>
          decodes.push({
            src: this.src,
            settle: (ok) => (ok ? resolve() : reject(new Error('x'))),
          }),
        );
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const host = document.createElement('div');
    host.innerHTML =
      '<svg><image href="tb://export/t/a.png"/><image xlink:href="tb://export/t/b.png"/>' +
      '<image href="data:image/png;base64,AA"/></svg>';
    let settled: 'pending' | 'ok' | 'failed' = 'pending';
    const ready = imagesReady(host).then(
      () => (settled = 'ok'),
      () => (settled = 'failed'),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(decodes.map((d) => d.src)).toEqual(['tb://export/t/a.png', 'tb://export/t/b.png']);
    expect(settled).toBe('pending');
    decodes[0]?.settle(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe('pending');
    decodes[1]?.settle(false);
    await ready;
    expect(settled).toBe('failed');
  });
});

describe('imagesReady and CSS urls', () => {
  it('loads the url() images of the styles, not the #id of an element of the page', async () => {
    const srcs: string[] = [];
    class FakeImage {
      src = '';
      decode() {
        srcs.push(this.src);
        return Promise.resolve();
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const host = document.createElement('div');
    const a = document.createElement('div');
    a.style.backgroundImage = 'url("tb://export/t/bg.png")';
    const b = document.createElement('div');
    b.style.backgroundImage = 'url("#tb-tint-s1")';
    host.append(a, b);
    document.body.append(host);
    await imagesReady(host);
    host.remove();
    expect(srcs).toEqual(['tb://export/t/bg.png']);
  });
});

describe('export page maps', () => {
  const geometry = {
    version: 1,
    projection: { kind: 'mercator', rotate: [0, 0, 0], k: 600, tx: 500, ty: 300 },
    bounds: [
      [0, 0],
      [1000, 600],
    ],
    remoteBounds: [
      [0, 0],
      [1000, 600],
    ],
    paths: { land: 'M0 0', outline: 'M0 0', regions: '', selected: '', neighbours: '', lakes: '' },
  };

  function job(token: string, ids: string[]): ExportPageJob {
    const book = newBook({ title: 'T' });
    return {
      token,
      book,
      spread: {
        ...book.cover,
        elements: ids.map((id, i) => ({ ...mapElement(), id: `m${i}`, geometryAssetId: id })),
      },
      clip: { x: 0, y: 0, w: 100, h: 100 },
      derivatives: {},
    };
  }

  it('reads every geometry through tb://export before drawing, once per token; an unreadable one is missing', async () => {
    renders.length = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('map-bad')
        ? new Response('nope', { status: 404 })
        : new Response(JSON.stringify(geometry)),
    );
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div');
    document.body.append(host);
    installExportPage(host);
    const show = window.__tbExport?.show(job('tok1', ['map-ok', 'map-bad']));
    await Promise.resolve();
    expect(renders).toHaveLength(0); // nothing is drawn while the geometries load
    await show;
    expect(fetchMock.mock.calls.map((c) => String(c[0])).sort()).toEqual([
      'tb://export/tok1/original/map-bad',
      'tb://export/tok1/original/map-ok',
    ]);
    const draw = renders.at(-1);
    expect(draw?.mapGeometry?.('map-ok')).toEqual(geometry);
    expect(draw?.mapGeometry?.('map-bad')).toBe('missing');
    // A second page of the same export reads nothing again.
    await window.__tbExport?.show(job('tok1', ['map-ok', 'map-bad']));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('declares the bundled fonts of the job that bookFonts does not, and waits for them', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(geometry)));
    awaitedFonts.length = 0;
    const host = document.createElement('div');
    document.body.append(host);
    installExportPage(host);
    const face = (family: string) => ({
      family,
      weight: 400,
      style: 'normal' as const,
      url: `tb://resource/fonts/${family}.woff2`,
    });
    await window.__tbExport?.show({ ...job('tok2', []), fonts: [face('Pacifico'), face('Inter')] });
    const css = [...document.head.querySelectorAll('style')].map((e) => e.textContent).join('\n');
    expect(css).toContain('tb://resource/fonts/Pacifico.woff2');
    expect(css).not.toContain('tb://resource/fonts/Inter.woff2');
    expect(awaitedFonts.at(-1)).toEqual(['Inter', 'Pacifico']);
  });
});
