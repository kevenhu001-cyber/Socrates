import { getApiFetch } from '../legacy/gateway.ts';
import { clearAllMemories, getAllMemories, removeMemory, setMemory } from '../../storage/memoryStore.js';
import type { SettingsLabel, SettingsMemory } from './settings.types';
import { PersonalizationMemoryAddForm } from './PersonalizationMemoryAddForm';
import { PersonalizationMemoryList } from './PersonalizationMemoryList';

export function PersonalizationMemorySection({
  label,
  memories,
  onChange,
  reportSaveError,
}: {
  label: SettingsLabel;
  memories: SettingsMemory[];
  onChange: (memories: SettingsMemory[]) => void;
  reportSaveError: (message: string) => void;
}) {
  const refreshMemories = () => onChange(getAllMemories());
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
              onChange([]);
            }}
          >{label('清空全部', 'Clear all')}</button>
        )}
      </div>
      <PersonalizationMemoryList memories={memories} label={label} onDelete={deleteMemory} />
      <PersonalizationMemoryAddForm label={label} onAdd={addMemory} />
    </section>
  );
}
