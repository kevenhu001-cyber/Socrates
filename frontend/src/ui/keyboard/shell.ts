/**
 * ui/keyboard/shell.ts — freeze the 100dvh app shell for a keyboard session.
 *
 * Some browsers resize the layout viewport before dispatching their first
 * geometry event; if that native resize goes through, the composer reaches
 * its final position before the JS lift can animate. Freezing the shell's
 * inline height to its pre-keyboard value converts a native layout-resize
 * into the overlay model: --keyboard-inset then carries the composer toward
 * the visual viewport one frame at a time. The original inline style is
 * restored once the inset is back at zero and the viewports have settled.
 */
export class ShellFreeze {
  frozen = false;
  /** Shell height the keyboard session compensates against. */
  baselineHeight = 0;
  /** visualViewport.height captured when the session began. */
  baselineVisualHeight = 0;
  /** Date.now() timestamp of the freeze — backs the release grace window. */
  startedAt = 0;
  private restore: { value: string; priority: string } | null = null;

  /**
   * Lock the shell at `height` px. `height` should be the larger of the
   * live rect and the remembered closed-shell height — if the layout
   * viewport already shrank before this focus, the live rect is the
   * post-keyboard height and freezing it would leave no animation range.
   */
  freeze(shell: HTMLElement, height: number, visualHeight: number): void {
    if (this.frozen || !Number.isFinite(height) || height <= 0) return;
    const style = shell.style;
    this.restore = {
      value: style.getPropertyValue('height'),
      priority: style.getPropertyPriority('height'),
    };
    this.baselineHeight = height;
    this.baselineVisualHeight = Number.isFinite(visualHeight) ? visualHeight : 0;
    this.startedAt = Date.now();
    this.frozen = true;
    style.setProperty('height', `${height}px`, this.restore.priority);
  }

  /** Restore the shell's original inline height. Safe to call repeatedly. */
  unfreeze(shell: HTMLElement | null): void {
    if (!this.frozen) return;
    try {
      if (shell?.style && this.restore) {
        if (this.restore.value) {
          shell.style.setProperty('height', this.restore.value, this.restore.priority);
        } else {
          shell.style.removeProperty('height');
        }
      }
    } catch { /* detached shell */ }
    this.frozen = false;
    this.baselineHeight = 0;
    this.baselineVisualHeight = 0;
    this.restore = null;
    this.startedAt = 0;
  }

  /**
   * True once the viewports have grown back to (approximately) their
   * pre-keyboard size. A platform that never resized the layout viewport
   * (overlay mode) trivially satisfies the inner-height half.
   */
  viewportsSettled(visualHeight: number, innerHeight: number): boolean {
    if (!this.frozen) return true;
    const visualSettled = !Number.isFinite(visualHeight)
      || this.baselineVisualHeight <= 0
      || visualHeight >= this.baselineVisualHeight - 1;
    const innerSettled = !Number.isFinite(innerHeight)
      || this.baselineHeight <= 0
      || innerHeight >= this.baselineHeight - 1;
    return visualSettled && innerSettled;
  }
}
