import { Fragment, type ReactNode } from 'react';
import { toolRunView, type TurnSegment } from './toolRunModel.js';
import { ToolRunAttachments } from './ToolRunAttachments.js';
import { ToolRunGroup } from './ToolRunGroup.js';
import { ToolRunRow } from './ToolRunRow.js';
import { LiveTextSegment } from './LiveTextSegment';
import type { ProseRenderer } from './proseRenderer';

interface TurnSegmentContentProps {
  segment: TurnSegment;
  index: number;
  growingIndex: number;
  messageId: string;
  readOnly?: boolean;
  prose: ProseRenderer;
}

export function TurnSegmentContent({
  segment,
  index,
  growingIndex,
  messageId,
  readOnly,
  prose,
}: TurnSegmentContentProps): ReactNode {
  if (segment.kind === 'text') {
    if (index !== growingIndex) {
      return (
        <div
          key={'text-' + segment.start + '-' + index}
          className="tool-run-prose"
          dangerouslySetInnerHTML={prose.settled(segment.text)}
        />
      );
    }
    return (
      <LiveTextSegment
        key={'text-' + segment.start + '-' + index}
        text={segment.text}
        settled={prose.settled}
        tail={prose.tail}
      />
    );
  }

  if (segment.kind === 'group') {
    const first = segment.members.length ? segment.members[0] : segment.running[0];
    return (
      <ToolRunGroup
        key={'group-' + (first ? first.id : index) + '-' + index}
        segment={segment}
        messageId={messageId}
        readOnly={readOnly}
      />
    );
  }

  if (segment.kind === 'tool') {
    return (
      <Fragment key={'tool-' + segment.call.id}>
        <ToolRunRow view={toolRunView(segment.call)} messageId={messageId} readOnly={readOnly} />
        <ToolRunAttachments call={segment.call} />
      </Fragment>
    );
  }

  if (segment.kind === 'think') {
    return null;
  }

  return null;
}
