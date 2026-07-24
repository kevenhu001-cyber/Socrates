/* ui/readAloud.ts — browser text-to-speech "read aloud" for assistant
 * messages (P_chatgpt-landing).
 *
 * Uses the platform `window.speechSynthesis` API — no backend, no
 * network, no audio ever leaves the device. Mirrors ChatGPT's
 * read-aloud affordance on assistant replies.
 *
 * Only one utterance plays at a time: starting a new one (or clicking
 * the same button again) cancels whatever is currently speaking. The
 * active button gets an `is-speaking` class so the CSS can swap the
 * speaker icon for a stop affordance and animate it.
 */

var _activeBtn: HTMLElement | null = null;

function _supported(): boolean {
  return typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof window.SpeechSynthesisUtterance === "function";
}

function _notify(msg: string): void {
  if (typeof (window as any).showToast === "function") (window as any).showToast(msg);
}

/* Pick a voice roughly matching the current UI language so zh replies
   are read with a Chinese voice when the platform provides one. */
function _pickVoice(lang: string): SpeechSynthesisVoice | null {
  try {
    var voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    var want = (lang || "").slice(0, 2).toLowerCase();
    var match = voices.find(function (v) { return (v.lang || "").slice(0, 2).toLowerCase() === want; });
    return match || null;
  } catch (_) { return null; }
}

export function stopSpeaking(): void {
  if (!_supported()) return;
  try { window.speechSynthesis.cancel(); } catch (_) {}
  _clearActive();
}

function _clearActive(): void {
  if (_activeBtn) {
    _activeBtn.classList.remove("is-speaking");
    _activeBtn.setAttribute("aria-pressed", "false");
  }
  _activeBtn = null;
}

/* Toggle read-aloud for a message. `btn` is the toolbar button that
   was clicked; `text` is the plain-text content to speak. Clicking the
   active button again (or any button while speaking) stops playback. */
export function toggleReadAloud(btn: HTMLElement, text: string): void {
  if (!_supported()) {
    _notify("Read aloud isn't supported in this browser.");
    return;
  }
  var wasActive = _activeBtn === btn;
  /* Always stop the current utterance first so we never overlap. */
  stopSpeaking();
  if (wasActive) return;

  var clean = String(text || "").trim();
  if (!clean) { _notify("Nothing to read."); return; }

  var lang = (document.documentElement.lang || navigator.language || "en-US");
  var utter = new SpeechSynthesisUtterance(clean);
  utter.lang = lang;
  var voice = _pickVoice(lang);
  if (voice) utter.voice = voice;
  utter.onend = _clearActive;
  utter.onerror = _clearActive;

  _activeBtn = btn || null;
  if (_activeBtn) {
    _activeBtn.classList.add("is-speaking");
    _activeBtn.setAttribute("aria-pressed", "true");
  }
  try {
    window.speechSynthesis.speak(utter);
  } catch (_) {
    _clearActive();
    _notify("Read aloud could not start.");
  }
}

/* Stop speaking if the user navigates away / resets the app. */
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", function () { try { stopSpeaking(); } catch (_) {} });
}
