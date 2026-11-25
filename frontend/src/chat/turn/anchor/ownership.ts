/**
 * Turn viewport ownership, reserve math, and the public anchor config.
 */
export interface TurnAnchorDeps {
  /** Live reader for React ownership of #msgList, owned by application bootstrap. */
  isMsgListMounted: () => boolean;
}

export interface RetryViewportOffset {
  offset: number;
}

export interface TurnAnchorList extends HTMLElement {
  /** @deprecated The send anchor publishes ownership on
   *  `dataset.turnViewportOwner` (see markTurnViewportOwner). This property
   *  is kept only so older callers type-check; nothing reads it any more. */
  __socratesTurnViewportOwner?: boolean;
}

/* One spelling for "the send anchor owns this transcript" — the `data-`
   attribute every reader already queries (legacy/scroll.ts, the mount window,
   above-viewport compensation). The old DOM-expando
   `__socratesTurnViewportOwner` was written by the send pass but read by the
   composer-resize handler alone, and nothing but a new user message ever
   cleared it: a retry or an error path left the transcript marked as owned
   forever, so a pinned reader silently stopped following the bottom. */
export function markTurnViewportOwner(list: HTMLElement | null): void {
  if (!list || !list.dataset) return;
  list.dataset.turnViewportOwner = 'turn';
  /* Keep the legacy expando in sync for any external caller still reading
     it; it is never the source of truth. */
  (list as TurnAnchorList).__socratesTurnViewportOwner = true;
}

/** Hand the transcript back. Safe to repeat and to call on a detached list. */
export function clearTurnViewportOwner(list: HTMLElement | null): void {
  if (!list) return;
  if (list.dataset) delete list.dataset.turnViewportOwner;
  if ('__socratesTurnViewportOwner' in list)
    delete (list as TurnAnchorList).__socratesTurnViewportOwner;
}

/** The transcript's scroll padding includes the overlaid header on phones. */
export function turnAnchorTopOffset(
  styles: Pick<CSSStyleDeclaration, 'scrollPaddingTop'> | null,
): number {
  return parseFloat(styles?.scrollPaddingTop ?? '') || 24;
}

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
 * its top offset while the answer fills the rest of the live
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

/** Provide the React-ownership reader owned by application bootstrap. */
export function configureTurnAnchor(next: TurnAnchorDeps): void {
  anchorDeps = next;
}

export function isMsgListMounted(): boolean {
  return anchorDeps.isMsgListMounted();
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
    typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&');
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

/* Which send currently owns `data-turn-anchor-settling`. A previous turn's
   bounded settle loop can finish after the next send has already taken the
   transcript; only the owning send may clear the flag. */
let settlingOwner = 0;

export function nextSettlingOwner(): number {
  return ++settlingOwner;
}

export function isSettlingOwner(sequence: number): boolean {
  return sequence === settlingOwner;
}
