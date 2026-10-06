import * as SecureStore from 'expo-secure-store';
import type { KeyValueStore } from '@socrates/platform';
export const storage: KeyValueStore = { get: SecureStore.getItemAsync, set: SecureStore.setItemAsync, remove: SecureStore.deleteItemAsync };
