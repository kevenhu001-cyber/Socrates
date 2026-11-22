import { hasCompleteScaffold } from '../../render/markdownScaffolds.ts';
import { isStableMarkdownPrefix } from '../../render/streaming.ts';
import {
  createProseCache,
  sharedFinalProseCache,
  clearSharedProseCache,
} from '../../render/proseCache.ts';
import { useMemo, useRef, useSyncExternalStore } from 'react';
import {
  applyScaffoldTurnPlan,
  scaffoldTurnPlan,
  type ScaffoldTurnPlan,
} from '@socrates/ui/learn-split';
import { getLegacyActions } from '../legacy/gateway.ts';
import { stripLegacyToolHtml } from './toolRunModel.js';
import { getMathRenderRevision, subscribeMathRenderRevision } from '../../render/mathRevision.ts';
import { getCurrentLang } from '../../ui/legacyI18n.ts';
import { escHTML } from '../../render/text.ts';

const IMPURE_OUTPUT = /class="viz"|-slot"|canvas-block/;

/* A long plain-prose tail (the common single-paragraph Chinese answer) has
   no Markdown to parse. Marked + sanitize + widget wiring are pure overhead
   there, and they run on every streaming frame. Only take this path when no
   Markdown/HTML trigger exists and the tail cannot be a list, heading,
   fence, quote or indented block; everything else keeps the real pipeline. */
const PLAIN_TAIL_MIN = 512;
const PLAIN_TAIL_FORBIDDEN = /[\\`*_{}[\]<>#|~$&\r]/;
const PLAIN_TAIL_LINE =
  /(?:^|\n)(?: {0,3}(?:[-+*][ \t]|\d{1,9}[.)][ \t]|#{1,6}(?:[ \t]|$)|>[ \t]?|```|~~~)|\t| {4}\S)/;
const PLAIN_TAIL_SETEXT = /(?:^|\n)(?:=+|-+)[ \t]*$/;

function plainProseTailHtml(text: string): string | null {
  if (text.length < PLAIN_TAIL_MIN || text.includes('\n\n')) return null;
  if (PLAIN_TAIL_FORBIDDEN.test(text) || PLAIN_TAIL_LINE.test(text)) return null;
  if (PLAIN_TAIL_SETEXT.test(text) || /\s{2,}$/.test(text)) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return '<p>' + escHTML(trimmed).replace(/\n/g, '<br>') + '</p>\n';
}
function renderEnvKey(mathRevision: number): string {
  if (typeof window === 'undefined') return '0';
  const runtime = window as unknown as {
    hljs?: unknown;
  };
  return String(mathRevision) + '|' + getCurrentLang() + '|' + (runtime.hljs ? 1 : 0) + '|';
}

function sharedFinalProse(
  text: string,
  paint: () => string,
  mathRevision: number,
): { __html: string } {
  const key = renderEnvKey(mathRevision) + text;
  const hit = sharedFinalProseCache.get(key);
  if (hit !== undefined) return hit;
  const box = { __html: paint() };
  if (IMPURE_OUTPUT.test(box.__html)) return box;
  sharedFinalProseCache.set(key, box);
  return box;
}

/** Test hook: forget every shared render. */
export function __resetSharedProseCache(): void {
  clearSharedProseCache();
}

export interface ProseRenderer {
  settled: (text: string) => { __html: string };
  tail: (text: string) => { __html: string };
}

/**
 * Reuse finalized markdown objects so React does not rewrite settled DOM.
 * Live tails are memoized by their last text while finalized turns share a
 * bounded cache, excluding renderers that register placeholders as effects.
 */
export function useProseRenderer(live: boolean): ProseRenderer {
  const mathRevision = useSyncExternalStore(
    subscribeMathRenderRevision,
    getMathRenderRevision,
    getMathRenderRevision,
  );
  return useMemo(() => {
    const renderer = getLegacyActions().render;
    const final = renderer.renderAssistantHTML;
    const progressive = renderer.renderAssistantProgressive;
    const paint = (text: string, complete: boolean): string => {
      const clean = stripLegacyToolHtml(text);
      if (!clean.trim()) return '';
      try {
        // Closed cards mount as soon as their data arrives. Other prose keeps
        // the progressive parser and its DOM through the end of the turn.
        const readyScaffold = hasCompleteScaffold(clean) && isStableMarkdownPrefix(clean);
        return live && progressive && !readyScaffold
          ? progressive(clean, { complete })
          : final(clean);
      } catch {
        /* A segment failure must not blank the rest of the assistant answer. */
        return '';
      }
    };

    const cache = createProseCache(1_000_000, 200);
    const settled = (text: string): { __html: string } => {
      const key = hasCompleteScaffold(text) ? text.trim() : text;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const box = live
        ? { __html: paint(key, true) }
        : sharedFinalProse(text, () => paint(key, true), mathRevision);
      cache.set(key, box);
      return box;
    };

    let lastTailText: string | null = null;
    let lastTailBox: { __html: string } | null = null;
    const tail = (text: string): { __html: string } => {
      if (hasCompleteScaffold(text) && isStableMarkdownPrefix(text)) return settled(text);
      if (lastTailBox !== null && text === lastTailText) return lastTailBox;
      lastTailText = text;
      const plain = plainProseTailHtml(text);
      lastTailBox = plain === null ? { __html: paint(text, false) } : { __html: plain };
      return lastTailBox;
    };
    return { settled, tail };
  }, [live, mathRevision]);
}

/**
 * Apply the turn's quiz/practice plan to every piece the renderer paints.
 *
 * The turn is painted in pieces (settled markdown blocks, the live tail, the
 * prose runs between tool rows), so the "one interactive quiz and one
 * practice per turn" rule is decided once over the whole turn text and each
 * piece only rewrites the blocks that lost. With no singleton scaffold in the
 * turn the renderer is returned as is, so ordinary prose keeps its identity.
 */
export function withScaffoldTurnPlan(prose: ProseRenderer, plan: ScaffoldTurnPlan): ProseRenderer {
  if (!plan.quiz && !plan.practice) return prose;
  return {
    settled: (text: string) => prose.settled(applyScaffoldTurnPlan(text, plan)),
    tail: (text: string) => prose.tail(applyScaffoldTurnPlan(text, plan)),
  };
}

/** The turn plan keyed by its content, so a streamed turn keeps one renderer
 *  identity until a new winner appears. */
export function useScaffoldTurnProse(prose: ProseRenderer, rawText: string): ProseRenderer {
  /* Most answers never contain a quiz or practice singleton. Re-running the
     full-text plan scan on every streaming frame is pure overhead in that
     case, so remember the last plan and only re-scan when an appended frame
     can actually introduce a scaffold (`<`) or when an existing plan may
     have grown. Non-append edits always re-scan. */
  const cache = useRef<{ text: string; plan: ScaffoldTurnPlan; key: string } | null>(null);
  const planKey = useMemo(() => {
    const previous = cache.current;
    if (
      previous &&
      previous.key === '' &&
      rawText.startsWith(previous.text) &&
      rawText.indexOf('<', previous.text.length) === -1
    ) {
      cache.current = { text: rawText, plan: previous.plan, key: '' };
      return '';
    }
    const plan = scaffoldTurnPlan(rawText);
    const key = plan.quiz || plan.practice ? JSON.stringify(plan) : '';
    cache.current = { text: rawText, plan, key };
    return key;
  }, [rawText]);
  const plan = cache.current && cache.current.key === planKey ? cache.current.plan : null;
  return useMemo(
    () => (planKey && plan ? withScaffoldTurnPlan(prose, plan) : prose),
    [prose, planKey, plan],
  );
}
