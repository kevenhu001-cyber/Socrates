import type { KeyValueStore } from '@socrates/platform';
import * as SecureStore from 'expo-secure-store';

// Android: SecureStore backed. Same contract as storage.native.ts,
// split out so Android-specific tweaks (e.g. keychain accessibility,
// backup rules) stay here and never leak into shared core.
export const storage: KeyValueStore = {
  get: SecureStore.getItemAsync,
  set: SecureStore.setItemAsync,
  remove: SecureStore.deleteItemAsync,
};
