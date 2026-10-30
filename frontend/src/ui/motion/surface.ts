import { prefersReducedMotion } from '../motion.ts';

let active: { host: HTMLElement; animation: Animation } | null = null;

/** Reveal only the incoming pane. The shell and composer remain live, and
 * rapid navigation cancels the hidden pane's motion instead of queuing a
 * whole-window snapshot over the next destination. Layout commits once. */
export function animateSurfaceEntrance(host: HTMLElement, previousView?: string, reveal = true): void {
  if (host.id === previousView) return;
  active?.animation.cancel();
  active = null;
  const forcedColors = typeof window !== 'undefined' && window.matchMedia?.('(forced-colors: active)').matches;
  if (!reveal || prefersReducedMotion() || forcedColors || typeof host.animate !== 'function') return;
  const style = getComputedStyle(host);
  const time = style.getPropertyValue('--ui-duration-overlay').trim();
  const value = Number.parseFloat(time);
  const duration = Number.isFinite(value) ? value * (time.endsWith('ms') ? 1 : 1000) : 180;
  const easing = style.getPropertyValue('--ui-ease-out').trim() || 'cubic-bezier(0.16, 1, 0.3, 1)';
  const animation = host.animate([
    { opacity: 0.86, transform: 'translateY(6px)' },
    { opacity: 1, transform: 'translateY(0)' },
  ], { duration, easing });
  const entry = { host, animation };
  active = entry;
  const finish = () => { if (active === entry) active = null; };
  void animation.finished.then(finish, finish);
}
