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

import { appMode } from '../config/providers.js';
import { stateStore } from '../state/store.js';
import { wrapForCanvas } from './canvasWrap.ts';
import { decodeEntities, esc, stripCitationMarkers, stripTags } from './helpers.js';
import { formatMsg } from './markdown.js';
import { extractScaffoldWidgets } from './scaffoldPipeline.js';
import { scheduleWidgetMounts } from './widgetScheduler.js';
import {
  parseExampleInner,
  parsePracticeInner,
  parseQuizInner,
  type ParsedExample,
  type ParsedPractice,
  type ParsedQuiz,
} from './widgetParsers.js';

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

let deps: AssistantHtmlDeps = { recordMistake: () => {} };

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

type PracticeParsed = ParsedPractice & { correct?: string };

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

/**
 * Build the final message-body HTML for one assistant raw text,
 * scheduling widget mounts for the placeholder slots.
 */
export function buildAssistantHtml(rawText: unknown): string {
  /* Never render provider scratch work, including historical messages that
     were saved before this policy changed. */
  let text = String(rawText || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '');
  /* Chat mode: strip a trailing "Sources: …" block the model
     occasionally writes. */
  if (appMode === 'chat') {
    text = text.replace(
      /(?:^|\n)\s*(?:Sources?|参考来源|来源|参考资料|参考文献|引用|参考)\s*[:：][\s\S]*$/i,
      '',
    );
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

  /* Pass 1: <quiz>…</quiz> → interactive multiple-choice widget.
     One-question-per-turn rule: only the FIRST <quiz> block becomes a
     tappable widget; any extra <quiz> blocks the model emitted are
     stripped to escaped plain text so they read as prose instead of
     trying to mount a second widget. */
  const quizRe = /<quiz\b[^>]*>([\s\S]*?)<\/quiz>/gi;
  let m: RegExpExecArray | null;
  let qi = 0;
  let quizCount = 0;
  while ((m = quizRe.exec(text)) !== null) {
    const raw = m[0];
    if (quizCount >= 1) {
      /* Convert to escaped plain text — show the question stem, not
         the answer options, so the user can read what the model said
         without seeing answer choices hanging in the air. */
      const parsedLate = parseQuizInner(m[1]);
      const replacement = parsedLate && parsedLate.q ? esc(parsedLate.q) : esc(raw);
      text = text.slice(0, m.index) + '\n\n' + replacement + '\n\n' + text.slice(quizRe.lastIndex);
      quizRe.lastIndex = m.index + replacement.length + 4;
      continue;
    }
    const parsed = parseQuizInner(m[1]);
    if (!parsed) {
      const fbHtml = fallbackBlock(m[1]);
      text = text.slice(0, m.index) + '\n\n' + fbHtml + '\n\n' + text.slice(quizRe.lastIndex);
      quizRe.lastIndex = m.index + fbHtml.length + 4;
      continue;
    }
    const id = 'quiz-' + ++qi + '-' + randomSuffix();
    const slot = '<div class="quiz-slot" data-quiz-id="' + id + '"></div>';
    text = text.slice(0, m.index) + '\n\n' + slot + '\n\n' + text.slice(quizRe.lastIndex);
    quizRe.lastIndex = m.index + slot.length + 4;
    quizPH.push({ id, parsed });
    quizCount++;
  }

  /* Pass 2: <example>…</example> → worked-example card with hidden solution
     behind a reveal button (added in change 3). */
  const exampleRe = /<example\b[^>]*>([\s\S]*?)<\/example>/gi;
  let em: RegExpExecArray | null;
  let ei = 0;
  while ((em = exampleRe.exec(text)) !== null) {
    const parsedEx = parseExampleInner(em[1]);
    if (!parsedEx) {
      const fbHtml = fallbackBlock(em[1]);
      text = text.slice(0, em.index) + '\n\n' + fbHtml + '\n\n' + text.slice(exampleRe.lastIndex);
      exampleRe.lastIndex = em.index + fbHtml.length + 4;
      continue;
    }
    const eId = 'ex-' + ++ei + '-' + randomSuffix();
    const eSlot = '<div class="example-slot" data-example-id="' + eId + '"></div>';
    text = text.slice(0, em.index) + '\n\n' + eSlot + '\n\n' + text.slice(exampleRe.lastIndex);
    exampleRe.lastIndex = em.index + eSlot.length + 4;
    examplePH.push({ id: eId, parsed: parsedEx });
  }

  /* Pass 3: <practice>…</practice> → interactive practice card with a
     textarea + Submit button (added in change 2). The optional
     `correct="…"` attribute on the opening tag enables self-grading
     and a Reveal-answer button.
     One-question-per-turn rule: only the FIRST <practice> block becomes
     a tappable widget; extras are stripped to escaped plain text. */
  const practiceRe = /<practice\b([^>]*)>([\s\S]*?)<\/practice>/gi;
  let pm: RegExpExecArray | null;
  let pi = 0;
  let practiceCount = 0;
  while ((pm = practiceRe.exec(text)) !== null) {
    const pAttrs = pm[1] || '';
    const pCorrectM = pAttrs.match(/correct="([^"]+)"/i);
    if (practiceCount >= 1) {
      const parsedLate = parsePracticeInner(pm[2]);
      const replacement =
        parsedLate && parsedLate.problem ? esc(parsedLate.problem) : esc(pm[0]);
      text = text.slice(0, pm.index) + '\n\n' + replacement + '\n\n' + text.slice(practiceRe.lastIndex);
      practiceRe.lastIndex = pm.index + replacement.length + 4;
      continue;
    }
    const parsedPr: PracticeParsed | null = parsePracticeInner(pm[2]);
    if (!parsedPr) {
      const fbHtml = fallbackBlock(pm[2]);
      text = text.slice(0, pm.index) + '\n\n' + fbHtml + '\n\n' + text.slice(practiceRe.lastIndex);
      practiceRe.lastIndex = pm.index + fbHtml.length + 4;
      continue;
    }
    if (pCorrectM) {
      parsedPr.correct = pCorrectM[1];
    }
    const pId = 'pr-' + ++pi + '-' + randomSuffix();
    const pSlot = '<div class="practice-slot" data-practice-id="' + pId + '"></div>';
    text = text.slice(0, pm.index) + '\n\n' + pSlot + '\n\n' + text.slice(practiceRe.lastIndex);
    practiceRe.lastIndex = pm.index + pSlot.length + 4;
    practicePH.push({ id: pId, parsed: parsedPr });
    practiceCount++;
  }

  /* Pass 4: <mistake>…</mistake> → record to mistake book, strip from prose. */
  const mistakeRe = /<mistake\b([^>]*)>([\s\S]*?)<\/mistake>/gi;
  let mm: RegExpExecArray | null;
  while ((mm = mistakeRe.exec(text)) !== null) {
    const attrs = mm[1] || '';
    const typeM = attrs.match(/type="([^"]+)"/i);
    const correctM = attrs.match(/correct="([^"]+)"/i);
    const mistakeType = typeM ? typeM[1] : 'practice';
    const correctVal = correctM ? correctM[1] : '';
    if (mistakeType === 'practice' && correctVal) {
      /* U-L4 — capture the actual problem text instead of a placeholder.
         Prefer the tag's inner content; fall back to the first <practice>
         problem parsed from this same message (Pass 3 runs before us).
         Skip recording entirely when neither exists — a card with no
         question is useless in the mistake book and Redo would mount
         an empty widget. */
      let mistakeQ = stripTags(decodeEntities(mm[2] || '')).trim();
      if (!mistakeQ && practicePH.length) {
        mistakeQ = practicePH[0].parsed.problem || '';
      }
      if (mistakeQ) {
        deps.recordMistake({
          type: 'practice',
          q: mistakeQ,
          options: [],
          correct: correctVal,
          userAnswer: null,
          judgedAnswer: correctVal,
        });
      }
    }
    text = text.slice(0, mm.index) + text.slice(mistakeRe.lastIndex);
    mistakeRe.lastIndex = mm.index;
  }

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
    } catch {
      /* Canvas seed is best effort; fall back to the fresh id. */
    }
    html = wrapForCanvas(html, 'canvas', extKey, cid);
  }
  return html;
}
