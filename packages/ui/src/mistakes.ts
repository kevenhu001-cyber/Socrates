/** Mistake book (DOM-free). Ports the baseline `frontend/src/ui/mistakeBook.js`
 * workflow: the record shape stored in the session `mistakes` array, the
 * newest-first prepend, the redo counter, the quiz-slot conquer path and the
 * filter/badge reads. Hosts own storage (session save) and rendering.
 *
 * Record shape is the baseline one (`{ id, type, topic, node, nodeIdx, q,
 * options, correct, userAnswer, judgedAnswer, timestamp, redoCount,
 * quizSlotId }`) so a session saved by either client reads the same in the
 * other. Rows written by round 16-10 (server-table shape: `questionContent`
 * / `correctAnswer` / `source` / `isResolved` / `collectedAt`) are read
 * through `normalizeMistakes`. */

export interface BookMistakeOption {
  letter: string;
  text: string;
}

export interface BookMistake {
  id: string;
  /** Baseline enum: `quiz` | `practice`. */
  type: string;
  topic: string;
  node: string;
  nodeIdx: number | null;
  q: string;
  options: BookMistakeOption[];
  correct: string | null;
  userAnswer: string | null;
  judgedAnswer: string | null;
  /** Epoch ms. */
  timestamp: number;
  redoCount: number;
  /** Slot of the quiz card the mistake came from; a later correct pick on
   * that slot conquers (removes) every row carrying it. */
  quizSlotId: string | null;
  /** Server/legacy rows may carry a resolved flag (`resolved` or
   * `isResolved`); the baseline only reads it. */
  resolved?: boolean;
}

export type MistakeFilter = 'all' | 'unresolved' | 'resolved';

export interface RecordMistakeInput {
  type: 'quiz' | 'practice';
  q: string;
  options?: BookMistakeOption[];
  correct?: string | null;
  userAnswer?: string | null;
  judgedAnswer?: string | null;
  quizSlotId?: string | null;
}

export interface RecordMistakeContext {
  topic?: string | null;
  node?: string | null;
  nodeIdx?: number | null;
  now?: number;
  /** Deterministic id hook for tests. */
  id?: string;
}

export function mistakeId(now: number = Date.now()): string {
  return `m-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Baseline `recordMistake(rec)` row builder. */
export function createMistake(rec: RecordMistakeInput, ctx: RecordMistakeContext = {}): BookMistake {
  const now = ctx.now ?? Date.now();
  return {
    id: ctx.id || mistakeId(now),
    type: rec.type || 'quiz',
    topic: ctx.topic || '',
    node: ctx.node || '',
    nodeIdx: typeof ctx.nodeIdx === 'number' ? ctx.nodeIdx : null,
    q: rec.q,
    options: (rec.options || []).map((option) => ({ letter: option.letter, text: option.text })),
    correct: rec.correct || null,
    userAnswer: rec.userAnswer || null,
    judgedAnswer: rec.judgedAnswer || null,
    timestamp: now,
    redoCount: 0,
    quizSlotId: rec.quizSlotId || null,
  };
}

/** Wrong quiz pick with a declared answer → a row; anything else → null
 * (baseline `handleQuizPick`: `correct && !isRight`). */
export function quizMistakeFor(pick: { q: string; options: BookMistakeOption[]; picked: string; correct: string | null; slotId?: string | null }, ctx: RecordMistakeContext = {}): BookMistake | null {
  if (!pick.correct || pick.picked === pick.correct) return null;
  return createMistake({ type: 'quiz', q: pick.q, options: pick.options, correct: pick.correct, userAnswer: pick.picked, quizSlotId: pick.slotId || null }, ctx);
}

/** Self-checked wrong practice attempt → a row (baseline
 * `mountPracticeWidget`: only when `correct` is declared and the check
 * fails; undeclared answers are never judged). */
export function practiceMistakeFor(attempt: { problem: string; answer: string; correct: string | null; isRight: boolean | null }, ctx: RecordMistakeContext = {}): BookMistake | null {
  if (!attempt.correct || attempt.isRight !== false) return null;
  return createMistake({ type: 'practice', q: attempt.problem, options: [], correct: attempt.correct, userAnswer: attempt.answer, judgedAnswer: attempt.correct }, ctx);
}

/** Newest-first prepend shared with the baseline (`[mistake].concat(list)`). */
export function prependMistake(list: BookMistake[], mistake: BookMistake): BookMistake[] {
  return [mistake, ...list];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null;
}

function asTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** Reads the session `mistakes` JSON (baseline rows, round 16-10 rows, or
 * junk) into baseline-shaped rows. Unreadable entries are dropped. */
export function normalizeMistakes(raw: unknown): BookMistake[] {
  if (!Array.isArray(raw)) return [];
  const out: BookMistake[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const row = entry as Record<string, unknown>;
    const q = asString(row.q) ?? asString(row.questionContent) ?? '';
    const options = Array.isArray(row.options)
      ? (row.options as unknown[]).flatMap((option) => {
        if (!option || typeof option !== 'object') return [];
        const letter = asString((option as Record<string, unknown>).letter);
        const text = asString((option as Record<string, unknown>).text) ?? '';
        return letter ? [{ letter, text }] : [];
      })
      : [];
    const resolved = !!(row.resolved || row.isResolved);
    const mistake: BookMistake = {
      id: asString(row.id) || `m-legacy-${index}`,
      type: asString(row.type) ?? asString(row.source) ?? 'quiz',
      topic: asString(row.topic) ?? '',
      node: asString(row.node) ?? asString(row.nodeName) ?? '',
      nodeIdx: typeof row.nodeIdx === 'number' ? row.nodeIdx : null,
      q,
      options,
      correct: asString(row.correct) ?? asString(row.correctAnswer),
      userAnswer: asString(row.userAnswer),
      judgedAnswer: asString(row.judgedAnswer),
      timestamp: asTimestamp(row.timestamp ?? row.collectedAt),
      redoCount: typeof row.redoCount === 'number' && row.redoCount > 0 ? Math.floor(row.redoCount) : 0,
      quizSlotId: asString(row.quizSlotId),
    };
    if (resolved) mistake.resolved = true;
    out.push(mistake);
  });
  return out;
}

export function isMistakeResolved(mistake: BookMistake | { resolved?: unknown; isResolved?: unknown }): boolean {
  const row = mistake as { resolved?: unknown; isResolved?: unknown };
  return !!(row.resolved || row.isResolved);
}

/** Baseline `renderMistakes` filter pass (`mistakeFilter` state). */
export function filterMistakes(list: BookMistake[], filter: MistakeFilter): BookMistake[] {
  if (filter === 'unresolved') return list.filter((mistake) => !isMistakeResolved(mistake));
  if (filter === 'resolved') return list.filter((mistake) => isMistakeResolved(mistake));
  return list.slice();
}

/** Unresolved count is useful for filter/status reads, but the baseline tab
 * badge itself is the total mistake-book size (resolved rows included). */
export function unresolvedMistakeCount(list: Array<BookMistake | { resolved?: unknown; isResolved?: unknown }>): number {
  return list.filter((mistake) => !isMistakeResolved(mistake)).length;
}

/** Baseline `updateMistakesBadge`: show total rows, regardless of filter or
 * resolved state; empty means the badge is hidden (`.tab-badge:empty`). */
export function mistakesBadgeText(list: BookMistake[]): string {
  return list.length > 0 ? String(list.length) : '';
}

/** Which empty line the panel shows, or null when rows are visible. */
export function mistakesEmptyState(list: BookMistake[], filter: MistakeFilter): 'empty' | 'filterResolved' | 'filterOther' | null {
  if (!list.length) return 'empty';
  if (filterMistakes(list, filter).length) return null;
  return filter === 'resolved' ? 'filterResolved' : 'filterOther';
}

/** Baseline `handleMistakeRedo` first half: bump `redoCount` on the row.
 * Returns the new list and the updated row (null when the id is gone). */
export function bumpMistakeRedo(list: BookMistake[], id: string): { list: BookMistake[]; mistake: BookMistake | null } {
  let updated: BookMistake | null = null;
  const next = list.map((mistake) => {
    if (mistake.id !== id) return mistake;
    updated = { ...mistake, redoCount: (mistake.redoCount || 0) + 1 };
    return updated;
  });
  return { list: updated ? next : list, mistake: updated };
}

/** A redo re-mounted on a fresh slot re-points the row at it (baseline
 * `mistake.quizSlotId = parsed.slotId`). */
export function assignMistakeQuizSlot(list: BookMistake[], id: string, slotId: string): BookMistake[] {
  return list.map((mistake) => mistake.id === id ? { ...mistake, quizSlotId: slotId } : mistake);
}

/** Conquer path (baseline `removeMistakeForQuizSlot`): a correct pick on a
 * slot removes every row recorded against it. Returns the same array when
 * nothing matched so hosts can skip the save. */
export function removeMistakesForQuizSlot(list: BookMistake[], slotId: string | null | undefined): BookMistake[] {
  if (!slotId) return list;
  const remaining = list.filter((mistake) => mistake.quizSlotId !== slotId);
  return remaining.length === list.length ? list : remaining;
}

/** How a redo is mounted (baseline `handleMistakeRedo` second half):
 * practice rows (or rows without options) re-open the free-form practice
 * widget; quiz rows re-mount the quiz card. */
export type MistakeRedoPlan =
  | { kind: 'practice'; problem: string; correct: string | null }
  | { kind: 'quiz'; q: string; options: BookMistakeOption[]; correct: string | null; slotId: string | null };

export function mistakeRedoPlan(mistake: BookMistake): MistakeRedoPlan {
  const options = mistake.options || [];
  if (mistake.type === 'practice' || !options.length) {
    return { kind: 'practice', problem: mistake.q || '', correct: mistake.correct || null };
  }
  return {
    kind: 'quiz',
    q: mistake.q,
    options: options.map((option) => ({ letter: option.letter, text: option.text })),
    correct: mistake.correct,
    slotId: mistake.quizSlotId,
  };
}

/** Option tag in the card (baseline: `correct-tag` / `wrong-tag` / none). */
export function mistakeOptionTag(mistake: BookMistake, letter: string): 'correct' | 'wrong' | null {
  if (letter === mistake.correct) return 'correct';
  if (letter === mistake.userAnswer) return 'wrong';
  return null;
}

/** Baseline `formatRelativeTime` (ui/recentsHelpers.js) — English in both
 * locales, exactly as the SPA prints it in the card meta. */
export function formatMistakeTime(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(ts).toLocaleDateString();
}
