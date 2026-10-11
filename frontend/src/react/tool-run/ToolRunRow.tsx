import { ToolRunApproval } from './ToolRunApproval.js';
import { ToolRunAgentSteps } from './ToolRunAgentSteps.js';
import { ToolRunDetail } from './ToolRunDetail.js';
import { RetryButton } from './ToolRunDetailSections.js';
import { ToolRunRowHead } from './ToolRunRowHead.js';
import { useToolRunDisclosure } from './ToolRunDisclosure';
import type { ToolRunView } from './toolRunModel';
import { useElapsed } from './useElapsed.js';

export interface ToolRunRowProps {
  view: ToolRunView;
  startedAt?: number;
  messageId?: string;
  readOnly?: boolean;
  nested?: boolean;
}

export function ToolRunRow({ view, startedAt, messageId, readOnly, nested }: ToolRunRowProps) {
  const { open, setOpen } = useToolRunDisclosure(view.id);
  const inFlight = view.state === 'running' || view.state === 'awaiting';
  const elapsedMs = useElapsed(startedAt || 0, inFlight);
  const error = view.sections.find((section) => section.kind === 'error');

  return (
    <>
      <details
        className={`tool-inline${inFlight ? ' is-live' : ''}`}
        data-tcid={view.id}
        data-tool={view.name}
        data-state={view.state}
        data-nested={nested ? '1' : undefined}
        data-react-owned="1"
        data-expandable={view.sections.length || view.tech.length || view.livePreview || view.liveOutput || view.agentRun ? '1' : undefined}
        data-error={view.state === 'error' ? '1' : undefined}
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary className="tool-inline-head" aria-expanded={open}>
          <ToolRunRowHead view={view} elapsedMs={elapsedMs} />
        </summary>
        {open ? (
          inFlight ? (
            <div className="tool-inline-detail">
              {view.livePreview ? <pre className="tool-inline-code-preview">{view.livePreview}</pre> : null}
              {view.liveOutput ? <pre className="tool-inline-code-preview is-output">{view.liveOutput}</pre> : null}
              {!view.livePreview && !view.liveOutput ? <ToolRunDetail view={view} readOnly={readOnly} /> : null}
              {view.agentRun ? <ToolRunAgentSteps run={view.agentRun} live /> : null}
            </div>
          ) : (
            <>
              <ToolRunDetail view={view} readOnly={readOnly} />
              {view.agentRun ? <ToolRunAgentSteps run={view.agentRun} live={false} state={view.state === 'error' ? 'failed' : view.state === 'stopped' ? 'cancelled' : 'done'} /> : null}
            </>
          )
        ) : null}
      </details>
      {error?.kind === 'error' ? <p className="tool-inline-error" role="alert">{error.text.trim().split('\n')[0].slice(0, 180)}</p> : null}
      <RetryButton view={view} readOnly={readOnly} />
      {view.approval ? (
        <ToolRunApproval view={view.approval} messageId={messageId || ''} toolCallId={view.id} readOnly={readOnly} />
      ) : null}
    </>
  );
}

export default ToolRunRow;
