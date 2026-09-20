import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { formatSeconds } from './labels.js';
import { runStartedAt, groupViewOf, type ToolRunState } from './toolRunModel.js';
import { ToolRunDetail } from './ToolRunDetail.js';
import { ToolRunRow } from './ToolRunRow.js';
import { useElapsed } from './useElapsed.js';
import {
  ToolRunSheetContext,
  toolRunGroupId,
  type ToolRunGroupSegment,
  type ToolRunSheetRequest,
} from './ToolRunSheetContext.js';

function translate(key: string, fallback: string): string {
  try {
    const translator = (window as unknown as { t?: (value: string) => string }).t;
    if (typeof translator === 'function') {
      const value = translator(key);
      if (value && value !== key) return value;
    }
  } catch (_) { /* use the fallback outside the app shell */ }
  return fallback;
}

function narrowViewport(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 760px)').matches;
}

function useIsNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(narrowViewport);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setNarrow(media.matches);
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  return narrow;
}

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

function sameCalls(left: readonly { id: string }[], right: readonly { id: string }[]): boolean {
  return left.length === right.length && left.every((call, index) => call === right[index]);
}

function sameToolView(
  left: import('./toolRunModel.js').ToolRunView,
  right: import('./toolRunModel.js').ToolRunView,
): boolean {
  if (left === right) return true;
  try { return JSON.stringify(left) === JSON.stringify(right); } catch (_) { return false; }
}

function metaFor(view: import('./toolRunModel.js').ToolRunView, elapsedMs: number): string {
  const meta = view.meta.slice();
  if (view.state === 'running' || view.state === 'awaiting') {
    const elapsed = formatSeconds(elapsedMs);
    if (elapsed) meta.push(elapsed);
  }
  return meta.join(' · ');
}

function ToolRunSheetContent({
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
                {request.segment.running.map((call, index) => (
                  <ToolRunRow
                    key={call.id}
                    view={groupView!.running[index]}
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

export function ToolRunSheetProvider({ children }: { children: ReactNode }) {
  const isNarrowViewport = useIsNarrowViewport();
  const [sheet, setSheet] = useState<ToolRunSheetRequest | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const isOpen = sheet !== null;
  const generatedId = useId().replace(/:/g, '');
  const headingId = `tool-run-sheet-title-${generatedId}`;

  const openGroup = useCallback((
    segment: ToolRunGroupSegment,
    messageId: string | undefined,
    readOnly: boolean | undefined,
    trigger: HTMLElement,
  ) => {
    const id = toolRunGroupId(segment);
    if (!id) return;
    setSheet({ kind: 'group', id, segment, messageId, readOnly, trigger });
  }, []);

  const openTool = useCallback((
    view: import('./toolRunModel.js').ToolRunView,
    messageId: string | undefined,
    readOnly: boolean | undefined,
    trigger: HTMLElement,
  ) => {
    setSheet({ kind: 'tool', id: view.id, view, messageId, readOnly, trigger });
  }, []);

  const refreshGroup = useCallback((segment: ToolRunGroupSegment) => {
    const id = toolRunGroupId(segment);
    setSheet((current) => current?.kind === 'group'
      && current.id === id
      && current.segment !== segment
      && (current.segment.state !== segment.state
        || current.segment.category !== segment.category
        || !sameCalls(current.segment.members, segment.members)
        || !sameCalls(current.segment.running, segment.running))
      ? { ...current, segment }
      : current);
  }, []);

  const refreshTool = useCallback((view: import('./toolRunModel.js').ToolRunView) => {
    setSheet((current) => current?.kind === 'tool'
      && current.id === view.id
      && current.view !== view
      && !sameToolView(current.view, view)
      ? { ...current, view }
      : current);
  }, []);

  const context = useMemo(() => ({
    isNarrowViewport,
    sheet,
    openGroup,
    openTool,
    refreshGroup,
    refreshTool,
  }), [isNarrowViewport, sheet, openGroup, openTool, refreshGroup, refreshTool]);

  const close = useCallback(() => setSheet(null), []);

  useEffect(() => {
    if (!isOpen) {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (target && target.isConnected) {
        try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
      }
      return undefined;
    }

    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        closeRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = oldOverflow;
    };
  }, [isOpen, close]);

  useEffect(() => {
    if (!sheet) return;
    returnFocusRef.current = sheet.trigger;
    try { closeRef.current?.focus({ preventScroll: true }); } catch (_) { closeRef.current?.focus(); }
  }, [sheet?.trigger]);

  const portal = sheet && typeof document !== 'undefined'
    ? createPortal(
      <ToolRunSheetContent
        request={sheet}
        headingId={headingId}
        closeRef={closeRef}
        panelRef={panelRef}
        onClose={close}
      />,
      document.body,
    )
    : null;

  return (
    <ToolRunSheetContext.Provider value={context}>
      {children}
      {portal}
    </ToolRunSheetContext.Provider>
  );
}

export default ToolRunSheetProvider;
