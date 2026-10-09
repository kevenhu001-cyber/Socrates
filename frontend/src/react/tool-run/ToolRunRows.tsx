import { ToolRunDetail } from './ToolRunDetail.js';
import { ToolRunRow } from './ToolRunRow.js';
import { runStartedAt, toolRunView, type TurnSegment, type ToolRunGroupView } from './toolRunModel.js';

type GroupSegment = Extract<TurnSegment, { kind: 'group' }>;

export function ToolRunRows({
  segment,
  view,
  grouped,
  open,
  isNarrowViewport,
  messageId,
  readOnly,
}: {
  segment: GroupSegment;
  view: ToolRunGroupView;
  grouped: boolean;
  open: boolean;
  isNarrowViewport: boolean;
  messageId?: string;
  readOnly?: boolean;
}) {
  if (!grouped) {
    const single = segment.members.concat(segment.running);
    return (
      <>
        {single.map((call) => (
          <ToolRunRow
            key={call.id}
            view={toolRunView(call)}
            startedAt={runStartedAt(call)}
            messageId={messageId}
            readOnly={readOnly}
          />
        ))}
      </>
    );
  }

  return (
    <>
      <div className="tool-run-list" hidden={isNarrowViewport || !open}>
        {open ? <ToolRunDetail view={view} readOnly={readOnly} /> : null}
        {segment.members.map((call, index) => (
          <ToolRunRow
            key={call.id}
            view={view.members[index]}
            startedAt={runStartedAt(call)}
            messageId={messageId}
            readOnly={readOnly}
            nested
          />
        ))}
      </div>

      {/* Live lines stay outside the collapsed aggregate. */}
      {segment.running.map((call, index) => (
        <ToolRunRow
          key={call.id}
          view={view.running[index]}
          startedAt={runStartedAt(call)}
          messageId={messageId}
          readOnly={readOnly}
          nested
        />
      ))}
    </>
  );
}
