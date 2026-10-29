/* Incremental previews and plugin registry for Tutor scaffolds during streaming. */
import { decodeEntities, escAttr, escHTML, stripTags } from './helpers.ts';

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
 * Built-in scaffold previews
 *
 * The stream renderer used to replace every scaffold with a small text
 * badge until the final pass. That made a perfectly valid <key-point>
 * look like plain prose while it was arriving, and the React handoff
 * could preserve that temporary DOM forever. Keep the extension registry
 * above for custom tools, but give the Tutor scaffolds a tolerant,
 * incremental renderer here. It accepts both complete fields and fields
 * whose closing tag has not arrived yet.
 * ------------------------------------------------------------------ */

const STREAM_SCAFFOLD_CLASSES: Record<string, string> = {
  quiz: 'inline-quiz',
  example: 'inline-example',
  practice: 'inline-practice',
  definition: 'inline-definition',
  step: 'scaffold-stream',
  flashcard: 'inline-flashcard',
  proof: 'inline-proof',
  theorem: 'inline-theorem',
  'key-point': 'inline-key-point',
  derivation: 'inline-derivation',
};

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
  const text = String(content || '').replace(/<[^>]+>/g, '').trim();
  return text.length > 200 ? text.slice(0, 200) + '…' : text;
}

function streamCard(tag: string, content: string): string {
  const cls = STREAM_SCAFFOLD_CLASSES[tag] || 'scaffold-stream';
  const label = streamScaffoldFallbackLabel(tag);
  /* The interactive scaffolds (quiz / example / practice) render WITHOUT a
   * badge in the final mounted widget. Skipping the badge here keeps the
   * streaming preview pixel-compatible with the final render, so the
   * finish() swap is imperceptible instead of "a labelled card losing its
   * label". Static scaffolds (key-point, theorem, …) keep the badge —
   * their final widgets carry an equivalent label element. */
  const badge = (tag === 'quiz' || tag === 'example' || tag === 'practice')
    ? ''
    : '<span class="scaffold-stream-label">' + escHTML(label) + '</span>';
  return '<div class="' + cls + ' scaffold-stream-live" data-scaffold-live="' + escAttr(tag) + '">' +
    badge + content + '</div>';
}

type StreamMarkdownRenderer = (value: string, empty?: string) => string;
type StreamPreviewRenderer = (inner: string, markdown: StreamMarkdownRenderer, attrs: string) => string;

function renderStreamMarkdown(value: string, formatMarkdown: (value: string) => string, empty = '…'): string {
  const text = String(value || '').trim();
  if (!text) return '<span class="scaffold-stream-placeholder shimmer-text">' + escHTML(empty) + '</span>';
  try {
    return formatMarkdown(text);
  } catch (_) {
    return escHTML(text);
  }
}

function renderKeyPointPreview(inner: string, markdown: StreamMarkdownRenderer): string {
  return streamCard('key-point',
    '<div class="inline-key-point-body">' + markdown(streamLeaf(inner)) + '</div>');
}

function renderDefinitionPreview(inner: string, markdown: StreamMarkdownRenderer): string {
  const term = streamField(inner, 'term');
  const body = streamField(inner, 'body');
  return streamCard('definition',
    '<div class="inline-definition-term">' + markdown(term, 'Term') + '</div>' +
    '<div class="inline-definition-body">' + markdown(body, 'Definition') + '</div>');
}

function renderExamplePreview(inner: string, markdown: StreamMarkdownRenderer): string {
  const title = streamField(inner, 'title') || 'Example';
  const problem = streamField(inner, 'problem');
  const solution = streamField(inner, 'solution');
  return streamCard('example',
    '<div class="inline-example-title">' + markdown(title) + '</div>' +
    '<div class="inline-example-problem">' + markdown(problem, 'Problem') + '</div>' +
    (solution
      ? '<span class="inline-example-reveal" aria-hidden="true">Show solution</span>' +
        '<div class="inline-example-solution" hidden>' + markdown(solution) + '</div>'
      : ''));
}

function renderPracticePreview(inner: string, markdown: StreamMarkdownRenderer): string {
  const problem = streamField(inner, 'problem');
  const hint = streamField(inner, 'hint');
  return streamCard('practice',
    '<div class="inline-practice-problem">' + markdown(problem, 'Problem') + '</div>' +
    (hint
      ? '<span class="inline-practice-hint-toggle" aria-hidden="true">Show hint</span>' +
        '<div class="inline-practice-hint" hidden>' + markdown(hint) + '</div>'
      : '') +
    '<div class="inline-practice-form" aria-hidden="true">' +
      '<div class="inline-practice-textarea">Type your answer…</div>' +
      '<div class="inline-practice-actions"><span class="inline-practice-submit">Submit</span></div>' +
      '<div class="inline-practice-feedback"></div>' +
    '</div>');
}

function renderFlashcardPreview(inner: string, markdown: StreamMarkdownRenderer): string {
  const front = streamField(inner, 'front');
  const back = streamField(inner, 'back');
  return streamCard('flashcard',
    '<div class="inline-flashcard-front">' + markdown(front, 'Front') + '</div>' +
    (back ? '<div class="inline-flashcard-back">' + markdown(back) + '</div>' : ''));
}

function renderTheoremPreview(inner: string, markdown: StreamMarkdownRenderer): string {
  const title = streamField(inner, 'title');
  const statement = streamField(inner, 'statement');
  return streamCard('theorem',
    (title ? '<div class="inline-theorem-title">' + markdown(title) + '</div>' : '') +
    '<div class="inline-theorem-statement">' + markdown(statement, 'Statement') + '</div>');
}

function renderProofPreview(inner: string, markdown: StreamMarkdownRenderer): string {
  const title = streamField(inner, 'title');
  const body = streamField(inner, 'body');
  return streamCard('proof',
    (title ? '<div class="inline-proof-title">' + markdown(title) + '</div>' : '') +
    '<div class="inline-proof-body">' + markdown(body, 'Proof') + '</div>');
}

function renderDerivationPreview(inner: string, markdown: StreamMarkdownRenderer): string {
  const title = streamField(inner, 'title');
  const body = streamField(inner, 'body');
  return streamCard('derivation',
    (title ? '<div class="inline-derivation-title">' + markdown(title) + '</div>' : '') +
    '<div class="inline-derivation-body">' + markdown(body, 'Derivation') + '</div>');
}

function renderStepPreview(inner: string, attrs: string): string {
  const number = streamAttr(attrs, 'n');
  const body = streamPlainPreview(inner);
  return streamCard('step',
    '<span class="scaffold-stream-step-number">' + escHTML(number || '·') + '</span>' +
    (body ? escHTML(body) : '<span class="scaffold-stream-placeholder shimmer-text">…</span>'));
}

function renderQuizPreview(inner: string, markdown: StreamMarkdownRenderer): string {
  const question = streamField(inner, 'q');
  const options: string[] = [];
  const optionRe = /<o\s+letter=["']([A-Da-d])["'][^>]*>([\s\S]*?)(?:<\/o>|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = optionRe.exec(inner)) !== null) {
    options.push('<div class="inline-quiz-opt" aria-hidden="true">' +
      '<span class="inline-quiz-opt-letter">' + escHTML(match[1].toUpperCase()) + '.</span>' +
      '<span class="inline-quiz-opt-text">' + markdown(decodeEntities(match[2].trim())) + '</span></div>');
  }
  return streamCard('quiz',
    '<div class="inline-quiz-q">' + markdown(question, 'Question') + '</div>' +
    (options.length ? '<div class="inline-quiz-opts">' + options.join('') + '</div>' : '') +
    /* Final mounted quiz has an empty feedback div — mirror it exactly so
     * the live preview and the final widget are structurally identical. */
    '<div class="inline-quiz-feedback"></div>');
}

function renderGenericScaffoldPreview(tag: string, inner: string): string {
  return streamCard(tag, escHTML(streamPlainPreview(inner)));
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
  step: (inner, _markdown, attrs) => renderStepPreview(inner, attrs),
  quiz: (inner, markdown) => renderQuizPreview(inner, markdown),
};

export function renderStreamScaffoldPreview(
  tag: string,
  inner: string,
  attrs: string,
  formatMarkdown: (value: string) => string,
): string | null {
  if (!STREAM_SCAFFOLD_CLASSES[tag]) return null;
  const renderer = STREAM_PREVIEW_RENDERERS[tag];
  if (!renderer) return renderGenericScaffoldPreview(tag, inner);
  const markdown: StreamMarkdownRenderer = (value, empty) => renderStreamMarkdown(value, formatMarkdown, empty);
  return renderer(inner, markdown, attrs);
}
