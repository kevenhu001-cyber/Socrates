import type { KeyValueStore } from '@socrates/platform';

// macOS (React Native macOS): same placeholder as Windows — in-memory until
// a Keychain adapter lands. Platform differences stay in these
// *.windows.ts / *.macos.ts files; packages/ remain DOM-free.
import { createMemoryStore } from '@socrates/platform';

export const storage: KeyValueStore = createMemoryStore();
