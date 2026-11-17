/**
 * Send-time viewport hold: keep the submitted prompt at its anchor while the
 * live transcript height changes (keyboard, composer, resize), and retire
 * reserves that belong to older turns.
 */
import { dispatchSession, sessionStore, uiStore } from '../../../store/index.ts';
import { subscribeLegacyState } from '../../../store/legacyListeners.ts';
import { publishReactChatRuntime } from '../../../legacy/reactBridge.ts';
import { updateMessageSnapshot } from '../../../legacy/messageSnapshot.ts';
import { writeScrollTop } from '../../../legacy/scrollCoordinator.ts';
import { suppressScrollPositionIntent } from '../../../legacy/scrollPill.ts';
import { getKeyboardLift } from '../../../legacy/keyboard/index.ts';
import type { MessageEntry } from '../../../legacy/messageActions.ts';
import { reportSwallow as reportEmptyCatch } from '../../../util/reportSwallow.ts';
import {
  clearTurnViewportOwner,
  markTurnViewportOwner,
  turnAnchorReserve,
  type TurnAnchorList,
} from './ownership.ts';

/**
 * A send-time viewport hold: while it is active the submitted prompt owns
 * the top of the transcript, and the active answer's reserve is kept matched
 * to the live transcript height.
 *
 * A single send-time measurement is not enough. The transcript's viewport
 * height keeps changing after the send — the virtual keyboard opens or
 * closes, the composer grows or collapses, the window resizes — and because
 * the scroll range is `scrollHeight - clientHeight`, a stale reserve lets the
 * range shrink under the anchor and the browser clamps `scrollTop`, sliding
 * the prompt down by the whole delta. Recomputing the reserve on every
 * viewport change is what LobeHub's trailing spacer does.
 *
 * The correction is written in the same frame as the layout change:
 * ResizeObserver callbacks run after layout and before paint, so growing or
 * shrinking the reserve here is never visible as a jump — the reader sees
 * the keyboard or composer move while the prompt stays put.
 */
interface TurnViewportHold {
  list: TurnAnchorList;
  /** The active answer's row, whichever renderer owns it. */
  rowFor: () => HTMLElement | null;
  /** The submitted prompt this hold keeps at the top offset. */
  promptRow: HTMLElement;
  clientId: string;
  targetOffset: number;
  /* While the send glide is still in flight, `align` stays false: the hold
     re-syncs the reserve on every viewport change so the glide's live target
     never outruns the reachable scroll range, but it must NOT write
     scrollTop — the eased motion owns the prompt's position until it lands.
     Flipped on when the glide resolves (releaseAnchor restarts the hold). */
  align: boolean;
  observer: ResizeObserver | null;
  /** Same-task correction listeners, removed on release. */
  onViewportResize: (() => void) | null;
  /** Unsubscribe from the keyboard lift's per-frame inset writes. */
  unsubInset: (() => void) | null;
  unsubScrollIntent: (() => void) | null;
}

let viewportHold: TurnViewportHold | null = null;

/**
 * Release the active send-time viewport hold, if any. Safe to repeat, and
 * called whenever a newer turn, a reader gesture, or a finished answer takes
 * the transcript back over.
 */
export function releaseTurnViewportHold(): void {
  const hold = viewportHold;
  if (!hold) return;
  viewportHold = null;
  hold.unsubScrollIntent?.();
  if (hold.observer) {
    try {
      hold.observer.disconnect();
    } catch (_) {
      reportEmptyCatch(_, 'empty catch: chat/turn/anchor/hold.ts');
      /* detached list */
    }
  }
  if (hold.onViewportResize) {
    try {
      window.removeEventListener('resize', hold.onViewportResize);
    } catch (_) {
      reportEmptyCatch(_, 'empty catch: chat/turn/anchor/hold.ts');
      /* no window */
    }
  }
  if (hold.unsubInset) {
    try {
      hold.unsubInset();
    } catch (_) {
      reportEmptyCatch(_, 'empty catch: chat/turn/anchor/hold.ts');
      /* released controller */
    }
  }
  /* legacy/keyboard reads this flag to leave the transcript alone while the
     send anchor owns it; clearing it hands the position back. */
  if (hold.list.dataset) delete hold.list.dataset.turnAnchorHold;
  clearTurnViewportOwner(hold.list);
}

function findAnchorEntry(clientId: string): MessageEntry | null {
  if (!clientId) return null;
  const stored = sessionStore.getState().messages as MessageEntry[];
  for (let i = stored.length - 1; i >= 0; i -= 1) {
    if (stored[i] && stored[i].clientId === clientId) return stored[i];
  }
  return null;
}

export function latestUserRow(list: HTMLElement): HTMLElement | null {
  const users = list.querySelectorAll('.msg.user');
  return users.length ? (users[users.length - 1] as HTMLElement) : null;
}

export function createPromptTarget(
  list: HTMLElement,
  anchor: Element,
  anchorInList: number,
  targetOffset: number,
): () => number {
  let promptNode: HTMLElement | null = anchor as HTMLElement;
  return function promptTarget(): number {
    if (!promptNode || !promptNode.isConnected) promptNode = latestUserRow(list);
    if (!promptNode) return Math.max(0, list.scrollTop + anchorInList - targetOffset);
    const live = promptNode.getBoundingClientRect().top - list.getBoundingClientRect().top;
    return Math.max(0, list.scrollTop + live - targetOffset);
  };
}

/** Converge the prompt back to its target offset without animating: the
 *  caller has just changed the layout, so a straight write is invisible. */
function alignPromptToOffset(
  list: TurnAnchorList,
  promptRow: HTMLElement,
  targetOffset: number,
): void {
  const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
  const next = Math.max(0, Math.min(maxScroll, Math.round(promptRow.offsetTop - targetOffset)));
  if (Math.abs(next - list.scrollTop) <= 0.5) return;
  suppressScrollPositionIntent(200);
  writeScrollTop(list, next, 'turn');
}

function shouldReleaseHold(
  list: HTMLElement,
  promptRow: HTMLElement,
  anchorRow: HTMLElement | null,
  entry: MessageEntry | null,
  reserve: number,
  holdTargetOffset: number,
): boolean {
  if (!list.isConnected || uiStore.getState()._userScrolledAway) return true;
  if (!promptRow.isConnected || latestUserRow(list) !== promptRow) return true;
  if (!anchorRow || !entry || reserve <= 0) return true;
  if (anchorRow.getBoundingClientRect().height > reserve + 1) return true;
  const promptTarget = Math.max(
    0,
    Math.min(
      Math.max(0, list.scrollHeight - list.clientHeight),
      Math.round(promptRow.offsetTop - holdTargetOffset),
    ),
  );
  return list.scrollTop > promptTarget + 24;
}

function holdTurnViewport(): void {
  const hold = viewportHold;
  if (!hold) return;
  const list = hold.list;
  const promptRow = hold.promptRow;
  const anchorRow = hold.rowFor();
  const entry = findAnchorEntry(hold.clientId);
  const reserve = entry ? Number(entry._turnAnchorMinHeight) || 0 : 0;

  if (shouldReleaseHold(list, promptRow, anchorRow, entry, reserve, hold.targetOffset)) {
    releaseTurnViewportHold();
    return;
  }
  if (!anchorRow || !entry) return;

  const styles = getComputedStyle(list);
  const bottomPadding = parseFloat(styles.paddingBottom) || 0;
  const nextReserve = turnAnchorReserve(
    list.clientHeight,
    promptRow.getBoundingClientRect().height,
    bottomPadding,
  );
  if (Math.abs(nextReserve - reserve) >= 1) {
    anchorRow.style.minHeight = nextReserve + 'px';
    anchorRow.classList.add('turn-viewport-anchor');
    /* Mirror the value onto the entry so React's next commit — and a
       remount — repaint the same reserve instead of a stale one. */
    updateMessageSnapshot(entry, { _turnAnchorMinHeight: nextReserve }, true);
    publishReactChatRuntime({ type: 'tool-run-updated', messageId: hold.clientId });
  }

  if (hold.align) alignPromptToOffset(list, promptRow, hold.targetOffset);
}

/**
 * Let the active hold watch another row of the transcript.
 *
 * The hold keeps the submitted prompt at the top offset by re-aligning it
 * whenever the transcript's layout moves, and it watches the answer row and
 * the viewport. That is enough while the answer is the only thing that
 * changes — but retiring a spent reserve shrinks the transcript ABOVE the
 * prompt, and the browser's scroll clamp is what moves the reader. Nothing
 * the hold watches changes in that case, so the prompt would come to rest a
 * few pixels above its slot.
 *
 * Watching the retired row gives the hold the signal it needs: the row
 * settles to its final height on the next React commit, and the hold
 * re-aligns the prompt in that frame — before it paints.
 */
function observeTurnViewportRow(el: HTMLElement): void {
  const hold = viewportHold;
  if (!hold || !hold.observer) return;
  try {
    hold.observer.observe(el);
  } catch (_) {
    reportEmptyCatch(_, 'empty catch: chat/turn/anchor/hold.ts');
    /* detached row */
  }
}

function observeHoldTargets(
  observer: ResizeObserver,
  list: HTMLElement,
  anchorRow: HTMLElement,
): void {
  try {
    observer.observe(list, { box: 'border-box' });
  } catch (_) {
    try {
      observer.observe(list);
    } catch (err) {
      reportEmptyCatch(err, 'empty catch: chat/turn/anchor/hold.ts');
      /* detached list */
    }
  }
  /* Watching the answer's own row is what retires the hold the moment the
     answer outgrows its reserve and sticky-bottom resumes. */
  try {
    observer.observe(anchorRow);
  } catch (err) {
    reportEmptyCatch(err, 'empty catch: chat/turn/anchor/hold.ts');
    /* detached row */
  }
}

export function startTurnViewportHold(
  list: TurnAnchorList | null,
  rowFor: () => HTMLElement | null,
  clientId: string,
  targetOffset: number,
  align = true,
): void {
  releaseTurnViewportHold();
  if (!list || !clientId || typeof ResizeObserver !== 'function') return;
  const promptRow = latestUserRow(list);
  const anchorRow = rowFor();
  if (!promptRow || !anchorRow) return;
  const hold: TurnViewportHold = {
    list,
    rowFor,
    promptRow,
    clientId,
    targetOffset,
    align,
    observer: null,
    onViewportResize: null,
    unsubInset: null,
    unsubScrollIntent: null,
  };
  const observer = new ResizeObserver(function () {
    holdTurnViewport();
  });
  hold.observer = observer;
  viewportHold = hold;
  // A reader gesture must release ownership even when no resize follows.
  // Otherwise the history window remains blocked at its mounted top.
  hold.unsubScrollIntent = subscribeLegacyState(() => {
    if (uiStore.getState()._userScrolledAway) releaseTurnViewportHold();
  });
  observeHoldTargets(observer, list, anchorRow);
  /* Resize-observer deliveries for a viewport change land one frame after the
     layout that revealed it, so the frame in between can paint the stale
     reserve and clamp scrollTop. A discrete viewport resize (window, mobile
     rotation, resize-content keyboard) is announced by `resize` before that
     frame's paint, so correcting here keeps the change off screen. */
  hold.onViewportResize = function () {
    holdTurnViewport();
  };
  try {
    window.addEventListener('resize', hold.onViewportResize);
  } catch (_) {
    reportEmptyCatch(_, 'empty catch: chat/turn/anchor/hold.ts');
    /* no window */
  }
  /* The virtual keyboard is tweened into `--keyboard-inset` frame by frame
     by the lift controller. Its onInset subscription fires synchronously
     inside the same write that will be laid out — so the reserve can be
     corrected before that frame paints. */
  try {
    hold.unsubInset =
      getKeyboardLift()?.onInset(() => {
        holdTurnViewport();
      }) ?? null;
  } catch (_) {
    hold.unsubInset = null;
  }
  if (list.dataset) list.dataset.turnAnchorHold = 'true';
  /* Publish the ownership the mount window, the above-viewport compensation
     and the scroll animations already read. `align` is true only once the
     send glide has landed: during the glide `turnAnchorSettling` covers the
     same window, and claiming `turnViewportOwner` earlier stops the glide's
     own animation on its first frame (legacy/scroll.ts aborts a scroll when the
     list is turn-owned) — exactly the teleport the send motion is meant to
     avoid. The mid-glide hold still owns the composer-resize decision
     through `turnAnchorHold`; ownership is claimed when the glide lands. */
  if (align) markTurnViewportOwner(list);
  holdTurnViewport();
}

function latestAssistantId(messages: MessageEntry[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i] && messages[i].role === 'assistant') return messages[i].clientId || '';
  }
  return '';
}

function retireSpentReserve(
  list: TurnAnchorList,
  row: HTMLElement,
  stored: MessageEntry[],
  clientId: string,
  latestId: string,
  listBottom: number,
  stubIds: string[],
): boolean {
  const id = row.dataset ? row.dataset.clientId : '';
  if ((clientId && id === clientId) || (latestId && id === latestId)) return false;
  /* A reserve below the visible transcript belongs to a newer turn. */
  if (row.getBoundingClientRect().top >= listBottom) return false;
  row.classList.remove('turn-viewport-anchor');
  row.style.minHeight = '';
  row.style.marginTop = '';
  if (id) {
    const entry = stored.find((candidate) => candidate && candidate.clientId === id);
    if (entry && (entry._turnAnchorMinHeight || entry._turnAnchorMarginTop)) {
      updateMessageSnapshot(
        entry,
        {
          _turnAnchorMinHeight: undefined,
          _turnAnchorMarginTop: undefined,
          _turnAnchorMode: undefined,
          _turnViewportTarget: undefined,
        },
        true,
      );
    }
    if (entry && entry._supersededStub) {
      /* Hide the spent stub after it has held the layout open. */
      row.style.display = 'none';
      stubIds.push(id);
    }
  }
  observeTurnViewportRow(row);
  return true;
}

function removeRetiredStubMessages(stubIds: string[]): void {
  for (const id of stubIds) {
    const messages = sessionStore.getState().messages as MessageEntry[];
    const index = messages.findIndex((candidate) => candidate && candidate.clientId === id);
    if (index >= 0) {
      dispatchSession({ type: 'session/remove-message-at', index, clientId: id });
    }
  }
}

export function retireTurnReservesAboveViewport(
  list: TurnAnchorList | null,
  clientId: string,
): void {
  if (!list) return;
  const listRect = list.getBoundingClientRect();
  const rows = list.querySelectorAll('.turn-viewport-anchor');
  const stored = sessionStore.getState().messages as MessageEntry[];
  const latestId = latestAssistantId(stored);
  const promptRows = list.querySelectorAll('.msg.user');
  const promptRow = promptRows.length ? (promptRows[promptRows.length - 1] as HTMLElement) : null;
  const promptOffsetBefore = promptRow
    ? promptRow.getBoundingClientRect().top - list.getBoundingClientRect().top
    : null;
  const stubIds: string[] = [];
  let cleared = 0;
  for (let i = 0; i < rows.length; i += 1) {
    if (
      retireSpentReserve(
        list,
        rows[i] as HTMLElement,
        stored,
        clientId,
        latestId,
        listRect.bottom,
        stubIds,
      )
    )
      cleared += 1;
  }
  if (!cleared) return;
  if (promptRow && promptOffsetBefore != null) {
    const drift =
      promptRow.getBoundingClientRect().top - list.getBoundingClientRect().top - promptOffsetBefore;
    if (Math.abs(drift) > 0.5) {
      suppressScrollPositionIntent(200);
      writeScrollTop(list, Math.max(0, list.scrollTop + drift), 'turn');
    }
  }
  removeRetiredStubMessages(stubIds);
  publishReactChatRuntime({ type: 'state-synced', reason: 'turn-reserve-retire' });
}
