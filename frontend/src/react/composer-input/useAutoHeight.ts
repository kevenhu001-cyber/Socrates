/*
 * Animate the composer wrapper to the editor's intrinsic height.
 *
 * A persistent inline height lock prevents the browser from snapping before
 * a ResizeObserver can read the old size. Mutation and resize notifications
 * share one animation-frame queue, and the lock is released on unmount.
 */

import { useEffect } from 'react';
import { planMotionForUser } from '../../ui/motion.js';

interface AutoHeightMotion {
  velocity?: number;
  minDuration?: number;
  maxDuration?: number;
  snapDistance?: number;
  easing?: string;
}

interface AutoHeightOptions { motion?: AutoHeightMotion }
interface HeightCap { min: number; max: number }
interface HeightAnimation { cancel(): void }

function prefersReducedMotion(): boolean {
  try {
    const host = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
    return Boolean(host && typeof host.matchMedia === 'function' && host.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (_) {
    return false;
  }
}

class AutoHeightController {
  private animation: HeightAnimation | null = null;
  private scheduledFrame = 0;
  private updatePending = false;
  private mutationObserver: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly reducedMotion = prefersReducedMotion();

  constructor(private readonly element: HTMLElement, private readonly motion?: AutoHeightMotion) {}

  start(): () => void {
    const cap = this.readHeightCap(this.element);
    this.lockAt(this.element, this.readNatural(this.element, cap));
    this.observeMutations();
    this.observeResizes();
    return () => this.dispose();
  }

  private readHeightCap(target: HTMLElement): HeightCap {
    try {
      const style = window.getComputedStyle(target);
      const parsePx = (value: string): number => {
        if (!value || value === 'none' || value === 'auto') return NaN;
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : NaN;
      };
      const max = parsePx(style.maxHeight);
      const min = parsePx(style.minHeight);
      return { min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : Infinity };
    } catch (_) {
      return { min: 0, max: Infinity };
    }
  }

  private readNatural(target: HTMLElement, cap: HeightCap): number {
    let naturalRaw: number;
    const locked = target.style.height;
    const lockedPriority = target.style.getPropertyPriority('height');
    try {
      if (locked) target.style.removeProperty('height');
      naturalRaw = target.scrollHeight;
    } catch (_) {
      naturalRaw = target.scrollHeight;
    } finally {
      try {
        if (locked) target.style.setProperty('height', locked, lockedPriority);
      } catch (_) { /* detached */ }
    }
    return Math.max(cap.min, Math.min(cap.max, naturalRaw));
  }

  private lockAt(target: HTMLElement, value: number): void {
    try { target.style.setProperty('height', value + 'px', 'important'); } catch (_) { /* detached */ }
  }

  private cancelAnimation(): void {
    if (!this.animation) return;
    try { this.animation.cancel(); } catch (_) { /* not animatable */ }
    this.animation = null;
  }

  private animateTo(target: HTMLElement, from: number, natural: number, cap: HeightCap): void {
    this.cancelAnimation();
    const plan = planMotionForUser(Math.abs(natural - from), this.motion);
    if (plan.duration === 0) {
      this.lockAt(target, natural);
      return;
    }
    this.animateOnFrames(target, from, natural, cap, plan.duration);
  }

  private animateOnFrames(target: HTMLElement, from: number, natural: number, cap: HeightCap, duration: number): void {
    const startedAt = performance.now();
    let cancelled = false;
    let handle = 0;
    const tick = (now: number): void => {
      if (cancelled) return;
      const elapsed = now - startedAt;
      if (elapsed >= duration) {
        this.lockAt(target, natural);
        this.finishAnimation(target, natural, cap);
        return;
      }
      const progress = elapsed / duration;
      const eased = progress * progress * (3 - 2 * progress);
      this.lockAt(target, from + (natural - from) * eased);
      handle = requestAnimationFrame(tick);
    };
    this.animation = {
      cancel() {
        cancelled = true;
        if (handle) cancelAnimationFrame(handle);
      },
    };
    handle = requestAnimationFrame(tick);
  }

  private finishAnimation(target: HTMLElement, natural: number, cap: HeightCap): void {
    this.animation = null;
    const latest = this.readNatural(target, cap);
    if (Math.abs(latest - natural) >= 1) {
      this.animateTo(target, natural, latest, cap);
      return;
    }
    this.lockAt(target, natural);
  }

  private update(target: HTMLElement): void {
    const visualHeight = target.getBoundingClientRect().height;
    this.cancelAnimation();
    const cap = this.readHeightCap(target);
    let currentHeight = visualHeight;
    if (!Number.isFinite(currentHeight) || currentHeight <= 0) {
      currentHeight = parseFloat(target.style.height);
      if (!Number.isFinite(currentHeight)) currentHeight = cap.min;
    }
    const natural = this.readNatural(target, cap);
    if (Math.abs(natural - currentHeight) < 1 || this.reducedMotion) {
      this.lockAt(target, natural);
      return;
    }
    this.animateTo(target, currentHeight, natural, cap);
  }

  private scheduleUpdate(target: HTMLElement): void {
    if (this.updatePending) return;
    this.updatePending = true;
    this.scheduledFrame = requestAnimationFrame(() => {
      this.updatePending = false;
      this.scheduledFrame = 0;
      this.update(target);
    });
  }

  private observeMutations(): void {
    this.mutationObserver = new MutationObserver(() => this.scheduleUpdate(this.element));
    this.mutationObserver.observe(this.element, { childList: true, subtree: true, characterData: true });
  }

  private observeResizes(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      if (!entries.length || this.animation) return;
      this.scheduleUpdate(entries[0].target as HTMLElement);
    });
    this.resizeObserver.observe(this.element);
  }

  private dispose(): void {
    this.cancelAnimation();
    if (this.scheduledFrame) cancelAnimationFrame(this.scheduledFrame);
    this.scheduledFrame = 0;
    this.updatePending = false;
    this.mutationObserver?.disconnect();
    this.resizeObserver?.disconnect();
    try { this.element.style.removeProperty('height'); } catch (_) { /* detached */ }
  }
}

export function useAutoHeight(element: HTMLElement | null | undefined, options: AutoHeightOptions = {}): void {
  const motionKey = JSON.stringify(options.motion);
  useEffect(() => {
    if (!element || typeof ResizeObserver !== 'function') return undefined;
    return new AutoHeightController(element, options.motion).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element, motionKey]);
}
