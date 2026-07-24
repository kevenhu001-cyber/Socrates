export interface ArchivedSession {
  id: string;
  title?: string;
  topic?: string;
  archivedAt?: number;
}

export interface StorageSnapshot {
  archived: ReadonlyArray<ArchivedSession>;
  open: boolean;
  revision: number;
}

export interface StorageBridge {
  getSnapshot: () => StorageSnapshot;
  publish: (snapshot: Omit<StorageSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesStorageBridge?: StorageBridge;
    closeStorageModal?: () => void;
    restoreSession?: (id: string) => void;
    confirmPurgeSession?: (id: string) => void;
    getArchivedSessions?: () => Array<{ id: string; title?: string; topic?: string; archivedAt?: number }>;
  }
}
