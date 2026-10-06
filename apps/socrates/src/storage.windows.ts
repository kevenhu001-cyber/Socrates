import type { KeyValueStore } from '@socrates/platform';

// Windows (React Native Windows): SecureStore is unavailable, so persist to
// the in-memory store for now. A future *.windows.ts adapter can swap this
// for Credential Locker / DPAPI without touching shared packages.
// See docs/plans/universal-app-migration.md §7.
import { createMemoryStore } from '@socrates/platform';

export const storage: KeyValueStore = createMemoryStore();
