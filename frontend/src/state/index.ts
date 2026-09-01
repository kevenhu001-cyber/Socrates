import {
  callBridge,
  examBridge,
  kbBridge,
  namespaceBridges,
  searchBridge,
  sessionBridge,
  uiBridge,
  type NamespaceName,
} from './bridges.ts';
import type { ImmutableBridge, RevisionedSnapshot } from '../lib/bridge/createImmutableBridge.ts';
import { createInitialCallState } from './call.ts';
import { createInitialExamState } from './exam.ts';
import { createInitialKbState } from './kb.ts';
import { createInitialSearchState } from './search.ts';
import { createInitialSessionState } from './session.ts';
import { createInitialUiState } from './ui.ts';

type Namespace = NamespaceName;

function directPaths(namespace: Namespace, keys: readonly string[]) {
  return Object.fromEntries(keys.map((key) => [key, `${namespace}.${key}`]));
}

function aliasedPaths(namespace: Namespace, keys: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(keys).map(([alias, key]) => [alias, `${namespace}.${key}`]),
  );
}

const SESSION_FLAT_KEYS = [
  'topic', 'phase', 'diagIndex', 'diagAnswers', 'diagQuestions',
  'currentSessionId', 'substantiveCount', 'explaining', 'sessionTitle',
  'domain', 'totalQ', 'stuckCount', 'messages', 'currentProjectId',
  'activeProjectFilter', 'diagCancel', 'teachingStage', 'currentExampleIdx',
  'practiceAttempts', 'practicePhase', 'teachingPlan', 'branchedFrom',
  'stuckCheckOffered', 'stuckCheckRejected', 'fourOptionDialog',
] as const;

const KB_FLAT_KEYS = [
  'kbNodes', 'currentNode', 'mistakes', 'boundariesHistory',
  'boundariesSavedAt', 'mistakeFilter',
] as const;

const SEARCH_FLAT_KEYS = {
  searchContext: 'context',
  searchResults: 'results',
  searchContextAt: 'contextAt',
  searchContextCount: 'contextCount',
  searchContextQuery: 'contextQuery',
  searchContextError: 'error',
} as const;

const CALL_FLAT_KEYS = {
  lastCallSource: 'source',
  lastCallError: 'error',
} as const;

const UI_FLAT_KEYS = [
  '_userScrolledAway', '_examInView', '_canvasPendingId',
] as const;

const EXAM_FLAT_KEYS = {
  examCancel: 'cancel',
  examQuestions: 'questions',
  examAnswers: 'answers',
  examSubmitted: 'submitted',
  examTopic: 'topic',
  examCount: 'count',
  _examScrollBound: '_examScrollBound',
  examReadOnly: 'readOnly',
  examLang: 'lang',
  examDifficulty: 'difficulty',
  examInstructions: 'instructions',
  examTypes: 'types',
  _examPrevActiveId: '_examPrevActiveId',
} as const;

/**
 * `FLAT_STATE_PATHS` is the legacy lookup table the Proxy uses to map
 * `state.<alias>` reads/writes into the correct namespace path. Each
 * namespace module contributes its own keys; the table is rebuilt
 * automatically when a new key is added.
 */
export const FLAT_STATE_PATHS: Readonly<Record<string, string>> = Object.freeze({
  ...directPaths('session', SESSION_FLAT_KEYS),
  ...directPaths('kb', KB_FLAT_KEYS),
  ...aliasedPaths('search', SEARCH_FLAT_KEYS),
  ...aliasedPaths('call', CALL_FLAT_KEYS),
  ...directPaths('ui', UI_FLAT_KEYS),
  ...aliasedPaths('exam', EXAM_FLAT_KEYS),
});

/**
 * Compose the root state from the current bridge snapshots.
 *
 * Kept for callers that want a one-shot, frozen view; the live
 * facade in `state.js` re-evaluates the bridges on every read so
 * its Proxy stays in sync with concurrent commits.
 */
export function composeRootState() {
  return Object.freeze({
    session: sessionBridge.getSnapshot(),
    kb: kbBridge.getSnapshot(),
    search: searchBridge.getSnapshot(),
    call: callBridge.getSnapshot(),
    ui: uiBridge.getSnapshot(),
    exam: examBridge.getSnapshot(),
    tutorAttachments: null,
    tutorPartsTemplate: null,
  });
}

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

/** Re-export the bridges for advanced callers. */
export {
  callBridge,
  examBridge,
  kbBridge,
  namespaceBridges,
  searchBridge,
  sessionBridge,
  uiBridge,
};

export type NamespaceBridge = ImmutableBridge<
  Readonly<Record<string, unknown>> & RevisionedSnapshot,
  unknown
>;
