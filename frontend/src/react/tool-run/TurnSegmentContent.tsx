import { annotateTurnProse } from '@socrates/core';
import type { TurnRuntime } from '@socrates/contracts';
import { Fragment, type ReactNode } from 'react';
import { IntelligentTextSegment } from '../intelligence-ui/IntelligentTextSegment';
import { runStartedAt, toolRunView, type ToolCallRecord, type TurnSegment } from './toolRunModel.js';
import { ToolRunAttachments } from './ToolRunAttachments.js';
import { ToolRunGroup } from './ToolRunGroup.js';
import { ToolRunRow } from './ToolRunRow.js';
import type { ProseRenderer } from './proseRenderer';

interface TurnSegmentContentProps {
  segment: TurnSegment;
  turnRuntime?: TurnRuntime | null;
  index: number;
  growingIndex: number;
  messageId: string;
  tools: ReadonlyArray<ToolCallRecord>;
  readOnly?: boolean;
  prose: ProseRenderer;
}

export function TurnSegmentContent({
  segment,
  turnRuntime,
  index,
  growingIndex,
  messageId,
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

  if (segment.kind === 'group') {
    return (
      <ToolRunGroup
        key={'group-' + index}
        segment={segment}
        tools={tools}
        messageId={messageId}
        readOnly={readOnly}
      />
    );
  }

  if (segment.kind === 'tool') {
    return (
      <Fragment key={'tool-' + segment.call.id}>
        <ToolRunRow startedAt={runStartedAt(segment.call)} view={toolRunView(segment.call)} messageId={messageId} readOnly={readOnly} />
        <ToolRunAttachments call={segment.call} tools={tools} readOnly={readOnly} />
      </Fragment>
    );
  }

  // Private think ranges reserve offsets only; they never create disclosures.
  return null;
}
