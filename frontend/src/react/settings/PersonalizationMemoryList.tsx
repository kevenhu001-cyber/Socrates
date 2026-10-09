import type { SettingsLabel, SettingsMemory } from './settings.types';

export function PersonalizationMemoryList({
  memories,
  label,
  onDelete,
}: {
  memories: SettingsMemory[];
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
