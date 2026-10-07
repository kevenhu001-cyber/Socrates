/* scaffolds — DOM-free parser for the tutor's interactive scaffold blocks
 * (`<quiz>` / `<practice>`), ported from the web baseline's
 * `render/widgetParsers.ts` + the replacement passes in
 * `render/assistantHtml.ts`:
 *
 * - only the FIRST quiz and the FIRST practice block in a message become
 *   interactive widgets; extras degrade to their question/problem text so
 *   they read as prose instead of mounting a second widget;
 * - an unparsable block falls back to a labeled plain-text segment;
 * - extraction is not fence-aware, matching the baseline regex passes.
 *
 * The host app owns widget behavior (stage transitions, synthetic sends);
 * this module only shapes the parsed segments. */

export interface QuizOption {
  letter: string;
  text: string;
}

export interface ParsedQuiz {
  q: string;
  options: QuizOption[];
  correct: string | null;
}

export interface ParsedPractice {
  title: string;
  problem: string;
  hint: string;
  /** From the optional `correct="…"` attribute on the opening tag. */
  correct: string | null;
}

export type ScaffoldSegment =
  | { kind: 'text'; text: string }
  | { kind: 'quiz'; quiz: ParsedQuiz }
  | { kind: 'practice'; practice: ParsedPractice }
  | { kind: 'fallback'; text: string };

const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&' };

export function decodeEntities(value: string): string {
  return String(value).replace(/&(lt|gt|quot|apos|amp);/g, (m) => ENTITIES[m] || m);
}

export function stripTags(value: string): string {
  return String(value).replace(/<[^>]+>/g, '');
}

/** Parse the inner XML of a `<quiz>` block into `{q, options, correct}`. */
export function parseQuizInner(inner: string): ParsedQuiz | null {
  const qMatch = inner.match(/<q>([\s\S]*?)<\/q>/i);
  if (!qMatch) return null;
  const q = stripTags(decodeEntities(qMatch[1].trim()));
  const options: QuizOption[] = [];
  const optRe = /<o\s+letter="([A-Da-d])"[^>]*>([\s\S]*?)<\/o>/gi;
  let m: RegExpExecArray | null;
  while ((m = optRe.exec(inner)) !== null) {
    options.push({ letter: m[1].toUpperCase(), text: stripTags(decodeEntities(m[2].trim())) });
  }
  if (options.length < 2) return null;
  const correct = inner.match(/<correct>([A-Da-d])<\/correct>/i);
  return { q, options, correct: correct ? correct[1].toUpperCase() : null };
}

/** Parse `<practice>…</practice>` inner. Fields stay as raw markdown
 * (entities decoded) so math survives into the widget's own renderer. */
export function parsePracticeInner(inner: string, correct?: string | null): ParsedPractice | null {
  const title = inner.match(/<title>([\s\S]*?)<\/title>/i);
  const problem = inner.match(/<problem>([\s\S]*?)<\/problem>/i);
  const hint = inner.match(/<hint>([\s\S]*?)<\/hint>/i);
  if (!problem) return null;
  return {
    title: title ? decodeEntities(title[1].trim()) : 'Practice',
    problem: decodeEntities(problem[1].trim()),
    hint: hint ? decodeEntities(hint[1].trim()) : '',
    correct: correct || null,
  };
}

/** Baseline self-check comparison: lowercase, drop whitespace + punctuation. */
export function practiceAnswerMatches(answer: string, correct: string): boolean {
  const normalize = (value: string) => String(value).toLowerCase().replace(/[\s.,;:!?()[\]'"]+/g, '').trim();
  return normalize(answer) === normalize(correct);
}

interface Block {
  start: number;
  end: number;
  segment: ScaffoldSegment;
}

function overlaps(block: Block, others: Block[]): boolean {
  return others.some((other) => block.start < other.end && other.start < block.end);
}

/** Split assistant text into prose runs and at most one quiz + one
 * practice widget. Never throws; malformed blocks become fallbacks. */
export function splitTutorScaffolds(text: string): ScaffoldSegment[] {
  const source = String(text || '');
  if (!/<(quiz|practice)\b/i.test(source)) return [{ kind: 'text', text: source }];
  const blocks: Block[] = [];

  // Pass 1 — quiz (mirrors the baseline: extras keep only the question stem).
  const quizRe = /<quiz\b[^>]*>([\s\S]*?)<\/quiz>/gi;
  let quizWidgets = 0;
  let m: RegExpExecArray | null;
  while ((m = quizRe.exec(source)) !== null) {
    const parsed = parseQuizInner(m[1]);
    if (!parsed) blocks.push({ start: m.index, end: quizRe.lastIndex, segment: { kind: 'fallback', text: m[1] } });
    else if (quizWidgets >= 1) blocks.push({ start: m.index, end: quizRe.lastIndex, segment: { kind: 'text', text: parsed.q } });
    else { blocks.push({ start: m.index, end: quizRe.lastIndex, segment: { kind: 'quiz', quiz: parsed } }); quizWidgets++; }
  }

  // Pass 2 — practice (extras keep only the problem). Blocks nested inside a
  // quiz were already claimed by pass 1 (baseline replaces there first).
  const practiceRe = /<practice\b([^>]*)>([\s\S]*?)<\/practice>/gi;
  let practiceWidgets = 0;
  while ((m = practiceRe.exec(source)) !== null) {
    const block: Block = { start: m.index, end: practiceRe.lastIndex, segment: { kind: 'fallback', text: m[2] } };
    if (overlaps(block, blocks)) continue;
    const correctMatch = (m[1] || '').match(/correct="([^"]+)"/i);
    const parsed = parsePracticeInner(m[2], correctMatch ? correctMatch[1] : null);
    if (!parsed) block.segment = { kind: 'fallback', text: m[2] };
    else if (practiceWidgets >= 1) block.segment = { kind: 'text', text: parsed.problem };
    else { block.segment = { kind: 'practice', practice: parsed }; practiceWidgets++; }
    blocks.push(block);
  }

  blocks.sort((a, b) => a.start - b.start);
  const out: ScaffoldSegment[] = [];
  let cursor = 0;
  for (const block of blocks) {
    if (block.start > cursor) out.push({ kind: 'text', text: source.slice(cursor, block.start) });
    out.push(block.segment);
    cursor = block.end;
  }
  if (cursor < source.length) out.push({ kind: 'text', text: source.slice(cursor) });
  return out;
}
