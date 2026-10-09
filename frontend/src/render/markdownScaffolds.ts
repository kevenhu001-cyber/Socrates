/* Incremental previews and plugin registry for Tutor scaffolds during streaming. */
import { decodeEntities, escAttr, escHTML, stripTags } from './helpers.js';

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

export function renderStreamScaffoldPreview(
  tag: string,
  inner: string,
  attrs: string,
  formatMarkdown: (value: string) => string,
): string | null {
  function renderStreamMarkdown(value: string, empty = '…'): string {
    const text = String(value || '').trim();
    if (!text) return '<span class="scaffold-stream-placeholder shimmer-text">' + escHTML(empty) + '</span>';
    try {
      return formatMarkdown(text);
    } catch (_) {
      return escHTML(text);
    }
  }
  if (!STREAM_SCAFFOLD_CLASSES[tag]) return null;

  if (tag === 'key-point') {
    return streamCard(tag,
      '<div class="inline-key-point-body">' + renderStreamMarkdown(streamLeaf(inner)) + '</div>');
  }

  if (tag === 'definition') {
    const term = streamField(inner, 'term');
    const body = streamField(inner, 'body');
    return streamCard(tag,
      '<div class="inline-definition-term">' + renderStreamMarkdown(term, 'Term') + '</div>' +
      '<div class="inline-definition-body">' + renderStreamMarkdown(body, 'Definition') + '</div>');
  }

  if (tag === 'example') {
    const title = streamField(inner, 'title') || 'Example';
    const problem = streamField(inner, 'problem');
    const solution = streamField(inner, 'solution');
    return streamCard(tag,
      '<div class="inline-example-title">' + renderStreamMarkdown(title) + '</div>' +
      '<div class="inline-example-problem">' + renderStreamMarkdown(problem, 'Problem') + '</div>' +
      (solution
        ? '<button type="button" class="inline-example-reveal" aria-disabled="true" tabindex="-1">Show solution</button>' +
          '<div class="inline-example-solution" hidden>' + renderStreamMarkdown(solution) + '</div>'
        : ''));
  }

  if (tag === 'practice') {
    const problem = streamField(inner, 'problem');
    const hint = streamField(inner, 'hint');
    return streamCard(tag,
      '<div class="inline-practice-problem">' + renderStreamMarkdown(problem, 'Problem') + '</div>' +
      (hint
        ? '<button type="button" class="inline-practice-hint-toggle" aria-disabled="true" tabindex="-1">Show hint</button>' +
          '<div class="inline-practice-hint" hidden>' + renderStreamMarkdown(hint) + '</div>'
        : '') +
      '<form class="inline-practice-form">' +
        '<textarea class="inline-practice-textarea" rows="3" placeholder="Type your answer…" aria-disabled="true" tabindex="-1"></textarea>' +
        '<div class="inline-practice-actions"><button type="button" class="inline-practice-submit" aria-disabled="true" tabindex="-1">Submit</button></div>' +
        '<div class="inline-practice-feedback"></div>' +
      '</form>');
  }

  if (tag === 'flashcard') {
    const front = streamField(inner, 'front');
    const back = streamField(inner, 'back');
    return streamCard(tag,
      '<div class="inline-flashcard-front">' + renderStreamMarkdown(front, 'Front') + '</div>' +
      (back ? '<div class="inline-flashcard-back">' + renderStreamMarkdown(back) + '</div>' : ''));
  }

  if (tag === 'theorem') {
    const title = streamField(inner, 'title');
    const statement = streamField(inner, 'statement');
    return streamCard(tag,
      (title ? '<div class="inline-theorem-title">' + renderStreamMarkdown(title) + '</div>' : '') +
      '<div class="inline-theorem-statement">' + renderStreamMarkdown(statement, 'Statement') + '</div>');
  }

  if (tag === 'proof') {
    const title = streamField(inner, 'title');
    const body = streamField(inner, 'body');
    return streamCard(tag,
      (title ? '<div class="inline-proof-title">' + renderStreamMarkdown(title) + '</div>' : '') +
      '<div class="inline-proof-body">' + renderStreamMarkdown(body, 'Proof') + '</div>');
  }

  if (tag === 'derivation') {
    const title = streamField(inner, 'title');
    const body = streamField(inner, 'body');
    return streamCard(tag,
      (title ? '<div class="inline-derivation-title">' + renderStreamMarkdown(title) + '</div>' : '') +
      '<div class="inline-derivation-body">' + renderStreamMarkdown(body, 'Derivation') + '</div>');
  }

  if (tag === 'step') {
    const n = streamAttr(attrs, 'n');
    const body = streamPlainPreview(inner);
    return streamCard(tag,
      '<span class="scaffold-stream-step-number">' + escHTML(n || '·') + '</span>' +
      (body ? escHTML(body) : '<span class="scaffold-stream-placeholder shimmer-text">…</span>'));
  }

  if (tag === 'quiz') {
    const q = streamField(inner, 'q');
    const options: string[] = [];
    const optionRe = /<o\s+letter=["']([A-Da-d])["'][^>]*>([\s\S]*?)(?:<\/o>|$)/gi;
    let match: RegExpExecArray | null;
    while ((match = optionRe.exec(inner)) !== null) {
      options.push('<button type="button" class="inline-quiz-opt" aria-disabled="true" tabindex="-1">' +
        '<span class="inline-quiz-opt-letter">' + escHTML(match[1].toUpperCase()) + '.</span>' +
        '<span class="inline-quiz-opt-text">' + renderStreamMarkdown(decodeEntities(match[2].trim())) + '</span></button>');
    }
    return streamCard(tag,
      '<div class="inline-quiz-q">' + renderStreamMarkdown(q, 'Question') + '</div>' +
      (options.length ? '<div class="inline-quiz-opts">' + options.join('') + '</div>' : '') +
      /* Final mounted quiz has an empty feedback div — mirror it exactly so
       * the live preview and the final widget are structurally identical. */
      '<div class="inline-quiz-feedback"></div>');
  }

  return streamCard(tag, escHTML(streamPlainPreview(inner)));
}
