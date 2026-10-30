/* ui/readAloud.ts — "read aloud" for assistant messages
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

let _activeBtn: HTMLElement | null = null;
let _cloudAudio: HTMLAudioElement|null = null;
let _cloudAbort: AbortController|null = null;

const CLOUD_DISABLED_KEY = "socrates-readaloud-cloud-disabled";

function _cloudEnabled() {
  try {
    return localStorage.getItem(CLOUD_DISABLED_KEY) !== "1";
  } catch (_) { return true; }
}

/* When the cloud voice has failed repeatedly the session stops trying so
   every click does not pay a network round trip before falling back. */
let _cloudFailures = 0;
const _CLOUD_FAILURE_LIMIT = 2;

function _supported() {
  return typeof window !== "undefined"
    && "speechSynthesis" in browserWindow
    && typeof browserWindow.SpeechSynthesisUtterance === "function";
}

import { showToast } from './toast.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


function _notify(msg: unknown) {
  showToast(msg);
}

/* Pick a voice roughly matching the current UI language so zh replies
   are read with a Chinese voice when the platform provides one. */
function _pickVoice(lang: any) {
  try {
    const voices = browserWindow.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    const want = (lang || "").slice(0, 2).toLowerCase();
    const match = voices.find(function (v) { return (v.lang || "").slice(0, 2).toLowerCase() === want; });
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
    try { _cloudAudio.pause(); } catch (error) { reportSwallow(error, 'ui/readAloud.impl.ts:70', 'expected'); }
    try { _cloudAudio.src = ""; } catch (error) { reportSwallow(error, 'ui/readAloud.impl.ts:71'); }
    _cloudAudio = null;
  }
  if (_cloudAbort) {
    try { _cloudAbort.abort(); } catch (error) { reportSwallow(error, 'ui/readAloud.impl.ts:75', 'expected'); }
    _cloudAbort = null;
  }
  if (_supported()) {
    try { browserWindow.speechSynthesis.cancel(); } catch (error) { reportSwallow(error, 'ui/readAloud.impl.ts:79', 'expected'); }
  }
  _clearActive();
}

/* ── Cloud voice ──────────────────────────────────────────────────── */

function _speakCloud(clean: string, lang: string, messageId?: string | number) {
  if (!_cloudEnabled() || _cloudFailures >= _CLOUD_FAILURE_LIMIT || typeof browserWindow.fetch !== "function" || typeof browserWindow.Audio !== "function") {
    return Promise.resolve(false);
  }
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  _cloudAbort = controller;
  const body: { text: string; lang: string; messageId?: string } = { text: clean.slice(0, 20000), lang: (lang || "").slice(0, 2) };
  /* P_tts-persist — forward the messageId so /api/tts can persist the
     synthesized audio in tts_results. The server still does the
     ownership check, so a forged id cannot read or write another
     user's audio. */
  if (messageId) body.messageId = String(messageId);
  return browserWindow.fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
    signal: controller ? controller.signal : undefined,
  }).then(function (resp) {
    if (!resp.ok) throw new Error("tts_http_" + resp.status);
    return resp.blob();
  }).then(function (blob) {
    return new Promise(function (resolve, reject) {
      const audio = new browserWindow.Audio();
      audio.src = browserWindow.URL.createObjectURL(blob);
      audio.onended = function () {
        _clearActive();
        resolve(true);
      };
      audio.onerror = function () {
        reject(new Error("tts_playback_failed"));
      };
      _cloudAudio = audio;
      const played = audio.play();
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
      try { localStorage.setItem(CLOUD_DISABLED_KEY, "1"); } catch (error) { reportSwallow(error, 'ui/readAloud.impl.ts:130', 'expected'); }
    }
    return false;
  }).finally(function () {
    _cloudAbort = null;
  });
}

/* ── Platform voice ───────────────────────────────────────────────── */

function _speakPlatform(clean: string|undefined, lang: string) {
  return new Promise(function (resolve) {
    const utter = new browserWindow.SpeechSynthesisUtterance(clean);
    utter.lang = lang;
    const voice = _pickVoice(lang);
    if (voice) utter.voice = voice;
    utter.onend = function () { _clearActive(); resolve(true); };
    utter.onerror = function () { _clearActive(); resolve(true); };
    try {
      browserWindow.speechSynthesis.speak(utter);
    } catch (_) {
      _clearActive();
      resolve(false);
    }
  });
}

/* Toggle read-aloud for a message. `btn` is the toolbar button that
   was clicked; `text` is the plain-text content to speak; `messageId`
   is the database id of the message (optional). Clicking the active
   button again (or any button while speaking) stops playback. The
   optional messageId is forwarded to /api/tts so the server can
   persist the synthesized audio in tts_results and replay it for
   free on subsequent reads of the same message. */
export function toggleReadAloud(btn: HTMLElement | null, text: unknown, messageId?: string | number) {
  const clean = String(text || "").trim();
  if (!clean) { _notify("Nothing to read."); return; }

  const wasActive = _activeBtn === btn;
  const speaking = _activeBtn !== null || _cloudAudio !== null;
  /* Always stop the current voice first so we never overlap. */
  stopSpeaking();
  if (wasActive || speaking) return;

  const lang = (document.documentElement.lang || navigator.language || "en-US");

  _activeBtn = btn || null;
  if (_activeBtn) {
    _activeBtn.classList.add("is-speaking");
    _activeBtn.setAttribute("aria-pressed", "true");
  }

  /* Cloud first (matches the chat provider voice), platform fallback.
     The platform path also covers the "no fetch / unsupported" case, so
     a browser without Web Audio still gets a voice. */
  _speakCloud(clean, lang, messageId)
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
  browserWindow.addEventListener("beforeunload", function () { try { stopSpeaking(); } catch (error) { reportSwallow(error, 'ui/readAloud.impl.ts:197'); } });
}
