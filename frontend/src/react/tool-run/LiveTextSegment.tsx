import { useLayoutEffect, useRef } from 'react';
import { createSettledSplitter } from '../../render/streaming.js';
import {
  applyTailFade,
  computeFadeSegments,
  recordReveal,
  type RevealEntry,
} from '../../render/tailReveal.js';
import { getLegacyActions } from '../legacy/gateway.ts';
import type { ProseRenderer } from './proseRenderer';

function SettledBlock({ html }: { html: { __html: string } }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    try {
      getLegacyActions().postRender?.wireCodeBlockHeaders?.(element);
    } catch {
      /* empty-catch: intentional — code header wiring must not break prose */
    }
  }, [html]);
  return (
    <div
      ref={ref}
      className="tool-run-prose is-settled"
      dangerouslySetInnerHTML={html}
    />
  );
}

interface LiveTextSegmentProps extends ProseRenderer {
  text: string;
}

/**
 * Keeps completed markdown blocks stable while reparsing only the open tail.
 * The splitter is held in a ref because its pure text index can be replayed
 * safely if React abandons a concurrent render.
 */
export function LiveTextSegment({ text, settled, tail }: LiveTextSegmentProps) {
  const splitterRef = useRef<ReturnType<typeof createSettledSplitter> | null>(null);
  if (!splitterRef.current) splitterRef.current = createSettledSplitter();
  const split = splitterRef.current.push(text);
  const liveRef = useRef<HTMLDivElement | null>(null);
  const revealRef = useRef<RevealEntry[]>([]);
  const lastFadeAtRef = useRef(0);
  const tailBox = tail(split.tail);

  useLayoutEffect(() => {
    const root = liveRef.current;
    if (!root) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    revealRef.current = recordReveal(revealRef.current, (root.textContent || '').length, now);
    try {
      if (typeof window !== 'undefined' && window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    } catch {
      /* empty-catch: intentional — render the text without reduced-motion lookup */
    }
    /* Token bursts may commit every 16 ms; 32 ms keeps fade decoration near
       30 fps without changing the timing or text of the live tail. */
    if (now - lastFadeAtRef.current < 32) return;
    lastFadeAtRef.current = now;
    try {
      applyTailFade(root, computeFadeSegments(revealRef.current, now));
    } catch {
      /* empty-catch: intentional — animation decoration is best-effort */
    }
  }, [tailBox]);

  return (
    <>
      {split.blocks.map((block, index) => (
        <SettledBlock key={index} html={settled(block)} />
      ))}
      <div
        ref={liveRef}
        className="tool-run-prose is-live"
        dangerouslySetInnerHTML={tailBox}
      />
    </>
  );
}
