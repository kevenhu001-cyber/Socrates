import { ToolRunRow } from './ToolRunRow.js';
import { groupOutputCalls, runStartedAt, toolRunView, type TurnSegment } from './toolRunModel.js';

export function ToolRunRows({ segment, messageId, readOnly, actionsOnly }: {
  segment: Extract<TurnSegment, { kind: 'group' }>;
  messageId?: string;
  readOnly?: boolean;
  actionsOnly?: boolean;
}) {
  return groupOutputCalls(segment).map((call) => (
    <ToolRunRow key={call.id} view={toolRunView(call)} call={call} startedAt={runStartedAt(call)} messageId={messageId} readOnly={readOnly} actionsOnly={actionsOnly} />
  ));
}
