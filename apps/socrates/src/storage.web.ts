import type { KeyValueStore } from '@socrates/platform';
export const storage: KeyValueStore = {
  get: async (key) => globalThis.localStorage?.getItem(key) ?? null,
  set: async (key, value) => { globalThis.localStorage?.setItem(key, value); },
  remove: async (key) => { globalThis.localStorage?.removeItem(key); },
};
