import { CALL_FLAT_KEYS, createInitialCallState } from './call.ts';
import { createInitialExamState, EXAM_FLAT_KEYS } from './exam.ts';
import { createInitialKbState, KB_FLAT_KEYS } from './kb.ts';
import { createInitialSearchState, SEARCH_FLAT_KEYS } from './search.ts';
import { createInitialSessionState, SESSION_FLAT_KEYS } from './session.ts';
import { createInitialUiState, UI_FLAT_KEYS } from './ui.ts';

type Namespace = 'session' | 'kb' | 'search' | 'call' | 'ui' | 'exam';

function directPaths(namespace: Namespace, keys: readonly string[]) {
  return Object.fromEntries(keys.map((key) => [key, `${namespace}.${key}`]));
}

function aliasedPaths(namespace: Namespace, keys: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(keys).map(([alias, key]) => [alias, `${namespace}.${key}`]),
  );
}

export const FLAT_STATE_PATHS: Readonly<Record<string, string>> = Object.freeze({
  ...directPaths('session', SESSION_FLAT_KEYS),
  ...directPaths('kb', KB_FLAT_KEYS),
  ...aliasedPaths('search', SEARCH_FLAT_KEYS),
  ...aliasedPaths('call', CALL_FLAT_KEYS),
  ...directPaths('ui', UI_FLAT_KEYS),
  ...aliasedPaths('exam', EXAM_FLAT_KEYS),
});

export function createInitialAppState() {
  return {
    session: createInitialSessionState(),
    kb: createInitialKbState(),
    search: createInitialSearchState(),
    call: createInitialCallState(),
    ui: createInitialUiState(),
    exam: createInitialExamState(),
    tutorAttachments: null,
    tutorPartsTemplate: null,
  };
}

export type AppState = ReturnType<typeof createInitialAppState>;
