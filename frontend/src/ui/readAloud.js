/* ui/readAloud.js — "read aloud" for assistant messages
 * (P_chatgpt-landing; cloud voice added in the LobeHub-alignment M4).
 *
 * Voice order:
 *   1. Provider voice — POST /api/tts proxies to the active built-in
 *      provider's speech endpoint and returns audio bytes. Anything that
 *      can leave the device already does for chat, so this only ships
 *      message text over the same authenticated channel.
 *   2. Platform voice — `window.speechSynthesis`, no network. Used
 *      automatically whenever the cloud voice is unavailable (no
 *      provider, offline, upstream error, or the browser blocks autoplay).
 *
 * Only one voice plays at a time: starting a new one (or clicking the
 * same button again) cancels whatever is currently speaking. The active
 * button gets an `is-speaking` class so the CSS can swap the speaker
 * icon for a stop affordance and animate it.
 */

var _activeBtn = null;
var _cloudAudio = null;
var _cloudAbort = null;

var CLOUD_DISABLED_KEY = "socrates-readaloud-cloud-disabled";

function _cloudEnabled() {
  try {
    return localStorage.getItem(CLOUD_DISABLED_KEY) !== "1";
  } catch (_) { return true; }
}

/* When the cloud voice has failed repeatedly the session stops trying so
   every click does not pay a network round trip before falling back. */
var _cloudFailures = 0;
var _CLOUD_FAILURE_LIMIT = 2;

function _supported() {
  return typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof window.SpeechSynthesisUtterance === "function";
}

function _notify(msg) {
  if (typeof window.showToast === "function") window.showToast(msg);
}

/* Pick a voice roughly matching the current UI language so zh replies
   are read with a Chinese voice when the platform provides one. */
function _pickVoice(lang) {
  try {
    var voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    var want = (lang || "").slice(0, 2).toLowerCase();
    var match = voices.find(function (v) { return (v.lang || "").slice(0, 2).toLowerCase() === want; });
    return match || null;
  } catch (_) { return null; }
}

function _clearActive() {
  if (_activeBtn) {
    _activeBtn.classList.remove("is-speaking");
    _activeBtn.setAttribute("aria-pressed", "false");
  }
  _activeBtn = null;
}

export function stopSpeaking() {
  if (_cloudAudio) {
    try { _cloudAudio.pause(); } catch (_) {}
    try { _cloudAudio.src = ""; } catch (_) {}
    _cloudAudio = null;
  }
  if (_cloudAbort) {
    try { _cloudAbort.abort(); } catch (_) {}
    _cloudAbort = null;
  }
  if (_supported()) {
    try { window.speechSynthesis.cancel(); } catch (_) {}
  }
  _clearActive();
}

/* ── Cloud voice ──────────────────────────────────────────────────── */

function _speakCloud(clean, lang) {
  if (!_cloudEnabled() || _cloudFailures >= _CLOUD_FAILURE_LIMIT || typeof window.fetch !== "function" || typeof window.Audio !== "function") {
    return Promise.resolve(false);
  }
  var controller = typeof AbortController === "function" ? new AbortController() : null;
  _cloudAbort = controller;
  return window.fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ text: clean.slice(0, 20000), lang: (lang || "").slice(0, 2) }),
    signal: controller ? controller.signal : undefined,
  }).then(function (resp) {
    if (!resp.ok) throw new Error("tts_http_" + resp.status);
    return resp.blob();
  }).then(function (blob) {
    return new Promise(function (resolve, reject) {
      var audio = new window.Audio();
      audio.src = window.URL.createObjectURL(blob);
      audio.onended = function () {
        _clearActive();
        resolve(true);
      };
      audio.onerror = function () {
        reject(new Error("tts_playback_failed"));
      };
      _cloudAudio = audio;
      var played = audio.play();
      if (played && typeof played.catch === "function") {
        played.catch(function () { reject(new Error("tts_autoplay_blocked")); });
      }
    });
  }).then(function (played) {
    _cloudFailures = 0;
    return played !== false;
  }).catch(function () {
    _cloudFailures += 1;
    if (_cloudFailures >= _CLOUD_FAILURE_LIMIT) {
      try { localStorage.setItem(CLOUD_DISABLED_KEY, "1"); } catch (_) {}
    }
    return false;
  }).finally(function () {
    _cloudAbort = null;
  });
}

/* ── Platform voice ───────────────────────────────────────────────── */

function _speakPlatform(clean, lang) {
  return new Promise(function (resolve) {
    var utter = new window.SpeechSynthesisUtterance(clean);
    utter.lang = lang;
    var voice = _pickVoice(lang);
    if (voice) utter.voice = voice;
    utter.onend = function () { _clearActive(); resolve(true); };
    utter.onerror = function () { _clearActive(); resolve(true); };
    try {
      window.speechSynthesis.speak(utter);
    } catch (_) {
      _clearActive();
      resolve(false);
    }
  });
}

/* Toggle read-aloud for a message. `btn` is the toolbar button that
   was clicked; `text` is the plain-text content to speak. Clicking the
   active button again (or any button while speaking) stops playback. */
export function toggleReadAloud(btn, text) {
  var clean = String(text || "").trim();
  if (!clean) { _notify("Nothing to read."); return; }

  var wasActive = _activeBtn === btn;
  var speaking = _activeBtn !== null || _cloudAudio !== null;
  /* Always stop the current voice first so we never overlap. */
  stopSpeaking();
  if (wasActive || speaking) return;

  var lang = (document.documentElement.lang || navigator.language || "en-US");

  _activeBtn = btn || null;
  if (_activeBtn) {
    _activeBtn.classList.add("is-speaking");
    _activeBtn.setAttribute("aria-pressed", "true");
  }

  /* Cloud first (matches the chat provider voice), platform fallback.
     The platform path also covers the "no fetch / unsupported" case, so
     a browser without Web Audio still gets a voice. */
  _speakCloud(clean, lang)
    .then(function (played) { return played ? played : _speakPlatform(clean, lang); })
    .then(function (played) {
      if (!played) {
        _clearActive();
        _notify("Read aloud could not start.");
      }
    });
}

/* Stop speaking if the user navigates away / resets the app. */
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", function () { try { stopSpeaking(); } catch (_) {} });
}
