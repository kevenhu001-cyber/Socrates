import { useState, type FormEvent } from 'react';

import type { SettingsLabel } from './settings.types';

export function PersonalizationMemoryAddForm({
  label,
  onAdd,
}: {
  label: SettingsLabel;
  onAdd: (key: string, value: string) => void;
}) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
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
