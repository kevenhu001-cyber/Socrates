import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { createSettledProseCache } from '../../render/proseCache.ts';
import { createSettledSplitter } from '../../render/streaming.ts';
import { createStreamReveal } from '../../render/streamReveal.ts';
import { getLegacyActions } from '../legacy/gateway.ts';
import type { ProseRenderer } from './proseRenderer';

const SettledBlock = memo(function SettledBlock({ html, live = false, tail = false, source = '' }: { html: { __html: string }; live?: boolean; tail?: boolean; source?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const revealRef = useRef<ReturnType<typeof createStreamReveal> | null>(null);
  const revealedMarkupRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    try {
      getLegacyActions().postRender?.wireCodeBlockHeaders?.(element);
    } catch {
      /* empty-catch: intentional — code header wiring must not break prose */
    }
    if (live && tail && revealedMarkupRef.current !== html.__html) {
      if (!revealRef.current) revealRef.current = createStreamReveal();
      revealRef.current(element, source);
      revealedMarkupRef.current = html.__html;
    } else if (!live) {
      revealRef.current = null;
      revealedMarkupRef.current = null;
    }
  }, [html, live, tail, source]);
  return (
    <div
      ref={ref}
      className={'tool-run-prose ' + (live ? 'is-live' : 'is-settled') + (tail ? ' is-tail' : '')}
      dangerouslySetInnerHTML={html}
    />
  );
});

interface LiveTextSegmentProps extends ProseRenderer {
  text: string;
  live?: boolean;
}

/**
 * Keeps completed markdown blocks stable while reparsing only the open tail.
 *
 * The playback clock already smooths network bursts before this component
 * sees them. Only the bounded suffix of the open prose tail receives a
 * time-anchored opacity reveal; completed blocks and code/math DOM stay
 * untouched. No layout measurements or per-character animation loop.
 *
 * The splitter is held in a ref because its pure text index can be replayed
 * safely if React abandons a concurrent render.
 */
export function LiveTextSegment({ text, live = true, settled, tail }: LiveTextSegmentProps) {
  const prefixCacheRef = useRef<ReturnType<typeof createSettledProseCache> | null>(null);
  if (!prefixCacheRef.current) prefixCacheRef.current = createSettledProseCache();
  const prefixCache = prefixCacheRef.current;
  const splitterRef = useRef<ReturnType<typeof createSettledSplitter> | null>(null);
  if (!splitterRef.current) splitterRef.current = createSettledSplitter();
  const splitter = splitterRef.current;
  const { blocks, tailBox, tailSource } = useMemo(() => {
    const split = splitter.push(text);
    return { blocks: prefixCache(split.blocks, settled), tailBox: tail(split.tail), tailSource: split.tail };
  }, [prefixCache, splitter, text, settled, tail]);

  return (
    <>
      {blocks.map((html, index) => (
        <SettledBlock key={index} html={html} />
      ))}
      <SettledBlock html={tailBox} live={live} tail source={tailSource} />
    </>
  );
}
