/**
 * react/tool-run/ToolRunGroup.tsx — the aggregate header for a run of tools.
 *
 * Replaces main.js's `_toolRunList` plus toolInline's
 * `settleInlineToolGroupRow`/`groupDoneLabel`/`groupErrorLabel`. Class names
 * and the `data-state` vocabulary match the stylesheet that already exists
 * (styles.css:4676+), so the group keeps its look while the rows under it come
 * from the new renderer.
 *
 * Two rules the old path got wrong and this one cannot:
 *  - a group of ONE call renders no header at all — an aggregate line above a
 *    single row is pure noise, which is why lone searches stayed light;
 *  - an in-flight call renders *outside* the collapsed header, because hiding
 *    the live line behind a toggle is how the streaming command preview became
 *    invisible.
 *
 * The third rule this file owns: tool OUTPUT is not tool STATUS. Charts and
 * saved files render beside the rows region, while the summary toggle only
 * controls `.tool-run-list` — collapsing a run may hide its arguments and
 * stdout, never its result.
 */
import { useEffect, useMemo, useState } from 'react';

import { categoryIcon, STROKE_ICONS } from '../../ui/icons/toolIcons.js';
import { formatSeconds } from './labels.js';
import { ToolRunAttachments } from './ToolRunAttachments.js';
import {
  groupOutputCalls,
  groupViewOf,
  runStartedAt,
  toolRunView,
  type ToolRunState,
  type TurnSegment,
} from './toolRunModel.js';
import { ToolRunDetail } from './ToolRunDetail.js';
import { ToolRunRow } from './ToolRunRow.js';
import { toolRunGroupId, useToolRunSheet } from './ToolRunSheetContext.js';
import { useElapsed } from './useElapsed.js';

type GroupSegment = Extract<TurnSegment, { kind: 'group' }>;

/** The stylesheet keys `data-state` off "complete"/"cancelled". */
const CSS_STATE: Record<ToolRunState, string> = {
  running: 'running',
  awaiting: 'running',
  done: 'complete',
  error: 'error',
  stopped: 'cancelled',
};

/**
 * The mark on the aggregate line.
 *
 * A failed run reports the failure with the shared alert glyph — the category
 * is the least useful thing to know about a run that did not work. Everything
 * else shows what kind of work happened, so the eye can skip or stop before it
 * reads the label.
 *
 * The category comes from the *segment*, not from `view.category`: the view
 * reports the first member's category (which is what `data-category` has always
 * carried), while the segment resolves a run whose members disagree to `mixed`.
 * An icon is a claim about the whole run, so it has to use the honest one.
 */
function summaryIcon(state: ToolRunState, category: string): string {
  if (state === 'error') return STROKE_ICONS.alert;
  return categoryIcon(category);
}

export interface ToolRunGroupProps {  segment: GroupSegment;
  /** Passed down so a member row can file an approval against its turn. */
  messageId?: string;
  /** Share / history-replay surfaces hide the actions that mutate state. */
  readOnly?: boolean;
}

export function ToolRunGroup({ segment, messageId, readOnly }: ToolRunGroupProps) {
  const [open, setOpen] = useState(false);
  const toolSheet = useToolRunSheet();
  const view = useMemo(() => groupViewOf(segment), [segment]);
  const showsHeader = view.showsHeader;
  const groupId = toolRunGroupId(segment);
  const sheetOpen = toolSheet.sheet?.kind === 'group' && toolSheet.sheet.id === groupId;
  useEffect(() => {
    const activeSheet = toolSheet.sheet;
    if (activeSheet?.kind === 'group' && activeSheet.id === groupId && activeSheet.segment !== segment) {
      toolSheet.refreshGroup(segment);
    }
  }, [groupId, segment, toolSheet.sheet, toolSheet.refreshGroup]);
  const inFlight = showsHeader && (view.state === 'running' || view.state === 'awaiting');
  const startedAt = showsHeader && segment.running.length ? runStartedAt(segment.running[0]) : 0;
  // Hooks first: the single-member shortcut below must not make one conditional.
  const elapsedMs = useElapsed(startedAt, inFlight && !!startedAt);

  const meta = view.meta.slice();
  if (inFlight) {
    const elapsed = formatSeconds(elapsedMs);
    if (elapsed) meta.push(elapsed);
  }

  /* Tool OUTPUTS render as a sibling of the rows region, in the group's own
     fragment — never inside the subtree whose shape changes when a run crosses
     two settled members. A host inside that subtree would be remounted (and its
     renderer torn down and rebuilt) exactly when the last call settles. The
     toggle below owns status only: a chart or a saved file stays on screen
     while the run is collapsed. */
  const outputs = groupOutputCalls(segment).map((call) => (
    <ToolRunAttachments key={`output-${call.id}`} call={call} />
  ));

  /* A run of one is just a row — no aggregate header. */
  if (!showsHeader) {
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
        {outputs}
      </>
    );
  }

  return (
    <>
      <section
        className={`tool-run-group${open ? ' open' : ''}`}
        data-state={CSS_STATE[view.state]}
        data-category={view.category}
      >
        <button
          type="button"
          className="tool-run-summary"
          aria-haspopup={toolSheet.isNarrowViewport ? 'dialog' : undefined}
          aria-expanded={toolSheet.isNarrowViewport ? sheetOpen : open}
          onClick={(event) => {
            if (toolSheet.isNarrowViewport) {
              toolSheet.openGroup(segment, messageId, readOnly, event.currentTarget);
              return;
            }
            setOpen((value) => !value);
          }}
        >
          <span
            className="tool-run-summary-icon"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: summaryIcon(view.state, segment.category) }}
          />
          <span className={`tool-run-summary-label${inFlight ? ' shimmer-text' : ''}`}>
            {view.headerLabel}
          </span>
          {meta.length ? <span className="tool-run-summary-meta">{meta.join(' · ')}</span> : null}
          <span
            className="tool-run-summary-chev"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: STROKE_ICONS.chevronDown }}
          />
        </button>

        <div className="tool-run-list" hidden={toolSheet.isNarrowViewport || !open}>
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
      </section>

      {outputs}
    </>
  );
}

export default ToolRunGroup;
