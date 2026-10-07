import type { KeyValueStore } from '@socrates/platform';

// DORMANT — Windows is out of scope as of 2026-10-07 (round 16-5): the
// supported targets are Android / Web / iOS only, and this repo has no
// React Native Windows native tree, so no build resolves this file. Kept as
// a placeholder in case desktop is re-opened; no work is planned here.
// See docs/plans/universal-app-migration.md §5 + §23.
import { createMemoryStore } from '@socrates/platform';

export const storage: KeyValueStore = createMemoryStore();
