import { createProseCache, sharedFinalProseCache, clearSharedProseCache } from '../../render/proseCache.ts';
import { useMemo } from 'react';
import { getLegacyActions } from '../legacy/gateway.ts';
import { stripLegacyToolHtml } from './toolRunModel.js';
import { getMathRenderRevision } from '../../render/mathRevision.ts';
import { getCurrentLang } from '../legacy/gateway.ts';

const IMPURE_OUTPUT = /class="viz"|-slot"|canvas-block/;
function renderEnvKey(mathRevision: number): string {
  if (typeof window === 'undefined') return '0';
  const runtime = window as unknown as {
    hljs?: unknown;
  };
  return String(mathRevision)
    + '|' + getCurrentLang()
    + '|' + (runtime.hljs ? 1 : 0)
    + '|';
}

function sharedFinalProse(text: string, paint: () => string, mathRevision: number): { __html: string } {
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
  const mathRevision = getMathRenderRevision();
  return useMemo(() => {
    const renderer = getLegacyActions().render;
    const final = renderer.renderAssistantHTML;
    const progressive = renderer.renderAssistantProgressive;
    const paint = (text: string, complete: boolean): string => {
      const clean = stripLegacyToolHtml(text);
      if (!clean.trim()) return '';
      try {
        return live && progressive ? progressive(clean, { complete }) : final(clean);
      } catch {
        /* A segment failure must not blank the rest of the assistant answer. */
        return '';
      }
    };

    const cache = createProseCache(1_000_000, 200);
    const settled = (text: string): { __html: string } => {
      const key = text;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const box = live
        ? { __html: paint(text, true) }
        : sharedFinalProse(text, () => paint(text, true), mathRevision);
      cache.set(key, box);
      return box;
    };

    let lastTailText: string | null = null;
    let lastTailBox: { __html: string } | null = null;
    const tail = (text: string): { __html: string } => {
      if (lastTailBox !== null && text === lastTailText) return lastTailBox;
      lastTailText = text;
      lastTailBox = { __html: paint(text, false) };
      return lastTailBox;
    };
    return { settled, tail };
  }, [live, mathRevision]);
}
