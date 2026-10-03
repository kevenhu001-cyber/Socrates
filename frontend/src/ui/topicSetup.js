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

/* Light up the primary button when the visible surface's draft has
   non-empty text OR there are pending attachments (P_attachments-tutor
   and P_attachments — a dropped file with an empty editor is still a
   valid turn). P_composer-single: one button, one wrap; the surface is
   read live so landing and chat share the updater.
   P_chatgpt-landing — also toggle .has-text on the input wrap so the
   CSS can swap the mic icon for the up-arrow on the send button. */
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
  /* Empty state is the voice-input action (the click handler routes a
     non-active press to toggleSpeechInput), so the control is never
     disabled — only its label/icon swap with the draft state. */
  var key = canSend ? "chat.send" : "voice.input";
  var fallback = canSend ? "Send" : "Voice input";
  var label = typeof window.t === "function" ? window.t(key) : fallback;
  b.setAttribute("aria-label", label);
  b.setAttribute("title", label);
  b.disabled = false;
  var wrap = document.getElementById("composerInputWrap");
  if(wrap) wrap.classList.toggle("has-text", !!(v || hasAtt));
}
