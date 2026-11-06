/**
 * One scaffold splitter for every host.
 *
 * The tutor writes its structured blocks into the assistant text: `<quiz>`,
 * `<practice>`, `<flashcard>`, `<definition>`, `<theorem>`, … Two hosts used
 * to decide what to do with them on their own — the web shell in
 * `frontend/src/render/assistantHtml.ts` + `render/scaffoldPipeline.ts`, the
 * universal app in `packages/ui/src/scaffolds.ts` — and the two drifted
 * apart: the package only knew quiz and practice, and the rules for "which
 * block becomes the interactive card" were written twice.
 *
 * This module is the one decision both hosts share:
 *
 * - the OUTERMOST block wins — a scaffold tag inside another block's body
 *   belongs to that body, it does not become a second card;
 * - a block that does not parse becomes a labelled plain-text fallback, and
 *   it never consumes the interactive slot;
 * - quiz and practice are single-shot per turn: the first valid one becomes
 *   the interactive card, later ones fall back to their own text so they
 *   read as prose;
 * - every other kind (example, step, flashcard, definition, theorem, proof,
 *   derivation, key point) mounts as its own card, as often as it appears.
 *
 * The module is DOM-free and side-effect free: it shapes segments, the host
 * turns them into its own surface — the web shell emits slot divs and mounts
 * React roots, the universal app renders the shared RN cards inline.
 */
import { decodeEntities, escapeHtml, stripTags } from '../scaffoldText.ts';
import {
  fieldMatches,
  parseDefinitionInner,
  parseDerivationInner,
  parseExampleInner,
  parseFlashcardInner,
  parseKeyPointInner,
  parsePracticeInner,
  parseProofInner,
  parseQuizInner,
  parseTheoremInner,
  type ParsedDefinition,
  type ParsedDerivation,
  type ParsedExample,
  type ParsedFlashcard,
  type ParsedKeyPoint,
  type ParsedPractice,
  type ParsedProof,
  type ParsedQuiz,
  type ParsedTheorem,
} from './model.ts';
import { markdownCodeRanges, type MarkdownCodeRange } from './markdownCode.ts';
export { markdownCodeRanges };
export type { MarkdownCodeRange };

/** The ten scaffold tags a reply may carry. */
export const SCAFFOLD_TAGS = [
  'quiz', 'flashcard', 'practice', 'example', 'step',
  'definition', 'theorem', 'proof', 'derivation', 'key-point',
] as const;
export type ScaffoldTag = typeof SCAFFOLD_TAGS[number];

export interface ScaffoldMarkupMatch extends MarkdownCodeRange {
  tag: ScaffoldTag;
  attrs: string;
  inner: string;
  raw: string;
}

interface OpenScaffoldTag {
  attrs: string;
  start: number;
  contentStart: number;
}

/**
 * Find complete outermost scaffold blocks without treating code examples as
 * markup. A block may itself contain fenced or inline code, so only the tag
 * tokens inside code are ignored, not a complete match merely because its
 * body contains a code range.
 */
export function scaffoldMarkupMatches(source: string): ScaffoldMarkupMatch[] {
  if (source.indexOf('<') === -1) return [];
  const pattern = new RegExp('<(/?)(' + SCAFFOLD_TAGS.join('|') + ')\\b([^>]*)>', 'gi');
  const codeRanges = markdownCodeRanges(source);
  let codeIndex = 0;
  const openings = new Map<ScaffoldTag, OpenScaffoldTag[]>();
  const candidates: ScaffoldMarkupMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    while (codeIndex < codeRanges.length && codeRanges[codeIndex].end <= match.index) codeIndex += 1;
    const codeRange = codeRanges[codeIndex];
    if (codeRange && codeRange.start <= match.index && codeRange.end > match.index) continue;

    const tag = match[2].toLowerCase() as ScaffoldTag;
    if (!match[1]) {
      const stack = openings.get(tag) ?? [];
      stack.push({
        attrs: match[3],
        start: match.index,
        contentStart: pattern.lastIndex,
      });
      openings.set(tag, stack);
      continue;
    }

    const stack = openings.get(tag);
    const open = stack?.pop();
    if (!open) continue;
    candidates.push({
      tag,
      attrs: open.attrs,
      inner: source.slice(open.contentStart, match.index),
      raw: source.slice(open.start, pattern.lastIndex),
      start: open.start,
      end: pattern.lastIndex,
    });
  }
  /* An unmatched outer opener must not hide a later, complete scaffold.
     Among overlapping complete matches, the earliest opening tag wins, which
     keeps the outermost complete block as the only card. */
  candidates.sort((left, right) => left.start - right.start);
  const matches: ScaffoldMarkupMatch[] = [];
  let consumedUntil = -1;
  for (const candidate of candidates) {
    if (candidate.start < consumedUntil) continue;
    matches.push(candidate);
    consumedUntil = candidate.end;
  }
  return matches;
}

/** True when a complete scaffold block appears outside Markdown code. */
export function hasScaffoldMarkup(text: string): boolean {
  return scaffoldMarkupMatches(String(text || '')).length > 0;
}

/** The kinds that become an interactive card only once per turn. */
const SINGLETON_TAGS: readonly string[] = ['quiz', 'practice'];

/** The attribute a host may use to pin a stable slot id per kind. */
const SLOT_ID_ATTR: Partial<Record<ScaffoldTag, string>> = {
  quiz: 'data-quiz-id',
  practice: 'data-practice-id',
};

export interface ScaffoldBlockBase {
  /** The block's inner XML, as the model wrote it. */
  raw: string;
  /** The opening tag's attribute text. */
  attrs: string;
  /** A host-supplied stable id (`data-quiz-id` / `data-practice-id`). */
  slotId: string | null;
}

export type ScaffoldBlock =
  | (ScaffoldBlockBase & { kind: 'quiz'; parsed: ParsedQuiz })
  | (ScaffoldBlockBase & { kind: 'example'; parsed: ParsedExample })
  | (ScaffoldBlockBase & { kind: 'practice'; parsed: ParsedPractice })
  | (ScaffoldBlockBase & { kind: 'definition'; parsed: ParsedDefinition })
  | (ScaffoldBlockBase & { kind: 'step'; parsed: { n: number; body: string } })
  | (ScaffoldBlockBase & { kind: 'flashcard'; parsed: ParsedFlashcard })
  | (ScaffoldBlockBase & { kind: 'derivation'; parsed: ParsedDerivation })
  | (ScaffoldBlockBase & { kind: 'proof'; parsed: ParsedProof })
  | (ScaffoldBlockBase & { kind: 'theorem'; parsed: ParsedTheorem & { proofTitle?: string; proofBody?: string } })
  | (ScaffoldBlockBase & { kind: 'key-point'; parsed: ParsedKeyPoint });

export type ScaffoldSegment =
  | { kind: 'text'; text: string }
  | { kind: 'scaffold'; block: ScaffoldBlock }
  | { kind: 'fallback'; text: string; scaffold: ScaffoldTag };

/** Attribute value, or null when the attribute is absent. */
function attrOf(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp('\\b' + name + '\\s*=\\s*["\']([^"\']*)["\']', 'i'));
  return match ? match[1] : null;
}

/** The host-pinned slot id, if the block carries one. */
function slotIdOf(tag: ScaffoldTag, attrs: string): string | null {
  const attr = SLOT_ID_ATTR[tag];
  if (!attr) return null;
  const value = attrs.match(new RegExp('\\b' + attr + '\\s*=\\s*["\']([\\w-]{1,120})["\']', 'i'))?.[1];
  return value ?? null;
}

/** The text a later block of the same kind degrades to. Model-authored text
 *  is escaped so it reads as words, not as markup. A quiz keeps its options
 *  as a list, so the reader can still answer it on their own; a practice
 *  keeps its title. */
function degradeText(block: ScaffoldBlock): string {
  if (block.kind === 'quiz') {
    const question = escapeHtml(block.parsed.q);
    const options = block.parsed.options
      .map((option) => '- ' + escapeHtml(option.letter) + '. ' + escapeHtml(option.text).replace(/\n+/g, ' '))
      .join('\n');
    return options ? question + '\n\n' + options : question;
  }
  if (block.kind === 'practice') {
    /* The parser fills an English "Practice" when no <title> is written;
       only a title the model wrote is kept. */
    const title = /<title\b/i.test(block.raw) ? block.parsed.title.trim() : '';
    const problem = escapeHtml(block.parsed.problem);
    return title ? '**' + escapeHtml(title) + '**\n\n' + problem : problem;
  }
  return escapeHtml(block.raw);
}

function parseStep(attrs: string, inner: string, stepIndex: number): ScaffoldBlock | null {
  const body = stripTags(decodeEntities(inner.trim()));
  if (!body) return null;
  const declared = Number.parseInt(attrOf(attrs, 'n') ?? '', 10);
  const n = Number.isFinite(declared) && declared >= 1 ? declared : stepIndex + 1;
  return { kind: 'step', raw: inner, attrs, slotId: null, parsed: { n, body } };
}

function parseBlock(tag: ScaffoldTag, attrs: string, inner: string, stepIndex: number): ScaffoldBlock | null {
  const base = { raw: inner, attrs, slotId: slotIdOf(tag, attrs) };
  switch (tag) {
    case 'quiz': {
      const parsed = parseQuizInner(inner, attrs);
      return parsed ? { ...base, kind: 'quiz', parsed } : null;
    }
    case 'example': {
      const parsed = parseExampleInner(inner);
      return parsed ? { ...base, kind: 'example', parsed } : null;
    }
    case 'practice': {
      const correct = attrOf(attrs, 'correct');
      const parsed = parsePracticeInner(inner, correct ? decodeEntities(correct) : null);
      return parsed ? { ...base, kind: 'practice', parsed } : null;
    }
    case 'definition': {
      const parsed = parseDefinitionInner(inner);
      return parsed ? { ...base, kind: 'definition', parsed } : null;
    }
    case 'step':
      return parseStep(attrs, inner, stepIndex);
    case 'flashcard': {
      const parsed = parseFlashcardInner(inner);
      return parsed ? { ...base, kind: 'flashcard', parsed } : null;
    }
    case 'derivation': {
      const parsed = parseDerivationInner(inner);
      return parsed ? { ...base, kind: 'derivation', parsed } : null;
    }
    case 'proof': {
      const parsed = parseProofInner(inner);
      return parsed ? { ...base, kind: 'proof', parsed } : null;
    }
    case 'theorem': {
      /* A proof written inside a theorem belongs to that theorem: it is
         folded into the card instead of waiting for a slot the theorem
         replacement would drop. */
      const proofMatches = fieldMatches(inner, 'proof');
      const proof = proofMatches.length ? parseProofInner(proofMatches[0].inner) : null;
      let cursor = 0;
      const statementParts: string[] = [];
      for (const proofMatch of proofMatches) {
        statementParts.push(inner.slice(cursor, proofMatch.start));
        cursor = proofMatch.end;
      }
      statementParts.push(inner.slice(cursor));
      const statementInner = statementParts.join('');
      const parsed = parseTheoremInner(statementInner);
      if (!parsed) return null;
      if (proof) {
        parsed.proofTitle = proof.title;
        parsed.proofBody = proof.body;
      }
      return { ...base, kind: 'theorem', parsed };
    }
    case 'key-point': {
      const parsed = parseKeyPointInner(inner);
      return parsed ? { ...base, kind: 'key-point', parsed } : null;
    }
    default:
      return null;
  }
}

/**
 * Split assistant text into prose runs and scaffold blocks.
 *
 * Never throws: a malformed block becomes a fallback segment that carries
 * the block's inner XML, so the host can show it as labelled plain text.
 */
export function splitScaffolds(text: string): ScaffoldSegment[] {
  const source = String(text || '');
  const out: ScaffoldSegment[] = [];
  const taken = new Set<string>();
  let stepIndex = 0;
  let cursor = 0;
  let found = false;
  for (const match of scaffoldMarkupMatches(source)) {
    found = true;
    const { tag, attrs, inner } = match;
    if (match.start > cursor) out.push({ kind: 'text', text: source.slice(cursor, match.start) });
    cursor = match.end;
    const block = parseBlock(tag, attrs, inner, stepIndex);
    if (!block) {
      out.push({ kind: 'fallback', text: inner, scaffold: tag });
      continue;
    }
    if (tag === 'step') stepIndex += 1;
    if (SINGLETON_TAGS.includes(tag)) {
      /* The interactive slot is taken: a later block of the same kind reads
         as prose instead of mounting a second card. */
      if (taken.has(tag)) {
        out.push({ kind: 'text', text: degradeText(block) });
        continue;
      }
      taken.add(tag);
    }
    out.push({ kind: 'scaffold', block });
  }
  if (!found) return [{ kind: 'text', text: source }];
  if (cursor < source.length) out.push({ kind: 'text', text: source.slice(cursor) });
  return out;
}

/** The scaffold blocks of a text, in order (fallbacks excluded). */
export function scaffoldBlocks(text: string): ScaffoldBlock[] {
  return splitScaffolds(text)
    .filter((segment): segment is { kind: 'scaffold'; block: ScaffoldBlock } => segment.kind === 'scaffold')
    .map((segment) => segment.block);
}

/** The single-shot kinds a turn plan tracks. */
export type SingletonScaffoldTag = 'quiz' | 'practice';

/**
 * Which quiz and which practice own the interactive slot of a whole turn.
 *
 * Hosts render a turn in pieces (one markdown block at a time while it
 * streams, one prose run between tool rows), so the "first valid one wins"
 * rule cannot be applied inside one piece: every piece would find its own
 * "first" quiz. The plan is computed once over the turn's full text and maps
 * each kind to the raw markup of its winning block.
 */
export type ScaffoldTurnPlan = Partial<Record<SingletonScaffoldTag, string>>;

const SINGLETON_HINT = /<(quiz|practice)\b/i;

export function scaffoldTurnPlan(text: string): ScaffoldTurnPlan {
  const source = String(text || '');
  const plan: ScaffoldTurnPlan = {};
  if (!SINGLETON_HINT.test(source)) return plan;
  for (const match of scaffoldMarkupMatches(source)) {
    if (!SINGLETON_TAGS.includes(match.tag)) continue;
    const tag = match.tag as SingletonScaffoldTag;
    if (plan[tag] !== undefined) continue;
    if (parseBlock(match.tag, match.attrs, match.inner, 0)) plan[tag] = match.raw;
  }
  return plan;
}

/**
 * Rewrite one piece of a turn so it follows the turn plan: a valid quiz or
 * practice that is not the turn's winner is replaced by its degraded prose
 * before the piece reaches the per-piece splitter. The winner keeps its
 * markup; a second copy of the winner inside the same piece degrades too.
 * Returns the same string when nothing changes.
 */
export function applyScaffoldTurnPlan(text: string, plan: ScaffoldTurnPlan): string {
  const source = String(text || '');
  if (!plan.quiz && !plan.practice) return source;
  if (!SINGLETON_HINT.test(source)) return source;
  const kept = new Set<string>();
  let out = '';
  let cursor = 0;
  let changed = false;
  for (const match of scaffoldMarkupMatches(source)) {
    if (!SINGLETON_TAGS.includes(match.tag)) continue;
    const tag = match.tag as SingletonScaffoldTag;
    const winner = plan[tag];
    if (winner === undefined) continue;
    if (match.raw === winner && !kept.has(tag)) {
      kept.add(tag);
      continue;
    }
    const block = parseBlock(match.tag, match.attrs, match.inner, 0);
    if (!block) continue;
    out += source.slice(cursor, match.start) + '\n\n' + degradeText(block) + '\n\n';
    cursor = match.end;
    changed = true;
  }
  if (!changed) return source;
  return out + source.slice(cursor);
}
