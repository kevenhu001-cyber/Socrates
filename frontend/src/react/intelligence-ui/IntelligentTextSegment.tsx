import { useRef } from 'react';

import { LiveTextSegment } from '../tool-run/LiveTextSegment';
import type { ProseRenderer } from '../tool-run/proseRenderer';
import type { ToolCallRecord } from '../tool-run/toolRunModel';
import { LazyIntelligenceUiBlock } from './LazyIntelligenceUiBlock';
import { splitIntelligenceUiText } from '@socrates/core';

interface IntelligentTextSegmentProps {
  text: string;
  live: boolean;
  prose: ProseRenderer;
  tools: ReadonlyArray<ToolCallRecord>;
  readOnly?: boolean;
}

function lastTextSegmentIndex(segments: ReturnType<typeof splitIntelligenceUiText>): number {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index].kind === 'text') return index;
  }
  return -1;
}

/** Once streamed, keep the same block tree even when the turn settles. */
function TextProse({ text, live, prose }: { text: string; live: boolean; prose: ProseRenderer }) {
  const streamedRef = useRef(live);
  if (live) streamedRef.current = true;
  if (streamedRef.current) {
    return <LiveTextSegment text={text} live={live} settled={prose.settled} tail={prose.tail} />;
  }
  return <div className="tool-run-prose" dangerouslySetInnerHTML={prose.settled(text)} />;
}

/**
 * Render one prose segment while allowing native Socrates UI fences to live
 * inline between paragraphs. Tool ordering is untouched: this component only
 * splits the text range that toolRunLayout already assigned to prose.
 */
export function IntelligentTextSegment({
  text,
  live,
  prose,
  tools,
  readOnly,
}: IntelligentTextSegmentProps) {
  const segments = splitIntelligenceUiText(text);
  const hasUi = segments.some((segment) => segment.kind === 'ui');

  /* Preserve the exact pre-Intelligent-UI streaming path for ordinary prose.
     This keeps the settled-prefix cache and live-tail animation unchanged. */
  if (!hasUi) {
    return <TextProse text={text} live={live} prose={prose} />;
  }

  const liveTextIndex = live ? lastTextSegmentIndex(segments) : -1;
  return (
    <>
      {segments.map((segment, index) => {
        /* `end` grows on every streamed token for an open fence. Keying by the
           stable start offset preserves local slider/choice state while new
           JSONL records arrive and the same block expands in place. */
        const key = `${segment.kind}-${segment.start}`;
        if (segment.kind === 'ui') {
          return (
            <LazyIntelligenceUiBlock
              key={key}
              source={segment.source}
              tools={tools}
              open={live && segment.open}
              readOnly={readOnly}
            />
          );
        }

        if (!segment.text) return null;
        return <TextProse key={key} text={segment.text} live={index === liveTextIndex} prose={prose} />;
      })}
    </>
  );
}

export default IntelligentTextSegment;
