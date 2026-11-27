import { describe, expect, it } from 'vitest';
import { runStyleValues, textLook, withoutRunStyle } from './textStyle';

const run = (text: string, attrs?: Record<string, string | null>, bold = false) => ({
  type: 'text',
  text,
  ...(attrs || bold
    ? {
        marks: [
          ...(bold ? [{ type: 'bold' }] : []),
          ...(attrs
            ? [
                {
                  type: 'textStyle',
                  attrs: { fontFamily: null, fontSize: null, color: null, ...attrs },
                },
              ]
            : []),
        ],
      }
    : {}),
});
const doc = (...runs: unknown[]) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: runs }, { type: 'paragraph' }],
});
const style = {
  fontFamily: "'Lora', serif",
  fontSizePt: 12,
  color: '#222222',
  lineHeight: 1.2,
  letterSpacing: 0,
};

describe('runStyleValues', () => {
  it('lists what the runs set, null for a run that sets nothing', () => {
    const d = doc(run('a', { fontSize: '24pt' }), run('b'), run('c', { fontSize: '24pt' }));
    expect(runStyleValues(d, 'fontSize')).toEqual(new Set(['24pt', null]));
    expect(runStyleValues(d, 'color')).toEqual(new Set([null]));
    expect(runStyleValues(doc(), 'color')).toEqual(new Set());
  });
});

describe('textLook', () => {
  it('is the style of the box where no run sets anything, and for a text with no run', () => {
    expect(textLook({ style, doc: doc(run('a')) })).toEqual({
      fontFamily: style.fontFamily,
      fontSizePt: 12,
      color: '#222222',
    });
    expect(textLook({ style, doc: doc() }).fontSizePt).toBe(12);
  });

  it('is what every run sets, and null for a property whose runs differ', () => {
    const all = doc(run('a', { fontSize: '24pt', color: '#FF0000' }), run('b', { fontSize: '24' }));
    expect(textLook({ style, doc: all })).toEqual({
      fontFamily: style.fontFamily,
      fontSizePt: 24,
      color: null, // one run red, the other the box's grey
    });
    // a run at the box's own size does not make it mixed
    expect(textLook({ style, doc: doc(run('a', { fontSize: '12pt' }), run('b')) }).fontSizePt).toBe(
      12,
    );
    expect(textLook({ style, doc: doc(run('a', { fontSize: '1em' })) }).fontSizePt).toBeNull();
  });
});

describe('withoutRunStyle', () => {
  it('takes one property out of every run and keeps the others, and the other marks', () => {
    const d = doc(
      run('a', { fontSize: '24pt', color: '#ff0000' }, true),
      run('b', { fontSize: '9pt' }),
    );
    const out = withoutRunStyle(d, 'fontSize');
    expect(runStyleValues(out, 'fontSize')).toEqual(new Set([null]));
    expect(runStyleValues(out, 'color')).toEqual(new Set(['#ff0000', null]));
    expect(JSON.stringify(out)).toContain('"bold"');
    // the second run's mark set nothing else: it is gone
    expect(JSON.stringify(out)).not.toMatch(/"text":"b","marks"/);
    expect(runStyleValues(d, 'fontSize')).toEqual(new Set(['24pt', '9pt'])); // not edited
  });

  it('gives the document itself back when no run sets the property', () => {
    const d = doc(run('a', { color: '#ff0000' }));
    expect(withoutRunStyle(d, 'fontSize')).toBe(d);
  });
});
