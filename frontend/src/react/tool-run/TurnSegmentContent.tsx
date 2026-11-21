import { annotateTurnProse } from '@socrates/core';
import type { TurnRuntime } from '@socrates/contracts';
import type { ReactNode } from 'react';
import { IntelligentTextSegment } from '../intelligent-ui/IntelligentTextSegment';
import type { ToolCallRecord, TurnSegment } from './toolRunModel.js';
import type { ProseRenderer } from './proseRenderer';

interface TurnSegmentContentProps {
  segment: Extract<TurnSegment, { kind: 'text' | 'think' }>;
  turnRuntime?: TurnRuntime | null;
  index: number;
  growingIndex: number;
  tools: ReadonlyArray<ToolCallRecord>;
  readOnly?: boolean;
  prose: ProseRenderer;
}

export function TurnSegmentContent({
  segment,
  turnRuntime,
  index,
  growingIndex,
  tools,
  readOnly,
  prose,
}: TurnSegmentContentProps): ReactNode {
  if (segment.kind === 'text') {
    return (
      <IntelligentTextSegment
        text={annotateTurnProse(segment.text, segment.start, turnRuntime)}
        live={index === growingIndex}
        prose={prose}
        tools={tools}
        readOnly={readOnly}
      />
    );
  }

  // Private think ranges reserve offsets only; they never create disclosures.
  return null;
}
