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

import { stateStore } from '../state/store.js';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { updateMessageSnapshot } from '../ui/messageSnapshot.js';
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
  let normalAnchorSettling = false;
  const messages = stateStore.read('messages') as MessageEntry[];
  let message: MessageEntry | null =
    msgIdx >= 0 && messages[msgIdx] ? messages[msgIdx] : null;
  const clientId: string = message && message.clientId
    ? message.clientId
    : (assistant && assistant.dataset ? assistant.dataset.clientId || '' : '');
  function row(): HTMLElement | null {
    return turnRowFor(list, assistant, clientId);
  }
  /* Reserve the row's leading space. A React row takes it from the message
     entry (MessageItem renders minHeight / .turn-viewport-anchor /
     data-viewport-anchor from there), which survives the next commit instead
     of being wiped by it — and lets the chrome be written one frame early,
     while the row is still only in stateStore.read("messages"). On the legacy path the
     bubble is already in the document, so the style goes straight on it. */
  function stampAnchor(mode: string, reserve: number, targetOffset: number): void {
    const mounted = row();
    if (!mounted && !anchorDeps.isMsgListMounted()) return;
    if (anchorDeps.isMsgListMounted()) {
      if (!message) return;
      if (message._turnAnchorMinHeight === reserve && message._turnAnchorMode === mode) return;
      message =
        (updateMessageSnapshot(message, {
          _turnAnchorMinHeight: reserve,
          _turnAnchorMode: mode,
          _turnViewportTarget: targetOffset,
          _toolRunRev: (message._toolRunRev || 0) + 1,
        }, true) as MessageEntry | null) || message;
      publishReactChatRuntime({ type: 'tool-run-updated', messageId: String(clientId || '') });
      return;
    }
    mounted!.classList.add('turn-viewport-anchor');
    mounted!.dataset.viewportAnchor = mode;
    mounted!.dataset.viewportTarget = String(targetOffset);
    mounted!.style.minHeight = reserve + 'px';
    if (message) {
      message =
        (updateMessageSnapshot(message, { _turnAnchorMinHeight: reserve }, true) as MessageEntry | null) ||
        message;
    }
  }
  /* The composer can still be in its short focus/keyboard transition when
     the stream bubble is mounted. Keep the submitted prompt at the target
     offset while that bounded layout change settles; stop immediately when
     the reader expresses upward intent. */
  function settleNormalTurnAnchor(targetOffset: number, deadline: number): void {
    if (!list || stateStore.read('_userScrolledAway')) return;
    /* Stop once this turn's row is gone — the loop only promises to hold the
       prompt still while the composer's layout settles. */
    if (!assistant!.isConnected && !row()) return;
    const users = list.querySelectorAll && list.querySelectorAll('.msg.user');
    const anchor = users && users.length ? users[users.length - 1] : null;
    if (!anchor || !anchor.isConnected) return;
    const actualOffset = anchor.getBoundingClientRect().top - list.getBoundingClientRect().top;
    const delta = actualOffset - targetOffset;
    if (Math.abs(delta) > 1) {
      const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
      const nextTop = Math.max(0, Math.min(maxScroll, list.scrollTop + delta));
      if (Math.abs(nextTop - list.scrollTop) > 0.5) list.scrollTop = nextTop;
    }
    if (Date.now() < deadline) {
      requestAnimationFrame(function () {
        settleNormalTurnAnchor(targetOffset, deadline);
      });
    }
  }
  function position(): void {
    const mounted = row();
    if (!list) return;
    const styles = getComputedStyle(list);
    const bottomPadding = parseFloat(styles.paddingBottom) || 0;
    let anchor: Element | null = null;
    let targetOffset = 12;
    let reserve = 120;
    if (retryViewport) {
      /* Re-running the positioning pass must be idempotent. Clear the
         previous leading-space correction before measuring; otherwise the
         next pass measures the already-correct offset and overwrites the
         full margin with only the tiny residual delta. */
      if (mounted === assistant) (mounted as HTMLElement).style.marginTop = '';
      if (message) {
        message =
          (updateMessageSnapshot(
            message,
            { _turnAnchorMarginTop: undefined },
            true,
          ) as MessageEntry | null) || message;
      }
      const maxOffset = Math.max(8, list.clientHeight - bottomPadding - 64);
      targetOffset = Math.max(8, Math.min(maxOffset, retryViewport.offset));
      reserve = Math.max(120, Math.round(list.clientHeight - bottomPadding - targetOffset));
      stampAnchor('retry', reserve, targetOffset);
      /* The retry row is a React commit away: the reserve is already on the
         entry so its first paint has the right height, and positionSoon
         comes back with the node in hand to do the measurement. */
      if (!mounted) return;
      anchor = mounted;
    } else {
      const users = list.querySelectorAll('.msg.user');
      anchor = users.length ? users[users.length - 1] : null;
      if (!anchor) return;
      reserve = Math.max(
        120,
        Math.round(list.clientHeight - anchor.getBoundingClientRect().height - bottomPadding - 24),
      );
      stampAnchor('turn', reserve, targetOffset);
    }
    if (!retryViewport) list.__socratesTurnViewportOwner = true;
    const listRect = list.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const target = list.scrollTop + (anchorRect.top - listRect.top) - targetOffset;
    list.scrollTop = Math.max(0, target);
    /* The retry placeholder's min-height and the React removal of the
       failed row can settle over several frames. A single scrollTop write
       therefore runs against stale scrollHeight and leaves the retry well
       below its captured viewport position. Re-align after layout settles,
       then use margin only when the scroller genuinely has no more range. */
    if (retryViewport) {
      requestAnimationFrame(function settleRetryAnchor(attempt: number) {
        const current = row();
        if (!current) return;
        const retryListRect = list.getBoundingClientRect();
        const actualOffset = current.getBoundingClientRect().top - retryListRect.top;
        const delta = Math.round(actualOffset - targetOffset);
        if (Math.abs(delta) > 1) {
          const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
          const nextTop = Math.max(0, Math.min(maxScroll, list.scrollTop + delta));
          if (Math.abs(nextTop - list.scrollTop) > 0.5) list.scrollTop = nextTop;
        }
        if (attempt < 2) {
          requestAnimationFrame(function () {
            settleRetryAnchor(attempt + 1);
          });
          return;
        }
        const finalListRect = list.getBoundingClientRect();
        const finalOffset = current.getBoundingClientRect().top - finalListRect.top;
        const missingSpace = Math.max(0, Math.round(targetOffset - finalOffset));
        const finalMaxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
        if (missingSpace > 1 && list.scrollTop >= finalMaxScroll - 1) {
          if (current === assistant) {
            current.style.marginTop = missingSpace + 'px';
            if (message) {
              message =
                (updateMessageSnapshot(
                  message,
                  { _turnAnchorMarginTop: missingSpace },
                  true,
                ) as MessageEntry | null) || message;
            }
          } else if (message) {
            message =
              (updateMessageSnapshot(message, {
                _turnAnchorMarginTop: missingSpace,
                _toolRunRev: (message._toolRunRev || 0) + 1,
              }, true) as MessageEntry | null) || message;
            publishReactChatRuntime({ type: 'tool-run-updated', messageId: String(clientId || '') });
          }
        }
      });
    }
    stateStore.dispatch({ type: 'state/set', key: '_userScrolledAway', value: false });
    if (!retryViewport && !normalAnchorSettling) {
      normalAnchorSettling = true;
      requestAnimationFrame(function () {
        settleNormalTurnAnchor(targetOffset, Date.now() + 420);
      });
    }
  }
  /* A retry bubble is already mounted in the legacy list and its target
     offset is known. Position it synchronously so the first visible frame
     cannot flash at the top while waiting for the deferred layout pass. */
  let positionWaits = 0;
  function positionSoon(): void {
    /* Under React the live row is a commit away — when the stream starts the
       entry is only in `stateStore.read("messages")`. Bailing on that first null is what
       made the send-time anchor a no-op, so keep asking (bounded) until the
       row exists and the scroll can be measured against it. */
    position();
    if (row() || ++positionWaits > 30) return;
    requestAnimationFrame(positionSoon);
  }
  if (retryViewport && row()) position();
  else positionSoon();
  requestAnimationFrame(function () {
    requestAnimationFrame(positionSoon);
  });
}
