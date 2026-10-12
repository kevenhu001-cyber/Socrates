import type { ReactNode } from 'react';

import { LiveTextSegment } from '../tool-run/LiveTextSegment';
import type { ProseRenderer } from '../tool-run/proseRenderer';
import type { ToolCallRecord } from '../tool-run/toolRunModel';
import { IntelligenceUiBlock } from './IntelligenceUi';
import { splitIntelligenceUiText, type IntelligenceUiTextSegment } from './model';

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

function settledText(segment: IntelligenceUiTextSegment, prose: ProseRenderer, key: string): ReactNode {
  if (!segment.text) return null;
  return (
    <div
      key={key}
      className="tool-run-prose"
      dangerouslySetInnerHTML={prose.settled(segment.text)}
    />
  );
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
    if (live) {
      return <LiveTextSegment text={text} settled={prose.settled} tail={prose.tail} />;
    }
    return (
      <div
        className="tool-run-prose"
        dangerouslySetInnerHTML={prose.settled(text)}
      />
    );
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
            <IntelligenceUiBlock
              key={key}
              source={segment.source}
              tools={tools}
              open={live && segment.open}
              readOnly={readOnly}
            />
          );
        }

        if (!segment.text) return null;
        if (index === liveTextIndex) {
          return (
            <LiveTextSegment
              key={key}
              text={segment.text}
              settled={prose.settled}
              tail={prose.tail}
            />
          );
        }
        return settledText(segment, prose, key);
      })}
    </>
  );
}

export default IntelligentTextSegment;
