/* Routes inline <think> blocks without holding ordinary prose behind a
 * fixed-size buffer. Its input is content deltas; visible prose and reasoning
 * leave through separate callbacks. */
import { reportSwallow } from '../util/reportSwallow.ts';

const OPEN_TAG = '<think>';
const CLOSE_TAG = '</think>';

function pendingOpenTagLength(text) {
  for (let length = Math.min(text.length, OPEN_TAG.length - 1); length > 0; length -= 1) {
    if (text.slice(-length) === OPEN_TAG.slice(0, length)) return length;
  }
  return 0;
}

export function createInlineThinkScanner({ onVisibleText, onThinking }) {
  let thinkOpen = false;
  let thinkTail = '';
  let thinkBuffer = '';

  function emitVisible(text) {
    if (!text) return;
    try { onVisibleText(text); }
    catch (error) { console.warn('[API stream] onDelta threw:', error && error.message); }
  }

  function emitThinking(text) {
    if (!text || typeof onThinking !== 'function') return;
    try { onThinking(text); }
    catch (error) { reportSwallow(error, 'chat/inlineThinkScanner.onThinking'); }
  }

  function flushVisibleTail() {
    if (thinkOpen || !thinkTail.length) return;
    const keepLength = pendingOpenTagLength(thinkTail);
    const visibleLength = thinkTail.length - keepLength;
    if (visibleLength <= 0) return;
    emitVisible(thinkTail.slice(0, visibleLength));
    thinkTail = thinkTail.slice(visibleLength);
  }

  function push(delta) {
    if (typeof delta !== 'string' || !delta.length) return;
    let pending = delta;
    while (true) {
      const probe = thinkTail + pending;
      if (!thinkOpen) {
        const openIndex = probe.indexOf(OPEN_TAG);
        if (openIndex === -1) {
          const visibleLength = probe.length - pendingOpenTagLength(probe);
          emitVisible(probe.slice(0, visibleLength));
          thinkTail = probe.slice(visibleLength);
          return;
        }

        emitVisible(probe.slice(0, openIndex));
        thinkTail = '';
        thinkOpen = true;
        thinkBuffer = '';
        pending = probe.slice(openIndex + OPEN_TAG.length);
        continue;
      }

      const closeIndex = probe.indexOf(CLOSE_TAG);
      if (closeIndex === -1) {
        const flushIndex = Math.max(0, probe.length - 7);
        thinkBuffer += probe.slice(0, flushIndex);
        thinkTail = probe.slice(flushIndex);
        if (typeof onThinking === 'function' && thinkBuffer.length >= 200) {
          emitThinking(thinkBuffer);
          thinkBuffer = '';
        }
        return;
      }

      thinkBuffer += probe.slice(0, closeIndex);
      emitThinking(thinkBuffer);
      thinkBuffer = '';
      thinkOpen = false;
      thinkTail = '';
      pending = probe.slice(closeIndex + CLOSE_TAG.length);
    }
  }

  function finish() {
    if (thinkOpen && typeof onThinking === 'function') {
      const remaining = thinkBuffer + thinkTail;
      emitThinking(remaining);
      thinkBuffer = '';
      thinkTail = '';
      thinkOpen = false;
      return remaining.length > 0;
    }
    if (!thinkOpen && thinkTail.length > 0) {
      flushVisibleTail();
      thinkTail = '';
    }
    return false;
  }

  return {
    push,
    flushVisibleTail,
    finish,
    get isOpen() { return thinkOpen; },
    get hasPendingThought() { return thinkBuffer.length > 0; },
  };
}
