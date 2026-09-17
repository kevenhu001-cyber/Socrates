/**
 * ui/keyboard/geometry.ts — pure keyboard-occlusion geometry.
 *
 * Browsers disagree on how the viewports react when a keyboard opens:
 *
 *   - "resizes-visual" (iOS Safari, Chrome/Edge Android 108+): the layout
 *     viewport keeps its height; only window.visualViewport shrinks, and
 *     the browser may pan it (reported via offsetTop).
 *   - "resizes-content" (Firefox Android, Chrome Android <108, Capacitor
 *     WebView with Keyboard.resize:"native"): the layout viewport itself
 *     shrinks, so the shell's own bottom edge moves up with the keyboard.
 *
 * The robust reference is the app shell's rendered bottom edge in client
 * (layout-viewport) coordinates. Two quantities come out of one read:
 *
 *     travel = appBottom − visualViewport.height          (screen space)
 *     inset  = travel   − visualViewport.offsetTop        (layout space)
 *
 * `travel` is the keyboard's total displacement on screen — independent
 * of any browser pan — and is what the lift spring integrates. `inset`
 * is the part of the travel the layout must still absorb after the pan;
 * it is re-projected per painted frame from the *current* offsetTop so a
 * native pan never appears as a jump followed by a correction.
 */

/** Minimal shape of the VisualViewport API this module reads. */
export interface ViewportLike {
  height: number;
  offsetTop: number;
  scale?: number;
}

/* Android/iOS WebViews can expose a 0–1px visual viewport for a transient
 * frame while the IME is opening or closing. It is not a usable geometry
 * sample; treating it as the keyboard top would lift the composer almost
 * the full height of the app. */
export const MIN_STABLE_VISUAL_HEIGHT = 96;

/* A focused visual viewport can differ from the shell by a fractional pixel
 * because of device-pixel rounding. Treat the keyboard as open on the first
 * meaningful painted frame rather than waiting until dozens of pixels into
 * the lift and changing layout halfway through the motion. */
export const KEYBOARD_OPEN_THRESHOLD_PX = 2;

/**
 * How many CSS pixels of the app shell are covered, given the shell's
 * bottom edge and the visual viewport's height + pan. Pure; all modes
 * fall out of the same formula:
 *   - overlay mode:  appBottom stays put            → covered = keyboard height
 *   - resize mode:   appBottom already moved up     → covered ≈ 0 (CSS did it)
 *   - stuck 100vh:   appBottom stuck at full height → covered = keyboard height
 */
export function getKeyboardInset(
  layoutBottom: number,
  visualHeight: number,
  visualOffsetTop = 0,
): number {
  if (
    !Number.isFinite(layoutBottom)
    || !Number.isFinite(visualHeight)
    || layoutBottom <= 0
    || visualHeight <= 0
  ) {
    return 0;
  }
  /* offsetTop is a client-coordinate distance. Negative values can appear
   * during an overscroll/pan frame, but clamping them prevents counting the
   * same covered pixels twice. */
  const offsetTop = Number.isFinite(visualOffsetTop) ? Math.max(0, visualOffsetTop) : 0;
  const visualBottom = Math.max(0, visualHeight + offsetTop);
  return Math.min(layoutBottom, Math.max(0, layoutBottom - visualBottom));
}

export interface KeyboardMeasurement {
  /** Screen-space keyboard displacement — the spring's target. */
  travel: number;
  /** Layout-space coverage for the current pan — for immediate writes. */
  inset: number;
}

/**
 * Measure both keyboard quantities from one viewport read. Returns 0s for
 * a transient or zoomed viewport sample (pinch-zoom is not IME occlusion).
 * `innerHeight` is the fallback for legacy WebViews without VisualViewport:
 * resize-mode keyboards still shrink innerHeight there, so the stuck-100vh
 * case keeps working while overlay keyboards degrade to 0.
 */
export function measureKeyboard(
  appBottom: number,
  viewport: ViewportLike | null | undefined,
  innerHeight: number,
): KeyboardMeasurement {
  const viewportHeight = Number(viewport?.height);
  if (viewport && Number.isFinite(viewportHeight)) {
    if (viewportHeight < MIN_STABLE_VISUAL_HEIGHT) return { travel: 0, inset: 0 };
    const scale = Number(viewport.scale);
    if (Number.isFinite(scale) && Math.abs(scale - 1) > 0.05) return { travel: 0, inset: 0 };
    const offsetTop = Number(viewport.offsetTop) || 0;
    return {
      travel: getKeyboardInset(appBottom, viewportHeight, 0),
      inset: getKeyboardInset(appBottom, viewportHeight, offsetTop),
    };
  }
  const covered = getKeyboardInset(appBottom, Number(innerHeight) || 0, 0);
  return { travel: covered, inset: covered };
}

/**
 * Project the spring's screen-space position into the two coordinates the
 * browser actually paints:
 *
 *     layoutInset − panCompensation + viewportOffset = travel
 *
 * `layoutInset` and `panCompensation` are allowed to move in opposite
 * directions when iOS changes offsetTop. Trying to make either component
 * monotonic breaks this identity and exposes the native pan as an instant
 * jump followed by a correction. Only `travel` owns the visible motion
 * curve; the projection must remain exact and stateless.
 */
export function projectTravel(
  travel: number,
  viewportOffset = 0,
): { layoutInset: number; panCompensation: number } {
  const paintedTravel = Number.isFinite(travel) ? Math.max(0, travel) : 0;
  const offset = Number.isFinite(viewportOffset) ? Math.max(0, viewportOffset) : 0;
  return {
    layoutInset: Math.max(0, paintedTravel - offset),
    panCompensation: Math.max(0, offset - paintedTravel),
  };
}

/**
 * True when focus is on or inside one of the tracked composer roots. The
 * tracked node is usually the React mount point while the actual focus
 * lives on a nested contenteditable element, so direct equality alone
 * misses the relationship.
 */
export function isTrackedInputFocused(
  trackedInputs: readonly unknown[],
  activeElement?: unknown,
): boolean {
  const active = activeElement ?? (
    typeof document !== 'undefined' ? document.activeElement : null
  );
  const inputs = Array.isArray(trackedInputs) ? trackedInputs : [];
  for (const el of inputs) {
    const node = el as HTMLElement | null;
    if (!node) continue;
    if (active === node) return true;
    try {
      if (active && typeof node.contains === 'function' && node.contains(active as Node)) return true;
      if (typeof node.matches === 'function' && node.matches(':focus-within')) return true;
    } catch { /* detached/custom elements can throw */ }
  }
  return false;
}

/**
 * True when an event target is an editable element (contenteditable,
 * textarea, input) inside one of the tracked composer roots. Used by the
 * pointerdown/touchstart pre-arm, which must freeze the shell before the
 * browser performs the default focus action.
 */
export function isEditableWithin(
  eventTarget: unknown,
  trackedInputs: readonly unknown[],
): boolean {
  let target = eventTarget as HTMLElement | null;
  try {
    if (target && target.nodeType !== 1) target = target.parentElement;
    const editor = target?.closest?.('[contenteditable="true"], textarea, input');
    if (!editor) return false;
    return trackedInputs.some((tracked) => {
      const node = tracked as HTMLElement | null;
      return !!node && (node === editor || node.contains?.(editor));
    });
  } catch {
    return false;
  }
}
