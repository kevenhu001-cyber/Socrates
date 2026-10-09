import { useState } from 'react';

import { getTonePreset, setTonePreset } from '../../config/tonePresets.js';
import { getAllMemories } from '../../storage/memoryStore.js';
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

function readCustomInstructions(): string {
  try {
    return localStorage.getItem('socrates-custom-instructions') || '';
  } catch {
    return '';
  }
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
  const [customInstructions, setCustomInstructions] = useState(readCustomInstructions);
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
        value={customInstructions}
        onChange={setCustomInstructions}
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
