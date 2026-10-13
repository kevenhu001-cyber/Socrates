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

const CSS_STATE = { running: 'running', awaiting: 'running', done: 'complete', error: 'error', stopped: 'cancelled' };

/** Each action stays in the transcript. Only its arguments/results collapse.
 * Keep the container stable as parallel calls settle; rows retain their
 * disclosure state and artifact hosts never remount. */
export function ToolRunGroup({ segment, messageId, readOnly, tools }: ToolRunGroupProps) {
  return (
    <>
      <section className="tool-run-group" data-state={CSS_STATE[segment.state]} data-category={segment.category}>
        <ToolRunRows segment={segment} messageId={messageId} readOnly={readOnly} />
      </section>
      {groupOutputCalls(segment).map((call) => <ToolRunAttachments key={`output-${call.id}`} call={call} tools={tools} readOnly={readOnly} />)}
    </>
  );
}

export default ToolRunGroup;
