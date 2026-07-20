// src/ui/voiceInput.js — Placeholder for the ChatGPT-style mic button.
// Socrates doesn't ship ASR in the browser yet, so clicking the mic
// just shows a toast. The button is hidden automatically by CSS when
// the textarea has text (see .has-text rules in styles.css).

function _toast(msg) {
  if (typeof window.toastInfo === "function") {
    try { window.toastInfo(msg); return; } catch (_) {}
  }
  // Fall back to a small console hint if the toast helper isn't loaded.
  if (typeof console !== "undefined") console.info("[voiceInput]", msg);
}

function wireVoiceInput() {
  ["topicMicBtn", "chatMicBtn"].forEach(function (id) {
    var b = document.getElementById(id);
    if (!b) return;
    // Guard against double-binding (e.g. afterAuthEnter re-runs after
    // sign-in / sign-out cycles).
    if (b.dataset.voiceWired === "1") return;
    b.dataset.voiceWired = "1";
    b.addEventListener("click", function () {
      var key = "voice.toast";
      var msg = (typeof window.t === "function") ? window.t(key) : "Voice input coming soon";
      _toast(msg);
    });
  });
}

if (typeof window !== "undefined") {
  window.wireVoiceInput = wireVoiceInput;
}

export { wireVoiceInput };