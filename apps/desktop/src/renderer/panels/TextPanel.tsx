import { fr } from '../strings/fr';
import { addPresetText } from '../editor/textActions';
import { TEXT_PRESETS } from '../editor/textPresets';
import './TextPanel.css';

/** Largest size a preset is previewed at, in px: the panel is narrow. */
const PREVIEW_MAX_PX = 26;
const PT_TO_PX = 96 / 72;

/** The "Texte" panel: one button per style, each drawn in its own font; a click adds it to the page. */
export function TextPanel() {
  return (
    <div className="text-panel">
      <p className="text-panel__hint">{fr.text.panelHint}</p>
      <ul className="text-panel__list" aria-label={fr.text.presets}>
        {TEXT_PRESETS.map((preset) => (
          <li key={preset.id}>
            <button
              type="button"
              className="text-preset"
              data-preset={preset.id}
              onClick={() => addPresetText(preset)}
            >
              <span
                className="text-preset__sample"
                style={{
                  fontFamily: preset.font,
                  fontSize: Math.min(preset.fontSizePt * PT_TO_PX, PREVIEW_MAX_PX),
                  fontWeight: preset.bold ? 700 : 400,
                  fontStyle: preset.italic ? 'italic' : 'normal',
                }}
              >
                {preset.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
