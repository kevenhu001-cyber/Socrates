import { ToggleGroup, ToggleGroupItem } from '../ui/shadcn/toggle-group';
import { cn } from 'cn';
import { CheckIcon } from 'lucide-react';
import { getAvailablePresets } from '../../config/tonePresets.ts';
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
      <ToggleGroup variant="outline" className="tone-preset-options grid w-full" id="tonePresetOptions" value={[selectedTone]}
        aria-label={label('助手语调风格', 'Tone & voice')}
        onValueChange={(values) => { if (values[0]) onSelect(values[0]); }}>
        {getAvailablePresets().map((preset) => {
          const active = selectedTone === preset.id;
          const presetLabel = language === 'zh' ? preset.labelZh || preset.label : preset.label;
          const description = language === 'zh'
            ? preset.descriptionZh || preset.description
            : preset.description;
          return (
            <ToggleGroupItem
              key={preset.id}
              type="button"
              className={cn('tone-preset-btn relative h-auto min-h-(--ui-control-touch) items-start whitespace-normal flex-col py-3 pr-8', active && 'active')}
              value={preset.id}
              data-tone={preset.id}
            >
              <span className="tone-preset-label">{presetLabel}</span>
              <span className="tone-preset-desc">{description}</span>
              {active && <CheckIcon data-icon="inline-end" aria-hidden className="absolute top-3 right-3" />}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </section>
  );
}
