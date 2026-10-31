/**
 * chat/turn/finishViewport.ts — finish-time viewport re-assertion.
 *
 * Capture the visible answer before completion updates its status and tools.
 * Preserve that row or paragraph while the layout settles; proximity to the
 * bottom is never a reason to move the reader to a different paragraph.
 */
import { stateStore } from '../../state/store.ts';
import { updateMessageSnapshot } from '../../ui/messageSnapshot.ts';
import { writeScrollTop } from '../../ui/scrollCoordinator.ts';
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

function findStreamingAnchor(
  state: TurnRuntimeState,
  list: HTMLElement,
  viewport: DOMRect,
): FinishAnchorCandidate {
  const liveRow = list.querySelector('.msg[data-client-id="' + state.clientId + '"]');
  if (!liveRow) return { node: null, streamRowOffset: null, streamRowNearTop: false };
  const liveRect = liveRow.getBoundingClientRect();
  if (liveRect.bottom <= viewport.top + 1 || liveRect.top >= viewport.bottom - 1) {
    return { node: null, streamRowOffset: null, streamRowNearTop: false };
  }
  const streamRowOffset = liveRect.top - viewport.top;
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
    '.think-prefix > *,.think-suffix > *,.tool-inline,' +
    '.visualization-card,.exec-artifact,.tool-run-prose > *,.msg-body > *',
  );
  for (let index = 0; index < candidates.length; index++) {
    if (candidates[index].getBoundingClientRect().bottom > viewportTop + 1) return candidates[index];
  }
  return null;
}

function latestMessageId(): string | null {
  const messages = stateStore.read('messages') as Array<{ clientId?: string }> | undefined;
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
    sessionId: stateStore.read('currentSessionId') as string | null,
    latestMessageId: latestMessageId(),
    /* Freeze reader intent before handoff scroll events can change the live flag. */
    scrolledAway: !!stateStore.read('_userScrolledAway'),
    scrollTop: list.scrollTop,
    streamRowId: stream.streamRowNearTop ? state.clientId : null,
    streamRowOffset: stream.streamRowNearTop ? stream.streamRowOffset : null,
    anchorNode: measuredAnchor,
    anchorId: anchor ? anchor.getAttribute('data-client-id') : null,
    anchorOffset: measuredAnchor ? measuredAnchor.getBoundingClientRect().top - viewport.top : 0,
  };
}

function installFinishIntentGuard(): FinishIntentGuard {
  let userIntent = false;
  const markIntent = (): void => { userIntent = true; };
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
  return stateStore.read('currentSessionId') === viewport.sessionId
    && latestMessageId() === viewport.latestMessageId;
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
  updateMessageSnapshot(message, {
    _turnAnchorMinHeight: Math.max(Number(message._turnAnchorMinHeight) || 0, requiredMin),
  }, true);
}

function applyStreamRowCorrection(state: TurnRuntimeState, viewport: FinishViewportCapture): boolean {
  if (!viewport.streamRowId || !Number.isFinite(viewport.streamRowOffset)) return false;
  const row = state.list.querySelector(
    '.msg[data-client-id="' + viewport.streamRowId + '"][data-react-owned]',
  ) as HTMLElement | null;
  if (!row) return true;
  const rowRect = row.getBoundingClientRect();
  const scrollerTop = viewport.scroller.getBoundingClientRect().top;
  const currentOffset = rowRect.top - scrollerTop;
  const delta = currentOffset - (viewport.streamRowOffset as number);
  reserveStreamRowForCorrection(state, viewport, row, rowRect, delta);
  writeScrollTop(viewport.scroller, viewport.scroller.scrollTop + delta, 'finish');
  return true;
}

function applyExactAnchorCorrection(viewport: FinishViewportCapture): boolean {
  if (!viewport.anchorNode || !viewport.anchorNode.isConnected) return false;
  const currentOffset = viewport.anchorNode.getBoundingClientRect().top
    - viewport.scroller.getBoundingClientRect().top;
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

function applyMessageAnchorCorrection(state: TurnRuntimeState, viewport: FinishViewportCapture): void {
  const anchor = viewport.anchorId ? findCurrentMessageAnchor(state, viewport.anchorId) : null;
  if (!anchor) {
    writeScrollTop(viewport.scroller, viewport.scrollTop, 'finish');
    return;
  }
  const currentOffset = anchor.getBoundingClientRect().top - viewport.scroller.getBoundingClientRect().top;
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
    try { finishViewport = captureFinishViewport(state); }
    catch (error) {
      reportEmptyCatch(error, 'empty catch: chat/turn/finishViewport.ts:242');
      /* viewport capture failed; settle will no-op */
    }
  }

  /* Completion can retire status rows or mount tool outputs. Reapply the
     captured reading position for a bounded number of frames, stopping as
     soon as the reader scrolls or interacts. */
  function settle(): void {
    const viewport = finishViewport;
    if (!viewport || !viewport.scroller) return;
    const intent = installFinishIntentGuard();
    let frames = 0;
    const settleFrame = (): void => {
      if (intent.hasUserIntent() || !isCurrentFinish(viewport)) {
        intent.detach();
        return;
      }
      try { applyFinishCorrection(state, viewport); }
      catch (error) {
        reportEmptyCatch(error, 'empty catch: chat/turn/finishViewport.ts:260');
        /* frame apply failed */
      }
      frames += 1;
      if (frames < 30) requestAnimationFrame(settleFrame);
      else intent.detach();
    };
    settleFrame();
  }

  return { capture, settle };
}
