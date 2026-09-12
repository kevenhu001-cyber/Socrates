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
import { velocityScrollTo } from '../ui/scroll.js';
import { suppressScrollPositionIntent } from '../ui/scrollPill.js';
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
  const users = list.querySelectorAll('.msg.user');
  const ref = users.length ? (users[users.length - 1] as HTMLElement) : null;
  const refTop = ref ? ref.getBoundingClientRect().top : null;
  row.style.display = 'none';
  if (ref && refTop != null) {
    const drift = ref.getBoundingClientRect().top - refTop;
    if (Math.abs(drift) > 0.5) {
      suppressScrollPositionIntent(200);
      list.scrollTop = Math.max(0, list.scrollTop + drift);
    }
  }
  const messages = stateStore.read('messages') as MessageEntry[];
  const index = messages.findIndex((entry) => entry && entry.clientId === id);
  if (index >= 0) {
    stateStore.dispatch({ type: 'session/remove-message-at', index, clientId: id });
    publishReactChatRuntime({ type: 'state-synced', reason: 'superseded-stub-removed' });
  }
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
  let anchorMotionStarted = false;
  const messages = stateStore.read('messages') as MessageEntry[];
  let message: MessageEntry | null =
    msgIdx >= 0 && messages[msgIdx] ? messages[msgIdx] : null;
  const clientId: string = message && message.clientId
    ? message.clientId
    : (assistant && assistant.dataset ? assistant.dataset.clientId || '' : '');
  function row(): HTMLElement | null {
    return turnRowFor(list, assistant, clientId);
  }
  /* The stamped reserve must be painted before the anchor can glide, or the
     target scrollTop is clamped by a still-short scrollHeight and the motion
     undershoots, then snaps. React commits the reserve from the message entry
     one frame after the stamp; the legacy path writes the style synchronously. */
  function anchorReservePainted(): boolean {
    const mounted = row() as HTMLElement | null;
    if (!mounted) return false;
    const minHeight = parseFloat(mounted.style.minHeight) || 0;
    const marginTop = parseFloat(mounted.style.marginTop) || 0;
    return minHeight > 0 || marginTop > 0;
  }
  /* Retire spent viewport reserves from earlier turns only once they sit
     completely above the visible transcript. Clearing them on the send
     frame collapsed the scroll range before the new turn's reserve
     existed, so the browser clamped scrollTop and the whole conversation
     jumped by the reserve height (the send "flash"). Here the layout
     shrink is compensated 1:1, so the visible content never moves. */
  function retireReservesAboveViewport(): void {
    if (!list) return;
    const listRect = list.getBoundingClientRect();
    const listBottom = listRect.bottom;
    const rows = list.querySelectorAll('.turn-viewport-anchor');
    /* A previous turn's bounded settle callback can fire after the next
       send has already stamped its reserve. Never retire the newest
       assistant row's reserve, whichever turn is asking. */
    const stored = stateStore.read('messages') as MessageEntry[];
    let latestAssistantId = '';
    for (let i = stored.length - 1; i >= 0; i -= 1) {
      if (stored[i] && stored[i].role === 'assistant') {
        latestAssistantId = stored[i].clientId || '';
        break;
      }
    }
    /* Keep the newest prompt visually still across the collapse: measure
       its viewport offset before and after and correct any drift (the
       browser's clamp is already baked into the "after" measurement). */
    const promptRows = list.querySelectorAll('.msg.user');
    const promptRow = promptRows.length ? (promptRows[promptRows.length - 1] as HTMLElement) : null;
    const promptTopBefore = promptRow ? promptRow.getBoundingClientRect().top : null;
    const stubIds: string[] = [];
    let cleared = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const el = rows[i] as HTMLElement;
      const id = el.dataset ? el.dataset.clientId : '';
      if (clientId && id === clientId) continue;
      if (latestAssistantId && id === latestAssistantId) continue;
      /* A reserve that sits fully below the visible transcript belongs to
         a newer turn; never touch it. Intersecting/above rows are spent. */
      if (el.getBoundingClientRect().top >= listBottom) continue;
      el.classList.remove('turn-viewport-anchor');
      el.style.minHeight = '';
      el.style.marginTop = '';
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
          /* A superseded empty placeholder held the layout open until this
             point; hide the rest of its row now that it is spent. */
          el.style.display = 'none';
          stubIds.push(id);
        }
      }
      cleared += 1;
    }
    if (!cleared) return;
    if (promptRow && promptTopBefore != null) {
      const drift = promptRow.getBoundingClientRect().top - promptTopBefore;
      if (Math.abs(drift) > 0.5) {
        suppressScrollPositionIntent(200);
        list.scrollTop = Math.max(0, list.scrollTop + drift);
      }
    }
    for (const id of stubIds) {
      const messages = stateStore.read('messages') as MessageEntry[];
      const index = messages.findIndex((candidate) => candidate && candidate.clientId === id);
      if (index >= 0) {
        stateStore.dispatch({ type: 'session/remove-message-at', index, clientId: id });
      }
    }
    publishReactChatRuntime({ type: 'state-synced', reason: 'turn-reserve-retire' });
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
     the reader expresses upward intent. `onDone` fires on every exit path so
     the anchor-ownership flag is released even when the loop stops early. */
  function settleNormalTurnAnchor(
    targetOffset: number,
    deadline: number,
    onDone?: () => void,
  ): void {
    const finish = () => { if (onDone) onDone(); };
    if (!list || stateStore.read('_userScrolledAway')) { finish(); return; }
    /* Stop once this turn's row is gone — the loop only promises to hold the
       prompt still while the composer's layout settles. */
    if (!assistant!.isConnected && !row()) { finish(); return; }
    const users = list.querySelectorAll && list.querySelectorAll('.msg.user');
    const anchor = users && users.length ? users[users.length - 1] : null;
    if (!anchor || !anchor.isConnected) { finish(); return; }
    const actualOffset = anchor.getBoundingClientRect().top - list.getBoundingClientRect().top;
    const delta = actualOffset - targetOffset;
    if (Math.abs(delta) > 1) {
      const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
      const nextTop = Math.max(0, Math.min(maxScroll, list.scrollTop + delta));
      if (Math.abs(nextTop - list.scrollTop) > 0.5) list.scrollTop = nextTop;
    }
    if (Date.now() < deadline) {
      requestAnimationFrame(function () {
        settleNormalTurnAnchor(targetOffset, deadline, onDone);
      });
    } else {
      finish();
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
    if (!retryViewport && !anchorReservePainted()) return;
    if (!retryViewport) list.__socratesTurnViewportOwner = true;
    const listRect = list.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    /* `offsetTop` is layout-based (transforms ignored), so the entrance
       animation on the fresh user bubble cannot bias the target. Retries
       keep the rect-based measurement for their exact visible restore. */
    const target = retryViewport
      ? Math.max(0, list.scrollTop + (anchorRect.top - listRect.top) - targetOffset)
      : Math.max(0, (anchor as HTMLElement).offsetTop - targetOffset);
    /* The retry placeholder's min-height and the React removal of the
       failed row can settle over several frames. A single scrollTop write
       therefore runs against stale scrollHeight and leaves the retry well
       below its captured viewport position. Re-align after layout settles,
       then use margin only when the scroller genuinely has no more range.
       Retries stay an instant, exact restore of the failed answer's visible
       offset — they are not a fresh send and must not animate. */
    if (retryViewport) {
      list.scrollTop = target;
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
      stateStore.dispatch({ type: 'state/set', key: '_userScrolledAway', value: false });
      return;
    }
    if (anchorMotionStarted) return;
    anchorMotionStarted = true;
    /* A normal send glides: the previous turns slide up and the submitted
       prompt settles at the target offset instead of teleporting there.
       `turnAnchorSettling` tells the content-follow observer to leave the
       scroll alone until the motion and its convergence window finish. */
    list.dataset.turnAnchorSettling = 'true';
    const releaseAnchor = () => {
      const done = () => {
        retireReservesAboveViewport();
        if (list.dataset) delete list.dataset.turnAnchorSettling;
      };
      if (stateStore.read('_userScrolledAway')) { done(); return; }
      stateStore.dispatch({ type: 'state/set', key: '_userScrolledAway', value: false });
      settleNormalTurnAnchor(targetOffset, Date.now() + 420, done);
    };
    velocityScrollTo(list, target, { smooth: true }).then(() => {
      if (!list.isConnected) return;
      releaseAnchor();
    });
  }
  /* A retry bubble is already mounted in the legacy list and its target
     offset is known. Position it synchronously so the first visible frame
     cannot flash at the top while waiting for the deferred layout pass. */
  let positionWaits = 0;
  function positionSoon(): void {
    /* Under React the live row is a commit away — when the stream starts the
       entry is only in `stateStore.read("messages")`. Bailing on that first null is what
       made the send-time anchor a no-op, so keep asking (bounded) until the
       row exists, its reserve is painted, and the scroll can be measured
       against a target the scroller can actually reach. */
    position();
    const ready = retryViewport
      ? Boolean(row())
      : Boolean(row()) && anchorReservePainted();
    if (ready || ++positionWaits > 30) return;
    requestAnimationFrame(positionSoon);
  }
  if (retryViewport && row()) position();
  else positionSoon();
  requestAnimationFrame(function () {
    requestAnimationFrame(positionSoon);
  });
}
