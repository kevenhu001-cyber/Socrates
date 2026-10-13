import { ToolRunRow } from './ToolRunRow.js';
import { groupOutputCalls, runStartedAt, toolRunView, type TurnSegment } from './toolRunModel.js';

export function ToolRunRows({ segment, messageId, readOnly }: {
  segment: Extract<TurnSegment, { kind: 'group' }>;
  messageId?: string;
  readOnly?: boolean;
}) {
  return groupOutputCalls(segment).map((call) => (
    <ToolRunRow key={call.id} view={toolRunView(call)} startedAt={runStartedAt(call)} messageId={messageId} readOnly={readOnly} />
  ));
}
