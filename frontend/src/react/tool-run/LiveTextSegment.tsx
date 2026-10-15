import { useLayoutEffect, useMemo, useRef } from 'react';
import { createSettledSplitter } from '../../render/streaming.js';
import { getLegacyActions } from '../legacy/gateway.ts';
import type { ProseRenderer } from './proseRenderer';

function SettledBlock({ html, live = false, tail = false }: { html: { __html: string }; live?: boolean; tail?: boolean }) {
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
      className={'tool-run-prose ' + (live ? 'is-live' : 'is-settled') + (tail ? ' is-tail' : '')}
      dangerouslySetInnerHTML={html}
    />
  );
}

interface LiveTextSegmentProps extends ProseRenderer {
  text: string;
  live?: boolean;
}

/**
 * Keeps completed markdown blocks stable while reparsing only the open tail.
 *
 * The playback clock already smooths network bursts before this component
 * sees them. Do not decorate every commit by walking and rewriting the live
 * DOM: that duplicates React's work on the hottest path and becomes
 * increasingly expensive for long, still-open paragraphs/code/math blocks.
 * Visual smoothness therefore comes from paced text publication plus the
 * lightweight cursor, while settled blocks remain untouched.
 *
 * The splitter is held in a ref because its pure text index can be replayed
 * safely if React abandons a concurrent render.
 */
export function LiveTextSegment({ text, live = true, settled, tail }: LiveTextSegmentProps) {
  const splitterRef = useRef<ReturnType<typeof createSettledSplitter> | null>(null);
  if (!splitterRef.current) splitterRef.current = createSettledSplitter();
  const splitter = splitterRef.current;
  const { blocks, tailBox } = useMemo(() => {
    const split = splitter.push(text);
    return { blocks: split.blocks.map(block => settled(block)), tailBox: tail(split.tail) };
  }, [splitter, text, settled, tail]);

  return (
    <>
      {blocks.map((html, index) => (
        <SettledBlock key={index} html={html} />
      ))}
      <SettledBlock html={tailBox} live={live} tail />
    </>
  );
}
