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

import { ToolRunApproval } from './ToolRunApproval.js';
import { LiveToolRunRow } from './LiveToolRunRow.js';
import { SettledToolRunRow } from './SettledToolRunRow.js';
import { useToolRunSheet } from './ToolRunSheetContext.js';
import type { ToolRunView } from './toolRunModel';
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

export function ToolRunRow({ view, startedAt, messageId, readOnly, nested, sheetMode }: ToolRunRowProps) {
  const [open, setOpen] = useState(false);
  const toolSheet = useToolRunSheet();
  const { sheet, refreshTool } = toolSheet;
  useEffect(() => {
    const activeSheet = sheet;
    if (activeSheet?.kind === 'tool' && activeSheet.id === view.id && activeSheet.view !== view) {
      refreshTool(view);
    }
  }, [refreshTool, sheet, view]);
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
      <LiveToolRunRow view={view} elapsedMs={elapsedMs} nested={nested}>
        {approval}
      </LiveToolRunRow>
    );
  }

  return (
    <SettledToolRunRow
      view={view}
      elapsedMs={elapsedMs}
      expanded={expanded}
      readOnly={readOnly}
      nested={nested}
      sheetMode={sheetMode}
      isNarrowViewport={toolSheet.isNarrowViewport}
      onOpenChange={setOpen}
      onOpenTool={(target) => toolSheet.openTool(view, messageId, readOnly, target)}
    >
      {approval}
    </SettledToolRunRow>
  );
}

export default ToolRunRow;
