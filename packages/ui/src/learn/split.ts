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

/** The ten scaffold tags a reply may carry. */
export const SCAFFOLD_TAGS = [
  'quiz', 'flashcard', 'practice', 'example', 'step',
  'definition', 'theorem', 'proof', 'derivation', 'key-point',
] as const;
export type ScaffoldTag = typeof SCAFFOLD_TAGS[number];

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
 *  is escaped so it reads as words, not as markup. */
function degradeText(block: ScaffoldBlock): string {
  if (block.kind === 'quiz') return escapeHtml(block.parsed.q);
  if (block.kind === 'practice') return escapeHtml(block.parsed.problem);
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
      const proofMatch = inner.match(/<proof\b[^>]*>([\s\S]*?)<\/proof>/i);
      const proof = proofMatch ? parseProofInner(proofMatch[1]) : null;
      const statementInner = inner.replace(/<proof\b[^>]*>[\s\S]*?<\/proof>/gi, '');
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
  const pattern = new RegExp('<(' + SCAFFOLD_TAGS.join('|') + ')\\b([^>]*)>([\\s\\S]*?)<\\/\\1>', 'gi');
  if (!pattern.test(source)) return [{ kind: 'text', text: source }];

  const out: ScaffoldSegment[] = [];
  const taken = new Set<string>();
  let stepIndex = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(source)) !== null) {
    const [full, rawTag, attrs, inner] = match;
    const tag = rawTag.toLowerCase() as ScaffoldTag;
    if (match.index > cursor) out.push({ kind: 'text', text: source.slice(cursor, match.index) });
    cursor = match.index + full.length;
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
  if (cursor < source.length) out.push({ kind: 'text', text: source.slice(cursor) });
  return out;
}

/** The scaffold blocks of a text, in order (fallbacks excluded). */
export function scaffoldBlocks(text: string): ScaffoldBlock[] {
  return splitScaffolds(text)
    .filter((segment): segment is { kind: 'scaffold'; block: ScaffoldBlock } => segment.kind === 'scaffold')
    .map((segment) => segment.block);
}
