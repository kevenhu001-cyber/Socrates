/* Incremental previews and plugin registry for Tutor scaffolds during streaming. */
import { decodeEntities, escAttr, escHTML, stripTags } from './helpers.ts';
import { stripHtmlTags } from '../util/stripHtml.ts';
import { splitDerivationSteps } from '@socrates/ui/learn-model';

/* Stream-time scaffold plugins. */
interface StreamScaffoldPlugin {
  name: string;
  parse: (inner: string) => unknown;
  render: (parsed: unknown) => string | null;
}
let STREAM_SCAFFOLD_PLUGINS: StreamScaffoldPlugin[] = [];

const STREAM_SCAFFOLD_FALLBACK: Record<string, string> = {
  quiz: '[Quick Check]',
  example: '[Example]',
  practice: '[Practice]',
  definition: '[Definition]',
  step: '[Step]',
  flashcard: '[Flashcard]',
  proof: '[Proof]',
  theorem: '[Theorem]',
  'key-point': '[Key Point]',
  derivation: '[Derivation]',
};

export function registerStreamScaffold(
  name: string,
  parse: (inner: string) => unknown,
  render: (parsed: unknown) => string | null,
): void {
  STREAM_SCAFFOLD_PLUGINS = STREAM_SCAFFOLD_PLUGINS.filter(function (p) {
    return p.name !== name;
  });
  STREAM_SCAFFOLD_PLUGINS.push({ name, parse, render });
}

export function clearStreamScaffolds(): void {
  STREAM_SCAFFOLD_PLUGINS = [];
}

export function findStreamScaffold(name: string): StreamScaffoldPlugin | null {
  for (let i = 0; i < STREAM_SCAFFOLD_PLUGINS.length; i++) {
    if (STREAM_SCAFFOLD_PLUGINS[i].name === name) return STREAM_SCAFFOLD_PLUGINS[i];
  }
  return null;
}

/* ------------------------------------------------------------------
 * Built-in scaffold previews (RN-3)
 *
 * While a scaffold streams, the transcript shows a static preview built from
 * the same box as the mounted React Native card: `.sc-live` has the card's
 * outer margin, radius, hairline, label header and body padding, and reserves
 * the controls' row height with quiet skeleton capsules. Fields render through
 * the progressive markdown + KaTeX renderer as `.sc-rich`, exactly like the
 * mounted card's host-rendered fields, so the finish() swap does not move the
 * content. Interactive widgets mount only once the block is complete
 * (scheduleWidgetMounts after the final render); until then nothing here is
 * focusable or clickable.
 * ------------------------------------------------------------------ */

const STREAM_SCAFFOLD_TAGS = new Set(Object.keys(STREAM_SCAFFOLD_FALLBACK));

const STREAM_LABEL_KEYS: Record<string, [string, string]> = {
  quiz: ['learn.label.quiz', 'Quiz'],
  example: ['learn.label.example', 'Example'],
  practice: ['learn.label.practice', 'Practice'],
  definition: ['learn.label.definition', 'Definition'],
  step: ['learn.label.step', 'Steps'],
  flashcard: ['learn.label.flashcard', 'Flashcard'],
  proof: ['learn.label.proof', 'Proof'],
  theorem: ['learn.label.theorem', 'Theorem'],
  'key-point': ['tutor.keyPointLabel', 'Key point'],
  derivation: ['learn.label.derivation', 'Derivation'],
  'flashcard-front': ['learn.flashcard.front', 'Question'],
};

function streamLabel(tag: string): string {
  const [key, fallback] = STREAM_LABEL_KEYS[tag] || ['', tag];
  const translate = (globalThis as { t?: (key: string) => string }).t;
  if (key && typeof translate === 'function') {
    try {
      const value = translate(key);
      if (value && value !== key) return value;
    } catch (_) {
      /* empty-catch: intentional — the English label is the fallback */
    }
  }
  return fallback;
}

function streamField(inner: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(inner || '').match(
    new RegExp('<' + escapedName + '\\b[^>]*>([\\s\\S]*?)(?:</' + escapedName + '>|$)', 'i'),
  );
  return match ? decodeEntities(match[1].trim()) : '';
}

function streamAttr(attrs: string, name: string): string {
  const attrRe = /([a-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(String(attrs || ''))) !== null) {
    if (match[1].toLowerCase() === name.toLowerCase()) {
      return decodeEntities(match[2] ?? match[3] ?? '');
    }
  }
  return '';
}

function streamLeaf(inner: string): string {
  return decodeEntities(String(inner || '').trim());
}

function streamPlainPreview(inner: string): string {
  const text = stripTags(streamLeaf(inner));
  return text.length > 300 ? text.slice(0, 300) + '…' : text;
}

export function streamScaffoldFallbackLabel(tag: string): string {
  return STREAM_SCAFFOLD_FALLBACK[tag] || '[' + tag + ']';
}

export function streamScaffoldFallbackText(content: string): string {
  const text = stripHtmlTags(content).trim();
  return text.length > 200 ? text.slice(0, 200) + '…' : text;
}

/** Quiet capsule that holds a control's place until the card mounts. */
function skeletonPill(kind: 'solid' | 'soft' | 'quiet' = 'quiet', width = 96): string {
  return '<span class="sc-live-pill sc-live-pill--' + kind + '" style="width:' + width + 'px"></span>';
}

function actionsRow(left: string, right: string): string {
  return '<div class="sc-live-actions" aria-hidden="true"><span class="sc-live-actions-start">' + left
    + '</span><span class="sc-live-actions-end">' + right + '</span></div>';
}

function streamCard(tag: string, body: string, trailing = ''): string {
  return '<div class="sc-live" data-scaffold-live="' + escAttr(tag) + '" aria-busy="true">'
    + '<div class="sc-live-head"><span class="sc-live-label">' + escHTML(streamLabel(tag)) + '</span>' + trailing + '</div>'
    + '<div class="sc-live-body">' + body + '</div></div>';
}

type StreamMarkdownRenderer = (value: string, part: string) => string;
type StreamPreviewRenderer = (inner: string, markdown: StreamMarkdownRenderer, attrs: string) => string;

function renderStreamMarkdown(value: string, part: string, formatMarkdown: (value: string) => string): string {
  const text = String(value || '').trim();
  if (!text) return '<div class="sc-live-skeleton" data-part="' + escAttr(part) + '"></div>';
  let html: string;
  try {
    html = formatMarkdown(text);
  } catch (_) {
    html = escHTML(text);
  }
  return '<div class="sc-rich" data-part="' + escAttr(part) + '">' + html + '</div>';
}

function renderKeyPointPreview(inner: string, markdown: StreamMarkdownRenderer): string {
  return streamCard('key-point', markdown(streamLeaf(inner), 'key-point-body'));
}

function renderDefinitionPreview(inner: string, markdown: StreamMarkdownRenderer): string {
  const term = streamField(inner, 'term');
  const body = streamField(inner, 'body');
  return streamCard('definition', markdown(term, 'definition-term') + (term || body ? markdown(body, 'definition-body') : ''));
}

function renderExamplePreview(inner: string, markdown: StreamMarkdownRenderer): string {
  const title = streamField(inner, 'title');
  const problem = streamField(inner, 'problem');
  const solution = streamField(inner, 'solution');
  const hint = streamField(inner, 'hint');
  return streamCard('example',
    (title && title !== 'Example' ? markdown(title, 'example-title') : '')
    + markdown(problem, 'example-problem')
    + (hint ? actionsRow(skeletonPill('quiet', 104), '') : '')
    + (solution ? actionsRow(skeletonPill('quiet', 112), '') : ''));
}

function renderPracticePreview(inner: string, markdown: StreamMarkdownRenderer): string {
  const title = streamField(inner, 'title');
  const problem = streamField(inner, 'problem');
  const hint = streamField(inner, 'hint');
  return streamCard('practice',
    (title && title !== 'Practice' ? markdown(title, 'practice-title') : '')
    + markdown(problem, 'practice-problem')
    + (hint ? actionsRow(skeletonPill('quiet', 104), '') : '')
    + '<div class="sc-live-input" aria-hidden="true"></div>'
    + actionsRow('', skeletonPill('solid', 72)));
}

function renderFlashcardPreview(inner: string, markdown: StreamMarkdownRenderer): string {
  const front = streamField(inner, 'front');
  return streamCard('flashcard',
    '<div class="sc-live-face"><span class="sc-live-face-label">' + escHTML(streamLabel('flashcard-front')) + '</span>'
    + markdown(front, 'flashcard-front') + '</div>'
    + actionsRow('', skeletonPill('soft', 88)));
}

function renderTheoremPreview(inner: string, markdown: StreamMarkdownRenderer): string {
  const title = streamField(inner, 'title');
  const statement = streamField(inner, 'statement');
  return streamCard('theorem', (title ? markdown(title, 'theorem-title') : '') + markdown(statement, 'theorem-statement'));
}

function renderProofPreview(inner: string, markdown: StreamMarkdownRenderer): string {
  const title = streamField(inner, 'title');
  const body = streamField(inner, 'body');
  return streamCard('proof', (title ? markdown(title, 'proof-title') : '') + markdown(body, 'proof-body'), skeletonPill('quiet', 72));
}

function stepRows(steps: string[], markdown: StreamMarkdownRenderer, part: string, numbers?: string[]): string {
  return '<div class="sc-live-steps">' + steps.map((step, index) => (
    '<div class="sc-live-step"><span class="sc-live-step-n">' + escHTML(numbers?.[index] || String(index + 1)) + '</span>'
    + '<div class="sc-live-step-body">' + markdown(step, part) + '</div></div>'
  )).join('') + '</div>';
}

function renderDerivationPreview(inner: string, markdown: StreamMarkdownRenderer): string {
  const title = streamField(inner, 'title');
  const body = streamField(inner, 'body');
  const steps = splitDerivationSteps(body);
  return streamCard('derivation',
    (title ? markdown(title, 'derivation-title') : '')
    + (steps.length ? stepRows(steps, markdown, 'derivation-step') : markdown('', 'derivation-step')),
    steps.length > 1 ? skeletonPill('quiet', 80) : '');
}

function renderStepPreview(inner: string, markdown: StreamMarkdownRenderer, attrs: string): string {
  const number = streamAttr(attrs, 'n');
  const body = streamPlainPreview(inner);
  /* Consecutive step previews merge into one list (CSS sibling rule), like the
     mounted StepsCard that folds every <step> into the first slot. */
  return streamCard('step', stepRows([body], markdown, 'step-step', [number || '1']));
}

function renderQuizPreview(inner: string, markdown: StreamMarkdownRenderer, attrs: string): string {
  const question = streamField(inner, 'q');
  const options: string[] = [];
  const optionRe = /<o\s+letter=["']([A-Ha-h])["'][^>]*>([\s\S]*?)(?:<\/o>|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = optionRe.exec(inner)) !== null) {
    options.push('<div class="sc-live-option" aria-hidden="true">'
      + '<span class="sc-live-letter">' + escHTML(match[1].toUpperCase()) + '</span>'
      + markdown(stripTags(decodeEntities(match[2].trim())), 'quiz-option') + '</div>');
  }
  const multi = /\b(?:multi|multiple)\b/i.test(attrs) || /<correct>\s*[A-Ha-h]\s*[,，、]?\s*[A-Ha-h]/i.test(inner);
  return streamCard('quiz',
    markdown(question, 'quiz-q')
    + (options.length ? '<div class="sc-live-options">' + options.join('') + '</div>' : '')
    + actionsRow('', skeletonPill('solid', 88)),
    multi ? skeletonPill('quiet', 64) : '');
}

function renderGenericScaffoldPreview(tag: string, inner: string): string {
  return streamCard(tag, '<div class="sc-rich">' + escHTML(streamPlainPreview(inner)) + '</div>');
}

const STREAM_PREVIEW_RENDERERS: Record<string, StreamPreviewRenderer> = {
  'key-point': (inner, markdown) => renderKeyPointPreview(inner, markdown),
  definition: (inner, markdown) => renderDefinitionPreview(inner, markdown),
  example: (inner, markdown) => renderExamplePreview(inner, markdown),
  practice: (inner, markdown) => renderPracticePreview(inner, markdown),
  flashcard: (inner, markdown) => renderFlashcardPreview(inner, markdown),
  theorem: (inner, markdown) => renderTheoremPreview(inner, markdown),
  proof: (inner, markdown) => renderProofPreview(inner, markdown),
  derivation: (inner, markdown) => renderDerivationPreview(inner, markdown),
  step: (inner, markdown, attrs) => renderStepPreview(inner, markdown, attrs),
  quiz: (inner, markdown, attrs) => renderQuizPreview(inner, markdown, attrs),
};

export function renderStreamScaffoldPreview(
  tag: string,
  inner: string,
  attrs: string,
  formatMarkdown: (value: string) => string,
): string | null {
  if (!STREAM_SCAFFOLD_TAGS.has(tag)) return null;
  const renderer = STREAM_PREVIEW_RENDERERS[tag];
  if (!renderer) return renderGenericScaffoldPreview(tag, inner);
  const markdown: StreamMarkdownRenderer = (value, part) => renderStreamMarkdown(value, part, formatMarkdown);
  return renderer(inner, markdown, attrs);
}
