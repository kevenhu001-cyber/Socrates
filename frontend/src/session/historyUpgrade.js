/* session/historyUpgrade.js — P_history-slice, viewport-priority variant.
 *
 * When loadSession paints a stored history it renders each message from the
 * server's `html` snapshot immediately, then re-renders every assistant turn
 * from its canonical `rawText` (buildAssistantHtml) so the CURRENT scaffold /
 * widget / visualization renderers upgrade old snapshots. That rebuild is the
 * expensive part: buildAssistantHtml runs marked + highlight.js + KaTeX and,
 * for turns with diagrams, queues mermaid work — the 2026-09-27 profile showed
 * it dominating the ~4 s tail after a switch and, because it walked the list
 * oldest-first, spending the first frames on turns far ABOVE the fold while
 * the just-scrolled-into-view latest answer stayed a stale snapshot.
 *
 * This module drives that queue two ways:
 *   1. NEAR burst — the newest `visibleTail` assistant turns (what sits in the
 *      viewport after loadSession anchors to the bottom) are upgraded first,
 *      two per animation frame, so the visible area becomes canonical fastest.
 *   2. FAR drain — the remaining (off-screen, older) turns are upgraded during
 *      idle time, so background rebuild never steals frames from the user's
 *      first interactions with the freshly opened session. A timeout guarantees
 *      it still finishes even if the tab stays busy.
 *
 * The session-id + slot-identity guards are inherited from the original
 * inline loop: a mid-drain switch to another session abandons the queue, and a
 * row whose clientId no longer matches the index (list changed under us) is
 * skipped rather than patched. Kept dependency-injected so it is unit-testable
 * without a DOM.
 */

function makeFrameScheduler() {
  return typeof requestAnimationFrame === 'function'
    ? function (cb) { return requestAnimationFrame(cb); }
    : function (cb) { return setTimeout(cb, 0); };
}

function makeIdleScheduler() {
  if (typeof requestIdleCallback === 'function') {
    return function (cb) { return requestIdleCallback(cb, { timeout: 2000 }); };
  }
  return function (cb) { return setTimeout(cb, 200); };
}

/**
 * Build the ordered upgrade list: newest assistant turns first.
 * @param {Array<{role:string, rawText:string, clientId:string}>} restoredMessages
 * @returns {Array<{index:number, clientId:string, rawText:string}>}
 */
export function planUpgradeOrder(restoredMessages) {
  const queue = [];
  for (let i = restoredMessages.length - 1; i >= 0; i--) {
    const rm = restoredMessages[i];
    if (rm && rm.role === 'assistant' && rm.rawText) {
      queue.push({ index: i, clientId: rm.clientId, rawText: rm.rawText });
    }
  }
  return queue;
}

/**
 * Drive the history rebuild. Returns a cancel() handle (mostly for tests /
 * callers that want to abort explicitly; the session-id guard already stops it
 * on a natural switch).
 *
 * @param {string} sessionId owning session id (guards the whole drain)
 * @param {Array<object>} restoredMessages the array just handed to replace-messages
 * @param {object} deps
 * @param {{read:(k:string)=>any, dispatch:(a:object)=>any}} deps.stateStore
 * @param {(rawText:string)=>string} deps.buildAssistantHtml
 * @param {(evt:object)=>void} deps.publish
 * @param {number} [deps.visibleTail] near-window size (default 20 turns)
 * @param {(cb:Function)=>number} [deps.raf]
 * @param {(cb:Function)=>number} [deps.ric]
 */
export function startHistoryUpgrade(sessionId, restoredMessages, deps) {
  const stateStore = deps.stateStore;
  const buildAssistantHtml = deps.buildAssistantHtml;
  const publish = deps.publish;
  const raf = deps.raf || makeFrameScheduler();
  const ric = deps.ric || makeIdleScheduler();
  const visibleTail = Number.isFinite(deps.visibleTail) ? deps.visibleTail : 20;

  const queue = planUpgradeOrder(restoredMessages);
  if (!queue.length) return { cancel: function () {} };

  const near = queue.slice(0, visibleTail);
  const far = queue.slice(visibleTail);
  let cancelled = false;

  function stillOwnsSession() {
    return !cancelled && stateStore.read('currentSessionId') === sessionId;
  }

  /* Upgrade one queued turn; returns true only when the row was found, its
     canonical html differs, and the store was patched. */
  function upgradeOne(item) {
    const live = stateStore.read('messages')[item.index];
    if (!live || live.clientId !== item.clientId) return false;
    let fresh;
    try { fresh = buildAssistantHtml(item.rawText); } catch (_) { return false; }
    if (fresh && fresh !== live.html) {
      stateStore.dispatch({
        type: 'session/update-message',
        index: item.index,
        clientId: item.clientId,
        patch: { html: fresh },
      });
      return true;
    }
    return false;
  }

  function runBatch(items, from, count) {
    let changed = false;
    let i = from;
    const stop = Math.min(from + count, items.length);
    for (; i < stop; i++) {
      if (upgradeOne(items[i])) changed = true;
    }
    if (changed) publish({ type: 'state-synced', reason: 'history-html-upgraded' });
    return i;
  }

  // NEAR: two per frame, on the animation clock, so the visible tail resolves
  // within the first dozen frames after the switch.
  let ni = 0;
  function nearSlice() {
    if (!stillOwnsSession()) return;
    ni = runBatch(near, ni, 2);
    if (ni < near.length) { raf(nearSlice); return; }
    startFar();
  }

  // FAR: idle clock with a timeout, three per slice. Guarantees eventual
  // completion without competing with the near burst or user input.
  let fi = 0;
  function farSlice() {
    if (!stillOwnsSession()) return;
    fi = runBatch(far, fi, 3);
    if (fi < far.length) ric(farSlice);
  }
  function startFar() {
    if (far.length) ric(farSlice);
  }

  raf(nearSlice);

  return {
    cancel: function () { cancelled = true; },
    // test seam: expose how the split landed
    _stats: function () { return { near: near.length, far: far.length }; },
  };
}
