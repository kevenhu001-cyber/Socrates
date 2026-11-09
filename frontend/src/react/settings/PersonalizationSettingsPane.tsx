import { useState } from 'react';
import { getCurrentUser } from '../legacy/gateway.ts';
import { reportSwallow as reportEmptyCatch } from '../../util/reportSwallow.ts';

import { getTonePreset, setTonePreset } from '../../config/tonePresets.ts';
import { loadCustomInstructions, type CustomInstructions } from '../../config/customInstructions.ts';
import { getAllMemories } from '../../storage/memoryStore.ts';
import type { SettingsLabel, SettingsMemory, SaveSettingsPreference } from './settings.types';
import { PersonalizationInstructionsSection } from './PersonalizationInstructionsSection';
import { PersonalizationMemorySection } from './PersonalizationMemorySection';
import { PersonalizationToneSection } from './PersonalizationToneSection';

interface PersonalizationSettingsPaneProps {
  hidden: boolean;
  language: 'zh' | 'en';
  label: SettingsLabel;
  savePreference: SaveSettingsPreference;
  reportSaveError: (message: string) => void;
}

function parseAccountInstructions(value: string): CustomInstructions {
  const responsePrefix = '[How to respond]\n';
  const aboutPrefix = '[About the user]\n';
  const aboutDivider = '\n\n' + aboutPrefix;
  if (value.startsWith(responsePrefix)) {
    const content = value.slice(responsePrefix.length);
    const divider = content.indexOf(aboutDivider);
    return divider < 0
      ? { response: content, about: '', savedAt: '' }
      : { response: content.slice(0, divider), about: content.slice(divider + aboutDivider.length), savedAt: '' };
  }
  if (value.startsWith(aboutPrefix)) return { response: '', about: value.slice(aboutPrefix.length), savedAt: '' };
  return { response: value, about: '', savedAt: '' };
}

function readCustomInstructions(): CustomInstructions {
  try {
    const localValue = localStorage.getItem('socrates-custom-instructions');
    if (localValue !== null) {
      const saved = loadCustomInstructions();
      if (saved.response || saved.about || saved.savedAt) return saved;
      return { response: localValue, about: '', savedAt: '' };
    }
  } catch (error) {
    reportEmptyCatch(error, 'empty catch: react/settings/PersonalizationSettingsPane.tsx:read-local');
  }
  const customInstructions = getCurrentUser<{ customInstructions?: unknown }>()?.customInstructions;
  return typeof customInstructions === 'string'
    ? parseAccountInstructions(customInstructions)
    : { response: '', about: '', savedAt: '' };
}

function readMemories(): SettingsMemory[] {
  try {
    return getAllMemories();
  } catch {
    return [];
  }
}

export function PersonalizationSettingsPane({
  hidden,
  language,
  label,
  savePreference,
  reportSaveError,
}: PersonalizationSettingsPaneProps) {
  const [selectedTone, setSelectedTone] = useState(() => getTonePreset());
  const [customInstructions, setCustomInstructions] = useState<CustomInstructions>(readCustomInstructions);
  const [memories, setMemories] = useState<SettingsMemory[]>(readMemories);

  const selectTone = (tone: string) => {
    setTonePreset(tone);
    setSelectedTone(tone);
  };

  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('个性化', 'Personalization')}</h2>
      <PersonalizationToneSection
        language={language}
        label={label}
        selectedTone={selectedTone}
        onSelect={selectTone}
      />
      <PersonalizationInstructionsSection
        language={language}
        label={label}
        value={customInstructions.response}
        about={customInstructions.about}
        onChange={(response) => setCustomInstructions((current) => ({ ...current, response }))}
        savePreference={savePreference}
        reportSaveError={reportSaveError}
      />
      <PersonalizationMemorySection
        label={label}
        memories={memories}
        onChange={setMemories}
        reportSaveError={reportSaveError}
      />
    </section>
  );
}
