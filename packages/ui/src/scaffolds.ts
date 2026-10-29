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
  /* Repeated until stable: one pass over "<<script>" leaves "<script". */
  let text = String(value ?? '');
  for (let pass = 0; pass < 8; pass += 1) {
    const next = text.replace(/<[^>]*>/g, '');
    if (next === text) break;
    text = next;
  }
  return text;
}

/** Body of the first \`<tag>\u2026</tag>\` run, or null.
 *  The equivalent \`/<tag>([\\s\\S]*?)<\\/tag>/i\` rescans the whole tail from
 *  every opener, which goes quadratic on a block that repeats the opener;
 *  two indexOf calls stay linear. */
function innerOf(source: string, tag: string): string | null {
  const lower = source.toLowerCase();
  if (lower.length !== source.length) return null;
  const openTag = '<' + tag + '>';
  const closeTag = '</' + tag + '>';
  const open = lower.indexOf(openTag);
  if (open === -1) return null;
  const close = lower.indexOf(closeTag, open + openTag.length);
  if (close === -1) return null;
  return source.slice(open + openTag.length, close);
}

/** Parse the inner XML of a `<quiz>` block into `{q, options, correct}`. */
export function parseQuizInner(inner: string): ParsedQuiz | null {
  const qInner = innerOf(inner, 'q');
  if (qInner === null) return null;
  const q = stripTags(decodeEntities(qInner.trim()));
  const options: QuizOption[] = [];
  /* Scanned by hand rather than `/<o …>([\s\S]*?)<\/o>/g`: with many
     unclosed `<o letter="…">` openers the lazy form rescans the tail once per
     opener (quadratic), while indexOf walks the string exactly once. */
  const lowerInner = inner.toLowerCase();
  const optOpen = /<o\s+letter="([A-Da-d])"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while (lowerInner.length === inner.length && (m = optOpen.exec(inner)) !== null) {
    const close = lowerInner.indexOf('</o>', m.index + m[0].length);
    if (close === -1) break;
    const body = inner.slice(m.index + m[0].length, close);
    options.push({ letter: m[1].toUpperCase(), text: stripTags(decodeEntities(body.trim())) });
    optOpen.lastIndex = close + 4;
  }
  if (options.length < 2) return null;
  const correct = inner.match(/<correct>([A-Da-d])<\/correct>/i);
  return { q, options, correct: correct ? correct[1].toUpperCase() : null };
}

/** Parse `<practice>…</practice>` inner. Fields stay as raw markdown
 * (entities decoded) so math survives into the widget's own renderer. */
export function parsePracticeInner(inner: string, correct?: string | null): ParsedPractice | null {
  const title = innerOf(inner, 'title');
  const problem = innerOf(inner, 'problem');
  const hint = innerOf(inner, 'hint');
  if (problem === null) return null;
  return {
    title: title === null ? 'Practice' : decodeEntities(title.trim()),
    problem: decodeEntities(problem.trim()),
    hint: hint === null ? '' : decodeEntities(hint.trim()),
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
