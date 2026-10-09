import type { ReactNode } from 'react';
import { ToolRunAgentSteps } from './ToolRunAgentSteps.js';
import { ToolRunDetail } from './ToolRunDetail.js';
import { ToolRunRowHead } from './ToolRunRowHead.js';
import type { ToolRunState, ToolRunView } from './toolRunModel.js';

function isExpandable(view: ToolRunView): boolean {
  return view.sections.length > 0 || view.tech.length > 0 || !!view.retry;
}

function runSectionState(state: ToolRunState): 'done' | 'failed' | 'cancelled' {
  if (state === 'error') return 'failed';
  if (state === 'stopped') return 'cancelled';
  return 'done';
}

export function SettledToolRunRow({
  view,
  elapsedMs,
  expanded,
  readOnly,
  nested,
  sheetMode,
  isNarrowViewport,
  onOpenChange,
  onOpenTool,
  children,
}: {
  view: ToolRunView;
  elapsedMs: number;
  expanded: boolean;
  readOnly?: boolean;
  nested?: boolean;
  sheetMode?: boolean;
  isNarrowViewport: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTool: (target: HTMLElement) => void;
  children?: ReactNode;
}) {
  return (
    <>
      <details
        className="tool-inline"
        data-tcid={view.id}
        data-tool={view.name}
        data-state={view.state}
        data-nested={nested ? '1' : undefined}
        data-react-owned="1"
        data-error={view.state === 'error' ? '1' : undefined}
        data-expandable={isExpandable(view) ? '1' : undefined}
        open={expanded}
        onToggle={(event) => onOpenChange((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary
          className="tool-inline-head"
          aria-haspopup={isNarrowViewport && !sheetMode ? 'dialog' : undefined}
          onClick={(event) => {
            if (sheetMode || !isNarrowViewport) return;
            event.preventDefault();
            onOpenTool(event.currentTarget);
          }}
        >
          <ToolRunRowHead view={view} elapsedMs={elapsedMs} />
        </summary>
        {children}
        {expanded ? <ToolRunDetail view={view} readOnly={readOnly} /> : null}
      </details>
      {view.agentRun ? (
        <ToolRunAgentSteps
          run={view.agentRun}
          live={false}
          state={runSectionState(view.state)}
        />
      ) : null}
    </>
  );
}
