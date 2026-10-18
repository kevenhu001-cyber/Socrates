import { ToolRunApproval } from './ToolRunApproval.js';
import { ToolRunAgentSteps } from './ToolRunAgentSteps.js';
import { ToolRunDetail } from './ToolRunDetail.js';
import { RetryButton } from './ToolRunDetailSections.js';
import { ToolRunRowHead } from './ToolRunRowHead.js';
import { useToolRunDisclosure } from './ToolRunDisclosure';
import { agentRunStateOf, type ToolRunView } from './toolRunModel';
import { useElapsed } from './useElapsed.js';

export interface ToolRunRowProps {
  view: ToolRunView;
  startedAt?: number;
  messageId?: string;
  readOnly?: boolean;
  nested?: boolean;
  activityOnly?: boolean;
  actionsOnly?: boolean;
}

export function ToolRunRow({ view, startedAt, messageId, readOnly, nested, activityOnly, actionsOnly }: ToolRunRowProps) {
  const { open, setOpen } = useToolRunDisclosure(view.id);
  const inFlight = view.state === 'running' || view.state === 'awaiting';
  const elapsedMs = useElapsed(startedAt || 0, inFlight && !actionsOnly);
  const expandable = Boolean(view.sections.length || view.tech.length || view.livePreview || view.liveOutput);
  const rowData = {
    className: `tool-inline${inFlight ? ' is-live' : ''}`,
    'data-tcid': view.id, 'data-tool': view.name, 'data-state': view.state,
    'data-nested': nested ? '1' : undefined, 'data-react-owned': '1',
    'data-error': view.state === 'error' ? '1' : undefined,
  };
  const error = view.sections.find((section) => section.kind === 'error');

  return (
    <>
      {!actionsOnly ? (expandable ? <details
        {...rowData}
        data-expandable="1"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary className="tool-inline-head" aria-expanded={open}>
          <ToolRunRowHead view={view} elapsedMs={elapsedMs} />
        </summary>
        {open ? <ToolRunDetail view={view} inFlight={inFlight} readOnly={readOnly} /> : null}
      </details> : <div {...rowData}>
        <div className="tool-inline-head"><ToolRunRowHead view={view} elapsedMs={elapsedMs} /></div>
      </div>) : null}
      {!actionsOnly && view.agentRun ? (
        <ToolRunAgentSteps
          run={view.agentRun}
          live={inFlight}
          state={agentRunStateOf(view.state)}
        />
      ) : null}
      {!activityOnly ? <>
        {error?.kind === 'error' ? <p className="tool-inline-error" role="alert">{error.text.trim().split('\n')[0].slice(0, 180)}</p> : null}
        <RetryButton view={view} readOnly={readOnly} />
        {view.approval ? (
          <ToolRunApproval view={view.approval} messageId={messageId || ''} toolCallId={view.id} readOnly={readOnly} />
        ) : null}
      </> : null}
    </>
  );
}

export default ToolRunRow;
