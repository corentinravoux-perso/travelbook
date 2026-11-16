// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imagesReady } from './ExportPage';

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
