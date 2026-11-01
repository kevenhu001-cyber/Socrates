import { ToolRunAttachments } from './ToolRunAttachments.js';
import { ToolRunRows } from './ToolRunRows.js';
import { groupOutputCalls, type ToolCallRecord, type TurnSegment } from './toolRunModel.js';

type GroupSegment = Extract<TurnSegment, { kind: 'group' }>;

export interface ToolRunGroupProps {
  segment: GroupSegment;
  messageId?: string;
  readOnly?: boolean;
  tools?: ReadonlyArray<ToolCallRecord>;
}

/** Required actions and results remain in the transcript. Activity rows live
 * in the turn's RN activity surface (TurnActivitySurface); stable output keys
 * preserve interactive state. */
export function ToolRunGroup({ segment, messageId, readOnly, tools }: ToolRunGroupProps) {
  return (
    <>
      <ToolRunRows segment={segment} messageId={messageId} readOnly={readOnly} actionsOnly />
      {groupOutputCalls(segment).map((call) => <ToolRunAttachments key={`output-${call.id}`} call={call} tools={tools} readOnly={readOnly} />)}
    </>
  );
}

export default ToolRunGroup;
