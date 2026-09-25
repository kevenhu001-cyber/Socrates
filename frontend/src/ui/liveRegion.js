/* ui/liveRegion.js — a single visually-hidden polite announcer for DOM
 * updates that never move focus (finished streaming replies).
 *
 * Text is announced once at completion, not per delta: an aria-live node
 * mutated at token cadence floods the screen-reader queue and renders the
 * turn unusable. Callers pass plain text (markdown source is acceptable —
 * NVDA/VoiceOver read it verbatim, which matches what ChatGPT announces).
 */

var region = null;

function ensureRegion() {
  if (region && region.isConnected) return region;
  region = document.createElement("div");
  region.id = "srLiveRegion";
  region.className = "visually-hidden";
  region.setAttribute("aria-live", "polite");
  region.setAttribute("aria-atomic", "true");
  document.body.appendChild(region);
  return region;
}

/* Announce `text` to assistive tech. Re-setting textContent with an
 * identical string is a no-op for some ATs, so clear first and write on
 * the next frame; very long transcripts are truncated — a screen reader
 * can still reach the full text in the message row itself. */
var MAX_ANNOUNCE_CHARS = 5000;
export function announceTranscript(text) {
  try {
    if (typeof document === "undefined" || !document.body) return;
    var value = String(text == null ? "" : text).trim();
    if (!value) return;
    if (value.length > MAX_ANNOUNCE_CHARS) {
      value = value.slice(0, MAX_ANNOUNCE_CHARS) + "…";
    }
    var node = ensureRegion();
    node.textContent = "";
    requestAnimationFrame(function () {
      if (node.isConnected) node.textContent = value;
    });
  } catch (_) { /* never break the stream for an announcement */ }
}
