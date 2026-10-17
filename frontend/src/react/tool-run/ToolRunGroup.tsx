import { ToolRunAttachments } from './ToolRunAttachments.js';
import { ToolRunRows } from './ToolRunRows.js';
import { groupOutputCalls, type ToolCallRecord, type TurnSegment } from './toolRunModel.js';

type GroupSegment = Extract<TurnSegment, { kind: 'group' }>;

export interface ToolRunGroupProps {
  segment: GroupSegment;
  messageId?: string;
  readOnly?: boolean;
  activityOnly?: boolean;
  tools?: ReadonlyArray<ToolCallRecord>;
}

/** Required actions and results remain in the transcript. Activity rows live
 * in the turn disclosure; stable output keys preserve interactive state. */
export function ToolRunGroup({ segment, messageId, readOnly, tools, activityOnly }: ToolRunGroupProps) {
  if (activityOnly) return <section className="tool-run-group" data-state={segment.state === 'done' ? 'complete' : segment.state} data-category={segment.category}>
    <ToolRunRows segment={segment} messageId={messageId} readOnly={readOnly} activityOnly />
  </section>;
  return (
    <>
      <ToolRunRows segment={segment} messageId={messageId} readOnly={readOnly} actionsOnly />
      {groupOutputCalls(segment).map((call) => <ToolRunAttachments key={`output-${call.id}`} call={call} tools={tools} readOnly={readOnly} />)}
    </>
  );
}

export default ToolRunGroup;
