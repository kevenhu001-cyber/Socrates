// src/ui/pressFeedback.js — minimum-visible press state for every control.
//
// `:active` only lasts as long as the pointer is down. A fast tap on a
// touch screen releases within the same frame it pressed, so the press
// feedback in styles/polish/press.css never paints. This module mirrors
// the press onto `.is-pressed` and keeps it for at least MIN_PRESS_MS,
// then swaps to `.is-press-release` for the springy release.
//
// It only toggles classes: no preventDefault, no stopPropagation, so
// click handlers, focus, and text selection behave exactly as before.
//
// Geometry: a click fires while its control is still visibly pressed
// (inside the minimum hold, then the release spring), and
// getBoundingClientRect() includes the press scale. Anything that anchors
// to a control it was just clicked on — popovers, menus — must measure it
// with restingRect() below, both in the click handler and in any later
// frame that re-positions it, or it lands a pixel or two off.

export const MIN_PRESS_MS = 90;
export const RELEASE_MS = 180;

export const PRESSABLE_SELECTOR =
  'button, [role="button"], [role="tab"], [role="menuitem"], [role="option"]';

function noopTeardown() {
  /* Nothing was wired (no document), so there is nothing to undo. */
}

function isDisabled(el) {
  if (!el) return true;
  if (el.disabled === true) return true;
  const aria = el.getAttribute && el.getAttribute('aria-disabled');
  return aria === 'true';
}

function pressableFrom(target) {
  if (!target || typeof target.closest !== 'function') return null;
  const el = target.closest(PRESSABLE_SELECTOR);
  return el && !isDisabled(el) ? el : null;
}

/**
 * Wire the press mirror on `doc`. Idempotent per document. Returns a
 * teardown function (used by tests; the app wires once for its lifetime).
 *
 * `env` lets tests inject a clock and timers without a DOM shim.
 */
export function wirePressFeedback(doc, env) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || typeof d.addEventListener !== 'function') return noopTeardown;
  if (d.__socratesPressFeedback) return d.__socratesPressFeedback;
  const e = env || {};
  const now = e.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const setT = e.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const clearT = e.clearTimeout || ((id) => clearTimeout(id));

  /* Per-element bookkeeping: when the press began and any pending
     release/cleanup timer, so rapid re-presses restart cleanly. */
  const state = new WeakMap();
  let active = null;

  function entry(el) {
    let s = state.get(el);
    if (!s) { s = { pressedAt: 0, timer: 0 }; state.set(el, s); }
    return s;
  }

  function clearTimer(s) {
    if (s.timer) { clearT(s.timer); s.timer = 0; }
  }

  function release(el) {
    const s = entry(el);
    clearTimer(s);
    const finish = () => {
      s.timer = 0;
      el.classList.remove('is-pressed');
      el.classList.add('is-press-release');
      s.timer = setT(() => {
        s.timer = 0;
        el.classList.remove('is-press-release');
      }, RELEASE_MS);
    };
    const held = now() - s.pressedAt;
    if (held >= MIN_PRESS_MS) finish();
    else s.timer = setT(finish, MIN_PRESS_MS - held);
  }

  function onDown(ev) {
    /* Only the primary button / first touch presses a control. */
    if (ev && typeof ev.button === 'number' && ev.button !== 0) return;
    const el = pressableFrom(ev && ev.target);
    if (!el) return;
    if (active && active !== el) release(active);
    const s = entry(el);
    clearTimer(s);
    s.pressedAt = now();
    el.classList.remove('is-press-release');
    el.classList.add('is-pressed');
    active = el;
  }

  function onUp() {
    if (!active) return;
    const el = active;
    active = null;
    release(el);
  }

  const opts = { capture: true, passive: true };
  d.addEventListener('pointerdown', onDown, opts);
  d.addEventListener('pointerup', onUp, opts);
  d.addEventListener('pointercancel', onUp, opts);
  /* Losing the window mid-press (alt-tab, OS dialog) never delivers
     pointerup; treat it as a release. */
  d.addEventListener('visibilitychange', onUp, opts);

  const teardown = function () {
    d.removeEventListener('pointerdown', onDown, opts);
    d.removeEventListener('pointerup', onUp, opts);
    d.removeEventListener('pointercancel', onUp, opts);
    d.removeEventListener('visibilitychange', onUp, opts);
    delete d.__socratesPressFeedback;
  };
  d.__socratesPressFeedback = teardown;
  return teardown;
}

function parseLengths(value) {
  return String(value || '').trim().split(/\s+/).map((part) => parseFloat(part));
}

/**
 * The element's border box as laid out, without its own `scale` — i.e.
 * where a pressed control will be once the press has sprung back. Use it
 * to anchor anything to a control that may be mid-press. The press scale
 * is the only transform undone (styles/polish/press.css animates `scale`
 * alone, about the element's transform-origin); an element at rest
 * returns getBoundingClientRect() unchanged.
 */
export function restingRect(el) {
  const rect = el.getBoundingClientRect();
  let cs;
  try { cs = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null; } catch (_) { cs = null; }
  const scaleValue = cs ? cs.scale : '';
  if (!scaleValue || scaleValue === 'none') return rect;
  const scales = parseLengths(scaleValue);
  const sx = scales[0];
  const sy = Number.isFinite(scales[1]) ? scales[1] : sx;
  if (!(sx > 0) || !(sy > 0) || (sx === 1 && sy === 1)) return rect;
  const origin = parseLengths(cs.transformOrigin);
  const width = rect.width / sx;
  const height = rect.height / sy;
  /* transform-origin computes to px from the untransformed box's corner. */
  const ox = Number.isFinite(origin[0]) ? origin[0] : width / 2;
  const oy = Number.isFinite(origin[1]) ? origin[1] : height / 2;
  const left = rect.left - ox * (1 - sx);
  const top = rect.top - oy * (1 - sy);
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}
