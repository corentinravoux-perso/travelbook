import {
  POSTER_FONTS,
  POSTER_LAYOUTS,
  SPINE_TEXT_MIN,
  recolorIllustration,
  type Book,
  type Licence,
  type PosterFont,
  type PosterLayout,
  type PosterPreset,
} from '@travelbook/core';
import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import { createStore, useStore } from 'zustand';
import type { LibraryItem } from '../../shared/api';
import { ColorField } from '../editor/inspector/controls';
import { useSeen } from '../editor/SpreadThumb';
import { svgRatio } from '../panels/stickers/model';
import { editorStore, useEditor } from '../store/editor';
import { fr } from '../strings/fr';
import {
  canApply,
  contrastWarning,
  initialPosterState,
  posterReducer,
  type ColorRole,
  type PosterDialogState,
} from './dialogModel';
import { AFFICHES_LICENCE, applyPosterToCover, illustrationUrl } from './posterActions';
import { PosterPreview } from './PosterPreview';
import { POSTER_DESTINATIONS, POSTER_PRESETS, presetsOf } from './presets';
import './PosterDialog.css';

const t = fr.poster;

const posterStore = createStore<{ open: boolean }>(() => ({ open: false }));

/** Open "Créer une affiche" (the cover editor and the Templates panel both call it). */
export const openPosterDialog = (): void => posterStore.setState({ open: true });

/** The text of an illustration and its ratio, fetched once per address. */
function useSvg(url: string | null): { text: string; ratio: number } | null {
  const [svg, setSvg] = useState<{ url: string; text: string; ratio: number } | null>(null);
  useEffect(() => {
    if (url === null) return;
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => live && setSvg({ url, text, ratio: svgRatio(text) ?? 1 }))
      .catch(() => live && setSvg({ url, text: '', ratio: 1 }));
    return () => {
      live = false;
    };
  }, [url]);
  return svg && svg.url === url ? svg : null;
}

const RECOLOURABLE = /\sclass\s*=\s*["'][^"']*\btb-main\b/;

/**
 * A blob URL of the illustration recoloured as the spec says, rebuilt 120 ms after the colours
 * stop changing; the previous one is revoked when the next is ready, the last on unmount. A
 * drawing without colour roles is shown from its plain address.
 */
function usePreviewUrl(
  base: string,
  text: string | undefined,
  colors: { main: string; shade: string },
): string {
  const [blob, setBlob] = useState<string | null>(null);
  const shown = useRef<string | null>(null);
  const { main, shade } = colors;
  const recolour = !!text && RECOLOURABLE.test(text) && typeof URL.createObjectURL === 'function';
  useEffect(() => {
    if (!recolour || !text) return;
    const timer = setTimeout(() => {
      const svg = recolorIllustration(text, { main, shade });
      const made = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      if (shown.current) URL.revokeObjectURL(shown.current);
      shown.current = made;
      setBlob(made);
    }, 120);
    return () => clearTimeout(timer);
  }, [recolour, text, main, shade]);
  useEffect(
    () => () => {
      if (shown.current) URL.revokeObjectURL(shown.current);
    },
    [],
  );
  return recolour && blob ? blob : base;
}

/** A preset in the gallery: its poster drawn small, once the tile comes into view. */
function PresetTile({
  book,
  preset,
  pressed,
  onPick,
}: {
  book: Book;
  preset: PosterPreset;
  pressed: boolean;
  onPick(): void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const seen = useSeen(ref);
  const url = illustrationUrl(preset.spec.illustration);
  const svg = useSvg(seen ? url : null);
  return (
    <li>
      <button
        ref={ref}
        type="button"
        className="poster-tile"
        aria-label={preset.name}
        aria-pressed={pressed}
        onClick={onPick}
      >
        {svg && (
          <PosterPreview
            book={book}
            spec={preset.spec}
            svgUrl={url}
            ratio={svg.ratio}
            height={132}
          />
        )}
      </button>
    </li>
  );
}

/** The user's library stickers, to use one as the illustration. */
function LibraryPicker({ onPick }: { onPick(item: LibraryItem): void }) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  useEffect(() => {
    let live = true;
    window.tb.library
      .list('sticker')
      .then((list) => live && setItems(list))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, []);
  if (items === null) return null;
  if (items.length === 0) return <p className="field__help">{t.mineEmpty}</p>;
  return (
    <ul className="poster-drawings">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="poster-drawing"
            aria-label={item.title}
            onClick={() => onPick(item)}
          >
            <img src={`tb://library/${item.id}`} alt="" />
          </button>
        </li>
      ))}
    </ul>
  );
}

const COLOR_ROLES: ColorRole[] = [
  'background',
  'title',
  'accent',
  'decor',
  'illustrationMain',
  'illustrationShade',
];

function colorOf(state: PosterDialogState, role: ColorRole): string {
  const c = state.spec.colors;
  if (role === 'illustrationMain') return c.illustration.main;
  if (role === 'illustrationShade') return c.illustration.shade;
  return c[role];
}

function PosterForm({ book, onDone }: { book: Book; onDone(): void }) {
  const [state, dispatch] = useReducer(posterReducer, book.title, initialPosterState);
  const [licence, setLicence] = useState<Licence>(AFFICHES_LICENCE);
  const [asking, setAsking] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const ids = { place: useId(), subtitle: useId(), year: useId(), font: useId() };
  const { spec } = state;

  const url = illustrationUrl(spec.illustration);
  const svg = useSvg(url);
  const previewUrl = usePreviewUrl(url, svg?.text, spec.colors.illustration);

  const gallery = presetsOf(state.destination);
  // The drawings offered: those of the filtered destination, else of the current preset's.
  const drawingDest =
    state.destination !== 'all'
      ? state.destination
      : (POSTER_PRESETS.find((p) => p.id === state.presetId)?.destination ?? 'all');
  const drawings = useMemo(() => presetsOf(drawingDest), [drawingDest]);

  const frontTaken = book.cover.elements.some((el) => el.x + el.w / 2 >= book.format.width);
  const spineOk = book.spineWidth >= SPINE_TEXT_MIN;

  const apply = async (): Promise<void> => {
    setAsking(false);
    setBusy(true);
    const ok = await applyPosterToCover(spec, licence);
    setBusy(false);
    if (ok) {
      const store = editorStore.getState();
      if (store.book) store.goToSpread(store.book.cover.id);
      onDone();
    }
  };

  return (
    <div className="poster-dialog">
      <header className="poster-dialog__head">
        <h2 id="poster-title" className="dialog__title">
          {t.title}
        </h2>
        <div className="poster-chips" role="group" aria-label={t.destinations}>
          {[{ id: 'all', label: t.all }, ...POSTER_DESTINATIONS].map((d) => (
            <button
              key={d.id}
              type="button"
              className="poster-chip"
              aria-pressed={state.destination === d.id}
              onClick={() => dispatch({ type: 'filter', destination: d.id })}
            >
              {d.label}
            </button>
          ))}
        </div>
        <ul className="poster-gallery" aria-label={t.gallery}>
          {gallery.map((p) => (
            <PresetTile
              key={p.id}
              book={book}
              preset={p}
              pressed={state.presetId === p.id}
              onPick={() => {
                setLicence(AFFICHES_LICENCE);
                dispatch({ type: 'pickPreset', id: p.id });
              }}
            />
          ))}
        </ul>
      </header>

      <div className="poster-dialog__body">
        <figure className="poster-dialog__preview" aria-label={t.preview}>
          {svg && (
            <PosterPreview
              book={book}
              spec={spec}
              svgUrl={previewUrl}
              ratio={svg.ratio}
              height={420}
            />
          )}
        </figure>

        <div className="poster-dialog__form">
          <div className="field">
            <label className="field__label" htmlFor={ids.place}>
              {t.place}
            </label>
            <input
              id={ids.place}
              className="input"
              value={spec.title}
              onChange={(e) =>
                dispatch({ type: 'setField', field: 'title', value: e.target.value })
              }
            />
          </div>
          <div className="poster-dialog__row">
            <div className="field">
              <label className="field__label" htmlFor={ids.subtitle}>
                {t.subtitle}
              </label>
              <input
                id={ids.subtitle}
                className="input"
                value={spec.subtitle}
                onChange={(e) =>
                  dispatch({ type: 'setField', field: 'subtitle', value: e.target.value })
                }
              />
            </div>
            <div className="field poster-dialog__year">
              <label className="field__label" htmlFor={ids.year}>
                {t.year}
              </label>
              <input
                id={ids.year}
                className="input"
                inputMode="numeric"
                value={spec.year}
                onChange={(e) =>
                  dispatch({ type: 'setField', field: 'year', value: e.target.value })
                }
              />
            </div>
          </div>

          <div className="field">
            <span className="field__label">{t.layout}</span>
            <div className="seg" role="group" aria-label={t.layout}>
              {POSTER_LAYOUTS.map((l: PosterLayout) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={spec.layout === l}
                  onClick={() => dispatch({ type: 'setLayout', layout: l })}
                >
                  {t.layouts[l]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor={ids.font}>
              {t.font}
            </label>
            <select
              id={ids.font}
              className="input"
              value={spec.font}
              onChange={(e) => dispatch({ type: 'setFont', font: e.target.value as PosterFont })}
            >
              {POSTER_FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="poster-colors">
            <legend className="field__label">{t.colorsTitle}</legend>
            {COLOR_ROLES.map((role) => (
              <ColorField
                key={role}
                label={t.colors[role]}
                value={colorOf(state, role)}
                onChange={(color) => dispatch({ type: 'setColor', role, color })}
              />
            ))}
            <label className="check">
              <input
                type="checkbox"
                checked={state.tieIllustrationToTitle}
                onChange={(e) => dispatch({ type: 'setTie', on: e.target.checked })}
              />
              {t.tie}
            </label>
          </fieldset>
          {contrastWarning(state) && <p className="field__help is-error">{t.contrast}</p>}

          <div className="field">
            <span className="field__label">{t.illustration}</span>
            <ul className="poster-drawings">
              {drawings.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="poster-drawing"
                    aria-label={t.drawing(p.name)}
                    aria-pressed={
                      illustrationUrl(spec.illustration) === illustrationUrl(p.spec.illustration)
                    }
                    onClick={() => {
                      setLicence(AFFICHES_LICENCE);
                      dispatch({
                        type: 'setIllustration',
                        illustration: p.spec.illustration,
                        colors: p.spec.colors.illustration,
                      });
                    }}
                  >
                    <img src={illustrationUrl(p.spec.illustration)} alt="" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="button button--small poster-dialog__other"
              aria-expanded={picking}
              onClick={() => setPicking((v) => !v)}
            >
              {t.otherSticker}
            </button>
            {picking && (
              <LibraryPicker
                onPick={(item) => {
                  setLicence(item.licence ?? AFFICHES_LICENCE);
                  dispatch({ type: 'setIllustration', illustration: { itemId: item.id } });
                  setPicking(false);
                }}
              />
            )}
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={spec.spine && spineOk}
              disabled={!spineOk}
              onChange={(e) => dispatch({ type: 'setSpine', on: e.target.checked })}
            />
            {t.spine}
          </label>
          {!spineOk && <p className="field__help">{t.spineNone}</p>}
        </div>
      </div>

      {asking ? (
        <div className="dialog__actions poster-dialog__ask" role="alert">
          <p>{t.replaceQuestion}</p>
          <button type="button" className="button" onClick={() => setAsking(false)}>
            {t.cancelReplace}
          </button>
          <button type="button" className="button button--primary" onClick={() => void apply()}>
            {t.replace}
          </button>
        </div>
      ) : (
        <div className="dialog__actions">
          <button type="button" className="button" onClick={onDone}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!canApply(state) || busy}
            onClick={() => (frontTaken ? setAsking(true) : void apply())}
          >
            {t.apply}
          </button>
        </div>
      )}
    </div>
  );
}

/** "Créer une affiche": a poster cover from presets, previewed live. Mounted once by the shell. */
export function PosterDialog() {
  const open = useStore(posterStore, (s) => s.open);
  const book = useEditor((s) => s.book);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open, book]);

  if (!open || book === null) return null;
  return (
    <dialog
      ref={ref}
      className="dialog dialog--poster"
      aria-labelledby="poster-title"
      onClose={() => posterStore.setState({ open: false })}
    >
      <PosterForm book={book} onDone={() => ref.current?.close()} />
    </dialog>
  );
}
