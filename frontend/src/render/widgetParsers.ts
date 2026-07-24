import { decodeEntities, stripTags } from './helpers.js';

export interface QuizOption {
  letter: string;
  text: string;
}

export interface ParsedQuiz {
  q: string;
  options: QuizOption[];
  correct: string | null;
}

/* Parse the inner XML of a <quiz> block into {q, options:[{letter,text}], correct}. */
export function parseQuizInner(inner: string): ParsedQuiz | null {
  const qMatch = inner.match(/<q>([\s\S]*?)<\/q>/i);
  if (!qMatch) return null;
  const q = stripTags(decodeEntities(qMatch[1].trim()));
  const optRe = /<o\s+letter="([A-Da-d])"[^>]*>([\s\S]*?)<\/o>/gi;
  const opts: QuizOption[] = [];
  let om: RegExpExecArray | null;
  while ((om = optRe.exec(inner)) !== null) {
    opts.push({ letter: om[1].toUpperCase(), text: stripTags(decodeEntities(om[2].trim())) });
  }
  if (opts.length < 2) return null;
  const cMatch = inner.match(/<correct>([A-Da-d])<\/correct>/i);
  const correct = cMatch ? cMatch[1].toUpperCase() : null;
  return { q, options: opts, correct };
}

export interface ParsedExample {
  title: string;
  problem: string;
  solution: string;
}

/* Parse <example>…</example> inner into {title, problem, solution}.
   Each field is kept as raw markdown (with HTML entities decoded) so the
   mount step can run it through formatMsg and pick up $...$ / $$...$$
   LaTeX. The earlier stripTags pass silently destroyed every inline math
   delimiter inside a title — titles like "Example 1: $a^2+b^2$" came out
   with literal dollar signs. */
export function parseExampleInner(inner: string): ParsedExample | null {
  const t = inner.match(/<title>([\s\S]*?)<\/title>/i);
  const p = inner.match(/<problem>([\s\S]*?)<\/problem>/i);
  const s = inner.match(/<solution>([\s\S]*?)<\/solution>/i);
  if (!p && !s) return null;
  return {
    title: t ? decodeEntities(t[1].trim()) : 'Example',
    problem: p ? decodeEntities(p[1].trim()) : '',
    solution: s ? decodeEntities(s[1].trim()) : '',
  };
}

export interface ParsedPractice {
  title: string;
  problem: string;
  hint: string;
}

/* Parse <practice>…</practice> inner into {title, problem, hint}.
   The optional `correct="…"` attribute on the opening <practice> tag
   is captured separately by renderAssistantHTML (which has access to
   the raw attribute string) and assigned to parsed.correct.
   Fields are kept as raw markdown so LaTeX in title / hint renders
   through formatMsg at mount time. */
export function parsePracticeInner(inner: string): ParsedPractice | null {
  const t = inner.match(/<title>([\s\S]*?)<\/title>/i);
  const p = inner.match(/<problem>([\s\S]*?)<\/problem>/i);
  const h = inner.match(/<hint>([\s\S]*?)<\/hint>/i);
  if (!p) return null;
  return {
    title: t ? decodeEntities(t[1].trim()) : 'Practice',
    problem: decodeEntities(p[1].trim()),
    hint: h ? decodeEntities(h[1].trim()) : '',
  };
}

export interface ParsedDefinition {
  term: string;
  body: string;
}

/* Parse <definition>…</definition> inner into {term, body}.
   Both fields are kept as raw markdown so term / body can carry $..$
   LaTeX and still render through formatMsg. The previous stripTags
   pass flattened "Group $G$" → "Group $G$" with literal $ left in. */
export function parseDefinitionInner(inner: string): ParsedDefinition | null {
  const tM = inner.match(/<term>([\s\S]*?)<\/term>/i);
  const bM = inner.match(/<body>([\s\S]*?)<\/body>/i);
  if (!tM && !bM) return null;
  return {
    term: tM ? decodeEntities(tM[1].trim()) : '',
    body: bM ? decodeEntities(bM[1].trim()) : '',
  };
}

export interface ParsedFlashcard {
  front: string;
  back: string;
}

/* Parse <flashcard>…</flashcard> inner into {front, back}. Front and
   back are kept as raw markdown so LaTeX on either face renders. */
export function parseFlashcardInner(inner: string): ParsedFlashcard | null {
  const fM = inner.match(/<front>([\s\S]*?)<\/front>/i);
  const bM = inner.match(/<back>([\s\S]*?)<\/back>/i);
  if (!fM && !bM) return null;
  return {
    front: fM ? decodeEntities(fM[1].trim()) : '',
    back: bM ? decodeEntities(bM[1].trim()) : '',
  };
}

export interface ParsedTheorem {
  title: string;
  statement: string;
}

/* Parse <theorem>…</theorem> inner into {title, statement}.
   The optional <proof> child is hoisted by renderAssistantHTML BEFORE
   this parser runs, so we never see proof markup here. Returns null
   only if no <statement> tag is present — a theorem without a
   statement is meaningless. */
export function parseTheoremInner(inner: string): ParsedTheorem | null {
  const tM = inner.match(/<title>([\s\S]*?)<\/title>/i);
  const sM = inner.match(/<statement>([\s\S]*?)<\/statement>/i);
  if (!sM) return null;
  return {
    title: tM ? decodeEntities(tM[1].trim()) : '',
    statement: decodeEntities(sM[1].trim()),
  };
}

export interface ParsedProof {
  title: string;
  body: string;
}

/* Parse <proof>…</proof> inner into {title, body}. Standalone proof
   (outside a <theorem>) and the hoisted child-proof path use the same
   parser. Title is optional. */
export function parseProofInner(inner: string): ParsedProof | null {
  const tM = inner.match(/<title>([\s\S]*?)<\/title>/i);
  const bM = inner.match(/<body>([\s\S]*?)<\/body>/i);
  if (!bM) return null;
  return {
    title: tM ? decodeEntities(tM[1].trim()) : '',
    body: decodeEntities(bM[1].trim()),
  };
}

export interface ParsedDerivation {
  title: string;
  body: string;
}

/* Parse <derivation>…</derivation> inner into {title, body}.
   Title optional; body required. The body may carry $$...$$ display
   math, which the mount step renders through formatMsg. */
export function parseDerivationInner(inner: string): ParsedDerivation | null {
  const tM = inner.match(/<title>([\s\S]*?)<\/title>/i);
  const bM = inner.match(/<body>([\s\S]*?)<\/body>/i);
  if (!bM) return null;
  return {
    title: tM ? decodeEntities(tM[1].trim()) : '',
    body: decodeEntities(bM[1].trim()),
  };
}

export interface ParsedKeyPoint {
  body: string;
}

/* Parse <key-point>…</key-point> — leaf element. The whole inner
   content is the body. Returns null only for empty content so we don't
   emit an empty card. */
export function parseKeyPointInner(inner: string): ParsedKeyPoint | null {
  const body = decodeEntities(inner.trim());
  if (!body) return null;
  return { body };
}