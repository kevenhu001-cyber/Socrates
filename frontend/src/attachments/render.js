// src/attachments/render.js — Phase C-2.4 extraction
// DOM-side rendering and event wiring for the attachment chip strip
// above each composer (chat-mode follow-up AND tutor-mode topic
// setup). Module state (the pending attachments array) lives in
// src/attachments.js; this module just mirrors it into the DOM and
// wires the paperclip button + drag/drop + paste for every wired
// input. Both composers share the same attachments[] store — the
// pending files travel with whichever submit button fires next.
//
// All inline handler references (window.renderAttachmentChips /
// window.setupAttachmentInput) are re-bound in src/windowExports.js.
import { attachments, addFiles, removeAttachment } from '../attachments.js';

// i18n translator is bound on `window.t` by i18n.js. We don't import
// the function directly because i18n.js is a side-effect module.
const t = (typeof window !== "undefined" ? window.t : null);

/* React migration bridge — fires whenever the pending attachments array
   changes so the React compatibility root can mirror the chip row via
   useSyncExternalStore. Installed by
   frontend/src/react/attachments/attachmentsStore.ts under `?react=1`;
   legacy mode never sees a subscriber so the helper is a cheap no-op.
   The publish always runs (before the React-owns guard) so subscribers
   observe mutations even when React renders the chips. */
function _publishAttachments(){
  try{
    var bridge = window.__socratesAttachmentsBridge;
    if(bridge && typeof bridge.publish === "function"){
      bridge.publish({
        attachments: attachments.slice(),
      });
    }
  }catch(_){ /* swallow — bridge is best-effort */ }
}

/* showToast is still defined in main.js — we read it lazily so this
   module doesn't take a hard dependency on main.js's internal state. */
function toast(msg, ms){
  if(typeof window !== "undefined" && typeof window.showToast === "function"){
    window.showToast(msg, ms);
  }
}

/* P_attachments-multimodal — surface the rejection via toast
   preferring the i18n-aware multimodal-gate message when every
   rejection is from the gate. */
function surfaceRejectionToast(res){
  if(!res || !res.rejected || !res.rejected.length) return;
  console.warn("[attachments] rejected:", res.rejected);
  const hasNonMm = res.rejected.some(function(r){ return r.indexOf("not multimodal") === -1; });
  if(!hasNonMm){
    toast((typeof t === "function" ? t("attach.notMultimodal") : null)
      || "The active model can't view images. Add a multimodal provider or remove image attachments.");
  } else {
    toast(res.rejected[0]);
  }
}

/* P_multi-input-attachment — every composer that wants attachments
   registers itself here. setupAttachmentInput pushes onto the list;
   document-level drag/drop iterates over the list to decide which
   wrap (if any) the user dropped onto, and renderAttachmentChips()
   writes the shared `attachments` array into every chips container
   so the user sees pending files regardless of which composer they
   attached them from. Each entry is a small DOM-id bag; the doc-
   level handler keeps a single set of listeners (added once) and
   decides per-event which wrap is in scope. */
const WIRED_INPUTS = [];

/* Render the pending-attachment chip strip into every wired chips
   container. Called after addFiles / removeAttachment /
   resetAttachments. */
export function renderAttachmentChips(){
  _publishAttachments();
}

/* RAF-throttled full rebuild — called on structural changes (add /
   remove / reset). Coalesces rapid progress-fire into a single anim
   frame so the DOM isn't rebuilt 30× per second per file. */
let _renderRAF = null;
function renderAndRefresh(){
  if (_renderRAF) return;
  _renderRAF = requestAnimationFrame(function(){
    _renderRAF = null;
    renderAttachmentChips();
    refreshAllSendBtns();
  });
}

/* Lightweight progress-only update — directly finds existing pending
   chips in the DOM and updates the progress-fill width, WITHOUT
   destroying and recreating chip elements. Called on every progress
   tick from addFiles(). This avoids the jank of a full DOM rebuild
   (which transitions the progress bar's width smoothly). */
let _progressRAF = null;
function updateProgressOnly(){
  if (_progressRAF) return;
  _progressRAF = requestAnimationFrame(function(){
    _progressRAF = null;
    const ids = WIRED_INPUTS.map(function(w){ return w.chipsId; }).filter(Boolean);
    if(!ids.length){
      var fb = document.getElementById("attachmentChips");
      if(fb) ids.push("attachmentChips");
    }
    ids.forEach(function(id){
      var wrap = document.getElementById(id);
      if(!wrap) return;
      var chips = wrap.querySelectorAll('.attachment-chip.pending[data-id]');
      for(var ci = 0; ci < chips.length; ci++){
        var chip = chips[ci];
        var aid = chip.getAttribute('data-id');
        if(!aid) continue;
        /* Find the matching attachment entry (O(n) but n ≤ 6). */
        var entry = null;
        for(var ai = 0; ai < attachments.length; ai++){
          if(attachments[ai].id === aid){ entry = attachments[ai]; break; }
        }
        if(!entry || !entry.pending || typeof entry.progress !== 'number') continue;
        var fill = chip.querySelector('.attachment-chip-progress-fill');
        if(fill) fill.style.width = Math.min(entry.progress, 100) + '%';
      }
    });
  });
}

/* Run every wired input's "send button refresher" (updateSendBtn for
   chat, updateStartBtn for tutor). Keeps each button in sync with
   pending attachments without the per-input wiring needing to know
   about the others. */
function refreshAllSendBtns(){
  WIRED_INPUTS.forEach(function(w){
    if(typeof window !== "undefined" && typeof window[w.updateBtnName] === "function"){
      try{ window[w.updateBtnName](); }catch(_){}
    }
  });
}

/* Returns the wired-input whose wrap contains the event target, or
   null if the event happened outside every registered wrap. */
function findWiredForTarget(target){
  if(!target) return null;
  for(let i = 0; i < WIRED_INPUTS.length; i++){
    const w = WIRED_INPUTS[i];
    const el = document.getElementById(w.wrapId);
    if(el && el.contains(target)) return w;
  }
  return null;
}

/* Wire one composer. opts:
 *   btnId        — paperclip button id (opens the hidden file input)
 *   inputId      — hidden file input id
 *   wrapId       — composer container (drop zone + visual hint)
 *   textareaId   — textarea id (clipboard paste handler)
 *   barId        — input bar id (full-doc drop visual hint)
 *   chipsId      — chips container id (renderAttachmentChips target)
 *   updateBtnName — name of the function on window to call after
 *                   mutations (updateSendBtn for chat, updateStartBtn
 *                   for tutor)
 * Called once per composer; safe to call multiple times for the same
 * ids (de-duplicated by chipsId). */
export function setupAttachmentInput(opts){
  if(!opts || !opts.inputId || !opts.wrapId) return;
  // De-dup: if a config with the same chipsId is already wired, skip.
  if(opts.chipsId && WIRED_INPUTS.some(function(w){ return w.chipsId === opts.chipsId; })) return;

  const btn = document.getElementById(opts.btnId);
  const input = document.getElementById(opts.inputId);
  const wrap = document.getElementById(opts.wrapId);
  const textarea = opts.textareaId ? document.getElementById(opts.textareaId) : null;
  const bar = opts.barId ? document.getElementById(opts.barId) : null;
  if(!input || !wrap) return;

  const cfg = {
    btnId: opts.btnId,
    inputId: opts.inputId,
    wrapId: opts.wrapId,
    textareaId: opts.textareaId || null,
    barId: opts.barId || null,
    chipsId: opts.chipsId || null,
    updateBtnName: opts.updateBtnName || "updateSendBtn",
  };
  WIRED_INPUTS.push(cfg);

  if(btn) btn.onclick = function(){
    /* Reset value first so re-selecting the same file fires `change`. */
    input.value = "";
    input.click();
  };
  input.onchange = async function(){
    if(!input.files || !input.files.length) return;
    const res = await addFiles(input.files, renderAndRefresh, updateProgressOnly);
    refreshAllSendBtns();
    if(res.rejected && res.rejected.length){
      if(btn) {
        btn.classList.add("has-error");
        setTimeout(function(){ btn.classList.remove("has-error"); }, 1500);
      }
      surfaceRejectionToast(res);
    }
  };

  // Drag-and-drop: visual hint + accept drops on this input wrap.
  ["dragenter","dragover"].forEach(function(evt){
    wrap.addEventListener(evt, function(e){
      e.preventDefault(); e.stopPropagation();
      wrap.classList.add("drag-over");
    });
  });
  ["dragleave","drop"].forEach(function(evt){
    wrap.addEventListener(evt, function(e){
      e.preventDefault(); e.stopPropagation();
      wrap.classList.remove("drag-over");
    });
  });
  wrap.addEventListener("drop", async function(e){
    const dt = e.dataTransfer;
    if(!dt || !dt.files || !dt.files.length) return;
    const res = await addFiles(dt.files, renderAndRefresh, updateProgressOnly);
    surfaceRejectionToast(res);
  });

  /* P_paste-attach — clipboard paste handler for the composer.
     When the user pastes an image (e.g. screenshot from clipboard),
     intercept it and send through addFiles() instead of dropping raw
     base64 text into the textarea. Text-only pastes pass through
     unchanged. */
  if(textarea){
    textarea.addEventListener("paste", async function(e){
      const items = e.clipboardData && e.clipboardData.items;
      if(!items || !items.length) return;
      const files = [];
      for(let i = 0; i < items.length; i++){
        const item = items[i];
        if(item.kind === "file" && item.getAsFile){
          const f = item.getAsFile();
          if(f) files.push(f);
        }
      }
      if(!files.length) return;
e.preventDefault();
    e.stopPropagation();
    const res = await addFiles(files, renderAndRefresh, updateProgressOnly);
    if(res.added > 0){
        toast(res.added + " file" + (res.added > 1 ? "s" : "") + " pasted");
      }
      surfaceRejectionToast(res);
    });
  }
}

/* The compact composer menu owns the visible + button; file upload is one
 * of its actions rather than the only action. */
export function openAttachmentPicker(inputId){
  const input = document.getElementById(inputId);
  if(!input) return;
  input.value = "";
  input.click();
}

/* Hook into module load — wire document-level drag/drop once,
 * then call setupAttachmentInput for each known composer. */
let docDragWired = false;
function wireDocumentDrag(){
  if(docDragWired) return;
  docDragWired = true;

  let docDragCount = 0;
  document.addEventListener("dragenter", function(e){
    if(!e.dataTransfer || !e.dataTransfer.types) return;
    let hasFile = false;
    for(let di = 0; di < e.dataTransfer.types.length; di++){
      if(e.dataTransfer.types[di] === "Files"){ hasFile = true; break; }
    }
    if(!hasFile) return;
    docDragCount++;
    if(docDragCount === 1){
      // Highlight every wired wrap + bar so the user sees feedback
      // anywhere on the page.
      WIRED_INPUTS.forEach(function(w){
        const el = document.getElementById(w.wrapId);
        if(el) el.classList.add("drag-over");
        if(w.barId){
          const bar = document.getElementById(w.barId);
          if(bar) bar.classList.add("drag-over-doc");
        }
      });
    }
  });
  document.addEventListener("dragleave", function(e){
    if(!e.dataTransfer || !e.dataTransfer.types) return;
    let hasFile = false;
    for(let di = 0; di < e.dataTransfer.types.length; di++){
      if(e.dataTransfer.types[di] === "Files"){ hasFile = true; break; }
    }
    if(!hasFile) return;
    docDragCount--;
    if(docDragCount <= 0){
      docDragCount = 0;
      WIRED_INPUTS.forEach(function(w){
        const el = document.getElementById(w.wrapId);
        if(el) el.classList.remove("drag-over");
        if(w.barId){
          const bar = document.getElementById(w.barId);
          if(bar) bar.classList.remove("drag-over-doc");
        }
      });
    }
  });
  document.addEventListener("drop", async function(e){
    if(!e.dataTransfer || !e.dataTransfer.types) return;
    let hasFile = false;
    for(let di = 0; di < e.dataTransfer.types.length; di++){
      if(e.dataTransfer.types[di] === "Files"){ hasFile = true; break; }
    }
    if(!hasFile) return;
    // Clear doc-level visual hint on every wired bar.
    WIRED_INPUTS.forEach(function(w){
      if(w.barId){
        const bar = document.getElementById(w.barId);
        if(bar) bar.classList.remove("drag-over-doc");
      }
    });
    // If the drop landed on a specific composer, that composer's
    // own handler already processed it. Otherwise the drop is on
    // the page background — adopt it for whichever composer the user
    // is currently looking at (the active one).
    if(findWiredForTarget(e.target)) return;
    const dt = e.dataTransfer;
    if(!dt || !dt.files || !dt.files.length) return;
    e.preventDefault();
    e.stopPropagation();
    const res = await addFiles(dt.files, renderAndRefresh, updateProgressOnly);
    surfaceRejectionToast(res);
  });
}

let booted = false;
function autoWire(){
  if(booted) return;
  booted = true;
  wireDocumentDrag();
  // Chat-mode composer.
  setupAttachmentInput({
    inputId: "attachInput",
    wrapId: "chatInputWrap",
    textareaId: "chatInputArea",
    barId: "chatInputBar",
    chipsId: "attachmentChips",
    updateBtnName: "updateSendBtn",
  });
  // Tutor-mode topic setup.
  setupAttachmentInput({
    inputId: "topicAttachInput",
    wrapId: "topicInputWrap",
    textareaId: "topicInput",
    barId: "topicSetup",
    chipsId: "topicAttachmentChips",
    updateBtnName: "updateStartBtn",
  });
}
/* P_timing-DCL — the Vite IIFE evaluates before the DOM is ready,
 * so any module-level code that queries getElementById returns null.
 * The only reliable way to wire DOM-dependent behaviour is
 * DOMContentLoaded, which fires once after the document is fully
 * parsed — see DOMContentLoaded support table. */
function dcl(){
  if(dcl.ran)return; dcl.ran=true;
  autoWire();
}
if(typeof window !== "undefined"){
  window.addEventListener("DOMContentLoaded", dcl);
  /* If the script runs after DOMContentLoaded (rare — Vite HMR,
     extension injection, SSR hydration), fire immediately. */
  if(document.readyState !== "loading"){ try{ dcl(); }catch(_){} }
}
