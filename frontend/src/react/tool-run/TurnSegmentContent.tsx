import { Fragment, type ReactNode } from 'react';
import { IntelligentTextSegment } from '../intelligence-ui/IntelligentTextSegment';
import { groupOutputCalls, runStartedAt, toolRunView, type ToolCallRecord, type TurnSegment } from './toolRunModel.js';
import { ToolRunAttachments } from './ToolRunAttachments.js';
import { ToolRunGroup } from './ToolRunGroup.js';
import { ToolRunRow } from './ToolRunRow.js';
import type { ProseRenderer } from './proseRenderer';

interface TurnSegmentContentProps {
  segment: TurnSegment;
  index: number;
  growingIndex: number;
  messageId: string;
  tools: ReadonlyArray<ToolCallRecord>;
  readOnly?: boolean;
  prose: ProseRenderer;
}

export function TurnSegmentContent({
  segment,
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
        text={segment.text}
        live={index === growingIndex}
        prose={prose}
        tools={tools}
        readOnly={readOnly}
      />
    );
  }

  if (segment.kind === 'group') {
    const first = groupOutputCalls(segment)[0];
    return (
      <ToolRunGroup
        key={'group-' + (first ? first.id : index) + '-' + index}
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

  if (segment.kind === 'think') {
    return null;
  }

  return null;
}
