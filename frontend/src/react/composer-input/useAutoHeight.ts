/*
 * useAutoHeight — animate an element's height to match its content's
 * intrinsic height whenever the content grows or shrinks.
 *
 * Used by the desktop chat composer (RichComposer.tsx) to make the
 * Tiptap editor expand smoothly when the user types past the first
 * line, matching the mobile composer's focus-in expansion morph.
 *
 * The Tiptap contenteditable grows naturally as the user types; the
 * wrap around it has no `min-height` to gate that growth. Without
 * this hook, the wrap's height snaps to the new content height on
 * every input event — the user sees a one-line "thunk" for each
 * newline. With this hook, the height change runs on a
 * velocity-based timeline that matches the rest of the chat motion
 * (keyboard lift, scroll-to-bottom) so the composer expansion feels
 * part of the same continuous animation system.
 *
 * Why this hook exists at all (the "snap" trap)
 * ---------------------------------------------
 * A naive `ResizeObserver` cannot animate this growth. The observer
 * fires AFTER the browser has already re-laid-out the box to fit the
 * new content (the element is `height: auto`, so the box tracks the
 * content automatically). By the time the callback runs there is no
 * "old" height to animate from — `getBoundingClientRect().height` is
 * already the new height. The animation is impossible without our
 * intervention.
 *
 * The fix: keep the element's `style.height` LOCKED to its last
 * displayed value at all times (initially the rendered height, after
 * each animation the new natural height). The lock prevents the
 * browser from auto-growing the box, so the next content change does
 * not cause an instant snap. Then:
 *
 *   1. A MutationObserver watches the contenteditable subtree. When
 *      the user types, pastes, or the editor applies a transaction,
 *      the mutation observer fires synchronously AFTER the DOM change
 *      but BEFORE the browser commits a new layout.
 *   2. In the callback we force a layout pass with the existing lock
 *      still in place (the lock ensures `scrollHeight` now reports
 *      the new content size but the rendered box is still the old
 *      height — no visible snap). This gives us a real
 *      old-to-new delta to animate over.
 *   3. The hook animates `style.height` from the old lock value to
 *      the new natural size via the velocity planner.
 *   4. When the animation finishes we leave `style.height` set to
 *      the new value (we do NOT release back to `auto`); releasing
 *      would re-introduce the snap on the next keystroke. The lock
 *      stays so future changes can animate the same way.
 *
 * On unmount the lock is cleared so the consumer does not retain an
 * inline style they did not set.
 *
 * Reduced-motion and unsupported environments degrade to a plain
 * height write so the box still tracks the content (without the
 * animation), and the absence of WAAPI falls back to a rAF chain.
 */

import { useEffect, type DependencyList } from 'react';
import { planMotionForUser, easeOutQuint } from '../../ui/motion.js';

interface AutoHeightOptions {
  motion?: {
    velocity?: number;
    minDuration?: number;
    maxDuration?: number;
    snapDistance?: number;
    easing?: string;
  };
}

export function useAutoHeight(
  element: HTMLElement | null | undefined,
  opts: AutoHeightOptions = {},
): void {
  const options = opts;
  useEffect(() => {
    if (!element || typeof ResizeObserver !== 'function') return undefined;
    let anim: { cancel(): void } | null = null;
    let scheduledFrame = 0;
    let updatePending = false;
    const reduced = (function () {
      try {
        const hasWindow = typeof window !== 'undefined' && window;
        const host = hasWindow || (typeof globalThis !== 'undefined' ? globalThis : null);
        if (!host || typeof host.matchMedia !== 'function') return false;
        return host.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch (_) { return false; }
    })();
    /* Read the computed `min/max-height` so we do not animate past the
       CSS cap. The Tiptap editor clamps its rendered height at
       max-height and scrolls internally past it; without this clamp
       the hook animates `style.height` to a value larger than the
       cap, the browser re-clamps each frame, and the user sees no
       motion while the JS thread burns cycles. */
    function readHeightCap(target: HTMLElement): { min: number; max: number } {
      try {
        const cs = window.getComputedStyle(target);
        const parsePx = (v: string): number => {
          if (!v || v === 'none' || v === 'auto') return NaN;
          const n = parseFloat(v);
          return Number.isFinite(n) ? n : NaN;
        };
        const max = parsePx(cs.maxHeight);
        const min = parsePx(cs.minHeight);
        return { min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : Infinity };
      } catch (_) {
        return { min: 0, max: Infinity };
      }
    }

    function readNatural(target: HTMLElement, cap: { min: number; max: number }): number {
      const naturalRaw = target.scrollHeight;
      return Math.max(cap.min, Math.min(cap.max, naturalRaw));
    }

    function lockAt(target: HTMLElement, value: number): void {
      try { target.style.height = value + 'px'; } catch (_) { /* detached */ }
    }

    /* Run one animated transition from `from` to `natural`. When it
       finishes, re-read the content: if it moved while the box was
       locked (fast typing past the observed size), chain a new
       animation from the old target to the new natural height so the
       motion stays continuous; otherwise lock at the new height so
       the next change can animate the same way (we deliberately do
       NOT release back to `auto`). */
    function animateTo(target: HTMLElement, from: number, natural: number, cap: { min: number; max: number }): void {
      if (anim) {
        try { anim.cancel(); } catch (_) { /* not animatable */ }
        anim = null;
      }
      const distance = Math.abs(natural - from);
      const plan = planMotionForUser(distance, options.motion);
      const finish = function () {
        anim = null;
        const latest = readNatural(target, cap);
        if (Math.abs(latest - natural) >= 1) {
          animateTo(target, natural, latest, cap);
          return;
        }
        lockAt(target, natural);
      };
      if (plan.duration === 0) {
        lockAt(target, natural);
        return;
      }
      if (typeof target.animate === 'function') {
        try {
          /* WAAPI animates the inline height alongside our lock. We
             use `fill: 'none'` because `fill: 'forwards'` would keep
             the final keyframe applied forever, which would re-freeze
             the box even after the lock is refreshed at `finish`. */
          const animation = target.animate(
            { height: [from + 'px', natural + 'px'] },
            {
              duration: plan.duration,
              easing: plan.easing,
              fill: 'none',
            }
          );
          animation.onfinish = finish;
          animation.oncancel = function () { anim = null; };
          anim = animation as unknown as { cancel(): void };
          return;
        } catch (_) { /* fall through */ }
      }
      /* WAAPI unavailable — rAF fallback on the JS thread. */
      const startedAt = performance.now();
      let cancelled = false;
      let handle = 0;
      const tick = function (now: number) {
        if (cancelled) return;
        const elapsed = now - startedAt;
        if (elapsed >= plan.duration) {
          lockAt(target, natural);
          finish();
          return;
        }
        const t = elapsed / plan.duration;
        const eased = easeOutQuint(t);
        lockAt(target, from + (natural - from) * eased);
        handle = requestAnimationFrame(tick);
      };
      anim = {
        cancel() {
          cancelled = true;
          if (handle) cancelAnimationFrame(handle);
        },
      };
      handle = requestAnimationFrame(tick);
    }

    /* The single source of truth for "the content size changed, do
       an animated transition". Called from:
         - the MutationObserver (primary: typing, paste, transactions)
         - the ResizeObserver fallback (window resize, parent reflow)
       Both call paths share one rAF queue and the same lock-and-animate
       dance, so bursts of transactions and resize notifications collapse
       into one measurement instead of competing height animations. */
    function update(target: HTMLElement): void {
      const cap = readHeightCap(target);
      /* Always read the CURRENT lock value as the animation start.
         The lock is set on mount (initial lock) and after every
         finish (chain-lock), so it is the most recent settled
         height. If the lock is somehow missing (race during unmount
         or first paint) fall back to the rendered height. */
      let current = parseFloat(target.style.height);
      if (!Number.isFinite(current)) {
        current = target.getBoundingClientRect().height;
      }
      const natural = readNatural(target, cap);
      const distance = Math.abs(natural - current);
      if (distance < 1) {
        /* No motion needed — re-assert the lock so the box stays
           locked at this size for the next change. */
        lockAt(target, current);
        return;
      }
      if (reduced) {
        lockAt(target, natural);
        return;
      }
      animateTo(target, current, natural, cap);
    }

    function scheduleUpdate(target: HTMLElement): void {
      if (updatePending) return;
      updatePending = true;
      scheduledFrame = requestAnimationFrame(() => {
        updatePending = false;
        scheduledFrame = 0;
        update(target);
      });
    }

    /* Initial lock: set the inline height to whatever the browser
       already rendered. This is an invisible change (the rendered
       box stays the same) but ensures the first content change does
       not trigger an instant snap. */
    const initialCap = readHeightCap(element);
    const initialNatural = readNatural(element, initialCap);
    lockAt(element, initialNatural);

    /* MutationObserver: fires synchronously after every DOM change in
       the contenteditable subtree (typing, paste, transactions). It
       runs BEFORE the next layout pass, so `getBoundingClientRect`
       at this point still reflects the pre-mutation layout — exactly
       what we need to derive the animation start height from the
       existing lock. */
    const mutation = new MutationObserver(function () {
      scheduleUpdate(element);
    });
    mutation.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    /* ResizeObserver fallback for non-mutation size changes (window
       resize rewraps text, parent reflow, font scale change). The
       element's own box cannot change while we hold the lock, but
       the cap / parent / wrap can, so this observer is here to pick
       those up.
       ─────────────────────────────────────────────────────────────────
       The callback is deferred to requestAnimationFrame so the
       mutation runs OUTSIDE the current layout pass. Without this
       deferral the observer fires every time our own WAAPI animation
       interpolates `style.height` (each interpolated value is a
       layout-affecting change), the callback synchronously writes
       the next lock value, the browser queues another notification
       before the previous one is delivered, and Chromium/Firefox
       surface the spec-mandated "ResizeObserver loop completed with
       undelivered notifications" warning. Deferring to the next
       frame lets the browser finish delivering the queued
       notification first.
       We additionally skip notifications while `anim` is in flight:
       during the animation we are the SOLE source of size change on
       the observed element, so there is nothing external to react
       to. The animation's own `finish()` re-reads the natural height
       and chains the next transition, which covers any content that
       moved while we were animating. */
    const resize = new ResizeObserver(function (entries) {
      if (!entries.length) return;
      if (anim) return;
      const target = entries[0].target as HTMLElement;
      scheduleUpdate(target);
    });
    resize.observe(element);

    return function () {
      if (anim) {
        try { anim.cancel(); } catch (_) { /* not animatable */ }
        anim = null;
      }
      if (scheduledFrame) cancelAnimationFrame(scheduledFrame);
      scheduledFrame = 0;
      updatePending = false;
      mutation.disconnect();
      resize.disconnect();
      try { element.style.height = ''; } catch (_) { /* detached */ }
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [element, JSON.stringify(options.motion)] as DependencyList);
}
