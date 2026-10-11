import { useLayoutEffect, useRef } from 'react';
import { createSettledSplitter } from '../../render/streaming.js';
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
export function LiveTextSegment({ text, settled, tail }: LiveTextSegmentProps) {
  const splitterRef = useRef<ReturnType<typeof createSettledSplitter> | null>(null);
  if (!splitterRef.current) splitterRef.current = createSettledSplitter();
  const split = splitterRef.current.push(text);
  const tailBox = tail(split.tail);

  return (
    <>
      {split.blocks.map((block, index) => (
        <SettledBlock key={index} html={settled(block)} />
      ))}
      <div
        className="tool-run-prose is-live"
        dangerouslySetInnerHTML={tailBox}
      />
    </>
  );
}
