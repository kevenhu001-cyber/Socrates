/*
 * useAutoHeight — animate an element's height to match its content's
 * intrinsic height whenever the content grows or shrinks.
 *
 * Used by the desktop chat composer (RichComposer.tsx) to make the
 * Tiptap editor expand smoothly when the user types past the first
 * line, matching the mobile composer's focus-in expansion animation.
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
 * The hook:
 *   - Mounts a ResizeObserver on the element
 *   - Reads `scrollHeight` after each observed resize
 *   - Animates `style.height` via Web Animations API with the
 *     velocity planner from ui/motion.js
 *   - Cancels any in-flight animation when a new one starts (so
 *     rapid typing does not stack overlapping height animations)
 *   - Degrades to setting `style.height = 'auto'` when prefers-
 *     reduced-motion is set, so the composer still resizes but
 *     without animation
 *
 * The element's `box-sizing` must be `border-box` (the default for
 * every chat surface) so `scrollHeight` and the explicit `height`
 * agree on what they include.
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
    let anim: { cancel(): void; handle?: number } | null = null;
    const reduced = (function () {
      try {
        const hasWindow = typeof window !== 'undefined' && window;
        const host = hasWindow || (typeof globalThis !== 'undefined' ? globalThis : null);
        if (!host || typeof host.matchMedia !== 'function') return false;
        return host.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch (_) { return false; }
    })();
    /* A4: read the computed `max-height` so we do not animate past the
       CSS cap. The Tiptap editor clamps its rendered height at
       max-height and scrolls internally past it; without this
       clamp the hook animates `style.height` to a value larger
       than the cap, the browser re-clamps each frame, and the
       user sees no motion while the JS thread burns cycles. We
       also respect `min-height` for the same reason in reverse
       (height can't shrink below min-height). */
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

    const observer = new ResizeObserver(function (entries) {
      if (!entries.length) return;
      const target = entries[0].target as HTMLElement;
      const cap = readHeightCap(target);
      const naturalRaw = target.scrollHeight;
      const natural = Math.max(cap.min, Math.min(cap.max, naturalRaw));
      const current = target.getBoundingClientRect().height;
      const distance = Math.abs(natural - current);
      if (distance < 1) return;
      if (reduced) {
        target.style.height = natural + 'px';
        return;
      }
      const plan = planMotionForUser(distance, options.motion);
      if (plan.duration === 0) {
        target.style.height = natural + 'px';
        return;
      }
      /* A2: cancel the previous animation through a real cancel
         handle. WAAPI's cancel is real; the rAF fallback uses a
         `cancelled` flag the next tick checks. Without this the
         rAF chain would keep writing stale values while a new
         chain wrote fresh ones, producing the same jitter
         pattern keyboardViewport had before A1. */
      if (anim) {
        try { anim.cancel(); } catch (_) { /* not animatable */ }
        anim = null;
      }
      if (typeof target.animate === 'function') {
        try {
          const animation = target.animate(
            { height: [current + 'px', natural + 'px'] },
            {
              duration: plan.duration,
              easing: plan.easing,
              fill: 'forwards',
            }
          );
          animation.onfinish = function () {
            try { target.style.height = natural + 'px'; } catch (_) { /* detached */ }
            anim = null;
          };
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
          target.style.height = natural + 'px';
          if (anim && anim.handle === handle) anim = null;
          return;
        }
        const t = elapsed / plan.duration;
        const eased = easeOutQuint(t);
        target.style.height = (current + (natural - current) * eased) + 'px';
        handle = requestAnimationFrame(tick);
      };
      anim = {
        handle: 0,
        cancel() {
          cancelled = true;
          if (handle) cancelAnimationFrame(handle);
        },
      };
      handle = requestAnimationFrame(tick);
      anim.handle = handle;
    });
    observer.observe(element);
    return function () {
      if (anim) {
        try { anim.cancel(); } catch (_) { /* not animatable */ }
        anim = null;
      }
      observer.disconnect();
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [element, JSON.stringify(options.motion)] as DependencyList);
}