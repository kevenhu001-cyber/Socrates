import { ToolRunRow } from './ToolRunRow.js';
import { toolRunView, type ToolCallRecord } from './toolRunModel.js';

export function ToolRunRows({
  calls,
  messageId,
  readOnly,
}: {
  calls: ReadonlyArray<ToolCallRecord>;
  messageId?: string;
  readOnly?: boolean;
}) {
  return calls.map((call) => (
    <ToolRunRow
      key={call.id}
      view={toolRunView(call)}
      call={call}
      messageId={messageId}
      readOnly={readOnly}
      actionsOnly
    />
  ));
}
