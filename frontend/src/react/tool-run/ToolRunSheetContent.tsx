import type { RefObject } from 'react';

import { formatSeconds, translate } from './labels.js';
import { groupViewOf, runStartedAt, type ToolRunState, type ToolRunView } from './toolRunModel.js';
import { ToolRunDetail } from './ToolRunDetail.js';
import { ToolRunRow } from './ToolRunRow.js';
import { useElapsed } from './useElapsed.js';
import type { ToolRunSheetRequest } from './ToolRunSheetContext.js';

function sheetState(state: ToolRunState): string {
  if (state === 'running' || state === 'awaiting') return 'running';
  if (state === 'done') return 'complete';
  if (state === 'error') return 'error';
  return 'cancelled';
}

function statusLabel(state: ToolRunState): string {
  if (state === 'running') return translate('tool.statusRunning', 'Running');
  if (state === 'awaiting') return translate('tool.awaitingApproval', 'Waiting for your decision');
  if (state === 'error') return translate('tool.statusFailed', 'Failed');
  if (state === 'stopped') return translate('tool.statusStopped', 'Stopped');
  return translate('tool.statusDone', 'Done');
}

function metaFor(view: ToolRunView, elapsedMs: number): string {
  const meta = view.meta.slice();
  if (view.state === 'running' || view.state === 'awaiting') {
    const elapsed = formatSeconds(elapsedMs);
    if (elapsed) meta.push(elapsed);
  }
  return meta.join(' · ');
}

export function ToolRunSheetContent({
  request,
  headingId,
  closeRef,
  panelRef,
  onClose,
}: {
  request: ToolRunSheetRequest;
  headingId: string;
  closeRef: RefObject<HTMLButtonElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const groupView = request.kind === 'group' ? groupViewOf(request.segment) : null;
  const view = request.kind === 'group' ? groupView! : request.view;
  const state = sheetState(view.state);
  const title = groupView ? groupView.headerLabel : view.label;
  const startedAt = request.kind === 'group' && request.segment.running.length
    ? runStartedAt(request.segment.running[0])
    : 0;
  const inFlight = view.state === 'running' || view.state === 'awaiting';
  const elapsedMs = useElapsed(startedAt, inFlight && !!startedAt);
  const meta = metaFor(view, elapsedMs);

  return (
    <div
      className="tool-run-sheet-backdrop"
      data-tool-run-sheet-backdrop="1"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        className="tool-run-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        data-kind={request.kind}
        data-state={state}
        data-tool-run-sheet="1"
      >
        <header className="tool-run-sheet-header">
          <div className="tool-run-sheet-heading">
            <h2 className="tool-run-sheet-title" id={headingId}>{title}</h2>
            {meta ? <p className="tool-run-sheet-meta">{meta}</p> : null}
          </div>
          <span className="tool-run-sheet-status" data-state={state}>
            <span className="tool-run-sheet-status-dot" aria-hidden="true" />
            {statusLabel(view.state)}
          </span>
          <button
            ref={closeRef}
            type="button"
            className="tool-run-sheet-close"
            aria-label={translate('common.close', 'Close')}
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="tool-run-sheet-body">
          {request.kind === 'group' ? (
            <>
              {view.sections.length || view.tech.length ? (
                <div className="tool-run-sheet-overview">
                  <ToolRunDetail view={view} readOnly={request.readOnly} />
                </div>
              ) : null}
              <div className="tool-run-sheet-call-list">
                {request.segment.members.map((call, index) => (
                  <ToolRunRow
                    key={call.id}
                    view={groupView!.members[index]}
                    startedAt={runStartedAt(call)}
                    messageId={request.messageId}
                    readOnly={request.readOnly}
                    nested
                    sheetMode
                  />
                ))}
              </div>
            </>
          ) : (
            <ToolRunDetail view={view} readOnly={request.readOnly} />
          )}
        </div>
      </section>
    </div>
  );
}
