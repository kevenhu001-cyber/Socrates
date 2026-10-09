import { toolCardView } from "./toolCardView.js";

/* ============================================================
   RUNNING-CARD ELAPSED TIMER (task 6.3, Req 3.2 / 3.3)
   A single shared ~250ms interval recomputes toolCardView(run,
   Date.now()) for every running card and writes the live elapsed
   time into that card's .agent-tool-status. The interval stops the
   moment no running cards remain, so idle chats carry no timer.

   Terminal transition: recordToolResult()/cancel() in chat/
   toolRuntime.ts flips card.dataset.toolState away from "running"
   (to complete | error | cancelled). We watch that attribute per
   card and, on the first terminal value (already latched upstream by
   transitionToolRun), stop the timer, write the final total-duration
   timeLabel, and unregister the card.
   ============================================================ */
var RUNNING_TOOL_CARDS = new Set();
var TOOL_CARD_TIMER = null;
var TOOL_CARD_TICK_MS = 250;

/* Terminal data-tool-state values written by toolRuntime.ts. Anything
   other than "running" (or a still-preparing state) is terminal for
   the purposes of the card timer. */
function isRunningToolState(state) {
  return state === "running";
}

/* Synthesize the minimal ToolRun toolCardView() needs from the card's
   own DOM. startedAt is stamped when the card is registered; the phase
   is derived from data-tool-state so terminal cards report their final
   endedAt-startedAt span. */
function toolRunFromCard(card, now) {
  var startedAt = Number(card.dataset.startedAt) || now;
  var state = card.dataset.toolState || "running";
  if (isRunningToolState(state)) {
    return { id: "", tool: "", phase: "running", startedAt: startedAt };
  }
  // Map the DOM terminal states to a terminal ToolRun phase so
  // toolCardView reports running=false and the total-duration span.
  var phase = state === "error" ? "failed" : state === "cancelled" ? "cancelled" : "succeeded";
  var endedAt = Number(card.dataset.endedAt) || now;
  return { id: "", tool: "", phase: phase, startedAt: startedAt, endedAt: endedAt };
}

function writeCardTimeLabel(card, label) {
  var status = card.querySelector(".agent-tool-status");
  if (status) status.textContent = label;
}

/* Finalize a card that has reached a terminal data-tool-state: stamp
   endedAt (once), write the final total-duration timeLabel, and remove
   it from the running set so the shared timer can stop. */
function finalizeToolCardTimer(card) {
  if (!card.dataset.endedAt) card.dataset.endedAt = String(Date.now());
  var view = toolCardView(toolRunFromCard(card, Date.now()), Date.now());
  writeCardTimeLabel(card, view.timeLabel);
  stopToolCardTimer(card);
}

function tickToolCards() {
  var now = Date.now();
  RUNNING_TOOL_CARDS.forEach(function (card) {
    if (!card || !card.isConnected) { stopToolCardTimer(card); return; }
    var state = card.dataset.toolState || "running";
    if (!isRunningToolState(state)) {
      // Terminal reached between ticks (no MutationObserver available or
      // it hasn't fired yet) — latch the final duration and drop out.
      finalizeToolCardTimer(card);
      return;
    }
    var view = toolCardView(toolRunFromCard(card, now), now);
    writeCardTimeLabel(card, view.timeLabel);
  });
}

function ensureToolCardTimer() {
  if (TOOL_CARD_TIMER != null) return;
  if (typeof setInterval !== "function") return;
  TOOL_CARD_TIMER = setInterval(tickToolCards, TOOL_CARD_TICK_MS);
}

function stopToolCardTimer(card) {
  if (card) {
    RUNNING_TOOL_CARDS.delete(card);
    if (card._toolStateObserver) {
      try { card._toolStateObserver.disconnect(); } catch (_) {
        // empty-catch: intentional — observer teardown must not block timer cleanup.
      }
      card._toolStateObserver = null;
    }
  }
  if (RUNNING_TOOL_CARDS.size === 0 && TOOL_CARD_TIMER != null) {
    clearInterval(TOOL_CARD_TIMER);
    TOOL_CARD_TIMER = null;
  }
}

/* Runtime owners call this when a stream is disposed before the card reaches
   a terminal event, so the shared interval cannot outlive its owner. */
export function stopToolCardTimerForCard(card) {
  stopToolCardTimer(card);
}

/* Register a freshly-mounted running card with the shared timer.
   Also attaches a MutationObserver on data-tool-state so the terminal
   transition is caught the instant toolRuntime.ts flips it, rather than
   waiting up to one tick. */
export function startToolCardTimer(card) {
  if (!card || RUNNING_TOOL_CARDS.has(card)) return;
  if (!card.dataset.startedAt) card.dataset.startedAt = String(Date.now());
  RUNNING_TOOL_CARDS.add(card);
  // Seed the label immediately so a running card never shows a stale
  // "Running" word for a full tick.
  var view = toolCardView(toolRunFromCard(card, Date.now()), Date.now());
  writeCardTimeLabel(card, view.timeLabel);
  if (typeof MutationObserver === "function") {
    var observer = new MutationObserver(function () {
      var state = card.dataset.toolState || "running";
      if (!isRunningToolState(state)) finalizeToolCardTimer(card);
    });
    try {
      observer.observe(card, { attributes: true, attributeFilter: ["data-tool-state"] });
      card._toolStateObserver = observer;
    } catch (_) { card._toolStateObserver = null; }
  }
  ensureToolCardTimer();
}
