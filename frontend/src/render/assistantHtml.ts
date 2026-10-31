/**
 * render/assistantHtml.ts — final assistant message-body HTML builder.
 *
 * Extracted from renderAssistantHTML in main.js. Takes the raw text the
 * assistant produced and converts it into the final message-body HTML,
 * including stripping <quiz>, <example>, and <practice> blocks from the
 * prose and injecting interactive/static widgets in their place.
 *
 * IMPORTANT: empty slot divs are embedded directly into the markdown
 * source (not as __PLACEHOLDER__ text) because GitHub-Flavored Markdown
 * interprets __...__ as <strong>...</strong>, which would silently
 * destroy the placeholders. Empty <div> blocks are passed through by
 * marked unchanged.
 *
 * Only the mistake-book writer lives in main.js, so the module takes it
 * via configureAssistantHtml(); everything else (including the appMode
 * live binding) is imported directly.
 */

import { appMode } from '../config/providers.ts';
import { stateStore } from '../state/store.ts';
import { wrapForCanvas } from './canvasWrap.ts';
import { decodeEntities, esc, stripCitationMarkers, stripTags } from './helpers.ts';
import { formatMsg } from './markdown.ts';
import { extractScaffoldWidgets } from './scaffoldPipeline.ts';
import { scheduleWidgetMounts } from './widgetScheduler.ts';
import {
  parseExampleInner,
  parsePracticeInner,
  parseQuizInner,
  type ParsedExample,
  type ParsedPractice,
  type ParsedQuiz,
} from './widgetParsers.ts';
import { reportSwallow as reportEmptyCatch } from '../util/reportSwallow.ts';

/** Mistake-book entry written for <mistake> practice blocks. */
export interface PracticeMistakeRecord {
  type: string;
  q: string;
  options: Array<{ letter: string; text: string }>;
  correct: string;
  userAnswer: string | null;
  judgedAnswer: string;
}

export interface AssistantHtmlDeps {
  /** Mistake-book writer owned by main.js. */
  recordMistake: (rec: PracticeMistakeRecord) => void;
}

let deps: AssistantHtmlDeps | undefined;

/** Provide the mistake-book writer owned by main.js. */
export function configureAssistantHtml(next: AssistantHtmlDeps): void {
  deps = next;
}

/** Global i18n lookup, resolved the same way main.js does. */
function t(key: string): string {
  const g = globalThis as unknown as { t: (key: string) => string };
  return g.t(key);
}

interface SlotEntry<Parsed> {
  id: string;
  parsed: Parsed;
}

type PracticeParsed = ParsedPractice & { correct?: string; slotId?: string | null };

function fallbackBlock(inner: string): string {
  return (
    '<div class="inline-block-fallback"><div class="inline-block-fallback-label">' +
    t('tutor.fallbackWarn') +
    '</div><pre class="inline-block-fallback-content">' +
    esc(inner) +
    '</pre></div>'
  );
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

/* A "Sources:" marker opening a line, Chinese variants included. */
const SOURCES_MARKER_RE = /(^|\n)[ \t]*(?:Sources?|参考来源|来源|参考资料|参考文献|引用|参考)[ \t]*[:：]/gi;
/* One entry of a citation list: a URL, a markdown link, a bare domain on a
   common TLD, or a [n] / 【n】 reference. */
const CITATION_ENTRY_RE =
  /https?:\/\/|\bwww\.|\]\(|^(?:[-*+•]\s*)?(?:\[\d{1,3}\]|【\d{1,3}】)|\b[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|edu|gov|io|dev|ai|cn|wiki|info|co|me|app)\b/i;

/**
 * Drop a trailing "Sources: …" citation list (sources already live in the
 * search tool card). Only a genuine list goes: the marker must open the
 * answer's final stretch and every non-blank line after it must be a
 * citation entry. The previous rule cut from the FIRST marker line to the
 * end, so an ordinary "参考：详见教材第三章。" mid-answer deleted everything
 * after it — and since only this final pass applied it, the answer visibly
 * lost its tail at finish.
 */
export function stripTrailingSources(text: string): string {
  for (const m of text.matchAll(SOURCES_MARKER_RE)) {
    const at = m.index ?? 0;
    const entries = text
      .slice(at + m[0].length)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (entries.every((line) => CITATION_ENTRY_RE.test(line))) {
      return text.slice(0, at);
    }
  }
  return text;
}

function replaceQuizSlots(text: string, slots: SlotEntry<ParsedQuiz>[]): string {
  return text.replace(/<quiz\b([^>]*)>([\s\S]*?)<\/quiz>/gi, (raw: string, attrs: string, inner: string) => {
    const parsed = parseQuizInner(inner);
    if (slots.length) return '\n\n' + esc(parsed?.q || raw) + '\n\n';
    if (!parsed) return '\n\n' + fallbackBlock(inner) + '\n\n';
    const requestedId = attrs.match(/\bdata-quiz-id\s*=\s*["']([\w-]{1,120})["']/i)?.[1];
    const id = requestedId || 'quiz-' + (slots.length + 1) + '-' + randomSuffix();
    parsed.slotId = id;
    slots.push({ id, parsed });
    return '\n\n<div class="quiz-slot" data-quiz-id="' + id + '"></div>\n\n';
  });
}

function replaceExampleSlots(text: string, slots: SlotEntry<ParsedExample>[]): string {
  return text.replace(/<example\b[^>]*>([\s\S]*?)<\/example>/gi, (_raw: string, inner: string) => {
    const parsed = parseExampleInner(inner);
    if (!parsed) return '\n\n' + fallbackBlock(inner) + '\n\n';
    const id = 'ex-' + (slots.length + 1) + '-' + randomSuffix();
    slots.push({ id, parsed });
    return '\n\n<div class="example-slot" data-example-id="' + id + '"></div>\n\n';
  });
}

function replacePracticeSlots(text: string, slots: SlotEntry<PracticeParsed>[]): string {
  return text.replace(/<practice\b([^>]*)>([\s\S]*?)<\/practice>/gi, (raw: string, attrs: string, inner: string) => {
    const parsed: PracticeParsed | null = parsePracticeInner(inner);
    if (slots.length) return '\n\n' + esc(parsed?.problem || raw) + '\n\n';
    if (!parsed) return '\n\n' + fallbackBlock(inner) + '\n\n';
    const correct = attrs.match(/correct="([^"]+)"/i);
    if (correct) parsed.correct = decodeEntities(correct[1]);
    const requestedId = attrs.match(/\bdata-practice-id\s*=\s*["']([\w-]{1,120})["']/i)?.[1];
    const id = requestedId || 'pr-' + (slots.length + 1) + '-' + randomSuffix();
    parsed.slotId = id;
    slots.push({ id, parsed });
    return '\n\n<div class="practice-slot" data-practice-id="' + id + '"></div>\n\n';
  });
}

function recordInlineMistakes(text: string, practices: SlotEntry<PracticeParsed>[]): string {
  return text.replace(/<mistake\b([^>]*)>([\s\S]*?)<\/mistake>/gi, (_raw: string, attrs: string, inner: string) => {
    const type = attrs.match(/type="([^"]+)"/i)?.[1] || 'practice';
    const correct = attrs.match(/correct="([^"]+)"/i)?.[1] || '';
    if (type === 'practice' && correct) {
      // An empty tag may refer to the first practice in this answer, but
      // never create a mistake record without a usable question.
      const question = stripTags(decodeEntities(inner)).trim() || practices[0]?.parsed.problem || '';
      if (question) deps?.recordMistake({
        type: 'practice', q: question, options: [], correct,
        userAnswer: null, judgedAnswer: correct,
      });
    }
    return '';
  });
}

/** Build final message HTML and schedule mounts for its widget slots. */
export function buildAssistantHtml(rawText: unknown): string {
  /* Never render provider scratch work, including historical messages that
     were saved before this policy changed. */
  let text = String(rawText || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '');
  /* Chat mode: strip a trailing "Sources: …" block the model
     occasionally writes. The rule must never blank the whole bubble:
     a short answer can legitimately START with such a marker
     (e.g. "来源：意大利语…"), and deleting it reads as the head of
     the answer being swallowed. */
  if (appMode === 'chat') {
    const stripped = stripTrailingSources(text);
    if (stripped.trim()) text = stripped;
  }
  /* P_strip-citations — the answer body carries no [1]/[2] search-citation
     markers. Sources stay in the search tool card; the models add inline
     markers despite the prompt, so the renderer removes them (code and
     math spans are protected inside the helper). */
  text = stripCitationMarkers(text);
  /* All placeholder lists — collected during the scan, mounted at the end. */
  const quizPH: SlotEntry<ParsedQuiz>[] = [];
  const examplePH: SlotEntry<ParsedExample>[] = [];
  const practicePH: SlotEntry<PracticeParsed>[] = [];

  // Preserve pass order and one interactive question of each kind per turn.
  // Malformed blocks stay readable; later questions become escaped prose.
  text = replaceQuizSlots(text, quizPH);
  text = replaceExampleSlots(text, examplePH);
  text = replacePracticeSlots(text, practicePH);
  text = recordInlineMistakes(text, practicePH);

  const scaffoldPH = extractScaffoldWidgets(text, { t, esc });
  text = scaffoldPH.text as string;
  const definitionPH = scaffoldPH.definitionPH;
  const stepPH = scaffoldPH.stepPH;
  const flashcardPH = scaffoldPH.flashcardPH;
  const derivationPH = scaffoldPH.derivationPH;
  const proofPH = scaffoldPH.proofPH;
  const theoremPH = scaffoldPH.theoremPH;
  const keyPointPH = scaffoldPH.keyPointPH;

  /* formatMsg uses marked.parse, which passes raw <div> blocks through
     untouched. The slots will land in the final HTML intact. */
  let html = formatMsg(text);

  /* Widget mounting is deferred until the rendered HTML is in the DOM. */
  scheduleWidgetMounts({
    quizPH,
    examplePH,
    practicePH,
    definitionPH,
    stepPH,
    flashcardPH,
    derivationPH,
    proofPH,
    theoremPH,
    keyPointPH,
  });
  /* P_canvas-mode — write (and any future canvas-mode extension) wraps the
     finalized HTML in a <div class="canvas-block"> so React can mount an
     editable surface from data-canvas-id. The id is read from the message
     entry that finish() seeded just before calling renderAssistantHTML
     (stateStore.read("messages")[idx].canvasId); that keeps DOM and state in lock-step
     across re-renders. */
  const w = window as unknown as {
    _activeTemplate?: { outputMode?: string; extensionKey?: string } | null;
  };
  const activeTpl = (typeof window !== 'undefined' && w._activeTemplate) || null;
  if (activeTpl && activeTpl.outputMode === 'canvas') {
    const extKey = activeTpl.extensionKey || 'canvas';
    let cid = 'canvas-' + Math.random().toString(36).slice(2, 10);
    /* If finish() pre-allocated a canvasId, use that one instead so the
       React <CanvasBlock> reads the same id from stateStore.read("messages")[idx]. */
    try {
      const seed = (stateStore.read('_canvasPendingId') as string | null) || null;
      if (seed) cid = seed;
    } catch (error) {
      reportEmptyCatch(error, 'empty catch: render/assistantHtml.ts:245', 'expected');
      /* Canvas seed is best effort; fall back to the fresh id. */
    }
    html = wrapForCanvas(html, 'canvas', extKey, cid);
  }
  return html;
}
