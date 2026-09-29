import assert from 'node:assert/strict';
import test from 'node:test';

import { wirePressFeedback, restingRect, MIN_PRESS_MS, RELEASE_MS } from '../src/ui/pressFeedback.js';

/* Hand-rolled stubs: a fake document that records listeners, elements with
   a classList, and a manual clock + timer queue so the minimum-press window
   can be advanced deterministically. */
function makeEnv() {
  let t = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout(fn, ms) { const id = nextId++; timers.set(id, { at: t + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let due = null;
        for (const [id, timer] of timers) if (timer.at <= end && (!due || timer.at < due[1].at)) due = [id, timer];
        if (!due) break;
        timers.delete(due[0]);
        t = due[1].at;
        due[1].fn();
      }
      t = end;
    },
  };
}

function makeEl({ disabled = false, ariaDisabled = null } = {}) {
  const classes = new Set();
  const el = {
    disabled,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    getAttribute: (n) => (n === 'aria-disabled' ? ariaDisabled : null),
    closest() { return el; },
  };
  return el;
}

function makeDoc() {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    fire(type, ev) { for (const fn of listeners[type] || []) fn(ev); },
  };
}

test('a fast tap keeps .is-pressed for the minimum window, then releases', () => {
  const env = makeEnv();
  const doc = makeDoc();
  const btn = makeEl();
  wirePressFeedback(doc, env);
  doc.fire('pointerdown', { target: btn, button: 0 });
  assert.equal(btn.classList.contains('is-pressed'), true);
  env.advance(10);
  doc.fire('pointerup', { target: btn });
  assert.equal(btn.classList.contains('is-pressed'), true, 'still pressed inside the min window');
  env.advance(MIN_PRESS_MS - 11);
  assert.equal(btn.classList.contains('is-pressed'), true);
  env.advance(2);
  assert.equal(btn.classList.contains('is-pressed'), false);
  assert.equal(btn.classList.contains('is-press-release'), true);
  env.advance(RELEASE_MS);
  assert.equal(btn.classList.contains('is-press-release'), false);
});

test('a long press releases immediately on pointerup', () => {
  const env = makeEnv();
  const doc = makeDoc();
  const btn = makeEl();
  wirePressFeedback(doc, env);
  doc.fire('pointerdown', { target: btn, button: 0 });
  env.advance(400);
  doc.fire('pointerup', { target: btn });
  assert.equal(btn.classList.contains('is-pressed'), false);
  assert.equal(btn.classList.contains('is-press-release'), true);
});

test('pointercancel releases like pointerup', () => {
  const env = makeEnv();
  const doc = makeDoc();
  const btn = makeEl();
  wirePressFeedback(doc, env);
  doc.fire('pointerdown', { target: btn, button: 0 });
  env.advance(200);
  doc.fire('pointercancel', { target: btn });
  assert.equal(btn.classList.contains('is-pressed'), false);
});

test('disabled and aria-disabled controls are ignored; secondary buttons too', () => {
  const env = makeEnv();
  const doc = makeDoc();
  const a = makeEl({ disabled: true });
  const b = makeEl({ ariaDisabled: 'true' });
  const c = makeEl();
  wirePressFeedback(doc, env);
  doc.fire('pointerdown', { target: a, button: 0 });
  doc.fire('pointerdown', { target: b, button: 0 });
  doc.fire('pointerdown', { target: c, button: 2 });
  assert.equal(a.classList.contains('is-pressed'), false);
  assert.equal(b.classList.contains('is-pressed'), false);
  assert.equal(c.classList.contains('is-pressed'), false);
});

test('a re-press during release restarts the press cleanly', () => {
  const env = makeEnv();
  const doc = makeDoc();
  const btn = makeEl();
  wirePressFeedback(doc, env);
  doc.fire('pointerdown', { target: btn, button: 0 });
  env.advance(200);
  doc.fire('pointerup', { target: btn });
  env.advance(50);
  doc.fire('pointerdown', { target: btn, button: 0 });
  assert.equal(btn.classList.contains('is-press-release'), false);
  assert.equal(btn.classList.contains('is-pressed'), true);
  env.advance(RELEASE_MS);
  assert.equal(btn.classList.contains('is-pressed'), true, 'stale release timer must not clear the new press');
});

test('wiring is idempotent per document and tears down', () => {
  const env = makeEnv();
  const doc = makeDoc();
  const t1 = wirePressFeedback(doc, env);
  const t2 = wirePressFeedback(doc, env);
  assert.equal(t1, t2);
  assert.equal(doc.listeners.pointerdown.length, 1);
  t1();
  assert.equal(doc.listeners.pointerdown.length, 0);
});

/* ── restingRect ────────────────────────────────────────────────── */

function withComputedStyle(style, fn) {
  const previous = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => style;
  try { return fn(); } finally {
    if (previous === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previous;
  }
}

function scaledEl({ left, top, size, scale }) {
  /* A size×size box scaled about its centre, as press.css renders it. */
  const shrink = (size * (1 - scale)) / 2;
  return {
    getBoundingClientRect: () => ({
      left: left + shrink,
      top: top + shrink,
      width: size * scale,
      height: size * scale,
      right: left + shrink + size * scale,
      bottom: top + shrink + size * scale,
    }),
  };
}

test('restingRect undoes a mid-press scale about the transform origin', () => {
  const el = scaledEl({ left: 100, top: 200, size: 36, scale: 0.92 });
  const rect = withComputedStyle({ scale: '0.92', transformOrigin: '18px 18px' }, () => restingRect(el));
  assert.ok(Math.abs(rect.left - 100) < 1e-9);
  assert.ok(Math.abs(rect.top - 200) < 1e-9);
  assert.ok(Math.abs(rect.width - 36) < 1e-9);
  assert.ok(Math.abs(rect.bottom - 236) < 1e-9);
  assert.ok(Math.abs(rect.right - 136) < 1e-9);
});

test('restingRect handles a two-value scale and an off-centre origin', () => {
  /* 40×20 box at (10,10), scaled 0.5 × 0.8 about its top-left corner. */
  const el = { getBoundingClientRect: () => ({ left: 10, top: 10, width: 20, height: 16, right: 30, bottom: 26 }) };
  const rect = withComputedStyle({ scale: '0.5 0.8', transformOrigin: '0px 0px' }, () => restingRect(el));
  assert.deepEqual(
    [rect.left, rect.top, rect.width, rect.height],
    [10, 10, 40, 20],
  );
});

test('restingRect returns the plain rect for an element at rest', () => {
  const plain = { left: 1, top: 2, width: 3, height: 4, right: 4, bottom: 6 };
  const el = { getBoundingClientRect: () => plain };
  assert.equal(withComputedStyle({ scale: 'none', transformOrigin: '1.5px 2px' }, () => restingRect(el)), plain);
  assert.equal(withComputedStyle({ scale: '1', transformOrigin: '1.5px 2px' }, () => restingRect(el)), plain);
});
