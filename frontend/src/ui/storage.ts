/**
 * Storage facade for archived sessions list.
 * The modal DOM is fully owned by React (frontend/src/react/storageModal/StorageModal.tsx)
 * via FoundationDialog.
 */
import { installStorageBridge } from '../react/storageModal/storageModal.bridge';
import { getArchivedSessions } from '../session/recents';

let _storageOpen = false;

function _publishStorageState(): void {
  try {
    const bridge = installStorageBridge();
    bridge.publish({
      archived: (getArchivedSessions() || []).map((s) => {
        const raw = s.archivedAt;
        const ms = typeof raw === 'number' ? raw : Date.parse(String(raw || '')) || 0;
        return {
          id: s.id,
          title: s.title || undefined,
          topic: s.topic || undefined,
          archivedAt: ms,
        };
      }),
      open: _storageOpen,
    });
  } catch (_) { /* empty-catch: intentional — storage bridge publish is best effort */ }
}

export function openStorageModal(): void {
  _storageOpen = true;
  _publishStorageState();
}

export function closeStorageModal(): void {
  _storageOpen = false;
  _publishStorageState();
}

export function renderArchivedList(): void {
  _publishStorageState();
}

export function loadStorageImpl(): Promise<typeof import('./storage')> {
  return Promise.resolve({
    openStorageModal,
    closeStorageModal,
    renderArchivedList,
    loadStorageImpl,
  });
}
