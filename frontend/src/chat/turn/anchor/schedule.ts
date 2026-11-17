/**
 * Send-time convergence: stamp the reserve, run the glide, position retries,
 * and settle the active turn at its target offset.
 */
import { stateStore } from '../../../state/store.ts';
import { publishReactChatRuntime } from '../../../ui/reactBridge.ts';
import { updateMessageSnapshot } from '../../../ui/messageSnapshot.ts';
import { cancelScrollAnimation, velocityScrollTo } from '../../../ui/scroll.ts';
import { writeScrollTop } from '../../../ui/scrollCoordinator.ts';
import { hideNewReplyPill, suppressScrollPositionIntent } from '../../../ui/scrollPill.ts';
import { planSendGlide } from '../../../ui/motion/index.ts';
import type { MessageEntry } from '../../../ui/messageActions.ts';
import { reportSwallow as reportEmptyCatch } from '../../../util/reportSwallow.ts';
import {
  BUBBLE_FADE_MAX_MS,
  TURN_ANCHOR_MIN_RESERVE,
  TURN_ANCHOR_TOP_OFFSET,
  isMsgListMounted,
  isSettlingOwner,
  markTurnViewportOwner,
  nextSettlingOwner,
  turnAnchorReserve,
  turnRowFor,
  type RetryViewportOffset,
  type TurnAnchorList,
} from './ownership.ts';
import {
  createPromptTarget,
  latestUserRow,
  releaseTurnViewportHold,
  retireTurnReservesAboveViewport,
  startTurnViewportHold,
} from './hold.ts';

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
  suppressScrollPositionIntent(200);
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
      if (Math.abs(nextTop - list.scrollTop) > 0.5) {
        suppressScrollPositionIntent(200);
        writeScrollTop(list, nextTop, 'retry');
      }
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
    if (Math.abs(nextTop - list.scrollTop) > 0.5) {
      /* This is layout alignment, not a reader gesture: without the guard
         the resulting scroll event looked like an upward drag and flipped
         `_userScrolledAway`, which stopped the pinned follow for the rest
         of the answer. */
      suppressScrollPositionIntent(200);
      writeScrollTop(list, nextTop, 'turn');
    }
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
  if (!isSettlingOwner(settlingSeq)) { done(); return; }
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
  if (isSettlingOwner(settlingSeq)) list.dataset.turnAnchorSettling = 'true';
  const plan = planSendGlide(Math.abs(target - list.scrollTop), list.clientHeight);
  const holdClientId = clientId || (assistant && assistant.dataset ? assistant.dataset.clientId || '' : '');
  /* A snap has no animation to protect, so the send owns the viewport
     immediately. A real glide stays on `turnAnchorSettling` until the hold
     starts aligning (claiming the owner here aborts the glide's first
     frame in ui/scroll.ts). */
  if (plan.snap) markTurnViewportOwner(list);
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
    if (isSettlingOwner(settlingSeq)) {
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
  const settlingSeq = nextSettlingOwner();
  const clearSettling = (): void => {
    if (!isSettlingOwner(settlingSeq) || !list || !list.dataset) return;
    delete list.dataset.turnAnchorSettling;
  };
  if (list && !retryViewport) {
    if (list.dataset) list.dataset.turnAnchorSettling = 'true';
    cancelScrollAnimation(list);
    try { hideNewReplyPill(); } catch (_) {
      reportEmptyCatch(_, 'empty catch: chat/turn/anchor/schedule.ts:770');
      /* pill not mounted */
    }
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
    isReactMounted: () => isMsgListMounted(),
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
    /* Ownership stays `turnAnchorSettling` until the glide lands. Writing
       `turnViewportOwner` here made ui/scroll.ts abort the glide on its
       first frame, so the send teleported to the slot; the hold claims the
       owner when it starts aligning. */
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
     offset is known; scheduleAnchorPosition positions it synchronously so
     the first visible frame cannot flash while waiting for a deferred
     layout pass. */
  scheduleAnchorPosition({
    list,
    retryViewport,
    row,
    position,
    motionStarted: () => anchorMotionStarted,
    clearSettling,
  });
}
