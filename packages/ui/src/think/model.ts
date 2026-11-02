/**
 * RN-4 — pure model for the question chain ("Think out loud") and the five
 * learning modes. DOM-free and React-free so the web shell, apps/socrates
 * and the node:test suite share one source of truth.
 */

/** One node on the chain: a question the learner has followed. */
export interface ChainStep {
  id: string;
  text: string;
  /**
   * RN-14: `own` marks a question the learner typed themselves (shown as
   * "You asked"); absent means the root or a question followed from the
   * chain's suggestions.
   */
  origin?: 'own';
}

/** A question the learner can follow next. `mistake` candidates come from the mistake book. */
export interface ChainCandidate {
  id: string;
  text: string;
  kind: 'ask' | 'mistake';
}

export interface ChainState {
  /** Session the chain belongs to; a different session starts a new chain. */
  sessionKey: string | null;
  steps: readonly ChainStep[];
}

export const EMPTY_CHAIN: ChainState = Object.freeze({ sessionKey: null, steps: Object.freeze([]) as readonly ChainStep[] });

/** Longest text a node keeps; the transcript holds the full question. */
export const CHAIN_TEXT_LIMIT = 140;

export function normalizeChainText(text: string, limit = CHAIN_TEXT_LIMIT): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit - 1).trimEnd()}…`;
}

/** Bind the chain to `sessionKey`, starting it from `root` when the session changed or the chain is empty. */
export function seedChain(state: ChainState, sessionKey: string | null, root: string | null | undefined): ChainState {
  const text = root ? normalizeChainText(root) : '';
  if (state.sessionKey === sessionKey && state.steps.length > 0) return state;
  if (state.sessionKey !== sessionKey) {
    return { sessionKey, steps: text ? [{ id: 'root', text }] : [] };
  }
  return text ? { sessionKey, steps: [{ id: 'root', text }] } : state;
}

/** Follow `text` one step further down the chain. Repeating the current question is a no-op. */
export function appendChainStep(state: ChainState, text: string): ChainState {
  const clean = normalizeChainText(text);
  if (!clean) return state;
  const last = state.steps[state.steps.length - 1];
  if (last && last.text === clean) return state;
  return { sessionKey: state.sessionKey, steps: [...state.steps, { id: `s${state.steps.length}`, text: clean }] };
}

/**
 * RN-14: whether a message the learner typed reads as a question. In tutor
 * mode most learner messages are answers to the tutor, so only text that
 * asks something joins the chain: a question mark (either width), a
 * leading interrogative, or a Chinese sentence-final question particle.
 */
const ZH_LEADING = /^(为什么|为何|怎么|怎样|如何|什么|哪|是否|能否|可否|能不能|可不可以|是不是|有没有|会不会|要不要|该不该)/;
const ZH_TRAILING = /[吗呢么][。.!！~～\s]*$/;
const EN_LEADING = /^(why|how|what|when|where|which|who|whom|whose|is|are|was|were|can|could|does|do|did|should|would|will|shall|may|might|isn't|aren't|doesn't|don't|didn't)\b/i;

export function looksLikeQuestion(text: string): boolean {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (Array.from(flat).length < 2) return false;
  if (/[?？]/.test(flat)) return true;
  return ZH_LEADING.test(flat) || ZH_TRAILING.test(flat) || EN_LEADING.test(flat);
}

/**
 * RN-14: a question the learner typed joins the chain as an `own` step.
 * Anything already on the chain (the root is often the first message)
 * is not added twice.
 */
export function appendOwnQuestion(state: ChainState, text: string): ChainState {
  const clean = normalizeChainText(text);
  if (!clean || state.steps.some((step) => step.text === clean)) return state;
  return { sessionKey: state.sessionKey, steps: [...state.steps, { id: `s${state.steps.length}`, text: clean, origin: 'own' }] };
}

export interface ChainView {
  /** Steps already walked, oldest first (excludes the current one). */
  walked: readonly (ChainStep & { index: number })[];
  /** Walked steps folded away when the chain is collapsed. */
  hiddenCount: number;
  current: (ChainStep & { index: number }) | null;
  /** 1-based number the next question would get. */
  nextIndex: number;
}

/**
 * Split the chain for display. Collapsed, the walked part keeps the root and
 * the step just before the current one; everything between folds into a
 * count the learner can expand.
 */
export function chainView(steps: readonly ChainStep[], expanded: boolean): ChainView {
  const numbered = steps.map((step, index) => ({ ...step, index: index + 1 }));
  const current = numbered.length > 0 ? numbered[numbered.length - 1] : null;
  const walked = numbered.slice(0, -1);
  if (expanded || walked.length <= 2) {
    return { walked, hiddenCount: 0, current, nextIndex: numbered.length + 1 };
  }
  return {
    walked: [walked[0], walked[walked.length - 1]],
    hiddenCount: walked.length - 2,
    current,
    nextIndex: numbered.length + 1,
  };
}

/** Zero-padded node label, matching the home starter cards ("01"). */
export function chainNodeLabel(index: number): string {
  return String(index).padStart(2, '0');
}

/* ── Learning modes ──────────────────────────────────────────────────── */

export type LearningModeId = 'think' | 'recall' | 'connect' | 'diagnose' | 'mistakes';

/**
 * What a mode does in the host, as data so every host wires it the same way.
 * No action carries copy: the mode id rides on every tutor turn and the
 * server-owned prompt for it decides what the model writes (RN-6).
 *  - `chain`       keeps the question chain under the reply (no extra request);
 *  - `turn`        runs one tutor turn in this mode right away (recall cards);
 *  - `panel`       opens a tutor side panel; `refresh: 'concepts'` also asks
 *                  the model to add or update the map's definitions and links;
 *  - `diagnostic`  runs a fresh formal diagnostic inside the session.
 * On the landing page there is no session yet, so `homeAction` can differ.
 */
export type LearningModeAction =
  | { kind: 'chain' }
  | { kind: 'turn' }
  | { kind: 'panel'; panel: 'knowledge' | 'mistakes'; refresh?: 'concepts' }
  | { kind: 'diagnostic' };

export interface LearningModeSpec {
  id: LearningModeId;
  labelKey: string;
  hintKey: string;
  homeAction: LearningModeAction;
  sessionAction: LearningModeAction;
  /** Whether chain candidates come from the mistake book in this mode. */
  candidatesFromMistakes: boolean;
}

export const LEARNING_MODES: readonly LearningModeSpec[] = Object.freeze([
  {
    id: 'think',
    labelKey: 'learnMode.think.label',
    hintKey: 'learnMode.think.hint',
    homeAction: { kind: 'chain' },
    sessionAction: { kind: 'chain' },
    candidatesFromMistakes: false,
  },
  {
    id: 'recall',
    labelKey: 'learnMode.recall.label',
    hintKey: 'learnMode.recall.hint',
    homeAction: { kind: 'chain' },
    sessionAction: { kind: 'turn' },
    candidatesFromMistakes: false,
  },
  {
    id: 'connect',
    labelKey: 'learnMode.connect.label',
    hintKey: 'learnMode.connect.hint',
    homeAction: { kind: 'chain' },
    sessionAction: { kind: 'panel', panel: 'knowledge', refresh: 'concepts' },
    candidatesFromMistakes: false,
  },
  {
    id: 'diagnose',
    labelKey: 'learnMode.diagnose.label',
    hintKey: 'learnMode.diagnose.hint',
    homeAction: { kind: 'chain' },
    sessionAction: { kind: 'diagnostic' },
    candidatesFromMistakes: false,
  },
  {
    id: 'mistakes',
    labelKey: 'learnMode.mistakes.label',
    hintKey: 'learnMode.mistakes.hint',
    homeAction: { kind: 'panel', panel: 'mistakes' },
    sessionAction: { kind: 'panel', panel: 'mistakes' },
    candidatesFromMistakes: true,
  },
] as LearningModeSpec[]);

export const DEFAULT_LEARNING_MODE: LearningModeId = 'think';

export function isLearningModeId(value: unknown): value is LearningModeId {
  return typeof value === 'string' && LEARNING_MODES.some((mode) => mode.id === value);
}

export function learningModeSpec(id: LearningModeId): LearningModeSpec {
  return LEARNING_MODES.find((mode) => mode.id === id) ?? LEARNING_MODES[0];
}

export function learningModeAction(id: LearningModeId, surface: 'home' | 'session'): LearningModeAction {
  const spec = learningModeSpec(id);
  return surface === 'home' ? spec.homeAction : spec.sessionAction;
}

/** Roving selection for the segmented control (arrow keys wrap). */
export function stepLearningMode(id: LearningModeId, delta: 1 | -1): LearningModeId {
  const index = LEARNING_MODES.findIndex((mode) => mode.id === id);
  const next = (Math.max(0, index) + delta + LEARNING_MODES.length) % LEARNING_MODES.length;
  return LEARNING_MODES[next].id;
}

/** Unresolved mistakes become the next questions on the chain, newest first. */
export function mistakeCandidates(
  mistakes: readonly { id: string; q: string; resolved?: boolean; timestamp?: number }[],
  limit = 3,
): ChainCandidate[] {
  return mistakes
    .filter((mistake) => !mistake.resolved && mistake.q.trim())
    .slice()
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, limit)
    .map((mistake) => ({ id: `mistake:${mistake.id}`, text: normalizeChainText(mistake.q), kind: 'mistake' as const }));
}

/**
 * Prompts as next questions, minus any already on the chain. When every
 * prompt has been followed, they are all offered again rather than none.
 */
export function askCandidates(prompts: readonly string[], walked: readonly ChainStep[] = []): ChainCandidate[] {
  const onChain = new Set(walked.map((step) => step.text));
  const fresh = prompts.filter((prompt) => !onChain.has(normalizeChainText(prompt)));
  return dedupeAsk(fresh.length > 0 ? fresh : prompts);
}

function dedupeAsk(prompts: readonly string[]): ChainCandidate[] {
  const seen = new Set<string>();
  const out: ChainCandidate[] = [];
  for (const prompt of prompts) {
    const text = normalizeChainText(prompt);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({ id: `ask:${out.length}`, text, kind: 'ask' });
  }
  return out;
}
