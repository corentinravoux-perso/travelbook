import { useEffect, useRef, useState } from 'react';
import type { MenuLanguage, StickerSourceInfo } from '../../shared/api';
import { fr } from '../strings/fr';

const t = fr.settings;

/** One optional key field of a source that asks for a key. */
function KeyField({ source, onSaved }: { source: StickerSourceInfo; onSaved(): void }) {
  const [value, setValue] = useState('');
  const [failed, setFailed] = useState(false);
  const save = (): void => {
    setFailed(false);
    window.tb.library.stickers.setKey(source.id, value).then(
      () => {
        setValue('');
        onSaved();
      },
      (error: unknown) => {
        console.error('Saving a source key failed', error);
        setFailed(true);
      },
    );
  };
  return (
    <div className="field" data-source={source.id}>
      <label className="field__label" htmlFor={`key-${source.id}`}>
        {t.keyLabel(source.label)}
      </label>
      <div className="settings-key">
        <input
          id={`key-${source.id}`}
          className="input"
          type="password"
          autoComplete="off"
          placeholder={t.keyHint}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="button" className="button" onClick={save}>
          {t.save}
        </button>
      </div>
      {source.hasKey && <span className="field__help">{t.keyStored}</span>}
      {failed && <span className="field__help is-error">{t.keyFailed}</span>}
    </div>
  );
}

const MENU_LANGUAGES: readonly { value: MenuLanguage; label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];

/** The language of the menu bar (the interface stays French); a change applies at once. */
function MenuLanguageField() {
  const [language, setLanguage] = useState<MenuLanguage>('fr');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    window.tb.settings.menuLanguage().then(setLanguage, (error: unknown) => {
      console.error('Reading the menu language failed', error);
    });
  }, []);
  const change = (next: MenuLanguage): void => {
    setFailed(false);
    window.tb.settings.setMenuLanguage(next).then(
      () => setLanguage(next),
      (error: unknown) => {
        console.error('Saving the menu language failed', error);
        setFailed(true);
      },
    );
  };
  return (
    <div className="field">
      <label className="field__label" htmlFor="menu-language">
        {t.menuLanguage}
      </label>
      <select
        id="menu-language"
        className="input"
        value={language}
        onChange={(e) => change(e.target.value as MenuLanguage)}
      >
        {MENU_LANGUAGES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <span className="field__help">{t.menuLanguageHelp}</span>
      {failed && <span className="field__help is-error">{t.menuLanguageFailed}</span>}
    </div>
  );
}

/**
 * Settings: the online sources and their optional keys. None of the built-in sources needs a
 * key, so the section usually says so; a source that declares `needsKey` gets a field here.
 */
export function SettingsDialog({ onClose }: { onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [sources, setSources] = useState<StickerSourceInfo[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = (): void => {
    window.tb.library.stickers.sources().then(setSources, (error: unknown) => {
      console.error('Sources failed', error);
      setFailed(true);
    });
  };
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    load();
  }, []);

  const keyed = (sources ?? []).filter((s) => s.needsKey);

  return (
    <dialog
      ref={ref}
      className="dialog dialog--scroll"
      aria-labelledby="settings-title"
      onClose={onClose}
    >
      <div className="dialog__form">
        <h2 id="settings-title" className="dialog__title">
          {t.title}
        </h2>
        <MenuLanguageField />
        <fieldset className="field settings-group">
          <legend>{t.sourcesTitle}</legend>
          <p className="field__help">{t.sourcesHelp}</p>
          {failed ? (
            <p className="field__help is-error" role="alert">
              {t.loadFailed}
            </p>
          ) : sources === null ? null : keyed.length === 0 ? (
            <p className="field__help settings-empty">{t.noKeys}</p>
          ) : (
            keyed.map((source) => <KeyField key={source.id} source={source} onSaved={load} />)
          )}
        </fieldset>
        <div className="dialog__actions">
          <button type="button" className="button" onClick={() => ref.current?.close()}>
            {t.close}
          </button>
        </div>
      </div>
    </dialog>
  );
}
