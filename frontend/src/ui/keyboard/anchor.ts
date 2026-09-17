/**
 * ui/keyboard/anchor.ts — keep the reader's position across a keyboard lift.
 *
 * The anchor's lifetime is the keyboard session: it is captured when a
 * composer takes focus (before any keyboard geometry lands), re-applied on
 * every inset write and viewport pan, and refreshed once the geometry is
 * calm:
 *
 *   - bottom-follow: the latest answer is kept flush above the composer
 *     (a snap, not a second animation that would amplify the lift);
 *   - history: the reader's content stays at the same visual position —
 *     a visual-viewport pan is compensated in scrollTop and the captured
 *     offset is clamped to the new range, never forced to the bottom.
 *
 * Any wheel/touch/key gesture after the capture abandons the anchor — a
 * live gesture always wins — and the anchor is re-captured once the
 * gesture settles so the next keyboard change still compensates.
 */

import { decideKeyboardAnchorAction, KEYBOARD_PIN_SLACK } from '../scrollDecision.ts';
import { smoothScrollToBottom } from '../scroll.js';
import { getLastScrollIntentAt, suppressScrollPositionIntent } from '../scrollPill.js';
import { stateStore } from '../../state/store.js';

/* Sub-4px offsetTop deltas are DPR rounding noise, not a real pan — feeding
 * them into scrollTop jitters the transcript ±2px every frame for the whole
 * lift. The layout-side pan projection intentionally stays raw (instant
 * 1:1 cancellation); only the transcript side is deadbanded. */
const PAN_DEADBAND_PX = 4;

/* Re-capture the anchor from settled geometry this long after the last
 * correction, so later keyboard changes compensate from the reader's
 * latest position instead of a stale one. */
const REFRESH_MS = 280;

interface AnchorSnapshot {
  list: HTMLElement;
  scrollTop: number;
  offsetTop: number;
  pinned: boolean;
  intentAt: number;
}

export class TranscriptAnchor {
  private snapshot: AnchorSnapshot | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private readonly listFor: () => HTMLElement | null;
  private readonly viewportOffset: () => number;
  private readonly stillActive: () => boolean;

  constructor(opts: {
    listFor: () => HTMLElement | null;
    viewportOffset: () => number;
    /** True while a keyboard session should keep the anchor alive. */
    stillActive: () => boolean;
  }) {
    this.listFor = opts.listFor;
    this.viewportOffset = opts.viewportOffset;
    this.stillActive = opts.stillActive;
  }

  get active(): boolean {
    return this.snapshot !== null;
  }

  /** Capture the reader's intent once per session; later calls are no-ops. */
  begin(): void {
    if (this.snapshot) return;
    this.snapshot = this.capture();
    this.refreshSoon();
  }

  /** Drop the anchor immediately (session ended or user owns the scroll). */
  end(): void {
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); this.refreshTimer = 0; }
    this.drop();
  }

  /**
   * Re-apply the captured reader position against the current geometry.
   * Call inside the same frame that publishes a new inset — or inside the
   * resize/pan event itself — so the painted transcript never trails the
   * composer by a frame.
   */
  correct(): void {
    const anchor = this.snapshot;
    const list = anchor?.list;
    if (!anchor || !list || list.isConnected === false) return;

    /* A fresh send owns the transcript offset while its anchor holds the
       submitted prompt at the top (chat/turnAnchor.ts): that controller
       re-aligns on every layout change, and snapping to the bottom here
       would slide the prompt down by the whole viewport delta. Keep the
       captured snapshot current instead, so the first unheld geometry
       change compensates from the reader's real position. */
    const viewportOwnerHeld = Boolean(
      (list as HTMLElement).dataset && (list as HTMLElement).dataset.turnAnchorHold === 'true',
    );
    const rawPanDelta = this.viewportOffset() - anchor.offsetTop;
    const panDelta = Math.abs(rawPanDelta) < PAN_DEADBAND_PX ? 0 : rawPanDelta;
    const action = decideKeyboardAnchorAction(
      { scrollTop: anchor.scrollTop, pinned: anchor.pinned },
      {
        maxScrollTop: list.scrollHeight - list.clientHeight,
        scrolledAway: Boolean(stateStore.read('_userScrolledAway')),
        userIntentAfterCapture: getLastScrollIntentAt() > anchor.intentAt,
        panDelta,
        viewportOwnerHeld,
      },
    );
    if (action.type === 'none') {
      if (viewportOwnerHeld) {
        this.snapshot = this.capture();
        return;
      }
      /* A live gesture owns the scroll: drop the stale anchor but watch
         for calm so the next keyboard change re-anchors from the new
         reader position. */
      this.drop();
      this.refreshSoon();
      return;
    }
    if (action.type === 'follow-bottom') {
      smoothScrollToBottom(list, { smooth: false });
      return;
    }
    if (Math.abs(action.top - list.scrollTop) > 0.5) {
      /* A programmatic compensation write must not be read by the
         scroll-intent listener as the reader leaving the bottom. */
      suppressScrollPositionIntent(150);
      list.scrollTop = action.top;
    }
  }

  /** Re-capture once the geometry is calm, or drop the anchor entirely. */
  refreshSoon(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = 0;
      if (this.stillActive()) {
        this.snapshot = this.capture();
        return;
      }
      this.end();
    }, REFRESH_MS);
  }

  private capture(): AnchorSnapshot | null {
    const list = this.listFor();
    if (!list || typeof list.getBoundingClientRect !== 'function') return null;
    const scrolledAway = Boolean(stateStore.read('_userScrolledAway'));
    const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
    return {
      list,
      scrollTop: Number(list.scrollTop) || 0,
      offsetTop: this.viewportOffset(),
      pinned: !scrolledAway && distance <= KEYBOARD_PIN_SLACK,
      intentAt: getLastScrollIntentAt(),
    };
  }

  private drop(): void {
    this.snapshot = null;
  }
}
