import type { ReactNode } from 'react';
import { ToolRunAgentSteps } from './ToolRunAgentSteps.js';
import { ToolRunRowHead } from './ToolRunRowHead.js';
import type { ToolRunView } from './toolRunModel.js';

export function LiveToolRunRow({
  view,
  elapsedMs,
  nested,
  children,
}: {
  view: ToolRunView;
  elapsedMs: number;
  nested?: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      <div
        className="tool-inline is-live"
        data-tcid={view.id}
        data-tool={view.name}
        data-state="running"
        data-nested={nested ? '1' : undefined}
        data-react-owned="1"
        aria-busy="true"
      >
        <div className="tool-inline-head">
          <ToolRunRowHead view={view} elapsedMs={elapsedMs} />
        </div>
        {view.livePreview ? (
          <pre className="tool-inline-code-preview" aria-hidden="true">{view.livePreview}</pre>
        ) : null}
        {view.liveOutput ? (
          <pre className="tool-inline-code-preview is-output" aria-hidden="true">{view.liveOutput}</pre>
        ) : null}
        {children}
      </div>
      {view.agentRun ? <ToolRunAgentSteps run={view.agentRun} live /> : null}
    </>
  );
}
