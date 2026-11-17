import { useEffect, useId, useRef, useState } from 'react';
import { BOOK_FONTS } from '../fonts/bookFonts';
import { fontListStore, useFontList } from '../fonts/fontList';
import { fr } from '../strings/fr';
import { Icon } from '../theme/Icon';
import { updateSpec, type MapSpec } from './dialogModel';
import { styleTemplatesStore, useStyleTemplates } from './styleTemplates';
import {
  DASHES,
  STYLE_GROUPS,
  dashId,
  getToken,
  setToken,
  type StyleControl,
  type StyleGroup,
} from './styleModel';

const t = fr.maps.style;

const setStyle = (spec: MapSpec, path: readonly string[], value: unknown) =>
  void updateSpec({ style: setToken(spec.style, path, value) });

/** A `#rrggbb` the colour input can show; any other CSS colour shows as black. */
const hexOf = (value: unknown): string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';

/** The name shown next to a control: its label without the group it already sits under. */
const shortName = (label: string): string => label.split(' : ').slice(1).join(' : ') || label;

/**
 * A number typed in: the text is kept while it is typed ("0." is not yet a number) and the value
 * is clamped into range once it parses.
 */
function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(value: number): void;
}) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // the value changed from elsewhere (a preset, an undo): show it
    setSeen(value);
    if (Number(text) !== value) setText(String(value));
  }
  return (
    <input
      type="number"
      className="input map-style__number"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n))
          onChange(Math.min(max, Math.max(min, n)));
      }}
    />
  );
}

function ColorField({
  control,
  spec,
}: {
  control: Extract<StyleControl, { kind: 'color' }>;
  spec: MapSpec;
}) {
  const value = getToken(spec.style, control.path);
  // the colour to come back to when the "none" switch is turned off again
  const last = useRef<string>('#888888');
  return (
    <span className="map-style__color">
      <input
        type="color"
        aria-label={control.label}
        value={hexOf(value)}
        disabled={value === null}
        onChange={(e) => setStyle(spec, control.path, e.target.value)}
      />
      {control.nullable && (
        <label className="check map-style__none">
          <input
            type="checkbox"
            aria-label={`${control.label} (${t.none})`}
            checked={value === null}
            onChange={(e) => {
              if (e.target.checked) last.current = hexOf(value);
              setStyle(spec, control.path, e.target.checked ? null : last.current);
            }}
          />
          {t.none}
        </label>
      )}
    </span>
  );
}

/** The bundled album fonts only (spec 7.8); before the list is read, the six the app declares. */
function FontField({
  control,
  spec,
}: {
  control: Extract<StyleControl, { kind: 'font' }>;
  spec: MapSpec;
}) {
  const families = useFontList((s) => s.families);
  useEffect(() => {
    void fontListStore.getState().load();
  }, []);
  const bundled = families.filter((f) => f.origin === 'bundled').map((f) => f.family);
  const names = bundled.length > 0 ? bundled : BOOK_FONTS.map((f) => f.family);
  const value = String(getToken(spec.style, control.path));
  const options = names.includes(value) ? names : [value, ...names];
  return (
    <select
      className="input"
      aria-label={control.label}
      value={value}
      onChange={(e) => setStyle(spec, control.path, e.target.value)}
    >
      {options.map((name) => (
        <option key={name} value={name} style={{ fontFamily: `'${name}'` }}>
          {name}
        </option>
      ))}
    </select>
  );
}

function Control({ control, spec }: { control: StyleControl; spec: MapSpec }) {
  const value = getToken(spec.style, control.path);
  const id = useId();
  const set = (v: unknown) => setStyle(spec, control.path, v);
  let field: React.ReactNode;
  switch (control.kind) {
    case 'color':
      field = <ColorField control={control} spec={spec} />;
      break;
    case 'number':
      field = (
        <NumberField
          label={control.label}
          value={value as number}
          min={control.min}
          max={control.max}
          step={control.step}
          onChange={set}
        />
      );
      break;
    case 'slider':
      field = (
        <span className="map-style__slider">
          <input
            id={id}
            type="range"
            aria-label={control.label}
            min={control.min}
            max={control.max}
            step={control.step}
            value={value as number}
            onChange={(e) => set(Number(e.target.value))}
          />
          <output htmlFor={id}>
            {control.max > 1 ? `${value as number} ${t.mm}` : (value as number).toFixed(2)}
          </output>
        </span>
      );
      break;
    case 'select': {
      const current = String(value);
      const options = control.options.some((o) => o.value === current)
        ? control.options
        : [{ value: current, label: current }, ...control.options];
      field = (
        <select
          className="input"
          aria-label={control.label}
          value={current}
          onChange={(e) => set(typeof value === 'number' ? Number(e.target.value) : e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    }
    case 'bool':
      field = (
        <input
          type="checkbox"
          aria-label={control.label}
          checked={value as boolean}
          onChange={(e) => set(e.target.checked)}
        />
      );
      break;
    case 'font':
      field = <FontField control={control} spec={spec} />;
      break;
    case 'dash': {
      const dash = value as number[] | null;
      const current = dashId(dash);
      field = (
        <select
          className="input"
          aria-label={control.label}
          value={current}
          onChange={(e) =>
            set(structuredClone(DASHES.find((d) => d.id === e.target.value)?.dash ?? dash))
          }
        >
          {current === 'custom' && <option value="custom">{t.dashes['custom']}</option>}
          {DASHES.map((d) => (
            <option key={d.id} value={d.id}>
              {t.dashes[d.id]}
            </option>
          ))}
        </select>
      );
      break;
    }
  }
  return (
    <div className="map-style__row">
      <span className="map-style__name" aria-hidden="true">
        {shortName(control.label)}
      </span>
      {field}
    </div>
  );
}

function Group({ group, spec }: { group: StyleGroup; spec: MapSpec }) {
  return (
    <fieldset className="map-style__group">
      <legend>{group.title}</legend>
      {group.controls.map((c) => (
        <Control key={c.path.join('.')} control={c} spec={spec} />
      ))}
    </fieldset>
  );
}

/** The hand-drawn outline: a switch, how rough, and another random variant. */
function RoughGroup({ spec }: { spec: MapSpec }) {
  const rough = spec.style.rough;
  const set = (v: { seed: number; roughness: number } | null) => setStyle(spec, ['rough'], v);
  return (
    <fieldset className="map-style__group">
      <legend>{t.groups.rough}</legend>
      <label className="check">
        <input
          type="checkbox"
          aria-label={t.rough}
          checked={rough !== null}
          onChange={(e) => set(e.target.checked ? { seed: 1, roughness: 1 } : null)}
        />
        {t.rough}
      </label>
      {rough && (
        <>
          <div className="map-style__row">
            <span className="map-style__name" aria-hidden="true">
              {t.roughness}
            </span>
            <span className="map-style__slider">
              <input
                type="range"
                aria-label={t.roughness}
                min={0}
                max={3}
                step={0.1}
                value={rough.roughness}
                onChange={(e) => set({ ...rough, roughness: Number(e.target.value) })}
              />
              <output>{rough.roughness.toFixed(1)}</output>
            </span>
          </div>
          <button
            type="button"
            className="button"
            onClick={() => {
              let seed = rough.seed;
              while (seed === rough.seed) seed = Math.floor(Math.random() * 1_000_000);
              set({ ...rough, seed });
            }}
          >
            {t.reroll}
          </button>
        </>
      )}
    </fieldset>
  );
}

/** One of the user's templates: its name (renamed in place) and a two-step delete. */
function Mine({ id, name }: { id: string; name: string }) {
  const [renaming, setRenaming] = useState(false);
  const [text, setText] = useState(name);
  const [confirming, setConfirming] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) field.current?.select();
  }, [renaming]);
  const finish = (keep: boolean) => {
    setRenaming(false);
    const next = text.trim();
    if (keep && next !== '' && next !== name) void styleTemplatesStore.getState().rename(id, next);
    else setText(name);
  };
  return (
    <li className="map-style__mine">
      {renaming ? (
        <input
          ref={field}
          className="input"
          value={text}
          aria-label={t.renameField}
          onChange={(e) => setText(e.target.value)}
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
        <span className="map-style__mine-name">{name}</span>
      )}
      <button
        type="button"
        className="icon-button"
        aria-label={t.rename(name)}
        title={t.rename(name)}
        onClick={() => {
          setText(name);
          setRenaming(true);
        }}
      >
        <Icon name="pencil" />
      </button>
      <button
        type="button"
        className="icon-button map-style__remove"
        data-confirming={confirming || undefined}
        aria-label={confirming ? t.confirmRemove(name) : t.remove(name)}
        title={confirming ? t.confirmRemove(name) : t.remove(name)}
        onBlur={() => setConfirming(false)}
        onClick={() => {
          if (confirming) void styleTemplatesStore.getState().remove(id);
          else setConfirming(true);
        }}
      >
        <Icon name={confirming ? 'check' : 'trash'} />
      </button>
    </li>
  );
}

/** "Enregistrer comme modèle…" and the user's templates, renamed and deleted in place. */
function Templates({ spec }: { spec: MapSpec }) {
  const mine = useStyleTemplates((s) => s.mine);
  const failed = useStyleTemplates((s) => s.error);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState<string>(t.templateDefault);
  const save = async () => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    if (await styleTemplatesStore.getState().save(trimmed, spec.style)) setNaming(false);
  };
  return (
    <fieldset className="map-style__group map-style__templates">
      <legend>{t.mine}</legend>
      {naming ? (
        <div className="map-style__save">
          <input
            className="input"
            aria-label={t.templateName}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setNaming(false);
              }
            }}
          />
          <button
            type="button"
            className="button button--primary"
            disabled={name.trim() === ''}
            onClick={() => void save()}
          >
            {t.save}
          </button>
          <button type="button" className="button" onClick={() => setNaming(false)}>
            {t.cancelSave}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="button"
          onClick={() => {
            setName(t.templateDefault);
            setNaming(true);
          }}
        >
          {t.saveAs}
        </button>
      )}
      {mine.length === 0 && <p className="field__help">{t.mineEmpty}</p>}
      <ul className="map-style__mines">
        {mine.map((p) => (
          <Mine key={p.id} id={p.id} name={p.name} />
        ))}
      </ul>
      {failed && (
        <p className="dialog__error" role="alert">
          {t.failed}
        </p>
      )}
      <p className="field__help">{t.copyHint}</p>
    </fieldset>
  );
}

/**
 * The style editor: a control for every token of `MapStyle`, the sliders for the icon sizes and
 * the outline detail, and the user's templates. Colours, widths and fonts redraw the preview
 * only; the detail (and the hand-drawn switch) are geometry inputs and bake it again.
 */
export function StylePanel({ spec }: { spec: MapSpec }) {
  return (
    <div className="map-style">
      <Templates spec={spec} />
      {STYLE_GROUPS.map((g) => (
        <Group key={g.id} group={g} spec={spec} />
      ))}
      <RoughGroup spec={spec} />
    </div>
  );
}
