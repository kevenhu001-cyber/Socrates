import { getAvailablePresets } from '../../config/tonePresets.js';
import type { SettingsLabel } from './settings.types';

export function PersonalizationToneSection({
  language,
  label,
  selectedTone,
  onSelect,
}: {
  language: 'zh' | 'en';
  label: SettingsLabel;
  selectedTone: string;
  onSelect: (tone: string) => void;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <h3>{label('助手语调风格', 'Tone & voice')}</h3>
        <p>{label('选择助手的说话风格。', 'Choose how Socrates speaks in a session.')}</p>
      </div>
      <div className="tone-preset-options" id="tonePresetOptions">
        {getAvailablePresets().map((preset) => {
          const active = selectedTone === preset.id;
          const presetLabel = language === 'zh' ? preset.labelZh || preset.label : preset.label;
          const description = language === 'zh'
            ? preset.descriptionZh || preset.description
            : preset.description;
          return (
            <button
              key={preset.id}
              type="button"
              className={'tone-preset-btn' + (active ? ' active' : '')}
              data-tone={preset.id}
              aria-pressed={active}
              onClick={() => onSelect(preset.id)}
            >
              <span className="tone-preset-label">{presetLabel}</span>
              <span className="tone-preset-desc">{description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
