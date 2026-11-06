/**
 * RN-3 learning scaffolds — DOM-free parsing and state for the ten tutor
 * scaffolds (quiz, flashcard, practice, example, step, definition, theorem,
 * proof, derivation, key-point).
 *
 * The parsers are the canonical copies of the web shell's widget parsers
 * (`frontend/src/render/widgetParsers.ts` re-exports them). Field values stay
 * raw markdown with entities decoded, so the host can run them through its
 * own markdown + KaTeX renderer. Optional extensions (several <hint> levels,
 * multi-answer quizzes, a quiz <explain>) only add keys when present, so the
 * historical parse shapes are unchanged.
 *
 * The reducers are pure: components keep them in `useReducer`, tests drive
 * them directly, and the host owns every side effect (grading, reporting).
 */
import { decodeEntities, stripTags } from '../scaffoldText.ts';
import { markdownCodeRanges } from './markdownCode.ts';
export { stripTags };
export { evaluatePracticeAnswer, type PracticeAnswerAssessment } from './practiceAnswer.ts';

export const SCAFFOLD_KINDS = [
  'quiz', 'flashcard', 'practice', 'example', 'step',
  'definition', 'theorem', 'proof', 'derivation', 'key-point',
] as const;
export type ScaffoldKind = typeof SCAFFOLD_KINDS[number];

export function isScaffoldKind(value: string): value is ScaffoldKind {
  return (SCAFFOLD_KINDS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Field helpers                                                       */
/* ------------------------------------------------------------------ */

function escapeTag(tag: string): string {
  return tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ScaffoldFieldMatch {
  attrs: string;
  inner: string;
  start: number;
  end: number;
}

/** Same-tag fields outside Markdown code, in source order. */
export function fieldMatches(
  inner: string,
  tag: string,
  includeTrailingPartial = false,
): ScaffoldFieldMatch[] {
  const source = String(inner || '');
  const pattern = new RegExp('<(/?)' + escapeTag(tag) + '\\b([^>]*)>', 'gi');
  const codeRanges = markdownCodeRanges(source);
  const stack: Array<{ attrs: string; start: number; contentStart: number }> = [];
  const candidates: ScaffoldFieldMatch[] = [];
  let codeIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    while (codeIndex < codeRanges.length && codeRanges[codeIndex].end <= match.index) codeIndex += 1;
    const codeRange = codeRanges[codeIndex];
    if (codeRange && codeRange.start <= match.index && codeRange.end > match.index) continue;

    if (!match[1]) {
      stack.push({
        attrs: match[2],
        start: match.index,
        contentStart: pattern.lastIndex,
      });
      continue;
    }

    const open = stack.pop();
    if (!open) continue;
    candidates.push({
      attrs: open.attrs,
      inner: source.slice(open.contentStart, match.index),
      start: open.start,
      end: pattern.lastIndex,
    });
  }

  if (includeTrailingPartial) {
    for (const open of stack) {
      candidates.push({
        attrs: open.attrs,
        inner: source.slice(open.contentStart),
        start: open.start,
        end: source.length,
      });
    }
  }

  candidates.sort((left, right) => left.start - right.start);
  const fields: ScaffoldFieldMatch[] = [];
  let consumedUntil = -1;
  for (const candidate of candidates) {
    if (candidate.start < consumedUntil) continue;
    fields.push(candidate);
    consumedUntil = candidate.end;
  }
  return fields;
}

/** Body of the first complete field (or a trailing partial field when requested). */
export function fieldOf(inner: string, tag: string, includeTrailingPartial = false): string | null {
  const match = fieldMatches(inner, tag, includeTrailingPartial)[0];
  return match ? decodeEntities(match.inner.trim()) : null;
}

/** Bodies of every complete `<tag>…</tag>`, in order. Empty bodies are skipped. */
export function fieldsOf(inner: string, tag: string): string[] {
  const out: string[] = [];
  for (const match of fieldMatches(inner, tag)) {
    const value = decodeEntities(match.inner.trim());
    if (value) out.push(value);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Answer keys                                                         */
/* ------------------------------------------------------------------ */

const OPTION_LETTER = /^[A-H]$/;

/** "A", "a", "A,C", "AC", "A、C", "A and C" → sorted unique letters. */
export function parseAnswerKey(raw: string | null | undefined): string[] {
  const text = String(raw ?? '').toUpperCase();
  const letters = new Set<string>();
  for (const token of text.split(/[\s,，、;；/|&]+|AND/)) {
    if (!token) continue;
    if (/^[A-H]+$/.test(token)) token.split('').forEach((letter) => letters.add(letter));
  }
  return Array.from(letters).filter((letter) => OPTION_LETTER.test(letter)).sort();
}

/** Display form of a key: "A" or "A, C". */
export function formatAnswerKey(letters: readonly string[], separator = ', '): string {
  return letters.join(separator);
}

export function sameAnswer(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((letter, index) => letter === right[index]);
}

/* ------------------------------------------------------------------ */
/* Parsers                                                             */
/* ------------------------------------------------------------------ */

export interface QuizOption {
  letter: string;
  text: string;
}

export interface ParsedQuiz {
  q: string;
  options: QuizOption[];
  /** Answer key as written: one letter ("A") or several ("AC"); null when absent. */
  correct: string | null;
  slotId?: string | null;
  /** Present (true) only for a multi-answer quiz. */
  multi?: boolean;
  /** Optional worked explanation (`<explain>` / `<explanation>`), raw markdown. */
  explanation?: string;
}

/** Parse the inner XML of a <quiz> block. `attrs` is the opening tag's attribute text. */
export function parseQuizInner(inner: string, attrs = ''): ParsedQuiz | null {
  const question = fieldOf(inner, 'q');
  if (question === null) return null;
  const q = stripTags(question.trim());
  const options = fieldMatches(inner, 'o').flatMap((match): QuizOption[] => {
    const letter = match.attrs.match(/\bletter\s*=\s*["']([A-Ha-h])["']/i)?.[1];
    return letter
      ? [{ letter: letter.toUpperCase(), text: stripTags(decodeEntities(match.inner.trim())) }]
      : [];
  });
  if (options.length < 2) return null;
  const letters = new Set(options.map((option) => option.letter));
  const key = fieldsOf(inner, 'correct').flatMap((value) => parseAnswerKey(value)).filter((letter) => letters.has(letter));
  const unique = Array.from(new Set(key)).sort();
  const parsed: ParsedQuiz = { q, options, correct: unique.length ? unique.join('') : null };
  if (unique.length > 1 || /\b(?:multi|multiple)\b|\btype\s*=\s*["'](?:multi|multiple)["']/i.test(attrs)) parsed.multi = true;
  const explanation = fieldOf(inner, 'explain') ?? fieldOf(inner, 'explanation');
  if (explanation) parsed.explanation = explanation;
  return parsed;
}

export interface ParsedExample {
  title: string;
  problem: string;
  solution: string;
  _revealed?: boolean;
  /** Present only when the example carries <hint> levels. */
  hints?: string[];
}

export function parseExampleInner(inner: string): ParsedExample | null {
  const title = fieldOf(inner, 'title');
  const problem = fieldOf(inner, 'problem');
  const solution = fieldOf(inner, 'solution');
  if (problem === null && solution === null) return null;
  const parsed: ParsedExample = { title: title ?? 'Example', problem: problem ?? '', solution: solution ?? '' };
  const hints = fieldsOf(inner, 'hint');
  if (hints.length) parsed.hints = hints;
  return parsed;
}

export interface ParsedPractice {
  title: string;
  problem: string;
  /** First hint (historical single-hint field). */
  hint: string;
  /** Present only when the block carries more than one <hint> level. */
  hints?: string[];
  /** Optional worked solution, raw markdown. */
  solution?: string;
  /** The answer key, when the opening tag declares `correct="…"`. */
  correct?: string | null;
}

export function parsePracticeInner(inner: string, correct?: string | null): ParsedPractice | null {
  const problem = fieldOf(inner, 'problem');
  if (problem === null) return null;
  const hints = fieldsOf(inner, 'hint');
  const parsed: ParsedPractice = {
    title: fieldOf(inner, 'title') ?? 'Practice',
    problem,
    hint: hints[0] ?? (fieldOf(inner, 'hint') ?? ''),
  };
  if (hints.length > 1) parsed.hints = hints;
  const solution = fieldOf(inner, 'solution');
  if (solution) parsed.solution = solution;
  if (correct) parsed.correct = correct;
  return parsed;
}

/** Every hint level of a practice/example, in reveal order. */
export function hintLevels(parsed: { hint?: string; hints?: string[] }): string[] {
  if (parsed.hints && parsed.hints.length) return parsed.hints;
  return parsed.hint ? [parsed.hint] : [];
}

export interface ParsedDefinition { term: string; body: string }

export function parseDefinitionInner(inner: string): ParsedDefinition | null {
  const term = fieldOf(inner, 'term');
  const body = fieldOf(inner, 'body');
  if (term === null && body === null) return null;
  return { term: term ?? '', body: body ?? '' };
}

export interface ParsedFlashcard { front: string; back: string }

export function parseFlashcardInner(inner: string): ParsedFlashcard | null {
  const front = fieldOf(inner, 'front');
  const back = fieldOf(inner, 'back');
  if (front === null && back === null) return null;
  return { front: front ?? '', back: back ?? '' };
}

export interface ParsedTheorem {
  title: string;
  statement: string;
  /** A proof written inside the theorem, folded into the theorem card. */
  proofTitle?: string;
  proofBody?: string;
}

export function parseTheoremInner(inner: string): ParsedTheorem | null {
  const statement = fieldOf(inner, 'statement');
  if (statement === null) return null;
  return { title: fieldOf(inner, 'title') ?? '', statement };
}

export interface ParsedProof { title: string; body: string }

export function parseProofInner(inner: string): ParsedProof | null {
  const body = fieldOf(inner, 'body');
  if (body === null) return null;
  return { title: fieldOf(inner, 'title') ?? '', body };
}

export interface ParsedDerivation { title: string; body: string }

export function parseDerivationInner(inner: string): ParsedDerivation | null {
  const body = fieldOf(inner, 'body');
  if (body === null) return null;
  return { title: fieldOf(inner, 'title') ?? '', body };
}

export interface ParsedKeyPoint { body: string }

export function parseKeyPointInner(inner: string): ParsedKeyPoint | null {
  const body = decodeEntities(inner.trim());
  return body ? { body } : null;
}

/* ------------------------------------------------------------------ */
/* Derivation steps and proof ending                                   */
/* ------------------------------------------------------------------ */

const CONTINUATION = /^\s*\$*\s*(?:=|≈|≤|≥|<|>|⇒|⟹|→|∴|\\Rightarrow|\\implies|\\Longrightarrow|\\therefore)/;

/**
 * Split a derivation body into numbered steps without breaking math:
 * paragraphs (blank-line separated) are steps; a single paragraph is split
 * at lines that continue the chain (`= …`, `⇒ …`). `$$…$$` blocks are never
 * split. Returns at least one step for a non-empty body.
 */
export function splitDerivationSteps(body: string): string[] {
  const text = String(body || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let inDisplayMath = false;
  const flush = () => {
    const value = current.join('\n').trim();
    if (value) blocks.push(value);
    current = [];
  };
  for (const line of lines) {
    const fences = (line.match(/\$\$/g) || []).length;
    if (!inDisplayMath && !line.trim()) {
      flush();
      continue;
    }
    current.push(line);
    if (fences % 2 === 1) inDisplayMath = !inDisplayMath;
  }
  flush();
  if (blocks.length > 1) return blocks;
  /* One paragraph: split on chain continuations outside display math. */
  const steps: string[] = [];
  let step: string[] = [];
  inDisplayMath = false;
  for (const line of lines) {
    if (!inDisplayMath && step.length && CONTINUATION.test(line)) {
      steps.push(step.join('\n').trim());
      step = [];
    }
    step.push(line);
    if (((line.match(/\$\$/g) || []).length) % 2 === 1) inDisplayMath = !inDisplayMath;
  }
  if (step.length) steps.push(step.join('\n').trim());
  return steps.filter(Boolean);
}

const QED = /(?:∎|□|■|\\blacksquare|\\square|\\qed|\bQ\.?E\.?D\.?)\s*\$*\s*$/i;

/** True when a proof body does not already close with a QED mark. */
export function proofNeedsQed(body: string): boolean {
  return !QED.test(String(body || '').trim());
}

/* ------------------------------------------------------------------ */
/* Streaming readiness                                                 */
/* ------------------------------------------------------------------ */

export type ScaffoldReadiness = 'empty' | 'partial' | 'complete';

/**
 * Whether a streamed scaffold has everything its interactive widget needs.
 * `closed` is whether the closing tag has arrived. Interactive widgets mount
 * only on `complete`; until then the host keeps the static preview.
 */
export function scaffoldReadiness(kind: string, inner: string, closed: boolean): ScaffoldReadiness {
  const source = String(inner || '');
  if (!source.trim()) return 'empty';
  if (!closed) return 'partial';
  switch (kind) {
    case 'quiz': return parseQuizInner(source) ? 'complete' : 'partial';
    case 'practice': return parsePracticeInner(source) ? 'complete' : 'partial';
    case 'example': return parseExampleInner(source) ? 'complete' : 'partial';
    case 'flashcard': return parseFlashcardInner(source) ? 'complete' : 'partial';
    case 'definition': return parseDefinitionInner(source) ? 'complete' : 'partial';
    case 'theorem': return parseTheoremInner(source) ? 'complete' : 'partial';
    case 'proof': return parseProofInner(source) ? 'complete' : 'partial';
    case 'derivation': return parseDerivationInner(source) ? 'complete' : 'partial';
    default: return 'complete';
  }
}

/* ------------------------------------------------------------------ */
/* Quiz state                                                          */
/* ------------------------------------------------------------------ */

export type QuizVerdict = 'correct' | 'incorrect' | 'recorded';
export type QuizPhase = 'choosing' | 'pending' | 'answered';

export interface QuizState {
  readonly selected: readonly string[];
  readonly phase: QuizPhase;
  readonly verdict: QuizVerdict | null;
  /** Feedback line returned by the host for the last submission. */
  readonly feedback: string;
  readonly attempts: number;
}

export type QuizAction =
  | { type: 'toggle'; letter: string; multi: boolean }
  | { type: 'submit' }
  | { type: 'resolve'; verdict: QuizVerdict; feedback: string }
  | { type: 'fail' }
  | { type: 'retry' };

export const initialQuizState: QuizState = { selected: [], phase: 'choosing', verdict: null, feedback: '', attempts: 0 };

export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'toggle': {
      if (state.phase !== 'choosing') return state;
      const letter = action.letter.toUpperCase();
      if (!action.multi) return { ...state, selected: state.selected[0] === letter ? [] : [letter] };
      const selected = state.selected.includes(letter)
        ? state.selected.filter((value) => value !== letter)
        : [...state.selected, letter].sort();
      return { ...state, selected };
    }
    case 'submit':
      return state.phase === 'choosing' && state.selected.length ? { ...state, phase: 'pending' } : state;
    case 'resolve':
      return state.phase === 'pending'
        ? { ...state, phase: 'answered', verdict: action.verdict, feedback: action.feedback, attempts: state.attempts + 1 }
        : state;
    case 'fail':
      return state.phase === 'pending' ? { ...state, phase: 'choosing' } : state;
    case 'retry':
      return state.phase === 'answered' && state.verdict === 'incorrect'
        ? { ...state, phase: 'choosing', selected: [], verdict: null, feedback: '' }
        : state;
    default:
      return state;
  }
}

/** Grade a selection against a key; without a key the pick is only recorded. */
export function gradeQuiz(selected: readonly string[], key: readonly string[]): QuizVerdict {
  if (!key.length) return 'recorded';
  return sameAnswer(selected, key) ? 'correct' : 'incorrect';
}

export type QuizOptionMark = 'idle' | 'selected' | 'correct' | 'incorrect' | 'missed' | 'muted';

/**
 * How an option reads. While choosing: idle / selected. After grading:
 * a picked right answer is `correct`, a picked wrong one `incorrect`, an
 * unpicked right one `missed`, everything else `muted`.
 */
export function quizOptionMark(letter: string, state: QuizState, key: readonly string[]): QuizOptionMark {
  const picked = state.selected.includes(letter);
  if (state.phase !== 'answered' || state.verdict === 'recorded' || !key.length) return picked ? 'selected' : (state.phase === 'answered' ? 'muted' : 'idle');
  const right = key.includes(letter);
  if (picked) return right ? 'correct' : 'incorrect';
  return right ? 'missed' : 'muted';
}

/* ------------------------------------------------------------------ */
/* Flashcard state                                                     */
/* ------------------------------------------------------------------ */

export type RecallRating = 'good' | 'fuzzy' | 'forgot';
export const RECALL_RATINGS: readonly RecallRating[] = ['good', 'fuzzy', 'forgot'];

export interface FlashcardState {
  readonly face: 'front' | 'back';
  readonly rating: RecallRating | null;
  readonly flips: number;
}

export type FlashcardAction = { type: 'flip' } | { type: 'rate'; rating: RecallRating } | { type: 'reset' };

export const initialFlashcardState: FlashcardState = { face: 'front', rating: null, flips: 0 };

/**
 * RN-14: the state a remounted card resumes from. A rating is only kept
 * with the answer side showing (a rating belongs to the back), and a
 * missing or malformed snapshot starts the card fresh.
 */
export function resumeFlashcardState(snapshot: Partial<FlashcardState> | null | undefined): FlashcardState {
  if (!snapshot) return initialFlashcardState;
  const face = snapshot.face === 'back' ? 'back' : 'front';
  const rating = snapshot.rating === 'good' || snapshot.rating === 'fuzzy' || snapshot.rating === 'forgot' ? snapshot.rating : null;
  const flips = typeof snapshot.flips === 'number' && snapshot.flips > 0 ? Math.floor(snapshot.flips) : (face === 'back' ? 1 : 0);
  return { face, rating: rating && (face === 'back' || flips > 0) ? rating : null, flips };
}

export function flashcardReducer(state: FlashcardState, action: FlashcardAction): FlashcardState {
  switch (action.type) {
    case 'flip':
      return { ...state, face: state.face === 'front' ? 'back' : 'front', flips: state.flips + 1 };
    case 'rate':
      /* A rating belongs to the answer side: it is only taken once the back was seen. */
      return state.face === 'back' || state.flips > 0 ? { ...state, rating: action.rating } : state;
    case 'reset':
      return initialFlashcardState;
    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/* Progressive reveal (hints, steps)                                    */
/* ------------------------------------------------------------------ */

export interface RevealState {
  readonly shown: number;
  readonly total: number;
}

export function revealState(total: number, shown = 0): RevealState {
  const safeTotal = Math.max(0, Math.floor(total));
  return { total: safeTotal, shown: Math.min(Math.max(0, Math.floor(shown)), safeTotal) };
}

export function revealNext(state: RevealState): RevealState {
  return { ...state, shown: Math.min(state.total, state.shown + 1) };
}

export function revealAll(state: RevealState): RevealState {
  return { ...state, shown: state.total };
}

export function revealNone(state: RevealState): RevealState {
  return { ...state, shown: 0 };
}

export function isFullyRevealed(state: RevealState): boolean {
  return state.shown >= state.total;
}

/** Replace `{n}` / `{total}` in a localized template. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return String(template).replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

export * from './review';
