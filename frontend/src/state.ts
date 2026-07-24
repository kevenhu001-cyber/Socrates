// src/state.ts — Reactive state object with legacy flat-namespace Proxy
//
// The state object is the single source of truth for the entire app.
// A Proxy translates flat legacy reads/writes (`state.topic`) into
// the namespaced structure (`state.session.topic`) so both forms work
// transparently.
//
// Exports:
//   state        — the Proxy-wrapped state object (import & use directly)
//   resetState() — reset all namespaces to defaults

/* ─── Type definitions ─── */

export interface SessionState {
  topic: string;
  phase: string;
  diagIndex: number;
  diagAnswers: unknown[];
  diagQuestions: unknown[];
  currentSessionId: string | null;
  substantiveCount: number;
  explaining: boolean;
  sessionTitle: string | null;
  domain: string | null;
  totalQ: number;
  stuckCount: number;
  messages: unknown[];
  currentProjectId: string | null;
  activeProjectFilter: string | null;
  teachingStage: string;
  currentExampleIdx: number;
  practiceAttempts: number;
  practicePhase: string;
  teachingPlan: unknown | null;
  stuckCheckOffered: boolean;
  stuckCheckRejected: number;
  fourOptionDialog: unknown | null;
  diagCancel: boolean;
}

export interface KbState {
  kbNodes: unknown[];
  currentNode: number;
  mistakes: unknown[];
  boundariesHistory: unknown[];
  boundariesSavedAt: number;
  mistakeFilter: string;
}

export interface SearchState {
  context: unknown | null;
  results: unknown[];
  contextAt: number;
  contextCount: number;
  contextQuery: string | null;
  error: unknown | null;
}

export interface CallState {
  source: unknown | null;
  error: unknown | null;
}

export interface UiState {
  _userScrolledAway: boolean;
  _examInView: boolean;
}

export interface ExamState {
  cancel: boolean;
  questions: unknown[];
  answers: Record<string, unknown>;
  submitted: boolean;
  topic: string;
  count: number;
  _examScrollBound: boolean;
  readOnly: boolean;
  lang: string;
  difficulty: string;
  instructions: string;
  types: unknown[];
  _examPrevActiveId: unknown | null;
}

export interface AppState {
  session: SessionState;
  kb: KbState;
  search: SearchState;
  call: CallState;
  ui: UiState;
  exam: ExamState;
  tutorAttachments: unknown | null;
  tutorPartsTemplate: unknown | null;
}

/* Flat-name → namespace path lookup.
 * Maps `state.<field>` to its sub-namespace path.
 * Add new entries here when adding fields to a sub-namespace. */
const STATE_FLAT_TO_NS: Record<string, string> = {
  /* session */
  topic: 'session.topic',
  phase: 'session.phase',
  diagIndex: 'session.diagIndex',
  diagAnswers: 'session.diagAnswers',
  diagQuestions: 'session.diagQuestions',
  currentSessionId: 'session.currentSessionId',
  substantiveCount: 'session.substantiveCount',
  explaining: 'session.explaining',
  sessionTitle: 'session.sessionTitle',
  domain: 'session.domain',
  totalQ: 'session.totalQ',
  stuckCount: 'session.stuckCount',
  messages: 'session.messages',
  currentProjectId: 'session.currentProjectId',
  activeProjectFilter: 'session.activeProjectFilter',
  diagCancel: 'session.diagCancel',
  teachingStage: 'session.teachingStage',
  currentExampleIdx: 'session.currentExampleIdx',
  practiceAttempts: 'session.practiceAttempts',
  practicePhase: 'session.practicePhase',
  teachingPlan: 'session.teachingPlan',
  /* kb */
  kbNodes: 'kb.kbNodes',
  currentNode: 'kb.currentNode',
  mistakes: 'kb.mistakes',
  boundariesHistory: 'kb.boundariesHistory',
  boundariesSavedAt: 'kb.boundariesSavedAt',
  mistakeFilter: 'kb.mistakeFilter',
  /* search */
  searchContext: 'search.context',
  searchResults: 'search.results',
  searchContextAt: 'search.contextAt',
  searchContextCount: 'search.contextCount',
  searchContextQuery: 'search.contextQuery',
  searchContextError: 'search.error',
  /* call */
  lastCallSource: 'call.source',
  lastCallError: 'call.error',
  /* ui */
  _userScrolledAway: 'ui._userScrolledAway',
  _examInView: 'ui._examInView',
  /* exam */
  examCancel: 'exam.cancel',
  examQuestions: 'exam.questions',
  examAnswers: 'exam.answers',
  examSubmitted: 'exam.submitted',
  examTopic: 'exam.topic',
  examCount: 'exam.count',
  _examScrollBound: 'exam._examScrollBound',
  examReadOnly: 'exam.readOnly',
  examLang: 'exam.lang',
  examDifficulty: 'exam.difficulty',
  examInstructions: 'exam.instructions',
  examTypes: 'exam.types',
  _examPrevActiveId: 'exam._examPrevActiveId',
};

/* ─── Raw state tree ─── */

const rawState: AppState = {
  session: {
    topic: '', phase: 'topic', diagIndex: 0, diagAnswers: [], diagQuestions: [],
    currentSessionId: null, substantiveCount: 0, explaining: false,
    sessionTitle: null, domain: null,
    totalQ: 0, stuckCount: 0,
    messages: [],
    currentProjectId: null,
    activeProjectFilter: null,
    teachingStage: 'motivate',
    currentExampleIdx: 0,
    practiceAttempts: 0,
    practicePhase: 'foundation',
    teachingPlan: null,
    stuckCheckOffered: false,
    stuckCheckRejected: 0,
    fourOptionDialog: null,
    diagCancel: false,
  },
  kb: {
    kbNodes: [], currentNode: 0, mistakes: [],
    boundariesHistory: [], boundariesSavedAt: 0, mistakeFilter: 'all',
  },
  search: {
    context: null, results: [], contextAt: 0, contextCount: 0,
    contextQuery: null, error: null,
  },
  call: { source: null, error: null },
  ui: { _userScrolledAway: false, _examInView: false },
  exam: {
    cancel: false, questions: [], answers: {}, submitted: false,
    topic: '', count: 0, _examScrollBound: false, readOnly: false,
    lang: '', difficulty: 'intermediate', instructions: '', types: [],
    _examPrevActiveId: null,
  },
  tutorAttachments: null,
  tutorPartsTemplate: null,
};

/* ─── Proxy construction ─── */

function resolve(path: string): unknown {
  const parts = path.split('.');
  let cur: Record<string, unknown> | unknown = rawState;
  for (let i = 0; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[parts[i]];
  }
  return cur;
}

function setByPath(path: string, value: unknown): void {
  const parts = path.split('.');
  let cur: Record<string, unknown> = rawState as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

/* Unchecked cast so Proxy handler can use Reflect methods
   on a structured object. The handler only accesses known keys. */
const dict = rawState as unknown as Record<string, unknown>;

/** The Proxy-wrapped state. Import this and use directly. */
export const state: AppState = new Proxy<AppState>(rawState, {
  get(_target: AppState, prop: string | symbol): unknown {
    if (typeof prop !== 'string') return Reflect.get(dict, prop);
    if (prop in rawState) return Reflect.get(dict, prop);
    if (Object.prototype.hasOwnProperty.call(STATE_FLAT_TO_NS, prop)) {
      return resolve(STATE_FLAT_TO_NS[prop]);
    }
    return undefined;
  },

  set(_target: AppState, prop: string | symbol, value: unknown): boolean {
    if (typeof prop !== 'string') return Reflect.set(dict, prop, value);
    if (prop in rawState) return Reflect.set(dict, prop, value);
    if (Object.prototype.hasOwnProperty.call(STATE_FLAT_TO_NS, prop)) {
      setByPath(STATE_FLAT_TO_NS[prop], value);
      return true;
    }
    /* Unknown property — set on the root target so we don't
       lose data, and warn. This preserves the previous
       behaviour of `state.foo = bar` silently working. */
    console.warn('[state] unknown flat key, setting on root:', prop);
    dict[prop] = value;
    return true;
  },

  deleteProperty(_target: AppState, prop: string | symbol): boolean {
    if (typeof prop !== 'string') return Reflect.deleteProperty(rawState, prop);
    if (Object.prototype.hasOwnProperty.call(STATE_FLAT_TO_NS, prop)) {
      const path = STATE_FLAT_TO_NS[prop].split('.');
      let cur: Record<string, unknown> = rawState as unknown as Record<string, unknown>;
      for (let i = 0; i < path.length - 1; i++) {
        if (cur[path[i]] == null) return true;
        cur = cur[path[i]] as Record<string, unknown>;
      }
      delete cur[path[path.length - 1]];
      return true;
    }
    return true;
  },

  has(_target: AppState, prop: string | symbol): boolean {
    if (typeof prop !== 'string') return Reflect.has(rawState, prop);
    if (prop in rawState) return true;
    return Object.prototype.hasOwnProperty.call(STATE_FLAT_TO_NS, prop);
  },

  ownKeys(_target: AppState): (string | symbol)[] {
    return Array.from(new Set([
      ...Reflect.ownKeys(rawState),
      ...Object.keys(STATE_FLAT_TO_NS),
    ]));
  },

  getOwnPropertyDescriptor(
    _target: AppState, prop: string | symbol
  ): PropertyDescriptor | undefined {
    if (typeof prop !== 'string') return Reflect.getOwnPropertyDescriptor(rawState, prop);
    if (prop in rawState) return Reflect.getOwnPropertyDescriptor(rawState, prop);
    if (Object.prototype.hasOwnProperty.call(STATE_FLAT_TO_NS, prop)) {
      const path = STATE_FLAT_TO_NS[prop];
      const val = resolve(path);
      return {
        configurable: true,
        enumerable: true,
        get: () => resolve(path),
        set: (v: unknown) => setByPath(path, v),
      };
    }
    return undefined;
  },
});

/* ─── resetState — reset all namespaces to defaults ─── */
export function resetState(): void {
  state.session.topic = '';
  state.session.phase = 'topic';
  state.session.diagIndex = 0;
  state.session.diagAnswers = [];
  state.session.diagQuestions = [];
  state.session.currentSessionId = null;
  state.session.substantiveCount = 0;
  state.session.explaining = false;
  state.session.sessionTitle = null;
  state.session.domain = null;
  state.session.totalQ = 0;
  state.session.stuckCount = 0;
  state.session.messages = [];
  state.session.currentProjectId = null;
  state.session.activeProjectFilter = null;
  state.session.teachingStage = 'motivate';
  state.session.currentExampleIdx = 0;
  state.session.practiceAttempts = 0;
  state.session.practicePhase = 'foundation';
  state.session.teachingPlan = null;
  state.session.stuckCheckOffered = false;
  state.session.stuckCheckRejected = 0;
  state.session.fourOptionDialog = null;
  state.session.diagCancel = false;
  state.kb.kbNodes = [];
  state.kb.currentNode = 0;
  state.kb.mistakes = [];
  state.kb.boundariesHistory = [];
  state.kb.boundariesSavedAt = 0;
  state.kb.mistakeFilter = 'all';
  state.search.context = null;
  state.search.results = [];
  state.search.contextAt = 0;
  state.search.contextCount = 0;
  state.search.contextQuery = null;
  state.search.error = null;
  state.call.source = null;
  state.call.error = null;
  state.ui._userScrolledAway = false;
  /* Clear exam-mode fields so a fresh session doesn't inherit stale
     topic / language / difficulty / instructions / types from a prior
     exam. */
  try { state.exam.cancel = false; } catch (_) { /* ignore */ }
  try { state.exam.questions = []; } catch (_) { /* ignore */ }
  try { state.exam.answers = {}; } catch (_) { /* ignore */ }
  try { state.exam.submitted = false; } catch (_) { /* ignore */ }
  try { state.exam.topic = ''; } catch (_) { /* ignore */ }
  try { state.exam.count = 0; } catch (_) { /* ignore */ }
  try { state.exam.readOnly = false; } catch (_) { /* ignore */ }
  try { state.exam.lang = ''; } catch (_) { /* ignore */ }
  try { state.exam.difficulty = 'intermediate'; } catch (_) { /* ignore */ }
  try { state.exam.instructions = ''; } catch (_) { /* ignore */ }
  try { state.exam.types = []; } catch (_) { /* ignore */ }
  /* P_dup-session — also clear the top-level mirror so a follow-up
     call to saveCurrentSession doesn't read a stale id. */
  try {
    if (typeof (window as any).setCurrentSessionId === 'function') {
      (window as any).setCurrentSessionId(null);
    } else if ('currentSessionId' in state) {
      (state as any).currentSessionId = null;
    }
  } catch (_) { /* ignore */ }
}
