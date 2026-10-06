export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface PlatformServices {
  storage: KeyValueStore;
  openUrl(url: string): Promise<void>;
  share?(value: { title?: string; text?: string; url?: string }): Promise<void>;
}

export function createMemoryStore(seed: Record<string, string> = {}): KeyValueStore {
  const values = new Map(Object.entries(seed));
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
}
