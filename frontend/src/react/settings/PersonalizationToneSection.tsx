import { cn } from 'cn';
import { CheckIcon } from 'lucide-react';
import { Button } from '../ui/v3';
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
      <div
        role="radiogroup"
        className="tone-preset-options w-full"
        id="tonePresetOptions"
        aria-label={label('助手语调风格', 'Tone & voice')}
      >
        {getAvailablePresets().map((preset) => {
          const active = selectedTone === preset.id;
          const presetLabel = language === 'zh' ? preset.labelZh || preset.label : preset.label;
          const description =
            language === 'zh' ? preset.descriptionZh || preset.description : preset.description;
          return (
            <Button
              key={preset.id}
              type="button"
              variant="outline"
              pill={false}
              role="radio"
              aria-checked={active}
              className={cn(
                'tone-preset-btn relative flex h-auto min-h-(--ui-control-touch) flex-col items-start justify-start rounded-xl px-3.5 py-3 pr-8 text-left whitespace-normal',
                active && 'active border-foreground/30 bg-muted/45',
              )}
              data-tone={preset.id}
              onClick={() => onSelect(preset.id)}
            >
              <span className="tone-preset-label">{presetLabel}</span>
              <span className="tone-preset-desc">{description}</span>
              {active && (
                <CheckIcon
                  size={15}
                  aria-hidden
                  className="absolute top-3 right-3 text-foreground"
                />
              )}
            </Button>
          );
        })}
      </div>
    </section>
  );
}
