import { useState } from 'react';
import { getApiFetch } from '../legacy/gateway.ts';
import { getAvailablePresets, getTonePreset, setTonePreset } from '../../config/tonePresets.js';
import { clearAllMemories, getAllMemories, removeMemory, setMemory } from '../../storage/memoryStore.js';
import type { SettingsLabel, SaveSettingsPreference } from './settings.types';

interface PersonalizationSettingsPaneProps {
  hidden: boolean;
  language: 'zh' | 'en';
  label: SettingsLabel;
  savePreference: SaveSettingsPreference;
  reportSaveError: (message: string) => void;
}

type Memory = { id: string; key: string; value: string };

export function PersonalizationSettingsPane({
  hidden,
  language,
  label,
  savePreference,
  reportSaveError,
}: PersonalizationSettingsPaneProps) {
  const [selectedTone, setSelectedTone] = useState(() => getTonePreset());
  const [customInstructions, setCustomInstructions] = useState(readCustomInstructions);
  const [memories, setMemories] = useState<Memory[]>(readMemories);

  return (
    <section className="settings-pane" hidden={hidden}>
      <h2>{label('个性化', 'Personalization')}</h2>
      <TonePresetSection
        language={language}
        label={label}
        selectedTone={selectedTone}
        onSelect={(tone) => {
          setTonePreset(tone);
          setSelectedTone(tone);
        }}
      />
      <CustomInstructionsSection
        language={language}
        label={label}
        value={customInstructions}
        onChange={setCustomInstructions}
        savePreference={savePreference}
        reportSaveError={reportSaveError}
      />
      <MemorySection
        label={label}
        memories={memories}
        setMemories={setMemories}
        reportSaveError={reportSaveError}
      />
    </section>
  );
}

function readCustomInstructions(): string {
  try {
    return localStorage.getItem('socrates-custom-instructions') || '';
  } catch {
    return '';
  }
}

function readMemories(): Memory[] {
  try {
    return getAllMemories();
  } catch {
    return [];
  }
}

function TonePresetSection({
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

function CustomInstructionsSection({
  language,
  label,
  value,
  onChange,
  savePreference,
  reportSaveError,
}: {
  language: 'zh' | 'en';
  label: SettingsLabel;
  value: string;
  onChange: (value: string) => void;
  savePreference: SaveSettingsPreference;
  reportSaveError: (message: string) => void;
}) {
  const handleChange = (nextValue: string) => {
    onChange(nextValue);
    try {
      localStorage.setItem('socrates-custom-instructions', nextValue);
    } catch {
      reportSaveError(label('无法保存在此设备。', 'Could not save on this device.'));
    }
    void savePreference({ customInstructions: nextValue });
  };

  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <h3>{label('自定义指令', 'Custom instructions')}</h3>
        <p>{label(
          '希望助手了解你什么，或者以怎样的风格与格式回答。',
          'What would you like the assistant to know about you to provide better responses.',
        )}</p>
      </div>
      <textarea
        className="settings-textarea"
        rows={3}
        value={value}
        placeholder={language === 'zh'
          ? '例如：我是高中物理老师，喜欢结构化、带有举例说明的清晰回答。'
          : 'e.g. I am a physics student; prefer concise, step-by-step explanations with examples.'}
        onChange={(event) => handleChange(event.target.value)}
      />
    </section>
  );
}

function MemorySection({
  label,
  memories,
  setMemories,
  reportSaveError,
}: {
  label: SettingsLabel;
  memories: Memory[];
  setMemories: (memories: Memory[]) => void;
  reportSaveError: (message: string) => void;
}) {
  const refreshMemories = () => setMemories(getAllMemories());
  const syncMemoryChange = (request: () => Promise<unknown> | undefined) => {
    try {
      const result = request();
      if (result) {
        void result.catch(() => {
          reportSaveError(label(
            '记忆已保存在此设备；账户同步暂不可用。',
            'Memory saved on this device; account sync is unavailable.',
          ));
        });
      }
    } catch {
      reportSaveError(label(
        '记忆已保存在此设备；账户同步暂不可用。',
        'Memory saved on this device; account sync is unavailable.',
      ));
    }
  };

  const deleteMemory = (id: string) => {
    removeMemory(id);
    refreshMemories();
    syncMemoryChange(() => getApiFetch()?.('/api/memory/' + id, { method: 'DELETE' }));
  };

  const addMemory = (key: string, value: string) => {
    setMemory(key, value);
    refreshMemories();
    syncMemoryChange(() => getApiFetch()?.('/api/memory', {
      method: 'POST',
      body: { text: key + ': ' + value },
    }));
  };

  return (
    <section className="settings-section">
      <div className="settings-section-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>{label('跨会话记忆', 'Memory')}</h3>
          <p>{label('助手在对话中自动沉淀的关于你的背景与偏好。', 'Things the assistant has learned about you across conversations.')}</p>
        </div>
        {memories.length > 0 && (
          <button
            type="button"
            className="settings-btn-mini danger"
            onClick={() => {
              if (!window.confirm(label('确定要清空全部已保存的记忆吗？', 'Are you sure you want to clear all memories?'))) return;
              clearAllMemories();
              setMemories([]);
            }}
          >{label('清空全部', 'Clear all')}</button>
        )}
      </div>
      <MemoryList memories={memories} label={label} onDelete={deleteMemory} />
      <MemoryAddForm label={label} onAdd={addMemory} />
    </section>
  );
}

function MemoryList({
  memories,
  label,
  onDelete,
}: {
  memories: Memory[];
  label: SettingsLabel;
  onDelete: (id: string) => void;
}) {
  if (!memories.length) {
    return (
      <div className="settings-memory-list">
        <div className="settings-empty-hint">
          {label(
            '暂无已保存的记忆。在对话中助手会自动记住关键偏好，你也可以在此手动添加。',
            'No saved memories yet. The assistant learns details as you chat, or you can add them below.',
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="settings-memory-list">
      {memories.map((memory) => (
        <div key={memory.id} className="settings-memory-item">
          <div className="settings-memory-content">
            <span className="settings-memory-key">{memory.key}</span>
            <span className="settings-memory-val">{memory.value}</span>
          </div>
          <button
            type="button"
            className="settings-memory-del-btn"
            aria-label={label('删除记忆', 'Delete memory')}
            title={label('删除记忆', 'Delete memory')}
            onClick={() => onDelete(memory.id)}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

function MemoryAddForm({
  label,
  onAdd,
}: {
  label: SettingsLabel;
  onAdd: (key: string, value: string) => void;
}) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextValue = value.trim();
    if (!nextValue) return;
    onAdd(key.trim() || 'fact', nextValue);
    setKey('');
    setValue('');
  };

  return (
    <form className="settings-memory-add-form" onSubmit={handleSubmit}>
      <input
        type="text"
        className="settings-input settings-memory-key-input"
        placeholder={label('标签 (如偏好)', 'Key (e.g. preference)')}
        value={key}
        onChange={(event) => setKey(event.target.value)}
      />
      <input
        type="text"
        className="settings-input settings-memory-val-input"
        placeholder={label('记忆内容 (如喜欢用 TypeScript)', 'Value (e.g. prefers TypeScript)')}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" className="settings-btn secondary" disabled={!value.trim()}>
        {label('添加', 'Add')}
      </button>
    </form>
  );
}
