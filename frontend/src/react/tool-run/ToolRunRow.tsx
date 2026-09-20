/**
 * react/tool-run/ToolRunRow.tsx — one tool call, one line.
 *
 * Two shapes on purpose:
 *  - settled rows are a `<details>` so the collapsed line stays one row tall;
 *  - a RUNNING row is a plain div, because its whole point is the streaming
 *    command/code preview, and content inside a closed `<details>` is exactly
 *    how the old row managed to hide the preview it was already building
 *    (updateInlineToolCodePreview wrote into a body nobody could see).
 *
 * The elapsed timer is driven by one shared 250ms tick per running row rather
 * than the old global RUNNING_INLINE_ROWS table.
 */
import { useEffect, useState } from 'react';

import { STROKE_ICONS, toolIcon } from '../../ui/icons/toolIcons.js';
import { formatSeconds } from './labels.js';
import { ToolRunAgentSteps } from './ToolRunAgentSteps.js';
import { ToolRunApproval } from './ToolRunApproval.js';
import { ToolRunDetail } from './ToolRunDetail.js';
import { useToolRunSheet } from './ToolRunSheetContext.js';
import type { ToolRunState, ToolRunView } from './toolRunModel';
import { useElapsed } from './useElapsed.js';

export interface ToolRunRowProps {
  view: ToolRunView;
  /** Live run start (ms epoch) for the elapsed counter. */
  startedAt?: number;
  /** Owning assistant message — an approval decision is filed against it. */
  messageId?: string;
  /** Share / history-replay surfaces hide the actions that mutate state. */
  readOnly?: boolean;
  /** True when this row sits inside a collapsed group (tighter rhythm). */
  nested?: boolean;
  /** Group rows rendered inside the mobile sheet expand in place, not a new sheet. */
  sheetMode?: boolean;
}

function metaParts(view: ToolRunView, elapsedMs: number): string {
  const parts = view.meta.slice();
  if (view.state === 'running') {
    const elapsed = formatSeconds(elapsedMs);
    if (elapsed) parts.push(elapsed);
  }
  return parts.join(' · ');
}

function RowHead({ view, elapsedMs }: { view: ToolRunView; elapsedMs: number }) {
  const meta = metaParts(view, elapsedMs);
  const running = view.state === 'running';
  return (
    <>
      <span className="tool-inline-tool-icon" aria-hidden="true">
        {running
          ? <span className="tool-inline-spinner" />
          : <span dangerouslySetInnerHTML={{ __html: toolIcon(view.name) }} />}
      </span>
      <span
        className={`tool-inline-label${running ? ' shimmer-text' : ''}${view.mono ? ' is-mono' : ''}`}
        title={view.label}
      >
        {view.label}
      </span>
      {meta ? <span className="tool-inline-meta is-visible">{meta}</span> : null}
      {running ? null : (
        <span
          className="tool-inline-chev"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: STROKE_ICONS.chevronRight }}
        />
      )}
    </>
  );
}

/** The chevron only earns its place when opening the row reveals something. */
function isExpandable(view: ToolRunView): boolean {
  return view.sections.length > 0 || view.tech.length > 0 || !!view.retry;
}

/** What a settled agent-run section reports as its outcome. */
function runSectionState(state: ToolRunState): 'done' | 'failed' | 'cancelled' {
  if (state === 'error') return 'failed';
  if (state === 'stopped') return 'cancelled';
  return 'done';
}

export function ToolRunRow({ view, startedAt, messageId, readOnly, nested, sheetMode }: ToolRunRowProps) {
  const [open, setOpen] = useState(false);
  const toolSheet = useToolRunSheet();
  useEffect(() => {
    const activeSheet = toolSheet.sheet;
    if (activeSheet?.kind === 'tool' && activeSheet.id === view.id && activeSheet.view !== view) {
      toolSheet.refreshTool(view);
    }
  }, [toolSheet.sheet, toolSheet.refreshTool, view]);
  /* A call blocked on approval is still in flight — it keeps the live shape and
     the spinner, because the run has not ended, it is waiting for the reader. */
  const inFlight = view.state === 'running' || view.state === 'awaiting';
  const elapsedMs = useElapsed(startedAt || 0, inFlight);
  /* An approval you cannot see is an approval you cannot answer, so the prompt
     pins the row open instead of hiding behind the collapsed line. */
  const expanded = open || Boolean(view.approval);

  const approval = view.approval ? (
    <ToolRunApproval
      view={view.approval}
      messageId={messageId || ''}
      toolCallId={view.id}
      readOnly={readOnly}
    />
  ) : null;

  if (inFlight) {
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
            <RowHead view={view} elapsedMs={elapsedMs} />
          </div>
          {view.livePreview ? (
            <pre className="tool-inline-code-preview" aria-hidden="true">{view.livePreview}</pre>
          ) : null}
          {view.liveOutput ? (
            <pre className="tool-inline-code-preview is-output" aria-hidden="true">{view.liveOutput}</pre>
          ) : null}
          {approval}
        </div>
        {view.agentRun ? <ToolRunAgentSteps run={view.agentRun} live /> : null}
      </>
    );
  }

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
        onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary
          className="tool-inline-head"
          aria-haspopup={toolSheet.isNarrowViewport && !sheetMode ? 'dialog' : undefined}
          onClick={(event) => {
            if (sheetMode || !toolSheet.isNarrowViewport) return;
            event.preventDefault();
            toolSheet.openTool(view, messageId, readOnly, event.currentTarget);
          }}
        >
          <RowHead view={view} elapsedMs={elapsedMs} />
        </summary>
        {approval}
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

export default ToolRunRow;
