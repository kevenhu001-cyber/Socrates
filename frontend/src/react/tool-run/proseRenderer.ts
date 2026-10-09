import { useMemo } from 'react';
import { getLegacyActions } from '../legacy/gateway.ts';
import { stripLegacyToolHtml } from './toolRunModel.js';

const IMPURE_OUTPUT = /class="viz"|-slot"|canvas-block/;
const FINAL_CACHE_BUDGET = 8_000_000;
const finalProseCache = new Map<string, { __html: string }>();
let finalProseCacheChars = 0;

function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ char, 2654435761);
    h2 = Math.imul(h2 ^ char, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

function proseCacheKey(prefix: string, text: string): string {
  return prefix + text.length + ':' + hashText(text);
}

function renderEnvKey(): string {
  if (typeof window === 'undefined') return '0';
  const runtime = window as unknown as {
    __socratesMathRenderRev?: number;
    _currentLang?: string;
    hljs?: unknown;
  };
  return String(runtime.__socratesMathRenderRev || 0)
    + '|' + (runtime._currentLang || '')
    + '|' + (runtime.hljs ? 1 : 0)
    + '|';
}

function sharedFinalProse(text: string, paint: () => string): { __html: string } {
  const key = renderEnvKey() + proseCacheKey('t', text);
  const hit = finalProseCache.get(key);
  if (hit !== undefined) {
    finalProseCache.delete(key);
    finalProseCache.set(key, hit);
    return hit;
  }
  const box = { __html: paint() };
  if (IMPURE_OUTPUT.test(box.__html)) return box;
  finalProseCache.set(key, box);
  finalProseCacheChars += box.__html.length + text.length;
  while (finalProseCacheChars > FINAL_CACHE_BUDGET && finalProseCache.size > 1) {
    const oldest = finalProseCache.keys().next().value as string;
    const dropped = finalProseCache.get(oldest);
    finalProseCache.delete(oldest);
    /* Hashed keys discard source-length accounting; this conservative estimate
       lets the cache drain without retaining a second copy of long prose. */
    finalProseCacheChars -= (dropped ? dropped.__html.length : 0) + 64;
  }
  return box;
}

/** Test hook: forget every shared render. */
export function __resetSharedProseCache(): void {
  finalProseCache.clear();
  finalProseCacheChars = 0;
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
  const mathRevision = typeof window === 'undefined' ? 0 : window.__socratesMathRenderRev || 0;
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

    const cache = new Map<string, { __html: string }>();
    const settled = (text: string): { __html: string } => {
      const key = proseCacheKey((live ? 'l' : 'f') + mathRevision, text);
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const box = live
        ? { __html: paint(text, true) }
        : sharedFinalProse(text, () => paint(text, true));
      if (cache.size > 200) {
        let drop = Math.ceil(cache.size / 2);
        for (const oldKey of cache.keys()) {
          if (drop <= 0) break;
          cache.delete(oldKey);
          drop -= 1;
        }
      }
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
