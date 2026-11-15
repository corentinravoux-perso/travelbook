import type { Book, Spread, Template } from '@travelbook/core';
import { useEffect, useRef, useState } from 'react';
import { formatNumber, SliderField } from '../editor/inspector/controls';
import { pageNumbers } from '../editor/pages';
import { findSpread, useEditor } from '../store/editor';
import { templatesStore, useTemplates } from '../store/templates';
import { openPosterDialog } from '../posters/PosterDialog';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import { TemplateThumb, WhenVisible } from './TemplateThumb';
import {
  COUNT_CHIPS,
  listTemplates,
  pageTarget,
  targetFor,
  viewKind,
  type CategoryFilter,
  type CountChip,
  type TemplateTab,
  type ViewKind,
} from './templatesModel';
import { thumbOf } from './thumbModel';
import '../editor/inspector/Inspector.css';
import './Templates.css';

const t = fr.templates;

const TABS: [TemplateTab, string][] = [
  ['themed', t.themed],
  ['classic', t.classic],
  ['mine', t.mine],
];
const CATEGORIES: CategoryFilter[] = ['all', 'photos', 'texte', 'ouverture', 'double'];
const SECTION_TITLES = {
  covers: t.sectionCovers,
  pages: t.sectionPages,
  spreads: t.sectionSpreads,
};

/** What a tile needs to draw a template for the book in hand. */
interface TileContext {
  book: Book;
  spread: Spread;
  margin: number;
  gap: number;
}

/** The drawing itself, built only once its tile has scrolled into view. */
function ThumbBody({ template, ctx }: { template: Template; ctx: TileContext }) {
  const { width, height } = ctx.book.format;
  const bleed = ctx.spread.kind === 'cover' ? ctx.book.coverBleed : ctx.book.bleed;
  const box = { w: template.scope === 'spread' ? 2 * width : width, h: height };
  return (
    <TemplateThumb thumb={thumbOf(template, box, bleed, { margin: ctx.margin, gap: ctx.gap })} />
  );
}

/** The frames of `template` as they would land on a page of this book, drawn small. */
function Thumbnail({ template, ctx }: { template: Template; ctx: TileContext }) {
  const { width, height } = ctx.book.format;
  const aspect = (template.scope === 'spread' ? 2 * width : width) / height;
  return (
    <WhenVisible aspect={aspect}>
      <ThumbBody template={template} ctx={ctx} />
    </WhenVisible>
  );
}

function Tile({ template, ctx, last }: { template: Template; ctx: TileContext; last: boolean }) {
  return (
    <button
      type="button"
      className="tpl-tile"
      aria-pressed={last}
      aria-label={t.tile(template.name, template.photoCount)}
      title={template.name}
      data-template-id={template.id}
      data-photos={template.photoCount}
      onClick={() => templatesStore.getState().apply(template)}
    >
      <Thumbnail template={template} ctx={ctx} />
    </button>
  );
}

/** A segmented row of photo-count chips; pressing the pressed one shows every count again. */
function CountChips({ value }: { value: CountChip | null }) {
  return (
    <div className="tpl-row">
      <span className="tpl-caption">{t.photoCount}</span>
      <div className="seg" role="group" aria-label={t.photoCountLabel}>
        {COUNT_CHIPS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={t.chipName(n)}
            data-count={n}
            onClick={() => templatesStore.getState().setChip(value === n ? null : n)}
          >
            {n === 7 ? t.sevenPlus : n}
          </button>
        ))}
      </div>
    </div>
  );
}

function CategorySelect({ value }: { value: CategoryFilter }) {
  return (
    <div className="tpl-row">
      <label className="tpl-caption" htmlFor="tpl-category">
        {t.category}
      </label>
      <select
        id="tpl-category"
        className="input tpl-select"
        value={value}
        aria-label={t.categoryLabel}
        onChange={(e) => templatesStore.getState().setCategory(e.target.value as CategoryFilter)}
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t.categories[c]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A model of the user's: its drawing, its name (renamed in place) and a two-step delete. */
function Mine({ template, ctx, last }: { template: Template; ctx: TileContext; last: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(template.name);
  const [confirming, setConfirming] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) field.current?.select();
  }, [renaming]);

  const finish = (keep: boolean) => {
    setRenaming(false);
    if (keep) void templatesStore.getState().rename(template.id, name);
    else setName(template.name);
  };

  return (
    <li className="tpl-mine" data-template-id={template.id}>
      <Tile template={template} ctx={ctx} last={last} />
      <div className="tpl-mine__name">
        {renaming ? (
          <input
            ref={field}
            className="input"
            value={name}
            aria-label={t.nameField}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => finish(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finish(true);
              if (e.key === 'Escape') {
                e.stopPropagation();
                finish(false);
              }
            }}
          />
        ) : (
          <span className="tpl-mine__label">{template.name}</span>
        )}
      </div>
      <div className="tpl-mine__actions">
        <button
          type="button"
          className="icon-button"
          aria-label={t.rename(template.name)}
          title={t.rename(template.name)}
          onClick={() => {
            setName(template.name);
            setRenaming(true);
          }}
        >
          <Icon name="pencil" />
        </button>
        <button
          type="button"
          className="icon-button tpl-remove"
          data-confirming={confirming || undefined}
          aria-label={confirming ? t.confirmRemove(template.name) : t.remove(template.name)}
          title={confirming ? t.confirmRemove(template.name) : t.remove(template.name)}
          onBlur={() => setConfirming(false)}
          onClick={() => {
            if (confirming) void templatesStore.getState().remove(template.id);
            else setConfirming(true);
          }}
        >
          <Icon name={confirming ? 'check' : 'trash'} />
        </button>
      </div>
    </li>
  );
}

function Spacing({ book }: { book: Book }) {
  const margin = useTemplates((s) => s.margin) ?? book.safeMargin;
  const gap = useTemplates((s) => s.gap);
  const mm = (v: number) => `${formatNumber(v)} ${t.mm}`;
  return (
    <div className="tpl-sliders">
      <SliderField
        label={t.margin}
        value={margin}
        min={0}
        max={30}
        step={0.5}
        display={mm(margin)}
        onChange={(v, gesture) => templatesStore.getState().setMargin(v, gesture)}
      />
      <SliderField
        label={t.gap}
        value={gap}
        min={0}
        max={20}
        step={0.5}
        display={mm(gap)}
        onChange={(v, gesture) => templatesStore.getState().setGap(v, gesture)}
      />
    </div>
  );
}

/**
 * The Modèles panel (spec §7.4, §8). The list follows what is in view, with no switch to make:
 * covers with the cover, page templates with a page, and spread templates beside them on an inner
 * spread. Clicking a tile lays it out; the sliders lay the last grid out again with new spacing.
 */
export function TemplatesPanel() {
  const book = useEditor((s) => s.book);
  const status = useTemplates((s) => s.status);
  useEffect(() => {
    void templatesStore.getState().load();
  }, []);
  if (book === null) return <p className="shell-empty">{fr.shell.panelEmpty}</p>;
  if (status === 'error') {
    return (
      <div className="shell-empty">
        <p>{t.loadFailed}</p>
        <button
          type="button"
          className="button button--small"
          onClick={() => void templatesStore.getState().load()}
        >
          {t.retry}
        </button>
      </div>
    );
  }
  if (status !== 'ready') return <p className="shell-empty">{t.loading}</p>;
  return <Templates book={book} />;
}

function Templates({ book }: { book: Book }) {
  const currentId = useEditor((s) => s.currentSpreadId);
  const activePage = useEditor((s) => s.activePage);
  const spread = findSpread(book, currentId);
  const index = useTemplates((s) => s.index);
  const themes = useTemplates((s) => s.themes);
  const tab = useTemplates((s) => s.tab);
  const filters = useTemplates((s) => s.filters);
  const margin = useTemplates((s) => s.margin) ?? book.safeMargin;
  const gap = useTemplates((s) => s.gap);
  const last = useTemplates((s) => s.last);
  const saved = useTemplates((s) => s.saved);

  const view: ViewKind = spread ? viewKind(spread) : 'pages';
  const sections = listTemplates(index, themes, tab, view, filters, SECTION_TITLES);
  if (!spread) return <p className="shell-empty">{fr.shell.panelEmpty}</p>;

  const page = pageTarget(spread, activePage);
  const number = pageNumbers(book, spread)[page];
  const ctx: TileContext = { book, spread, margin, gap };
  const isLast = (template: Template): boolean =>
    last[`${spread.id}:${targetFor(spread, activePage, template)}`] === template.id;
  const none = sections.length === 0;

  return (
    <div className="tpl">
      <div
        className="tpl-tabs"
        role="tablist"
        aria-label={t.tabs}
        onKeyDown={(e) => {
          // Arrow keys move between the tabs, as in the ARIA tabs pattern.
          const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (step === 0) return;
          const at = TABS.findIndex(([key]) => key === tab);
          const [next] = TABS[(at + step + TABS.length) % TABS.length] as [TemplateTab, string];
          templatesStore.getState().setTab(next);
          e.currentTarget
            .querySelectorAll<HTMLElement>('[role="tab"]')
            [TABS.findIndex(([k]) => k === next)]?.focus();
        }}
      >
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            className="tpl-tab"
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => templatesStore.getState().setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'cover' && (
        <button
          type="button"
          className="button button--small tpl-poster"
          onClick={openPosterDialog}
        >
          {fr.poster.open}
        </button>
      )}
      <div className="tpl-controls">
        <p className="tpl-target">
          {view === 'cover' ? t.targetCover : t.targetPage(number ?? null)}
        </p>
        <CountChips value={filters.chip} />
        {view === 'cover' ? (
          <label className="check">
            <input
              type="checkbox"
              checked={filters.withPages}
              onChange={(e) => templatesStore.getState().setWithPages(e.target.checked)}
            />
            {t.withPages}
          </label>
        ) : (
          <CategorySelect value={filters.category} />
        )}
        <Spacing book={book} />
      </div>

      <div className="tpl-list" role="tabpanel" aria-label={TABS.find(([k]) => k === tab)?.[1]}>
        {none ? (
          <p className="tpl-empty">{tab === 'mine' && !filters.chip ? t.emptyMine : t.emptyList}</p>
        ) : tab === 'mine' ? (
          <ul className="tpl-mine-list">
            {sections
              .flatMap((s) => s.templates)
              .map((template) => (
                <Mine key={template.id} template={template} ctx={ctx} last={isLast(template)} />
              ))}
          </ul>
        ) : (
          sections.map((s) => (
            <section key={s.key} className="tpl-section">
              {s.title !== undefined && (
                <h3 className="tpl-heading">
                  {s.title}
                  <span className="tpl-heading__count">{s.templates.length}</span>
                </h3>
              )}
              <ul className="tpl-grid">
                {s.templates.map((template) => (
                  <li key={template.id}>
                    <Tile template={template} ctx={ctx} last={isLast(template)} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="tpl-foot">
        <button
          type="button"
          className="button"
          onClick={() => void templatesStore.getState().saveAs(page)}
        >
          <Icon name="device-floppy" />
          {t.save}
        </button>
        {view === 'pages' && (
          <button
            type="button"
            className="button"
            onClick={() => void templatesStore.getState().saveAs('spread')}
          >
            {t.saveSpread}
          </button>
        )}
        {saved !== null && (
          <p className="tpl-saved" role="status">
            {t.saved(saved)}
          </p>
        )}
      </div>
    </div>
  );
}
