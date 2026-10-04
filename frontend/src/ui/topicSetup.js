// src/ui/topicSetup.js — Phase C-2.3 extraction
import { getComposerMarkdown, getVisibleComposerSurface } from '../react/composer-input/controller.ts';
// Small helpers for the single composer:
//
//   autoResize(el)        — retained for older secondary textareas.
//   updateComposerBtn()   — toggle the composer primary button's active
//                            state based on the visible surface's draft
//                            value AND any pending attachments.
//
// Called from RichComposer change notifications and the flows that
// mutate attachments, so it is also exposed on `window` via
// src/windowExports.js (see C-2.3 mirror block).

/* autoResize — the chat composer is capped at 120px (≈6 lines),
   the topic setup textarea at 160px (≈8 lines). Reset height to
   "auto" first so shrinking text reflows correctly. */
export function autoResize(el){
  var maxH = 160;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, maxH) + "px";
}

/* The primary action follows the draft: waveform starts voice input when
   empty, arrow sends text/attachments, and Stop always remains enabled while
   a turn streams. The sibling microphone stays a direct dictation shortcut. */
export function updateComposerBtn(){
  var surface = "topic";
  try{ surface = getVisibleComposerSurface(); }catch(_){/* default above */}
  var v = "";
  try{ v = getComposerMarkdown(surface).trim(); }catch(_){/* default above */}
  var b = document.getElementById("composerPrimaryBtn");
  var hasAtt = typeof window.attachments !== "undefined"
    && Array.isArray(window.attachments)
    && window.attachments.length > 0;
  var canSend = !!(v || hasAtt);
  if(!b) return;
  if(canSend) b.classList.add("active"); else b.classList.remove("active");
  /* A live turn owns the button as Stop, so "nothing to send" must not
     disable it out from under the one action that can end the turn. */
  var streaming = b.dataset.stop === "1"
    || b.classList.contains("chat-stop")
    || b.classList.contains("agent-stop");
  var label = typeof window.t === "function"
    ? window.t(streaming ? "chat.stop" : canSend ? "chat.send" : "chrome.startVoiceInput")
    : (streaming ? "Stop generating" : canSend ? "Send" : "Voice input");
  b.setAttribute("aria-label", label);
  b.setAttribute("title", label);
  b.disabled = false;
  var wrap = document.getElementById("composerInputWrap");
  if(wrap) wrap.classList.toggle("has-text", !!(v || hasAtt));
}
