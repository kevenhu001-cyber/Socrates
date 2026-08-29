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
 */
import { Fragment, useMemo, useState } from 'react';

import { STROKE_ICONS } from '../../ui/icons/toolIcons.js';
import { formatSeconds, tf } from './labels.js';
import { ToolRunAttachments } from './ToolRunAttachments.js';
import {
  groupViewOf,
  runStartedAt,
  toolRunView,
  type ToolRunState,
  type TurnSegment,
} from './toolRunModel.js';
import { ToolRunDetail } from './ToolRunDetail.js';
import { ToolRunRow } from './ToolRunRow.js';
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

export interface ToolRunGroupProps {
  segment: GroupSegment;
  /** Passed down so a member row can file an approval against its turn. */
  messageId?: string;
  /** Share / history-replay surfaces hide the actions that mutate state. */
  readOnly?: boolean;
}

export function ToolRunGroup({ segment, messageId, readOnly }: ToolRunGroupProps) {
  const [open, setOpen] = useState(false);
  const view = useMemo(() => groupViewOf(segment), [segment]);
  const showsHeader = view.showsHeader;
  const inFlight = showsHeader && (view.state === 'running' || view.state === 'awaiting');
  const startedAt = showsHeader && segment.running.length ? runStartedAt(segment.running[0]) : 0;
  // Hooks first: the single-member shortcut below must not make one conditional.
  const elapsedMs = useElapsed(startedAt, inFlight && !!startedAt);

  /* A run of one is just a row — no aggregate header. */
  if (!showsHeader) {
    const single = segment.members.concat(segment.running);
    return (
      <>
        {single.map((call) => (
          <Fragment key={call.id}>
            <ToolRunRow
              view={toolRunView(call)}
              startedAt={runStartedAt(call)}
              messageId={messageId}
              readOnly={readOnly}
            />
            <ToolRunAttachments call={call} />
          </Fragment>
        ))}
      </>
    );
  }

  const meta = view.meta.slice();
  if (inFlight) {
    const elapsed = formatSeconds(elapsedMs);
    if (elapsed) meta.push(elapsed);
  }

  return (
    <section
      className={`tool-run-group${open ? ' open' : ''}`}
      data-state={CSS_STATE[view.state]}
      data-category={view.category}
    >
      <button
        type="button"
        className="tool-run-summary"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="tool-run-summary-dot" aria-hidden="true" />
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

      {/* Collapsed, the file-count chip is the one-glance answer to "what did
          it touch" and Review is what opens the list; expanded, the paths are
          already in the body, so the chip gets out of the way. */}
      {view.fileSummary && !open && showsFileChip(view.state) ? (
        <div className="tool-inline-file-summary">
          <span
            className="tool-inline-file-summary-icon"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: STROKE_ICONS.fileChange }}
          />
          <span className="tool-inline-file-summary-count">
            {tf('tool.doneWriteFiles', 'Edited {n} files', { n: view.fileSummary.count })}
          </span>
          <button
            type="button"
            className="tool-inline-file-summary-review"
            onClick={() => setOpen(true)}
          >
            {tf('tool.fileSummaryReview', 'Review changes')}
          </button>
        </div>
      ) : null}

      <div className="tool-run-list" hidden={!open}>
        {open ? <ToolRunDetail view={view} readOnly={readOnly} /> : null}
        {segment.members.map((call, index) => (
          <Fragment key={call.id}>
            <ToolRunRow
              view={view.members[index]}
              startedAt={runStartedAt(call)}
              messageId={messageId}
              readOnly={readOnly}
              nested
            />
            <ToolRunAttachments call={call} />
          </Fragment>
        ))}
      </div>

      {/* Live lines stay outside the collapsed aggregate. */}
      {segment.running.map((call, index) => (
        <Fragment key={call.id}>
          <ToolRunRow
            view={view.running[index]}
            startedAt={runStartedAt(call)}
            messageId={messageId}
            readOnly={readOnly}
            nested
          />
          <ToolRunAttachments call={call} />
        </Fragment>
      ))}
    </section>
  );
}

/** The file chip reports work that landed, so failures and stops skip it. */
function showsFileChip(state: ToolRunState): boolean {
  return state === 'done' || state === 'running' || state === 'awaiting';
}

export default ToolRunGroup;
