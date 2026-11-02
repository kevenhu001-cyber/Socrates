/* RN-6 — shared, DOM-free normalizers for the structured blocks the tutor
 * model writes for the learning features:
 *
 *   <next-questions>  2–3 context questions at the end of a tutor reply;
 *   concept map       node definitions + "why connected" links (JSON);
 *   diagnostic        per-gap reasons + a suggested next step (JSON);
 *   mistake analysis  where it went wrong + the right approach (JSON).
 *
 * Same contract as visualizationNormalize.js: a loose schema in, a canonical
 * shape out, never throws on model input, and every lossy repair is named in
 * `warnings`. A block that is cut off mid-way (stream stopped, token limit)
 * is reported as `truncated` so callers can decline to show half an answer
 * instead of guessing the rest. Nothing here invents content: a field the
 * model did not write stays absent.
 */

export type BlockStatus = 'ok' | 'missing' | 'truncated' | 'invalid';

export interface LooseJsonResult {
  value: unknown;
  /** True when the text ends inside an unclosed object/array/string. */
  truncated: boolean;
  /** Complete objects recovered from a truncated or broken document. */
  salvaged: Array<Record<string, unknown>>;
}

const MAX_TEXT = 600;
export const NEXT_QUESTIONS_TAG = 'next-questions';
export const NEXT_QUESTION_LIMIT = 3;
const NEXT_QUESTION_MAX_CHARS = 160;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Trim, collapse runs of spaces, cap the length (CJK-safe). Empty → null. */
export function cleanText(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return null;
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max - 1).join('').trimEnd() + '…' : text;
}

function firstText(record: Record<string, unknown>, keys: readonly string[], max = MAX_TEXT): string | null {
  for (const key of keys) {
    const text = cleanText(record[key], max);
    if (text) return text;
  }
  return null;
}

function stripWrappers(text: string): string {
  return String(text ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/```(?:json|JSON)?\s*/g, '')
    .replace(/```/g, '')
    .trim();
}

/** Every balanced `{…}` at any depth that closes, in document order of their end. */
function balancedObjects(text: string): string[] {
  const out: string[] = [];
  const starts: number[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') starts.push(i);
    else if (ch === '}' && starts.length) {
      const start = starts.pop()!;
      out.push(text.slice(start, i + 1));
    }
  }
  return out;
}

function endsOpen(text: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth += 1;
    else if ((ch === '}' || ch === ']') && depth > 0) depth -= 1;
  }
  return inString || depth > 0;
}

/**
 * Parse the first JSON document in model text. Accepts code fences, a
 * `<think>` preamble, prose around the JSON and curly quotes used as JSON
 * delimiters. On failure, recovers every complete inner object so a reply
 * cut off half-way still yields the parts that were finished.
 */
export function parseLooseJson(text: unknown): LooseJsonResult {
  const raw = stripWrappers(typeof text === 'string' ? text : '');
  const objectAt = raw.indexOf('{');
  const arrayAt = raw.indexOf('[');
  const start = objectAt < 0 ? arrayAt : arrayAt < 0 ? objectAt : Math.min(objectAt, arrayAt);
  if (start < 0) return { value: undefined, truncated: false, salvaged: [] };
  const body = raw.slice(start);
  const close = body[0] === '{' ? '}' : ']';
  const end = body.lastIndexOf(close);
  const candidates = end > 0 ? [body.slice(0, end + 1)] : [];
  for (const candidate of candidates) {
    for (const attempt of [candidate, candidate.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1')]) {
      try {
        return { value: JSON.parse(attempt), truncated: false, salvaged: [] };
      } catch { /* empty-catch: intentional — fall through to the next repair */ }
    }
  }
  const salvaged: Array<Record<string, unknown>> = [];
  for (const chunk of balancedObjects(body)) {
    try {
      const parsed: unknown = JSON.parse(chunk);
      if (isRecord(parsed)) salvaged.push(parsed);
    } catch { /* empty-catch: intentional — an unparseable fragment is simply not recovered */ }
  }
  return { value: undefined, truncated: endsOpen(body), salvaged };
}

/* ------------------------------------------------------------ next questions */

export interface NextQuestionsResult {
  status: BlockStatus;
  questions: string[];
  warnings: string[];
}

const OPEN_RE = /<next-questions\b[^>]*>/i;
const BLOCK_RE = /<next-questions\b[^>]*>([\s\S]*?)<\/next-questions>/gi;

function questionListFrom(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) {
    for (const key of ['questions', 'next', 'nextQuestions', 'next_questions', 'items']) {
      if (Array.isArray(value[key])) return value[key] as unknown[];
    }
    const single = firstText(value, ['question', 'text', 'q']);
    if (single) return [single];
  }
  return null;
}

function questionText(item: unknown): string | null {
  if (isRecord(item)) return firstText(item, ['question', 'text', 'q', 'title'], NEXT_QUESTION_MAX_CHARS);
  const text = cleanText(item, NEXT_QUESTION_MAX_CHARS);
  return text ? text.replace(/^(?:[-*•]|\d+[.)、]|[（(]?\d+[）)])\s*/, '').replace(/^["'“「](.*)["'”」]$/, '$1').trim() || null : null;
}

/** Normalize the inside of one `<next-questions>` block. */
export function normalizeNextQuestions(inner: string, limit = NEXT_QUESTION_LIMIT): NextQuestionsResult {
  const warnings: string[] = [];
  const parsed = parseLooseJson(inner);
  let items = questionListFrom(parsed.value);
  if (!items && parsed.salvaged.length) {
    items = parsed.salvaged;
    warnings.push('Recovered questions from a broken JSON list.');
  }
  if (!items) {
    if (parsed.truncated) return { status: 'truncated', questions: [], warnings: ['The question list was cut off.'] };
    const lines = stripWrappers(inner).split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length && !/^[[{]/.test(lines[0]!)) {
      items = lines;
      warnings.push('Read questions from a plain list instead of JSON.');
    }
  }
  if (!items) return { status: 'invalid', questions: [], warnings: ['No question list found.'] };
  const seen = new Set<string>();
  const questions: string[] = [];
  for (const item of items) {
    const text = questionText(item);
    if (!text) continue;
    const key = text.toLowerCase().replace(/[\s?？。.!！]+$/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(text);
  }
  if (questions.length > limit) {
    warnings.push(`Kept the first ${limit} of ${questions.length} questions.`);
    questions.length = limit;
  }
  return { status: questions.length ? 'ok' : 'invalid', questions, warnings };
}

/** Find and normalize the last complete `<next-questions>` block in a reply. */
export function extractNextQuestions(text: string | null | undefined, limit = NEXT_QUESTION_LIMIT): NextQuestionsResult {
  const source = String(text ?? '');
  const blocks = [...source.matchAll(BLOCK_RE)];
  if (blocks.length) return normalizeNextQuestions(blocks[blocks.length - 1]![1] ?? '', limit);
  if (OPEN_RE.test(source)) return { status: 'truncated', questions: [], warnings: ['The question block never closed.'] };
  return { status: 'missing', questions: [], warnings: [] };
}

/**
 * Remove next-question blocks from text meant for display: complete blocks,
 * an unclosed block at the tail (still streaming), and a half-typed opening
 * tag at the very end (`<next-qu`). Other tags are left alone.
 */
export function stripNextQuestions(text: string | null | undefined): string {
  let source = String(text ?? '');
  if (!source.includes('<')) return source;
  source = source.replace(BLOCK_RE, '');
  const open = source.search(OPEN_RE);
  if (open >= 0) source = source.slice(0, open);
  const tail = source.match(/<[a-z-]*$/i);
  if (tail && tail[0].length > 1 && '<next-questions'.startsWith(tail[0].toLowerCase())) {
    source = source.slice(0, tail.index);
  }
  return source.replace(/\s+$/, (space) => (space.includes('\n') ? '\n' : space));
}

/* --------------------------------------------------------------- concept map */

export interface ConceptNode {
  name: string;
  definition: string | null;
}

export interface ConceptLink {
  from: number;
  to: number;
  /** Short label for the kind of relation ("is a special case of"). */
  relation: string | null;
  /** One or two sentences on why the two ideas are connected. */
  why: string;
}

export interface ConceptMapResult {
  status: BlockStatus;
  nodes: ConceptNode[];
  links: ConceptLink[];
  warnings: string[];
}

function nameKey(name: string): string {
  return name.toLowerCase().replace(/[\s「」『』"'“”‘’《》()（）]/g, '');
}

function resolveEndpoint(value: unknown, names: readonly string[]): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value >= 0 && value < names.length ? value : -1;
  const text = cleanText(value, 200);
  if (!text) return -1;
  if (/^\d+$/.test(text)) {
    const index = Number(text);
    return index < names.length ? index : -1;
  }
  const key = nameKey(text);
  const exact = names.findIndex((name) => nameKey(name) === key);
  if (exact >= 0) return exact;
  /* A model often shortens a long dimension name; accept a unique containment. */
  const loose = names.map((name, index) => ({ index, key: nameKey(name) }))
    .filter((entry) => key.length >= 2 && (entry.key.includes(key) || key.includes(entry.key)));
  return loose.length === 1 ? loose[0]!.index : -1;
}

/**
 * Normalize a concept map. `knownNames` are the nodes already on the map
 * (in order); when given, node entries for those names only add their
 * definitions and new names are appended, so an update never reorders or
 * renames what the learner already has. Accepts the legacy shape too (a
 * bare array of node names).
 */
export function normalizeConceptMap(text: unknown, knownNames: readonly string[] = [], maxNodes = 12): ConceptMapResult {
  const warnings: string[] = [];
  const parsed = typeof text === 'string' ? parseLooseJson(text) : { value: text, truncated: false, salvaged: [] as Array<Record<string, unknown>> };
  let rawNodes: unknown[] = [];
  let rawLinks: unknown[] = [];
  if (Array.isArray(parsed.value)) rawNodes = parsed.value;
  else if (isRecord(parsed.value)) {
    const value = parsed.value;
    rawNodes = Array.isArray(value.nodes) ? value.nodes : Array.isArray(value.concepts) ? value.concepts : [];
    rawLinks = Array.isArray(value.links) ? value.links : Array.isArray(value.edges) ? value.edges : Array.isArray(value.relations) ? value.relations : [];
  } else if (parsed.salvaged.length) {
    rawNodes = parsed.salvaged.filter((item) => !('from' in item) && !('source' in item));
    rawLinks = parsed.salvaged.filter((item) => 'from' in item || 'source' in item);
    warnings.push('Recovered complete entries from a cut-off concept map.');
  } else {
    return { status: parsed.truncated ? 'truncated' : 'invalid', nodes: [], links: [], warnings: [parsed.truncated ? 'The concept map was cut off.' : 'No concept map found.'] };
  }

  const nodes: ConceptNode[] = knownNames.map((name) => ({ name, definition: null }));
  const names = nodes.map((node) => node.name);
  for (const item of rawNodes) {
    const name = isRecord(item) ? firstText(item, ['name', 'concept', 'title', 'label'], 80) : cleanText(item, 80);
    if (!name) continue;
    const definition = isRecord(item) ? firstText(item, ['definition', 'define', 'summary', 'description', 'meaning']) : null;
    const at = resolveEndpoint(name, names);
    if (at >= 0) {
      if (definition && !nodes[at]!.definition) nodes[at]!.definition = definition;
      continue;
    }
    if (nodes.length >= maxNodes) {
      warnings.push(`Dropped node "${name}" past the ${maxNodes}-node limit.`);
      continue;
    }
    nodes.push({ name, definition });
    names.push(name);
  }

  const links: ConceptLink[] = [];
  const seen = new Set<string>();
  for (const item of rawLinks) {
    if (!isRecord(item)) continue;
    const from = resolveEndpoint(item.from ?? item.source, names);
    const to = resolveEndpoint(item.to ?? item.target, names);
    const why = firstText(item, ['why', 'reason', 'explanation', 'because']);
    if (from < 0 || to < 0) { warnings.push('Dropped a link to a node that is not on the map.'); continue; }
    if (from === to) { warnings.push('Dropped a link from a node to itself.'); continue; }
    if (!why) { warnings.push('Dropped a link with no explanation.'); continue; }
    const key = from < to ? `${from}-${to}` : `${to}-${from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ from, to, relation: firstText(item, ['relation', 'type', 'label', 'kind'], 40), why });
  }
  const hasContent = nodes.some((node) => node.definition) || links.length > 0 || nodes.length > knownNames.length;
  const status: BlockStatus = hasContent ? 'ok' : parsed.truncated ? 'truncated' : 'invalid';
  if (parsed.truncated && hasContent) warnings.push('The concept map was cut off; kept the complete entries.');
  return { status, nodes, links, warnings };
}

/* ---------------------------------------------------------------- diagnostic */

export interface DiagnosticInsightResult {
  status: BlockStatus;
  summary: string | null;
  nextStep: string | null;
  /** Reason per node index, only for nodes the model wrote one for. */
  reasons: Record<number, string>;
  warnings: string[];
}

export function normalizeDiagnosticInsight(text: unknown, nodeNames: readonly string[]): DiagnosticInsightResult {
  const warnings: string[] = [];
  const parsed = typeof text === 'string' ? parseLooseJson(text) : { value: text, truncated: false, salvaged: [] as Array<Record<string, unknown>> };
  const value = isRecord(parsed.value) ? parsed.value : null;
  const reasons: Record<number, string> = {};
  const rawGaps: unknown[] = value
    ? (Array.isArray(value.gaps) ? value.gaps : Array.isArray(value.weaknesses) ? value.weaknesses : Array.isArray(value.reasons) ? value.reasons : [])
    : parsed.salvaged;
  for (const gap of rawGaps) {
    if (!isRecord(gap)) continue;
    const index = resolveEndpoint(gap.name ?? gap.node ?? gap.dimension ?? gap.index, nodeNames);
    const reason = firstText(gap, ['reason', 'why', 'explanation', 'cause']);
    if (index < 0 || !reason) { warnings.push('Dropped a gap reason that names no known dimension.'); continue; }
    if (!reasons[index]) reasons[index] = reason;
  }
  const summary = value ? firstText(value, ['summary', 'overview']) : null;
  const nextStep = value ? firstText(value, ['nextStep', 'next_step', 'next', 'suggestion', 'recommendation']) : null;
  const hasContent = !!(summary || nextStep || Object.keys(reasons).length);
  if (!value && parsed.salvaged.length && hasContent) warnings.push('Recovered gap reasons from a cut-off reply.');
  return {
    status: hasContent ? 'ok' : parsed.truncated ? 'truncated' : 'invalid',
    summary,
    nextStep,
    reasons,
    warnings,
  };
}

/* ------------------------------------------------------------------ mistakes */

export interface MistakeAnalysisResult {
  status: BlockStatus;
  whyWrong: string | null;
  correctApproach: string | null;
  warnings: string[];
}

export function normalizeMistakeAnalysis(text: unknown): MistakeAnalysisResult {
  const parsed = typeof text === 'string' ? parseLooseJson(text) : { value: text, truncated: false, salvaged: [] as Array<Record<string, unknown>> };
  const value = isRecord(parsed.value) ? parsed.value : parsed.salvaged.find((item) => 'whyWrong' in item || 'correctApproach' in item) ?? null;
  if (!value) {
    return { status: parsed.truncated ? 'truncated' : 'invalid', whyWrong: null, correctApproach: null, warnings: [parsed.truncated ? 'The analysis was cut off.' : 'No analysis found.'] };
  }
  const whyWrong = firstText(value, ['whyWrong', 'why_wrong', 'error', 'mistake', 'whereWrong', 'where_wrong']);
  const correctApproach = firstText(value, ['correctApproach', 'correct_approach', 'approach', 'solution', 'rightWay', 'right_way']);
  return {
    status: whyWrong || correctApproach ? 'ok' : 'invalid',
    whyWrong,
    correctApproach,
    warnings: parsed.truncated ? ['The analysis was cut off; kept the complete fields.'] : [],
  };
}
