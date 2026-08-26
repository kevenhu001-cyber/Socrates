import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreamScheduler } from '../src/render/streamScheduler.ts';

/* Task 2.4 wires createStreamScheduler into the main.js stream loop:
   append() calls push(delta) instead of the old per-chunk repaint, and the
   turn-end finish() path calls flushNow(). These tests pin the scheduler
   contract main.js depends on, driven by deterministic now/raf seams so no
   real clock or frame loop is needed. */

/* A manual rAF queue: raf(cb) enqueues; runFrame() drains one frame. */
function makeRaf() {
  const queue = [];
  const raf = (cb) => { queue.push(cb); };
  const runFrame = () => {
    const batch = queue.splice(0, queue.length);
    for (const cb of batch) cb();
  };
  return { raf, runFrame, get pending() { return queue.length; } };
}

test('push coalesces deltas into a single paint of the accumulated text', () => {
  const paints = [];
  let clock = 0;                       // starts past the first interval
  const { raf, runFrame } = makeRaf();
  const s = createStreamScheduler((full) => paints.push(full), () => clock, raf);

  s.push('a');
  s.push('b');
  s.push('c');
  // Three pushes, but schedule() dedupes to a single queued frame.
  clock = 1000;                        // ensure the tick is "due"
  runFrame();

  assert.deepEqual(paints, ['abc']);   // one coalesced paint, full accumulator
});

test('a not-yet-due tick reschedules instead of painting', () => {
  const paints = [];
  let clock = 0;
  const { raf, runFrame } = makeRaf();
  const s = createStreamScheduler((full) => paints.push(full), () => clock, raf);

  s.push('x');
  clock = 10;                          // below the 50ms first-screen tier
  runFrame();
  assert.deepEqual(paints, [], 'not painted before the interval elapses');

  clock = 60;                          // now past the 50ms tier
  runFrame();                          // the reschedule from the first tick fires
  assert.deepEqual(paints, ['x']);
});

test('flushNow forces an immediate paint of the accumulated text', () => {
  const paints = [];
  let clock = 0;
  const { raf } = makeRaf();           // deliberately never run a frame
  const s = createStreamScheduler((full) => paints.push(full), () => clock, raf);

  s.push('hello ');
  s.push('world');
  s.flushNow();                        // turn end: paint synchronously

  assert.deepEqual(paints, ['hello world']);
});

test('dispose clears the scheduled latch so later pushes can reschedule', () => {
  const paints = [];
  let clock = 1000;
  const { raf, runFrame, pending } = makeRaf();
  const s = createStreamScheduler((full) => paints.push(full), () => clock, raf);

  s.push('a');                         // schedules a frame
  s.dispose();                         // cancelScheduledRender() calls this
  s.push('b');                         // must be able to schedule again
  runFrame();                          // drains every queued frame

  // The accumulator is not reset by dispose, so the paint carries 'ab'.
  assert.ok(paints.includes('ab'), `expected a paint of "ab", got ${JSON.stringify(paints)}`);
});
