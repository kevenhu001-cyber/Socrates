// src/ui/topicSetup.js — Phase C-2.3 extraction
// Small helpers for the topic-setup and chat composer areas:
//
//   autoResize(el)        — grow a textarea up to its max-height as
//                            the user types, then stop.
//   updateStartBtn()      — toggle the topic-setup "Start" button's
//                            active state based on the input value.
//   updateSendBtn()       — toggle the chat "Send" button's active
//                            state based on the chat input value AND
//                            any pending attachments.
//
// All three are called from inline `oninput=` / `onclick=` handlers
// in index.html, so they are also exposed on `window` via
// src/windowExports.js (see C-2.3 mirror block).

/* autoResize — the chat composer is capped at 120px (≈6 lines),
   the topic setup textarea at 160px (≈8 lines). Reset height to
   "auto" first so shrinking text reflows correctly. */
export function autoResize(el){
  var maxH = el.id === "chatInputArea" ? 120 : 160;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, maxH) + "px";
}

/* Light up the "Start" button when the topic input has non-empty
   text OR pending attachments (P_attachments-tutor — a user can drop
   a PDF in tutor mode, leave the textarea empty, and Begin must
   still be active). */
export function updateStartBtn(){
  var v = document.getElementById("topicInput").value.trim();
  var b = document.getElementById("startBtn");
  var hasAtt = typeof window.attachments !== "undefined"
    && Array.isArray(window.attachments)
    && window.attachments.length > 0;
  if(v || hasAtt) b.classList.add("active"); else b.classList.remove("active");
}

/* Light up the "Send" button when there's text OR pending attachments
   (P_attachments: a user can attach an image, leave the textarea
   empty, and the send button must still look active). */
export function updateSendBtn(){
  var v = document.getElementById("chatInputArea").value.trim();
  var b = document.getElementById("sendBtn");
  var hasAtt = typeof window.attachments !== "undefined"
    && Array.isArray(window.attachments)
    && window.attachments.length > 0;
  if(v || hasAtt) b.classList.add("active"); else b.classList.remove("active");
}