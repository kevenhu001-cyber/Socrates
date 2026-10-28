/**
 * ui/keyboard — virtual-keyboard avoidance controller.
 *
 * Direct-follower model (Open WebUI): the measured keyboard coverage is
 * mirrored 1:1 into `--keyboard-inset` synchronously inside the geometry
 * event — never deferred to rAF, never gated behind a mode vote, never
 * blended, never animated. Smoothness comes from the source:
 * visualViewport events fire per frame during the IME animation, and
 * resizes-content browsers animate the 100dvh flex column natively on the
 * compositor. There is deliberately no FLIP / WAAPI compensation timeline:
 * a second motion timeline on top of the browser's own geometry is what
 * made the composer judder against the rising keyboard.
 *
 * Closing is confirmed, not instant: a lone restored frame (IME reporting
 * hiccup) is held instead of dipping the composer to zero and bouncing
 * back. Opening is always immediate — the first lifted frame already shows
 * the measured value.
 */

import {
  getKeyboardInset,
  isTrackedInputFocused,
  KEYBOARD_OPEN_THRESHOLD_PX,
  MIN_STABLE_VISUAL_HEIGHT,
  type ViewportLike,
} from './geometry.ts';
import { TranscriptAnchor } from './anchor.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';

const BLUR_GRACE_MS = 900;
/* A restored (zero-coverage) read must persist this long before the lift is
 * released. Shorter than one real close animation step, longer than an IME
 * reporting hiccup, so a lone bad frame never dips the composer. */
const CLOSE_CONFIRM_MS = 64;
/* Settle window after the confirmed close write before the session tears
 * down, so the transcript anchor observes the final geometry. */
const FINISH_CLOSE_MS = 120;
const RESTORE_SLOP_PX = 8;
const NATIVE_OPEN_SETTLE_MS = 260;
const NATIVE_HIDE_FALLBACK_MS = 520;
/* A native height hint (physical pixels, density unscaled) must never lift
 * the composer off the screen — it is a floor capped against the shell. */
const NATIVE_HINT_MAX_RATIO = 0.65;
/* Sub-pixel shell/viewport rounding noise must not churn the layout. */
const WRITE_EPSILON_PX = 0.2;

type KeyboardMode = 'unknown' | 'native-resize' | 'overlay';
export type KeyboardPhase = 'closed' | 'opening' | 'open' | 'closing';

export interface KeyboardLift {
  readonly phase: KeyboardPhase;
  readonly inset: number;
  onInset(cb: (layoutInset: number) => void): () => void;
  notifyNativeKeyboard(kind: 'show' | 'hide', keyboardHeight?: number): void;
  destroy(): void;
}

export interface KeyboardLiftOptions {
  inputs?: HTMLElement | HTMLElement[] | string;
  input?: HTMLElement;
  container?: HTMLElement | null;
  root?: HTMLElement | null;
}

let active: KeyboardLift | null = null;

export function getKeyboardLift(): KeyboardLift | null {
  return active;
}

function resolveTrackedInputs(options: KeyboardLiftOptions): HTMLElement[] {
  const source = options.inputs ?? options.input;
  if (!source) return [];
  if (typeof source === 'string') return Array.from(document.querySelectorAll<HTMLElement>(source));
  return (Array.isArray(source) ? source : [source]).filter(Boolean);
}

class KeyboardLiftController implements KeyboardLift {
  private readonly trackedInputs: HTMLElement[];
  private readonly viewport: (ViewportLike & EventTarget & { width?: number }) | null;
  private readonly insetListeners = new Set<(layoutInset: number) => void>();
  private readonly anchor: TranscriptAnchor;
  private phaseValue: KeyboardPhase = 'closed';
  private sessionActive = false;
  private appliedInset = -1;
  private blurTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private closeTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private finishTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private nativeOpenTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private nativeHideTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private nativeHint: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly container: HTMLElement | null,
    options: KeyboardLiftOptions,
  ) {
    this.trackedInputs = resolveTrackedInputs(options);
    this.viewport = window.visualViewport as (ViewportLike & EventTarget & { width?: number }) | null;
    this.anchor = new TranscriptAnchor({
      listFor: () => {
        try { return document.getElementById('msgList'); } catch { return null; }
      },
      viewportOffset: () => this.viewportPan(),
      stillActive: () => this.sessionActive || this.phaseValue === 'closing',
    });
    this.bindEvents();
    this.publishInset(0);
    this.setPhase('closed');
    this.setIntent(false);
    this.setMode('unknown');
    try { delete this.root.dataset.keyboardMotion; }
    catch (error) { reportSwallow(error, 'keyboard.onGeometryEvent.clearMotion'); /* cleanup */ }
  }

  get phase(): KeyboardPhase {
    return this.phaseValue;
  }

  get inset(): number {
    return this.appliedInset > 0 ? this.appliedInset : 0;
  }

  onInset(cb: (layoutInset: number) => void): () => void {
    this.insetListeners.add(cb);
    return () => { this.insetListeners.delete(cb); };
  }

  private readonly onPointerDown = (): void => {
    /* Pointerdown is retained for the keyboard lifecycle event surface. */
  };

  private readonly onFocusIn = (): void => {
    if (this.blurTimer) {
      clearTimeout(this.blurTimer);
      this.blurTimer = 0;
    }
    this.clearNativeTimers();
    this.updateFromGeometry();
  };

  private readonly onFocusOut = (): void => {
    if (!this.sessionActive) return;
    /* Geometry owns close; blur is only a fallback for WebViews without it. */
    this.setPhase('closing');
    this.updateFromGeometry();
    if (this.blurTimer) clearTimeout(this.blurTimer);
    this.blurTimer = setTimeout(() => {
      this.blurTimer = 0;
      if (this.sessionActive && !this.isFocused()) {
        this.cancelCloseConfirm();
        this.publishInset(0);
        this.finishSession();
      }
    }, BLUR_GRACE_MS);
  };

  private readonly onGeometryEvent = (): void => {
    this.updateFromGeometry();
  };

  private bindEvents(): void {
    document.addEventListener('pointerdown', this.onPointerDown, true);
    if (this.viewport && typeof this.viewport.addEventListener === 'function') {
      this.viewport.addEventListener('resize', this.onGeometryEvent);
      this.viewport.addEventListener('scroll', this.onGeometryEvent);
    }
    window.addEventListener('resize', this.onGeometryEvent);
    window.addEventListener('scroll', this.onGeometryEvent, { passive: true });
    document.addEventListener('focusin', this.onFocusIn);
    document.addEventListener('focusout', this.onFocusOut);
    document.addEventListener('visibilitychange', this.onGeometryEvent);
  }

  private shellElement(): HTMLElement {
    return this.container || document.getElementById('appShell') || this.root;
  }

  private isFocused(): boolean {
    return isTrackedInputFocused(this.trackedInputs);
  }

  private setPhase(next: KeyboardPhase): void {
    if (this.phaseValue === next && this.root.dataset.keyboardPhase === next) return;
    this.phaseValue = next;
    try { this.root.dataset.keyboardPhase = next; }
    catch (error) { reportSwallow(error, 'keyboard.setPhase'); /* detached */ }
  }

  private setIntent(open: boolean): void {
    try { this.root.dataset.keyboardOpen = open ? 'true' : 'false'; }
    catch (error) { reportSwallow(error, 'keyboard.setIntent'); /* detached */ }
  }

  private setMode(next: KeyboardMode): void {
    try { this.root.dataset.keyboardMode = next; }
    catch (error) { reportSwallow(error, 'keyboard.setMode'); /* detached */ }
  }

  private publishInset(value: number): void {
    const next = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
    if (Math.abs(next - this.appliedInset) <= WRITE_EPSILON_PX) return;
    this.appliedInset = next;
    this.root.style.setProperty('--keyboard-inset', next + 'px');
    for (const cb of this.insetListeners) {
      try { cb(next); } catch (error) { reportSwallow(error, 'keyboard.publishInset'); /* isolated */ }
    }
    if (this.anchor.active) this.anchor.correct();
  }

  private shellBottom(): number {
    const element = this.shellElement();
    try {
      if (element && typeof element.getBoundingClientRect === 'function') {
        const bottom = Number(element.getBoundingClientRect().bottom);
        if (Number.isFinite(bottom) && bottom > 0) return bottom;
      }
    } catch (error) { reportSwallow(error, 'keyboard.shellBottom.measure'); /* detached */ }
    return Math.max(0, Number(window.innerHeight) || 0);
  }

  private viewportPan(): number {
    const visualTop = this.viewport && Number.isFinite(Number(this.viewport.offsetTop))
      ? Math.max(0, Number(this.viewport.offsetTop)) : 0;
    const documentTop = Number.isFinite(Number(window.scrollY))
      ? Math.max(0, Number(window.scrollY)) : 0;
    return visualTop + documentTop;
  }

  private resolveMeasuredCoverage(measured: number, shell: number): number {
    if (measured > KEYBOARD_OPEN_THRESHOLD_PX) {
      this.nativeHint = null;
      return measured;
    }
    if (this.nativeHint == null) return measured;
    return Math.min(Math.max(0, this.nativeHint), shell * NATIVE_HINT_MAX_RATIO, shell);
  }

  private measureTarget(): number | null {
    const shell = this.shellBottom();
    if (!(shell > 0)) return 0;
    if (this.viewport && Number.isFinite(Number(this.viewport.height))) {
      const height = Math.max(0, Number(this.viewport.height));
      if (height < MIN_STABLE_VISUAL_HEIGHT) return null;
      const scale = Number(this.viewport.scale);
      if (Number.isFinite(scale) && Math.abs(scale - 1) > 0.05) return null;
      const offsetTop = Number.isFinite(Number(this.viewport.offsetTop))
        ? Math.max(0, Number(this.viewport.offsetTop)) : 0;
      return this.resolveMeasuredCoverage(getKeyboardInset(shell, height, offsetTop), shell);
    }

    /* Legacy WebViews expose no VisualViewport; native resize is the fallback. */
    const innerHeight = Number(window.innerHeight);
    if (!Number.isFinite(innerHeight) || innerHeight <= 0) return 0;
    return this.resolveMeasuredCoverage(getKeyboardInset(shell, Math.max(0, innerHeight), 0), shell);
  }

  private clearTimers(): void {
    if (this.blurTimer) { clearTimeout(this.blurTimer); this.blurTimer = 0; }
    if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = 0; }
    if (this.finishTimer) { clearTimeout(this.finishTimer); this.finishTimer = 0; }
  }

  private clearNativeTimers(): void {
    if (this.nativeOpenTimer) { clearTimeout(this.nativeOpenTimer); this.nativeOpenTimer = 0; }
    if (this.nativeHideTimer) { clearTimeout(this.nativeHideTimer); this.nativeHideTimer = 0; }
  }

  private startSession(): void {
    if (this.sessionActive) return;
    this.sessionActive = true;
    this.setIntent(true);
    this.setPhase('opening');
    this.anchor.begin();
  }

  private finishSession(): void {
    this.clearTimers();
    this.clearNativeTimers();
    this.nativeHint = null;
    this.sessionActive = false;
    this.setMode('unknown');
    this.setIntent(false);
    this.setPhase('closed');
    this.publishInset(0);
    this.anchor.end();
    try {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }
    } catch (error) { reportSwallow(error, 'keyboard.finishSession.snapHome'); /* detached */ }
  }

  private scheduleFinish(): void {
    if (this.finishTimer) return;
    this.finishTimer = setTimeout(() => {
      this.finishTimer = 0;
      if (!this.sessionActive) return;
      const target = this.measureTarget();
      if (target == null || target <= RESTORE_SLOP_PX || !this.isFocused()) this.finishSession();
    }, FINISH_CLOSE_MS);
  }

  private confirmClose(): void {
    this.closeTimer = 0;
    if (!this.sessionActive) return;
    const target = this.measureTarget();
    if (target != null && target > RESTORE_SLOP_PX) return;
    if (target == null) {
      if (this.sessionActive) this.scheduleCloseConfirm();
      return;
    }
    this.setPhase('closing');
    this.publishInset(0);
    this.scheduleFinish();
  }

  private scheduleCloseConfirm(): void {
    if (this.closeTimer) return;
    this.closeTimer = setTimeout(() => this.confirmClose(), CLOSE_CONFIRM_MS);
  }

  private cancelCloseConfirm(): void {
    if (!this.closeTimer) return;
    clearTimeout(this.closeTimer);
    this.closeTimer = 0;
  }

  private applyOpenGeometry(target: number): void {
    this.cancelCloseConfirm();
    if (this.finishTimer) { clearTimeout(this.finishTimer); this.finishTimer = 0; }
    if (this.phaseValue === 'closing') this.setPhase('opening');
    this.publishInset(target);
    this.setMode('overlay');
    if (Math.abs(target - (this.appliedInset > 0 ? this.appliedInset : 0)) <= 1) this.setPhase('open');
  }

  private applyClosingGeometry(target: number): void {
    if (target > RESTORE_SLOP_PX) return;
    if (this.phaseValue === 'open' || this.phaseValue === 'opening') this.scheduleCloseConfirm();
    else if (this.phaseValue === 'closing' && !this.closeTimer && !this.finishTimer) this.scheduleCloseConfirm();
  }

  private settleClosedGeometry(): void {
    if (this.appliedInset !== 0) this.publishInset(0);
    if (this.phaseValue !== 'closed') this.setPhase('closed');
    if (this.root.dataset.keyboardOpen !== 'false') this.setIntent(false);
  }

  private updateFromGeometry(): void {
    const target = this.measureTarget();
    if (target == null) return;
    const open = target > KEYBOARD_OPEN_THRESHOLD_PX;
    if (!this.sessionActive && open && this.isFocused()) this.startSession();
    if (this.sessionActive) {
      if (open) this.applyOpenGeometry(target);
      else this.applyClosingGeometry(target);
      if (this.anchor.active) this.anchor.correct();
      return;
    }
    this.settleClosedGeometry();
  }

  private showNativeKeyboard(keyboardHeight?: number): void {
    if (this.blurTimer) { clearTimeout(this.blurTimer); this.blurTimer = 0; }
    if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = 0; }
    if (this.finishTimer) { clearTimeout(this.finishTimer); this.finishTimer = 0; }
    if (this.nativeHideTimer) { clearTimeout(this.nativeHideTimer); this.nativeHideTimer = 0; }
    const hint = Number(keyboardHeight);
    this.nativeHint = Number.isFinite(hint) && hint > 0 ? hint : null;
    this.startSession();
    this.setMode('native-resize');
    this.setPhase('opening');
    this.updateFromGeometry();
    if (this.nativeOpenTimer) clearTimeout(this.nativeOpenTimer);
    this.nativeOpenTimer = setTimeout(() => {
      this.nativeOpenTimer = 0;
      if (this.sessionActive && this.phaseValue === 'opening') this.setPhase('open');
    }, NATIVE_OPEN_SETTLE_MS);
  }

  private hideNativeKeyboard(): void {
    if (this.nativeOpenTimer) {
      clearTimeout(this.nativeOpenTimer);
      this.nativeOpenTimer = 0;
    }
    this.nativeHint = null;
    if (!this.sessionActive) {
      this.publishInset(0);
      this.setIntent(false);
      this.setPhase('closed');
      return;
    }
    this.setPhase('closing');
    this.updateFromGeometry();
    if (this.nativeHideTimer) clearTimeout(this.nativeHideTimer);
    this.nativeHideTimer = setTimeout(() => {
      this.nativeHideTimer = 0;
      if (!this.sessionActive) return;
      this.cancelCloseConfirm();
      this.publishInset(0);
      this.finishSession();
    }, NATIVE_HIDE_FALLBACK_MS);
  }

  notifyNativeKeyboard(kind: 'show' | 'hide', keyboardHeight?: number): void {
    if (kind === 'show') this.showNativeKeyboard(keyboardHeight);
    else this.hideNativeKeyboard();
  }

  destroy(): void {
    this.clearTimers();
    this.clearNativeTimers();
    this.anchor.end();
    this.insetListeners.clear();
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    if (this.viewport && typeof this.viewport.removeEventListener === 'function') {
      this.viewport.removeEventListener('resize', this.onGeometryEvent);
      this.viewport.removeEventListener('scroll', this.onGeometryEvent);
    }
    window.removeEventListener('resize', this.onGeometryEvent);
    window.removeEventListener('scroll', this.onGeometryEvent);
    document.removeEventListener('focusin', this.onFocusIn);
    document.removeEventListener('focusout', this.onFocusOut);
    document.removeEventListener('visibilitychange', this.onGeometryEvent);
    try { this.root.style.removeProperty('--keyboard-inset'); }
    catch (error) { reportSwallow(error, 'keyboard.onGeometryEvent.clearInset'); /* detached */ }
    try { delete this.root.dataset.keyboardOpen; }
    catch (error) { reportSwallow(error, 'keyboard.onGeometryEvent.clearOpen'); /* detached */ }
    try { delete this.root.dataset.keyboardPhase; }
    catch (error) { reportSwallow(error, 'keyboard.onGeometryEvent.clearPhase'); /* detached */ }
    try { delete this.root.dataset.keyboardMode; }
    catch (error) { reportSwallow(error, 'keyboard.onGeometryEvent.clearMode'); /* detached */ }
    try { delete this.root.dataset.keyboardMotion; }
    catch (error) { reportSwallow(error, 'keyboard.onGeometryEvent.clearMotionFlag'); /* detached */ }
    if (active === this) active = null;
  }
}

export function initKeyboardLift(options: KeyboardLiftOptions = {}): KeyboardLift {
  const root = options.root === undefined
    ? (typeof document !== 'undefined' ? document.documentElement : null)
    : options.root;
  if (!root || typeof window === 'undefined' || typeof document === 'undefined') return unavailableLift();
  const controller = new KeyboardLiftController(root, options.container || null, options);
  active = controller;
  return controller;
}
function unavailableLift(): KeyboardLift {
  return {
    phase: 'closed',
    inset: 0,
    onInset: () => () => undefined,
    notifyNativeKeyboard: () => undefined,
    destroy: () => undefined,
  };
}
