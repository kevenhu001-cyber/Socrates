/**
 * chat/turn/finishViewport.ts — finish-time viewport re-assertion.
 *
 * Capture the visible answer before completion updates its status and tools.
 * Preserve that row or paragraph while the layout settles; proximity to the
 * bottom is never a reason to move the reader to a different paragraph.
 */
import { sessionBridge, uiBridge } from '../../store/index.ts';
import { updateMessageSnapshot } from '../../legacy/messageSnapshot.ts';
import { writeScrollTop } from '../../legacy/scrollCoordinator.ts';
import { readTurnMessage } from './runtimeState.ts';
import type { TurnRuntimeState } from './runtimeState.ts';
import { reportSwallow as reportEmptyCatch } from '../../util/reportSwallow.ts';

/** What `capture()` froze so `settle()` can reapply it. */
interface FinishViewportCapture {
  scroller: HTMLElement;
  sessionId: string | null;
  latestMessageId: string | null;
  scrolledAway: boolean;
  scrollTop: number;
  streamRowId: string | null;
  streamRowOffset: number | null;
  anchorNode: Element | null;
  anchorId: string | null;
  anchorOffset: number;
}

interface FinishAnchorCandidate {
  node: Element | null;
  streamRowOffset: number | null;
  streamRowNearTop: boolean;
}

interface FinishIntentGuard {
  hasUserIntent(): boolean;
  detach(): void;
}

export interface FinishViewport {
  capture(): void;
  settle(): void;
}

/* The first frames after the settled React commit do the real work. Later
   frames only need to run when the answer's own box changes (fonts, KaTeX,
   an image or a tool output mounting), so a ResizeObserver takes over from
   the old unconditional 30-frame loop. */
const SETTLE_FRAME_BUDGET = 6;
const SETTLE_OBSERVE_MS = 500;

function findStreamingAnchor(
  state: TurnRuntimeState,
  list: HTMLElement,
  viewport: DOMRect,
): FinishAnchorCandidate {
  const liveRow = list.querySelector('.msg[data-client-id="' + state.clientId + '"]');
  if (!liveRow) return { node: null, streamRowOffset: null, streamRowNearTop: false };
  const target = (liveRow.querySelector('.tool-run-prose') as HTMLElement | null) || liveRow;
  const targetRect = target.getBoundingClientRect();
  if (targetRect.bottom <= viewport.top + 1 || targetRect.top >= viewport.bottom - 1) {
    return { node: null, streamRowOffset: null, streamRowNearTop: false };
  }
  const streamRowOffset = targetRect.top - viewport.top;
  return {
    node: liveRow,
    streamRowOffset,
    streamRowNearTop: Math.abs(streamRowOffset) <= 96,
  };
}

function findVisibleMessageAnchor(rows: NodeListOf<Element>, viewportTop: number): Element | null {
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!row.classList.contains('user') && row.getBoundingClientRect().bottom > viewportTop + 1) {
      return row;
    }
  }
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (row.getBoundingClientRect().bottom > viewportTop + 1) return row;
  }
  return null;
}

function findVisibleInnerAnchor(anchor: Element | null, viewportTop: number): Element | null {
  if (!anchor) return null;
  const candidates = anchor.querySelectorAll(
    '.stream-settled-content > *,.stream-live-content > *,' +
      '.think-prefix > *,.think-suffix > *,.tool-inline,.rn-tool-row,.rn-turn-activity,' +
      '.visualization-card,.exec-artifact,.tool-run-prose > *,.msg-body > *',
  );
  for (let index = 0; index < candidates.length; index++) {
    if (candidates[index].getBoundingClientRect().bottom > viewportTop + 1)
      return candidates[index];
  }
  return null;
}

function latestMessageId(): string | null {
  const messages = sessionBridge.getSnapshot().messages as Array<{ clientId?: string }> | undefined;
  return messages?.length ? messages[messages.length - 1].clientId || null : null;
}

function captureFinishViewport(state: TurnRuntimeState): FinishViewportCapture {
  const list = state.list;
  const viewport = list.getBoundingClientRect();
  const rows = list.querySelectorAll('.msg[data-client-id]');
  const stream = findStreamingAnchor(state, list, viewport);
  const anchor = stream.node || findVisibleMessageAnchor(rows, viewport.top);
  const innerAnchor = findVisibleInnerAnchor(anchor, viewport.top);
  const rowOffset = anchor ? anchor.getBoundingClientRect().top - viewport.top : 0;
  /* Near the top, preserve the answer row because streaming chrome above the
     first paragraph disappears during handoff. Mid-answer, preserve the
     paragraph the reader is following instead. */
  const measuredAnchor = anchor && Math.abs(rowOffset) <= 96 ? anchor : innerAnchor || anchor;
  return {
    scroller: list,
    sessionId: sessionBridge.getSnapshot().currentSessionId as string | null,
    latestMessageId: latestMessageId(),
    /* Freeze reader intent before handoff scroll events can change the live flag. */
    scrolledAway: !!uiBridge.getSnapshot()._userScrolledAway,
    scrollTop: list.scrollTop,
    streamRowId: stream.streamRowNearTop ? state.clientId : null,
    streamRowOffset: stream.streamRowNearTop ? stream.streamRowOffset : null,
    anchorNode: measuredAnchor,
    anchorId: anchor ? anchor.getAttribute('data-client-id') : null,
    anchorOffset: measuredAnchor ? measuredAnchor.getBoundingClientRect().top - viewport.top : 0,
  };
}

function installFinishIntentGuard(onIntent?: () => void): FinishIntentGuard {
  let userIntent = false;
  const markIntent = (): void => {
    userIntent = true;
    onIntent?.();
  };
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  for (const event of events) {
    window.addEventListener(event, markIntent, { passive: true, capture: true });
  }
  return {
    hasUserIntent: () => userIntent,
    detach: () => {
      for (const event of events) window.removeEventListener(event, markIntent, { capture: true });
    },
  };
}

function isCurrentFinish(viewport: FinishViewportCapture): boolean {
  return (
    sessionBridge.getSnapshot().currentSessionId === viewport.sessionId &&
    latestMessageId() === viewport.latestMessageId
  );
}

function reserveStreamRowForCorrection(
  state: TurnRuntimeState,
  viewport: FinishViewportCapture,
  row: HTMLElement,
  rowRect: DOMRect,
  delta: number,
): void {
  if (delta <= 1) return;
  const maxTop = Math.max(0, viewport.scroller.scrollHeight - viewport.scroller.clientHeight);
  const neededTop = viewport.scroller.scrollTop + delta;
  const shortfall = Math.ceil(neededTop - maxTop);
  if (shortfall <= 0) return;
  /* At the physical scroll limit, create only the missing answer reserve. */
  const requiredMin = Math.ceil(rowRect.height + shortfall);
  row.style.minHeight = requiredMin + 'px';
  const message = readTurnMessage(state.msgIdx);
  if (!message) return;
  updateMessageSnapshot(
    message,
    {
      _turnAnchorMinHeight: Math.max(Number(message._turnAnchorMinHeight) || 0, requiredMin),
    },
    true,
  );
}

function applyStreamRowCorrection(
  state: TurnRuntimeState,
  viewport: FinishViewportCapture,
): boolean {
  if (!viewport.streamRowId || !Number.isFinite(viewport.streamRowOffset)) return false;
  const row = state.list.querySelector(
    '.msg[data-client-id="' + viewport.streamRowId + '"][data-react-owned]',
  ) as HTMLElement | null;
  if (!row) return true;
  const target = (row.querySelector('.tool-run-prose') as HTMLElement | null) || row;
  const targetRect = target.getBoundingClientRect();
  const scrollerTop = viewport.scroller.getBoundingClientRect().top;
  const currentOffset = targetRect.top - scrollerTop;
  const delta = currentOffset - (viewport.streamRowOffset as number);
  reserveStreamRowForCorrection(state, viewport, row, row.getBoundingClientRect(), delta);
  writeScrollTop(viewport.scroller, viewport.scroller.scrollTop + delta, 'finish');
  return true;
}

function applyExactAnchorCorrection(viewport: FinishViewportCapture): boolean {
  if (!viewport.anchorNode || !viewport.anchorNode.isConnected) return false;
  const currentOffset =
    viewport.anchorNode.getBoundingClientRect().top - viewport.scroller.getBoundingClientRect().top;
  writeScrollTop(
    viewport.scroller,
    viewport.scroller.scrollTop + currentOffset - viewport.anchorOffset,
    'finish',
  );
  return true;
}

function findCurrentMessageAnchor(state: TurnRuntimeState, anchorId: string): Element | null {
  const rows = state.list.querySelectorAll('.msg[data-client-id]');
  for (let index = 0; index < rows.length; index++) {
    if (rows[index].getAttribute('data-client-id') === anchorId) return rows[index];
  }
  return null;
}

function applyMessageAnchorCorrection(
  state: TurnRuntimeState,
  viewport: FinishViewportCapture,
): void {
  const anchor = viewport.anchorId ? findCurrentMessageAnchor(state, viewport.anchorId) : null;
  if (!anchor) {
    writeScrollTop(viewport.scroller, viewport.scrollTop, 'finish');
    return;
  }
  const currentOffset =
    anchor.getBoundingClientRect().top - viewport.scroller.getBoundingClientRect().top;
  writeScrollTop(
    viewport.scroller,
    viewport.scroller.scrollTop + currentOffset - viewport.anchorOffset,
    'finish',
  );
}

function applyFinishCorrection(state: TurnRuntimeState, viewport: FinishViewportCapture): void {
  /* At transcript top, scrollTop itself expresses reader intent. */
  if (viewport.scrolledAway && viewport.scrollTop <= 2) {
    writeScrollTop(viewport.scroller, viewport.scrollTop, 'finish');
    return;
  }
  if (applyStreamRowCorrection(state, viewport)) return;
  if (applyExactAnchorCorrection(viewport)) return;
  if (viewport.anchorId) {
    applyMessageAnchorCorrection(state, viewport);
    return;
  }
  writeScrollTop(viewport.scroller, viewport.scrollTop, 'finish');
}

/**
 * Build the finish-viewport capture/settle pair bound to one turn's DOM.
 *
 * `state.list` is the #msgList scroll container. Resolve the assistant row
 * from React's committed transcript by its stable message id.
 */
export function createFinishViewport(state: TurnRuntimeState): FinishViewport {
  let finishViewport: FinishViewportCapture | null = null;

  function capture(): void {
    if (!state.list) return;
    try {
      finishViewport = captureFinishViewport(state);
    } catch (error) {
      reportEmptyCatch(error, 'empty catch: chat/turn/finishViewport.ts');
      /* viewport capture failed; settle will no-op */
    }
  }

  /* Completion can retire status rows or mount tool outputs. Reapply the
     captured reading position for a short frame budget, then only when the
     scroller's own box actually changes. Reader intent still wins
     immediately. */
  function settle(): void {
    const viewport = finishViewport;
    if (!viewport || !viewport.scroller) return;
    let intent: FinishIntentGuard | null = null;
    let frames = 0;
    let stopped = false;
    let observer: ResizeObserver | null = null;
    let observeTimer: ReturnType<typeof setTimeout> | null = null;

    const stop = (): void => {
      if (stopped) return;
      stopped = true;
      intent?.detach();
      observer?.disconnect();
      observer = null;
      if (observeTimer !== null) {
        clearTimeout(observeTimer);
        observeTimer = null;
      }
    };
    const guard = installFinishIntentGuard(stop);
    intent = guard;

    const apply = (): boolean => {
      if (stopped) return false;
      if (guard.hasUserIntent() || !isCurrentFinish(viewport)) {
        stop();
        return false;
      }
      try {
        applyFinishCorrection(state, viewport);
      } catch (error) {
        reportEmptyCatch(error, 'empty catch: chat/turn/finishViewport.ts');
        /* frame apply failed */
      }
      return true;
    };

    const settleFrame = (): void => {
      if (!apply()) return;
      frames += 1;
      if (frames < SETTLE_FRAME_BUDGET) requestAnimationFrame(settleFrame);
      else if (!observer) stop();
    };

    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(() => {
        apply();
      });
      let content: Element | null = viewport.anchorNode;
      if (viewport.streamRowId) {
        const row = state.list.querySelector(
          '.msg[data-client-id="' + viewport.streamRowId + '"][data-react-owned]',
        );
        if (row) content = row;
      }
      try {
        /* The scroller's box does not change when the answer grows; observe
           the answer row/paragraph too, or a late toolbar/KaTeX mount would
           land after the frame budget with nobody left to correct it. */
        observer.observe(viewport.scroller);
        if (content && content !== viewport.scroller) observer.observe(content);
      } catch {
        observer = null;
      }
      if (observer) observeTimer = setTimeout(stop, SETTLE_OBSERVE_MS);
    }

    /* settle() runs inside the finish task, before
       React commits the settled snapshot (that commit is a microtask after
       this task). Correcting here only forced a layout of the pre-commit DOM
       and wrote a no-op scrollTop; the first useful correction is in the
       next frame, after the commit and before that frame paints. */
    requestAnimationFrame(settleFrame);
  }

  return { capture, settle };
}
