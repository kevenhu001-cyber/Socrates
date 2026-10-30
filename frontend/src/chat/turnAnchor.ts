/**
 * chat/turnAnchor.ts — send-time turn positioning for the transcript.
 *
 * Extracted from main.js. Positions a newly submitted turn like a
 * document page: the user's prompt and the assistant's "Thinking…" row
 * start at the top of the transcript viewport, leaving the answer room
 * to grow below. The reserve is computed from the real viewport, prompt
 * height, and composer padding instead of a device-specific constant.
 *
 * Whether React owns the message list is injected via
 * configureTurnAnchor (the React tree itself cannot be imported here
 * without dragging react-dom into the chat domain).
 */

import { stateStore } from '../state/store.ts';
import { publishReactChatRuntime } from '../ui/reactBridge.ts';
import { updateMessageSnapshot } from '../ui/messageSnapshot.ts';
import { velocityScrollTo, cancelScrollAnimation } from '../ui/scroll.ts';
import { writeScrollTop } from '../ui/scrollCoordinator.ts';
import { suppressScrollPositionIntent, hideNewReplyPill } from '../ui/scrollPill.ts';
import { planSendGlide } from '../ui/motion.ts';
import { getKeyboardLift } from '../ui/keyboard/index.ts';
import type { MessageEntry } from '../ui/messageActions.ts';

export interface TurnAnchorDeps {
  /** Live reader for React ownership of #msgList, owned by main.js. */
  isMsgListMounted: () => boolean;
}

export interface RetryViewportOffset {
  offset: number;
}

export interface TurnAnchorList extends HTMLElement {
  __socratesTurnViewportOwner?: boolean;
}

/* The submitted prompt's own top offset inside the transcript viewport.
   Shared by the send-time pass and the viewport hold below so both land
   (and stay) on the same line. */
export const TURN_ANCHOR_TOP_OFFSET = 12;

/* The active turn never reserves less than this much answer room. */
export const TURN_ANCHOR_MIN_RESERVE = 120;

/* The user-bubble fade never runs longer than this, even when the send
   glide itself travels further. The prompt must read as arrived within a
   few frames of the submit; a far glide continues alone after the fade. */
export const BUBBLE_FADE_MAX_MS = 240;

/* Air kept below the reserved answer room before the composer. */
export const TURN_ANCHOR_BOTTOM_GAP = 24;

/**
 * Leading space the active answer needs so the submitted prompt can stay at
 * TURN_ANCHOR_TOP_OFFSET while the answer fills the rest of the live
 * transcript viewport. Recomputed on every viewport change, not just at send
 * time: the keyboard and the composer both change the transcript's height
 * after the send, and a stale reserve lets the scroll range shrink under the
 * anchor, which slides the prompt down by the delta.
 */
export function turnAnchorReserve(
  clientHeight: number,
  promptHeight: number,
  bottomPadding: number,
): number {
  const available = Number(clientHeight) - Number(promptHeight) - Number(bottomPadding);
  if (!Number.isFinite(available)) return TURN_ANCHOR_MIN_RESERVE;
  return Math.max(TURN_ANCHOR_MIN_RESERVE, Math.round(available - TURN_ANCHOR_BOTTOM_GAP));
}

let anchorDeps: TurnAnchorDeps = { isMsgListMounted: () => false };

/** Provide the React-ownership reader owned by main.js. */
export function configureTurnAnchor(next: TurnAnchorDeps): void {
  anchorDeps = next;
}

/**
 * The mounted row for a turn, whichever renderer put it there. Legacy
 * appended its own bubble and can be handed the node directly; once
 * React owns #msgList that node is detached and the only way back to
 * the row is the message id.
 */
export function turnRowFor(
  list: HTMLElement | null,
  assistant: HTMLElement | null,
  clientId: string,
): HTMLElement | null {
  if (!list) return null;
  if (assistant && assistant.isConnected) return assistant;
  const id = String(clientId || '');
  if (!id) return null;
  const esc =
    typeof CSS !== 'undefined' && CSS.escape
      ? CSS.escape(id)
      : id.replace(/["\\]/g, '\\$&');
  return list.querySelector('.msg[data-client-id="' + esc + '"]');
}

/**
 * Start the same send-time anchor for a finalized assistant message whose row
 * is created by `addMessage` instead of `addStreamingMessage`.
 *
 * React may not have committed the row when the direct reply is appended, so
 * resolve the authoritative message by client id and let
 * `scheduleActiveTurnToTop` keep retrying until the real row is mounted.
 * Keeping this lookup here also means direct Tutor/Chat fallbacks cannot
 * accidentally create a second scroll implementation.
 */
export function scheduleTurnToTopForMessage(
  list: TurnAnchorList | null,
  clientId: string | null | undefined,
  retryViewport: RetryViewportOffset | null = null,
): void {
  if (!list) return;
  const id = String(clientId || '');
  if (!id) return;
  const messages = stateStore.read('messages') as MessageEntry[];
  const msgIdx = messages.findIndex((entry) =>
    Boolean(entry && entry.clientId === id && entry.role === 'assistant'),
  );
  if (msgIdx < 0) return;
  scheduleActiveTurnToTop(list, turnRowFor(list, null, id), msgIdx, retryViewport);
}

function hideStubAndPreserveScroll(list: TurnAnchorList, row: HTMLElement): void {
  const users = list.querySelectorAll('.msg.user');
  const reference = users.length ? users[users.length - 1] as HTMLElement : null;
  const referenceTop = reference ? reference.getBoundingClientRect().top : null;
  row.style.display = 'none';
  if (!reference || referenceTop == null) return;
  const drift = reference.getBoundingClientRect().top - referenceTop;
  if (Math.abs(drift) <= 0.5) return;
  suppressScrollPositionIntent(200);
  writeScrollTop(list, Math.max(0, list.scrollTop + drift), 'turn');
}

function removeSupersededMessage(id: string): void {
  const messages = stateStore.read('messages') as MessageEntry[];
  const index = messages.findIndex((entry) => entry && entry.clientId === id);
  if (index < 0) return;
  stateStore.dispatch({ type: 'session/remove-message-at', index, clientId: id });
  publishReactChatRuntime({ type: 'state-synced', reason: 'superseded-stub-removed' });
}

/**
 * Remove a superseded empty placeholder (kept as an invisible layout stub)
 * once it is spent. Defers while a send anchor is gliding so the
 * compensation write cannot cancel the motion; safe to call repeatedly.
 */
export function removeSupersededStub(clientId: string): void {
  const list = typeof document !== 'undefined'
    ? (document.getElementById('msgList') as TurnAnchorList | null)
    : null;
  if (!list) return;
  if (list.dataset && list.dataset.turnAnchorSettling === 'true') {
    setTimeout(() => removeSupersededStub(clientId), 300);
    return;
  }
  const id = String(clientId || '');
  if (!id) return;
  const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&');
  const row = list.querySelector(`.msg[data-client-id="${esc}"]`) as HTMLElement | null;
  if (!row) return;
  hideStubAndPreserveScroll(list, row);
  removeSupersededMessage(id);
}

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
}

let viewportHold: TurnViewportHold | null = null;

/* Which send currently owns `data-turn-anchor-settling`. A previous turn's
   bounded settle loop can finish after the next send has already taken the
   transcript; only the owning send may clear the flag. */
let settlingOwner = 0;

/**
 * Release the active send-time viewport hold, if any. Safe to repeat, and
 * called whenever a newer turn, a reader gesture, or a finished answer takes
 * the transcript back over.
 */
export function releaseTurnViewportHold(): void {
  const hold = viewportHold;
  if (!hold) return;
  viewportHold = null;
  if (hold.observer) {
    try { hold.observer.disconnect(); } catch (_) { /* detached list */ }
  }
  if (hold.onViewportResize) {
    try { window.removeEventListener('resize', hold.onViewportResize); } catch (_) { /* no window */ }
  }
  if (hold.unsubInset) {
    try { hold.unsubInset(); } catch (_) { /* released controller */ }
  }
  /* ui/keyboard reads this flag to leave the transcript alone while the
     send anchor owns it; clearing it hands the position back. */
  if (hold.list.dataset) delete hold.list.dataset.turnAnchorHold;
}

function findAnchorEntry(clientId: string): MessageEntry | null {
  if (!clientId) return null;
  const stored = stateStore.read('messages') as MessageEntry[];
  for (let i = stored.length - 1; i >= 0; i -= 1) {
    if (stored[i] && stored[i].clientId === clientId) return stored[i];
  }
  return null;
}

function latestUserRow(list: HTMLElement): HTMLElement | null {
  const users = list.querySelectorAll('.msg.user');
  return users.length ? (users[users.length - 1] as HTMLElement) : null;
}

function createPromptTarget(
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

function holdTurnViewport(): void {
  const hold = viewportHold;
  if (!hold) return;
  const list = hold.list;
  if (!list.isConnected || stateStore.read('_userScrolledAway')) {
    releaseTurnViewportHold();
    return;
  }
  const promptRow = hold.promptRow;
  if (!promptRow.isConnected || latestUserRow(list) !== promptRow) {
    /* The prompt was removed or a newer send replaced it as the anchor. */
    releaseTurnViewportHold();
    return;
  }
  const anchorRow = hold.rowFor();
  const entry = findAnchorEntry(hold.clientId);
  const reserve = entry ? Number(entry._turnAnchorMinHeight) || 0 : 0;
  if (!anchorRow || !entry || reserve <= 0) {
    releaseTurnViewportHold();
    return;
  }
  /* The answer has outgrown the reserve: the row is content-sized now and
     sticky-bottom owns the tail, so there is no layout left to hold open. */
  if (anchorRow.getBoundingClientRect().height > reserve + 1) {
    releaseTurnViewportHold();
    return;
  }
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
  try { hold.observer.observe(el); } catch (_) { /* detached row */ }
}

function startTurnViewportHold(
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
  };
  const observer = new ResizeObserver(function () { holdTurnViewport(); });
  hold.observer = observer;
  viewportHold = hold;
  try { observer.observe(list, { box: 'border-box' }); }
  catch (_) { try { observer.observe(list); } catch (_) { /* detached list */ } }
  /* Watching the answer's own row is what retires the hold the moment the
     answer outgrows its reserve and sticky-bottom resumes. */
  try { observer.observe(anchorRow); } catch (_) { /* detached row */ }
  /* Resize-observer deliveries for a viewport change land one frame after the
     layout that revealed it, so the frame in between can paint the stale
     reserve and clamp scrollTop. A discrete viewport resize (window, mobile
     rotation, resize-content keyboard) is announced by `resize` before that
     frame's paint, so correcting here keeps the change off screen. */
  hold.onViewportResize = function () { holdTurnViewport(); };
  try { window.addEventListener('resize', hold.onViewportResize); } catch (_) { /* no window */ }
  /* The virtual keyboard is tweened into `--keyboard-inset` frame by frame
     by the lift controller. Its onInset subscription fires synchronously
     inside the same write that will be laid out — so the reserve can be
     corrected before that frame paints. */
  try {
    hold.unsubInset = getKeyboardLift()?.onInset(() => { holdTurnViewport(); }) ?? null;
  } catch (_) { hold.unsubInset = null; }
  if (list.dataset) list.dataset.turnAnchorHold = 'true';
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
      updateMessageSnapshot(entry, {
        _turnAnchorMinHeight: undefined,
        _turnAnchorMarginTop: undefined,
        _turnAnchorMode: undefined,
        _turnViewportTarget: undefined,
      }, true);
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
    const messages = stateStore.read('messages') as MessageEntry[];
    const index = messages.findIndex((candidate) => candidate && candidate.clientId === id);
    if (index >= 0) {
      stateStore.dispatch({ type: 'session/remove-message-at', index, clientId: id });
    }
  }
}

function retireTurnReservesAboveViewport(list: TurnAnchorList | null, clientId: string): void {
  if (!list) return;
  const listRect = list.getBoundingClientRect();
  const rows = list.querySelectorAll('.turn-viewport-anchor');
  const stored = stateStore.read('messages') as MessageEntry[];
  const latestId = latestAssistantId(stored);
  const promptRows = list.querySelectorAll('.msg.user');
  const promptRow = promptRows.length ? promptRows[promptRows.length - 1] as HTMLElement : null;
  const promptOffsetBefore = promptRow
    ? promptRow.getBoundingClientRect().top - list.getBoundingClientRect().top
    : null;
  const stubIds: string[] = [];
  let cleared = 0;
  for (let i = 0; i < rows.length; i += 1) {
    if (retireSpentReserve(
      list,
      rows[i] as HTMLElement,
      stored,
      clientId,
      latestId,
      listRect.bottom,
      stubIds,
    )) cleared += 1;
  }
  if (!cleared) return;
  if (promptRow && promptOffsetBefore != null) {
    const drift = promptRow.getBoundingClientRect().top
      - list.getBoundingClientRect().top
      - promptOffsetBefore;
    if (Math.abs(drift) > 0.5) {
      suppressScrollPositionIntent(200);
      writeScrollTop(list, Math.max(0, list.scrollTop + drift), 'turn');
    }
  }
  removeRetiredStubMessages(stubIds);
  publishReactChatRuntime({ type: 'state-synced', reason: 'turn-reserve-retire' });
}

interface AnchorStampContext {
  row(): HTMLElement | null;
  readMessage(): MessageEntry | null;
  writeMessage(message: MessageEntry): void;
  clientId: string;
  isReactMounted(): boolean;
}

interface RetryPositionContext extends AnchorStampContext {
  list: TurnAnchorList;
  assistant: HTMLElement | null;
  offset: number;
}

function stampTurnAnchor(
  context: AnchorStampContext,
  mode: string,
  reserve: number,
  targetOffset: number,
): void {
  const mounted = context.row();
  if (!mounted && !context.isReactMounted()) return;
  if (context.isReactMounted()) {
    const message = context.readMessage();
    if (!message || (message._turnAnchorMinHeight === reserve && message._turnAnchorMode === mode)) return;
    const updated = updateMessageSnapshot(message, {
      _turnAnchorMinHeight: reserve,
      _turnAnchorMode: mode,
      _turnViewportTarget: targetOffset,
      _toolRunRev: (message._toolRunRev || 0) + 1,
    }, true) as MessageEntry | null;
    context.writeMessage(updated || message);
    publishReactChatRuntime({ type: 'tool-run-updated', messageId: String(context.clientId || '') });
    return;
  }
  mounted!.classList.add('turn-viewport-anchor');
  mounted!.dataset.viewportAnchor = mode;
  mounted!.dataset.viewportTarget = String(targetOffset);
  mounted!.style.minHeight = reserve + 'px';
  const message = context.readMessage();
  if (!message) return;
  const updated = updateMessageSnapshot(message, { _turnAnchorMinHeight: reserve }, true) as MessageEntry | null;
  context.writeMessage(updated || message);
}

function hasTurnAnchorReserve(row: () => HTMLElement | null): boolean {
  const mounted = row();
  if (!mounted) return false;
  return (parseFloat(mounted.style.minHeight) || 0) > 0
    || (parseFloat(mounted.style.marginTop) || 0) > 0;
}

function positionRetryTurnAnchor(context: RetryPositionContext): boolean {
  const { list, assistant } = context;
  const mounted = context.row();
  /* Repositioning must clear the previous correction before measuring, or
     the next pass only sees its residual margin. */
  if (mounted === assistant && mounted) mounted.style.marginTop = '';
  const priorMessage = context.readMessage();
  if (priorMessage) {
    const updated = updateMessageSnapshot(priorMessage, { _turnAnchorMarginTop: undefined }, true) as MessageEntry | null;
    context.writeMessage(updated || priorMessage);
  }
  const bottomPadding = parseFloat(getComputedStyle(list).paddingBottom) || 0;
  const maxOffset = Math.max(8, list.clientHeight - bottomPadding - 64);
  const targetOffset = Math.max(8, Math.min(maxOffset, context.offset));
  const reserve = Math.max(
    TURN_ANCHOR_MIN_RESERVE,
    Math.round(list.clientHeight - bottomPadding - targetOffset),
  );
  stampTurnAnchor(context, 'retry', reserve, targetOffset);
  /* React may still need a commit to mount the retry row. */
  if (!mounted) return true;

  const listRect = list.getBoundingClientRect();
  const anchorRect = mounted.getBoundingClientRect();
  const anchorInList = anchorRect.top - listRect.top;
  let promptNode: HTMLElement | null = mounted;
  const promptTarget = (): number => {
    if (!promptNode || !promptNode.isConnected) promptNode = latestUserRow(list);
    if (!promptNode) return Math.max(0, list.scrollTop + anchorInList - targetOffset);
    const live = promptNode.getBoundingClientRect().top - list.getBoundingClientRect().top;
    return Math.max(0, list.scrollTop + live - targetOffset);
  };
  writeScrollTop(list, promptTarget(), 'retry');
  const settleRetryAnchor = (attempt: number): void => {
    const current = context.row();
    if (!current) return;
    const retryListRect = list.getBoundingClientRect();
    const actualOffset = current.getBoundingClientRect().top - retryListRect.top;
    const delta = Math.round(actualOffset - targetOffset);
    if (Math.abs(delta) > 1) {
      const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
      const nextTop = Math.max(0, Math.min(maxScroll, list.scrollTop + delta));
      if (Math.abs(nextTop - list.scrollTop) > 0.5) writeScrollTop(list, nextTop, 'retry');
    }
    if (attempt < 2) {
      requestAnimationFrame(() => settleRetryAnchor(attempt + 1));
      return;
    }
    const finalListRect = list.getBoundingClientRect();
    const finalOffset = current.getBoundingClientRect().top - finalListRect.top;
    const missingSpace = Math.max(0, Math.round(targetOffset - finalOffset));
    const finalMaxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
    if (missingSpace <= 1 || list.scrollTop < finalMaxScroll - 1) return;
    if (current === assistant) {
      current.style.marginTop = missingSpace + 'px';
      const message = context.readMessage();
      if (!message) return;
      const updated = updateMessageSnapshot(message, { _turnAnchorMarginTop: missingSpace }, true) as MessageEntry | null;
      context.writeMessage(updated || message);
      return;
    }
    const message = context.readMessage();
    if (!message) return;
    const updated = updateMessageSnapshot(message, {
      _turnAnchorMarginTop: missingSpace,
      _toolRunRev: (message._toolRunRev || 0) + 1,
    }, true) as MessageEntry | null;
    context.writeMessage(updated || message);
    publishReactChatRuntime({ type: 'tool-run-updated', messageId: String(context.clientId || '') });
  };
  requestAnimationFrame(settleRetryAnchor);
  stateStore.dispatch({ type: 'state/set', key: '_userScrolledAway', value: false });
  return true;
}

function settleNormalTurnAnchor(
  list: TurnAnchorList | null,
  assistant: HTMLElement | null,
  row: () => HTMLElement | null,
  targetOffset: number,
  deadline: number,
  onDone?: () => void,
): void {
  const finish = (): void => { if (onDone) onDone(); };
  if (!list || stateStore.read('_userScrolledAway')) { finish(); return; }
  if ((!assistant || !assistant.isConnected) && !row()) { finish(); return; }
  const anchor = latestUserRow(list);
  if (!anchor || !anchor.isConnected) { finish(); return; }
  const actualOffset = anchor.getBoundingClientRect().top - list.getBoundingClientRect().top;
  const delta = actualOffset - targetOffset;
  if (Math.abs(delta) > 1) {
    const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
    const nextTop = Math.max(0, Math.min(maxScroll, list.scrollTop + delta));
    if (Math.abs(nextTop - list.scrollTop) > 0.5) writeScrollTop(list, nextTop, 'turn');
  }
  if (Date.now() < deadline) {
    requestAnimationFrame(() => settleNormalTurnAnchor(list, assistant, row, targetOffset, deadline, onDone));
  } else {
    finish();
  }
}

function releaseTurnAnchor(
  list: TurnAnchorList,
  assistant: HTMLElement | null,
  clientId: string,
  row: () => HTMLElement | null,
  targetOffset: number,
  settlingSeq: number,
  clearSettling: () => void,
): void {
  const holdClientId = clientId || (assistant && assistant.dataset ? assistant.dataset.clientId || '' : '');
  const done = (): void => {
    retireTurnReservesAboveViewport(list, clientId);
    clearSettling();
  };
  if (stateStore.read('_userScrolledAway')) { done(); return; }
  if (settlingSeq !== settlingOwner) { done(); return; }
  stateStore.dispatch({ type: 'state/set', key: '_userScrolledAway', value: false });
  startTurnViewportHold(list, row, holdClientId, targetOffset);
  settleNormalTurnAnchor(list, assistant, row, targetOffset, Date.now() + 140, done);
}

interface NormalTurnMotionContext {
  list: TurnAnchorList;
  assistant: HTMLElement | null;
  clientId: string;
  row(): HTMLElement | null;
  targetOffset: number;
  settlingSeq: number;
  clearSettling(): void;
  target: number;
  promptTarget(): number;
}

function startNormalTurnMotion(context: NormalTurnMotionContext): void {
  const {
    list, assistant, clientId, row, targetOffset, settlingSeq, clearSettling,
    target, promptTarget,
  } = context;
  if (settlingSeq === settlingOwner) list.dataset.turnAnchorSettling = 'true';
  const plan = planSendGlide(Math.abs(target - list.scrollTop), list.clientHeight);
  const holdClientId = clientId || (assistant && assistant.dataset ? assistant.dataset.clientId || '' : '');
  startTurnViewportHold(list, row, holdClientId, targetOffset, false);
  if (!plan.snap) {
    const promptRows = list.querySelectorAll('.msg.user');
    const promptBubble = promptRows.length
      ? (promptRows[promptRows.length - 1] as HTMLElement)
      : null;
    if (promptBubble) {
      promptBubble.style.setProperty(
        '--bubble-fade-duration',
        Math.min(plan.duration, BUBBLE_FADE_MAX_MS) + 'ms',
      );
      promptBubble.dataset.bubbleArriving = 'true';
    }
  }
  velocityScrollTo(list, target, { smooth: true, owner: 'turn', target: promptTarget, plan }).then(() => {
    if (!list.isConnected) { clearSettling(); return; }
    if (settlingSeq === settlingOwner) {
      const promptRows = list.querySelectorAll('.msg.user');
      const promptBubble = promptRows.length
        ? (promptRows[promptRows.length - 1] as HTMLElement)
        : null;
      if (promptBubble) delete promptBubble.dataset.bubbleArriving;
    }
    releaseTurnAnchor(list, assistant, clientId, row, targetOffset, settlingSeq, clearSettling);
  });
}

interface PositionRetryContext {
  list: TurnAnchorList | null;
  retryViewport: RetryViewportOffset | null;
  row(): HTMLElement | null;
  position(): void;
  motionStarted(): boolean;
  clearSettling(): void;
}

function scheduleAnchorPosition(context: PositionRetryContext): void {
  let positionWaits = 0;
  function positionSoon(): void {
    context.position();
    const ready = context.retryViewport
      ? Boolean(context.row())
      : Boolean(context.row()) && hasTurnAnchorReserve(context.row);
    if (ready || ++positionWaits > 30) {
      if (!context.motionStarted() && !context.retryViewport) context.clearSettling();
      return;
    }
    requestAnimationFrame(positionSoon);
  }
  if (context.retryViewport && context.row()) context.position();
  else positionSoon();
  requestAnimationFrame(() => requestAnimationFrame(positionSoon));
}

/**
 * Reserve the new turn's leading space and converge the scroll so the
 * submitted prompt lands at the target offset. A React row takes its
 * reserve from the message entry (which survives the next commit),
 * letting the chrome be written one frame early; on the legacy path
 * the bubble is already in the document, so the style goes straight
 * on it. This is intentionally a send-time convergence loop, not a
 * permanent streaming scroll owner.
 */
export function scheduleActiveTurnToTop(
  list: TurnAnchorList | null,
  assistant: HTMLElement | null,
  msgIdx: number,
  retryViewport: RetryViewportOffset | null,
): void {
  /* A newer turn supersedes the previous send's viewport hold in the same
     task that mounts this one, so the two never fight over scrollTop. */
  releaseTurnViewportHold();
  let anchorMotionStarted = false;
  /* P_send-ownership — take the transcript over in the same task as the
     submit, not when the reserve finally paints a few frames later. In that
     gap a still-running content-follow (the previous answer streaming, a
     late image, a bottom glide from the keyboard) could otherwise write
     scrollTop and start the send glide from a moving position — the jolt
     before the glide. Retries keep their exact, instant restore. */
  const settlingSeq = ++settlingOwner;
  const clearSettling = (): void => {
    if (settlingSeq !== settlingOwner || !list || !list.dataset) return;
    delete list.dataset.turnAnchorSettling;
  };
  if (list && !retryViewport) {
    if (list.dataset) list.dataset.turnAnchorSettling = 'true';
    cancelScrollAnimation(list);
    try { hideNewReplyPill(); } catch (_) { /* pill not mounted */ }
  }
  const messages = stateStore.read('messages') as MessageEntry[];
  let message: MessageEntry | null =
    msgIdx >= 0 && messages[msgIdx] ? messages[msgIdx] : null;
  const clientId: string = message && message.clientId
    ? message.clientId
    : (assistant && assistant.dataset ? assistant.dataset.clientId || '' : '');
  function row(): HTMLElement | null {
    return turnRowFor(list, assistant, clientId);
  }
  const anchorContext: AnchorStampContext = {
    row,
    clientId,
    readMessage: () => message,
    writeMessage: (next) => { message = next; },
    isReactMounted: () => anchorDeps.isMsgListMounted(),
  };
  function position(): void {
    if (!list) return;
    if (retryViewport) {
      positionRetryTurnAnchor({
        list,
        assistant,
        offset: retryViewport.offset,
        ...anchorContext,
      });
      return;
    }
    const styles = getComputedStyle(list);
    const bottomPadding = parseFloat(styles.paddingBottom) || 0;
    const users = list.querySelectorAll('.msg.user');
    const anchor = users.length ? users[users.length - 1] : null;
    if (!anchor) return;
    const targetOffset = TURN_ANCHOR_TOP_OFFSET;
    const reserve = turnAnchorReserve(
      list.clientHeight,
      anchor.getBoundingClientRect().height,
      bottomPadding,
    );
    stampTurnAnchor(anchorContext, 'turn', reserve, targetOffset);
    if (!hasTurnAnchorReserve(row)) return;
    list.__socratesTurnViewportOwner = true;
    /* Read layout once. Both rects land in the same flush and reusing
       `anchorInList` below skips a separate `offsetTop` read, which
       would otherwise force a second layout flush in this rAF body. */
    const listRect = list.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const anchorInList = anchorRect.top - listRect.top;
    /* The destination is an absolute scrollTop: the prompt's content
       position (`scrollTop + offset-in-viewport`) minus the top offset. The
       bare viewport offset only equals the scrollTop when the reader is
       already at the top; from the bottom of a full transcript it drove the
       glide the entire scroll range the wrong way and then snapped, instead
       of travelling the few hundred pixels up to the slot. `scrollTop +
       offset` is invariant under scrolling, so re-reading it every frame is
       stable — it bends to a mid-glide layout change (a reserve repaint, the
       composer collapsing) instead of landing a few pixels past the slot and
       snapping, and it never chases its own tail. Re-resolving the prompt
       node is O(1) while it stays mounted and falls back to the send-time
       measurement only if it is replaced. Retry shares the same expression. */
    const promptTarget = createPromptTarget(list, anchor, anchorInList, targetOffset);
    const target = promptTarget();
    if (anchorMotionStarted) return;
    anchorMotionStarted = true;
    startNormalTurnMotion({
      list,
      assistant,
      clientId,
      row,
      targetOffset,
      settlingSeq,
      clearSettling,
      target,
      promptTarget,
    });
  }
  /* A retry bubble is already mounted in the legacy list and its target
     offset is known. Position it synchronously so the first visible frame
     cannot flash at the top while waiting for the deferred layout pass. */
  scheduleAnchorPosition({
    list,
    retryViewport,
    row,
    position,
    motionStarted: () => anchorMotionStarted,
    clearSettling,
  });
}
