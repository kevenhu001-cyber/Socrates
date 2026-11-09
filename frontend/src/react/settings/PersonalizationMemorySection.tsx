import { Button } from '../ui/shadcn/button';
import { getApiFetch } from '../legacy/gateway.ts';
import { clearAllMemories, getAllMemories, removeMemory, replaceMemoryId, setMemory } from '../../storage/memoryStore.ts';
import { showConfirm } from '../../ui/confirm.ts';
import type { SettingsLabel, SettingsMemory } from './settings.types';
import { PersonalizationMemoryAddForm } from './PersonalizationMemoryAddForm';
import { PersonalizationMemoryList } from './PersonalizationMemoryList';

function isServerMemoryId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

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
    if (isServerMemoryId(id)) {
      syncMemoryChange(() => getApiFetch()?.('/api/memory/' + id, { method: 'DELETE' }));
    }
  };

  const addMemory = (key: string, value: string) => {
    const memory = setMemory(key, value);
    refreshMemories();
    const api = getApiFetch();
    if (!memory || !api) return;
    const localId = memory.id;
    syncMemoryChange(async () => {
      const text = key + ': ' + value;
      if (isServerMemoryId(localId)) {
        await api('/api/memory/' + localId, { method: 'PATCH', body: { text } });
        return;
      }
      const result = await api<{ id?: string }>('/api/memory', { method: 'POST', body: { text } });
      if (result.id && isServerMemoryId(result.id)) {
        const wasStillPresent = replaceMemoryId(localId, result.id);
        refreshMemories();
        // A user can remove a local draft while its first server write is in flight.
        if (!wasStillPresent) await api('/api/memory/' + result.id, { method: 'DELETE' });
      }
    });
  };

  const clearMemories = async () => {
    const current = getAllMemories();
    clearAllMemories();
    onChange([]);
    const api = getApiFetch();
    const serverIds = current.filter((memory) => isServerMemoryId(memory.id)).map((memory) => memory.id);
    if (api && serverIds.length > 0) {
      syncMemoryChange(() => Promise.all(serverIds.map((id) => api('/api/memory/' + id, { method: 'DELETE' }))));
    }
  };

  return (
    <section className="settings-section">
      <div className="settings-section-head settings-memory-head">
        <div>
          <h3>{label('跨会话记忆', 'Memory')}</h3>
          <p>{label('助手在对话中自动沉淀的关于你的背景与偏好。', 'Things the assistant has learned about you across conversations.')}</p>
        </div>
        {memories.length > 0 && (
          <Button variant="destructive"
            type="button"
            className="settings-btn-mini"
            onClick={() => {
              void showConfirm(
                label('清空全部记忆？', 'Clear all memories?'),
                label('这会从此设备和账户中删除已保存的记忆。', 'This removes saved memories from this device and your account.'),
                true,
              ).then((confirmed) => { if (confirmed) void clearMemories(); });
            }}
          >{label('清空全部', 'Clear all')}</Button>
        )}
      </div>
      <PersonalizationMemoryList memories={memories} label={label} onDelete={deleteMemory} />
      <PersonalizationMemoryAddForm label={label} onAdd={addMemory} />
    </section>
  );
}
