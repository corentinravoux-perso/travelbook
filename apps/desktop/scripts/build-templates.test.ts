import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyTemplate, newBook, type Template } from '@travelbook/core';
import { describe, expect, it } from 'vitest';
import {
  MINIMUMS,
  TEMPLATES_DIR,
  generateTemplates,
  readTemplates,
  templateFiles,
  validateBundled,
  type BundledSet,
} from './build-templates';

/** A copy of the generated set that a test may damage. */
const fresh = (): BundledSet => structuredClone(generateTemplates());
const problems = (set: BundledSet) => validateBundled(set);

describe('the bundled templates', () => {
  it('are valid and meet the minimum counts of design 7.4', async () => {
    expect(await problems(generateTemplates())).toEqual([]);
  });

  it('hold at least the counts the plan asks for', () => {
    const { templates, themes } = generateTemplates();
    const count = (test: (t: Template) => boolean) => templates.filter(test).length;
    const photos = templates.filter((t) => t.category === 'photos' && t.scope === 'page');
    const withCount = (from: number, to: number) =>
      photos.filter((t) => t.photoCount >= from && t.photoCount <= to).length;
    expect(photos.length).toBeGreaterThanOrEqual(75);
    expect(withCount(1, 1)).toBeGreaterThanOrEqual(9);
    expect(withCount(2, 2)).toBeGreaterThanOrEqual(9);
    expect(withCount(3, 3)).toBeGreaterThanOrEqual(12);
    expect(withCount(4, 4)).toBeGreaterThanOrEqual(15);
    expect(withCount(5, 6)).toBeGreaterThanOrEqual(14);
    expect(withCount(7, 16)).toBeGreaterThanOrEqual(16);
    expect(count((t) => t.category === 'couverture')).toBeGreaterThanOrEqual(30);
    expect(count((t) => t.category === 'ouverture')).toBeGreaterThanOrEqual(10);
    expect(count((t) => t.category === 'texte')).toBeGreaterThanOrEqual(6);
    expect(count((t) => t.category === 'double')).toBeGreaterThanOrEqual(8);
    expect(templates.length).toBeGreaterThanOrEqual(129);
    expect(count((t) => t.free !== undefined)).toBeGreaterThanOrEqual(15);
    expect(themes.length).toBeGreaterThanOrEqual(3);
  });

  it('have a "Classique" set of plain templates beside the themed ones', () => {
    const { templates } = generateTemplates();
    const plain = templates.filter((t) => t.themeId === undefined);
    expect(plain.filter((t) => t.category === 'photos').length).toBeGreaterThanOrEqual(75);
    expect(plain.filter((t) => t.category === 'couverture').length).toBeGreaterThanOrEqual(30);
  });

  it('are generated the same way every time', () => {
    expect(generateTemplates()).toEqual(generateTemplates());
  });

  it('are the committed files: run `npm run templates` if this fails', async () => {
    for (const [name, text] of await templateFiles()) {
      expect(await readFile(join(TEMPLATES_DIR, name), 'utf8'), name).toBe(text);
    }
    expect(await problems(await readTemplates())).toEqual([]);
  });

  it('fill the slots of a book: every template applies and lands its photo frames', () => {
    for (const t of generateTemplates().templates) {
      const book = newBook({ title: 'Test', innerSpreads: 2 });
      const inner = book.spreads[1]!;
      const [spread, target] =
        t.category === 'couverture'
          ? ([book.cover, 'right'] as const)
          : t.scope === 'spread'
            ? ([inner, 'spread'] as const)
            : ([inner, 'left'] as const);
      const out = applyTemplate(book, spread.id, target, t, { margin: 10, gap: 4 });
      const after = [out.cover, ...out.spreads].find((s) => s.id === spread.id)!;
      expect(
        after.elements.filter((e) => e.type === 'photo'),
        t.id,
      ).toHaveLength(t.photoCount);
    }
  });
});

describe('validateBundled', () => {
  it('rejects a duplicate id', async () => {
    const set = fresh();
    set.templates[1]!.id = set.templates[0]!.id;
    expect(await problems(set)).toContainEqual(expect.stringContaining('duplicate id'));
  });

  it('rejects an id without the b- prefix, and a user template', async () => {
    const set = fresh();
    set.templates[0] = { ...set.templates[0]!, id: 'x-plain' };
    set.templates[1] = { ...set.templates[1]!, origin: 'user' };
    const found = await problems(set);
    expect(found).toContainEqual(expect.stringContaining('starts with "b-"'));
    expect(found).toContainEqual(expect.stringContaining('origin must be "bundled"'));
  });

  it('rejects more than 16 photos', async () => {
    const set = fresh();
    set.templates[0]!.photoCount = 17;
    expect(await problems(set)).toContainEqual(expect.stringContaining('p1-photo-m'));
  });

  it('rejects a photo count that does not match the frames', async () => {
    const set = fresh();
    set.templates[0]!.photoCount = 2;
    expect(await problems(set)).toContainEqual(
      expect.stringContaining('photoCount is 2 but it has 1 photo frames'),
    );
  });

  it('rejects a theme whose cover does not exist, or is not a cover', async () => {
    const set = fresh();
    set.themes[0]!.coverTemplateId = 'b-nowhere';
    set.themes[1]!.coverTemplateId = set.templates[0]!.id;
    const found = await problems(set);
    expect(found).toContainEqual(expect.stringContaining('b-nowhere does not exist'));
    expect(found).toContainEqual(expect.stringContaining('not a cover template'));
  });

  it('rejects a template that names a theme that does not exist', async () => {
    const set = fresh();
    set.templates[0] = {
      ...set.templates[0]!,
      themeId: 'nowhere',
      background: { kind: 'color', color: '#fff' },
    };
    expect(await problems(set)).toContainEqual(
      expect.stringContaining('theme nowhere does not exist'),
    );
  });

  it('rejects a theme with fewer than 3 pages that carry its background', async () => {
    const set = fresh();
    const id = set.themes[0]!.id;
    set.templates = set.templates.filter(
      (t) => t.themeId !== id || t.category === 'couverture' || t.photoCount > 3,
    );
    expect(await problems(set)).toContainEqual(expect.stringContaining(`theme ${id}`));
  });

  it('rejects fewer than 3 themes', async () => {
    const set = fresh();
    set.themes = set.themes.slice(0, 2);
    expect(await problems(set)).toContainEqual(expect.stringContaining(`needed`));
  });

  it('rejects counts below the minimums', async () => {
    const set = fresh();
    set.templates = set.templates.filter((t) => t.category !== 'ouverture');
    expect(await problems(set)).toContainEqual(`0 opening pages, ${MINIMUMS.openings} needed`);
  });

  it('wants full bleed, margins and a caption at every photo count, and a title and text up to 6', async () => {
    const set = fresh();
    set.templates = set.templates.filter(
      (t) =>
        !(t.photoCount === 3 && t.grid?.fullBleed) &&
        !(t.photoCount === 5 && JSON.stringify(t.grid).includes('"body"')),
    );
    const found = await problems(set);
    expect(found).toContainEqual('no bleed page for 3 photos');
    expect(found).toContainEqual('no text page for 5 photos');
  });
});
