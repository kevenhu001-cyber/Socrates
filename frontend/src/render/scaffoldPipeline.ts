/**
 * render/scaffoldPipeline.ts — the web shell's adapter for the shared
 * scaffold system.
 *
 * The decision of what a scaffold block becomes (which one is interactive,
 * which one degrades to prose, which one is a malformed fallback) lives in
 * `@socrates/ui/learn-split`, so the web shell and the universal app apply
 * the same rules. This module only turns the shared segments into the DOM
 * the web shell mounts:
 *
 *   - a scaffold becomes an empty `<div class="…-slot">` placeholder plus a
 *     `{ id, parsed }` entry the widget scheduler mounts later;
 *   - a malformed block becomes the labelled plain-text fallback;
 *   - prose runs are passed through untouched.
 *
 * The slot ids stay with the web shell: the mistake book pins a quiz or
 * practice slot through `data-quiz-id` / `data-practice-id`, everything else
 * gets a generated id.
 */
import { splitScaffolds, type ScaffoldBlock, type ScaffoldTag } from '@socrates/ui/learn-split';
import type {
  ParsedDefinition,
  ParsedDerivation,
  ParsedExample,
  ParsedFlashcard,
  ParsedKeyPoint,
  ParsedProof,
} from '@socrates/ui/learn-model';
import type { PracticeMountData, QuizMountData, TheoremMountData } from './widgetRuntime.ts';

export interface ScaffoldPlaceholder<Parsed = unknown> {
  id: string;
  parsed: Parsed;
}

export interface ScaffoldDeps {
  t: (key: string) => string;
  esc: (value: unknown) => string;
}

/** The placeholder lists the widget scheduler mounts, one per kind. */
export interface ScaffoldWidgets {
  text: string;
  quizPH: ScaffoldPlaceholder<QuizMountData>[];
  examplePH: ScaffoldPlaceholder<ParsedExample>[];
  practicePH: ScaffoldPlaceholder<PracticeMountData>[];
  definitionPH: ScaffoldPlaceholder<ParsedDefinition>[];
  stepPH: ScaffoldPlaceholder<{ n: number; body: string }>[];
  flashcardPH: ScaffoldPlaceholder<ParsedFlashcard>[];
  derivationPH: ScaffoldPlaceholder<ParsedDerivation>[];
  proofPH: ScaffoldPlaceholder<ParsedProof>[];
  theoremPH: ScaffoldPlaceholder<TheoremMountData>[];
  keyPointPH: ScaffoldPlaceholder<ParsedKeyPoint>[];
}

/** The slot class, the id attribute and the id prefix of every kind. */
const SLOT_SHAPE: Record<ScaffoldTag, { className: string; attr: string; prefix: string }> = {
  quiz: { className: 'quiz-slot', attr: 'data-quiz-id', prefix: 'quiz' },
  example: { className: 'example-slot', attr: 'data-example-id', prefix: 'ex' },
  practice: { className: 'practice-slot', attr: 'data-practice-id', prefix: 'pr' },
  definition: { className: 'definition-slot', attr: 'data-definition-id', prefix: 'def' },
  step: { className: 'step-slot', attr: 'data-step-id', prefix: 'step' },
  flashcard: { className: 'flashcard-slot', attr: 'data-flashcard-id', prefix: 'fc' },
  derivation: { className: 'derivation-slot', attr: 'data-derivation-id', prefix: 'der' },
  proof: { className: 'proof-slot', attr: 'data-proof-id', prefix: 'prf' },
  theorem: { className: 'theorem-slot', attr: 'data-theorem-id', prefix: 'thm' },
  'key-point': { className: 'key-point-slot', attr: 'data-key-point-id', prefix: 'kp' },
};

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

function fallback(inner: string, t: ScaffoldDeps['t'], esc: ScaffoldDeps['esc']): string {
  return '<div class="inline-block-fallback"><div class="inline-block-fallback-label">'
    + t('tutor.fallbackWarn')
    + '</div><pre class="inline-block-fallback-content">'
    + esc(inner)
    + '</pre></div>';
}

/** The placeholder element a mounted card replaces. */
function slotHtml(tag: ScaffoldTag, id: string): string {
  const shape = SLOT_SHAPE[tag];
  return `<div class="${shape.className}" ${shape.attr}="${id}"></div>`;
}

/** Add one scaffold to the placeholder list the widget scheduler mounts. */
function addPlaceholder(widgets: ScaffoldWidgets, block: ScaffoldBlock, id: string): void {
  const parsed = block.parsed;
  switch (block.kind) {
    case 'quiz':
      widgets.quizPH.push({ id, parsed: { ...(parsed as { slotId?: string | null }), slotId: id } as QuizMountData });
      break;
    case 'example':
      widgets.examplePH.push({ id, parsed: parsed as ParsedExample });
      break;
    case 'practice':
      widgets.practicePH.push({ id, parsed: { ...(parsed as { slotId?: string | null }), slotId: id } as PracticeMountData });
      break;
    case 'definition':
      widgets.definitionPH.push({ id, parsed: parsed as ParsedDefinition });
      break;
    case 'step':
      widgets.stepPH.push({ id, parsed: parsed as { n: number; body: string } });
      break;
    case 'flashcard':
      widgets.flashcardPH.push({ id, parsed: parsed as ParsedFlashcard });
      break;
    case 'derivation':
      widgets.derivationPH.push({ id, parsed: parsed as ParsedDerivation });
      break;
    case 'proof':
      widgets.proofPH.push({ id, parsed: parsed as ParsedProof });
      break;
    case 'theorem':
      widgets.theoremPH.push({ id, parsed: parsed as TheoremMountData });
      break;
    case 'key-point':
      widgets.keyPointPH.push({ id, parsed: parsed as ParsedKeyPoint });
      break;
    default:
      break;
  }
}

/**
 * Extract every scaffold of an assistant message and leave the prose.
 *
 * The returned `text` carries one empty slot div per scaffold, separated by
 * blank lines so the markdown renderer keeps them as their own blocks.
 */
export function extractScaffoldWidgets(source: string, { t, esc }: ScaffoldDeps): ScaffoldWidgets {
  const widgets: ScaffoldWidgets = {
    text: '',
    quizPH: [],
    examplePH: [],
    practicePH: [],
    definitionPH: [],
    stepPH: [],
    flashcardPH: [],
    derivationPH: [],
    proofPH: [],
    theoremPH: [],
    keyPointPH: [],
  };
  const counts: Record<string, number> = {};
  const parts: string[] = [];

  for (const segment of splitScaffolds(source)) {
    if (segment.kind === 'text') {
      parts.push(segment.text);
      continue;
    }
    if (segment.kind === 'fallback') {
      parts.push(fallback(segment.text, t, esc));
      continue;
    }
    const block = segment.block;
    const shape = SLOT_SHAPE[block.kind];
    const index = (counts[block.kind] = (counts[block.kind] ?? 0) + 1);
    const id = block.slotId ?? `${shape.prefix}-${index}-${randomSuffix()}`;
    parts.push(slotHtml(block.kind, id));
    addPlaceholder(widgets, block, id);
  }

  widgets.text = parts.filter(Boolean).join('\n\n');
  return widgets;
}
