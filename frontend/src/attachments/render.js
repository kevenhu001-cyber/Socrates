// src/attachments/render.js — Phase C-2.4 extraction
// DOM-side rendering and event wiring for the attachment chip strip
// above the single composer. Module state (the pending attachments
// array) lives in src/attachments.js; this module just mirrors it
// into the DOM and wires the paperclip button + drag/drop + paste.
// The composer shell moves between the landing slot and the chat slot
// (P_composer-single) but stays one node, so one wiring covers both.
//
// All inline handler references (window.renderAttachmentChips /
// window.setupAttachmentInput) are re-bound in src/windowExports.js.
import { attachments, addFiles, retryAttachment } from '../attachments.js';
import { showToast } from '../ui/toast.js';

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

/* Rejections surface per-file through addFiles' onRejected callback
   (showToast) so a slow in-flight upload never delays them. Identical
   messages inside a short window collapse into one toast — selecting
   six over-quota files used to fire six identical toasts. */
let _lastToastMsg = '';
let _lastToastAt = 0;
function dedupToast(msg) {
  const text = String(msg || '');
  if (!text) return;
  const now = Date.now();
  if (text === _lastToastMsg && now - _lastToastAt < 2000) return;
  _lastToastMsg = text;
  _lastToastAt = now;
  showToast(text);
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

/* Error-chip retry — flips a failed upload back to pending and re-runs
   the job against the retained File handle, then re-syncs the send
   buttons (a failed chip still counts toward activation). */
export function retryComposerAttachment(id){
  const ok = retryAttachment(id, renderAndRefresh);
  refreshAllSendBtns();
  return ok;
}

export async function addComposerFiles(files, source){
  const list = Array.from(files || []);
  if(!list.length) return { added:0, rejected:[] };
  const res = await addFiles(list, renderAndRefresh, updateProgressOnly, dedupToast);
  refreshAllSendBtns();
  if(source === "paste" && res.added > 0){
    dedupToast(res.added + " file" + (res.added > 1 ? "s" : "") + " pasted");
  }
  return res;
}

/* Lightweight progress-only update — rAF-coalesced bridge publish so the
   React chip row re-renders the "Uploading… n%" meta at most once per
   frame instead of rebuilding DOM per progress event. */
let _progressRAF = null;
function updateProgressOnly(){
  if (_progressRAF) return;
  _progressRAF = requestAnimationFrame(function(){
    _progressRAF = null;
    _publishAttachments();
  });
}

/* Run the wired input's "send button refresher" (updateComposerBtn).
   Keeps the primary button in sync with pending attachments. */
function refreshAllSendBtns(){
  WIRED_INPUTS.forEach(function(w){
    if(typeof window !== "undefined" && typeof window[w.updateBtnName] === "function"){
      try{ window[w.updateBtnName](); }catch(_){}
    }
  });
}

/* Bar ids for the doc-level drop hint. Accepts one id or an array —
   hidden ancestors never paint, so the single wiring names both the
   landing and chat containers and the visible one lights up. */
function wiredBarIds(w){
  if(!w.barId) return [];
  return Array.isArray(w.barId) ? w.barId : [w.barId];
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
 *   barId        — input bar id(s) for the full-doc drop visual hint;
 *                  accepts one id or an array — hidden ancestors never
 *                  paint, so naming both the landing and chat containers
 *                  keeps the hint working wherever the shell is parked
 *   chipsId      — chips container id (renderAttachmentChips target)
 *   updateBtnName — name of the function on window to call after
 *                   mutations (updateComposerBtn)
 * Called once for the single composer; safe to call multiple times for
 * the same ids (de-duplicated by chipsId). */
export function setupAttachmentInput(opts){
  if(!opts || !opts.inputId || !opts.wrapId) return;
  // De-dup: if a config with the same chipsId is already wired, skip.
  if(opts.chipsId && WIRED_INPUTS.some(function(w){ return w.chipsId === opts.chipsId; })) return;

  const btn = document.getElementById(opts.btnId);
  const input = document.getElementById(opts.inputId);
  const wrap = document.getElementById(opts.wrapId);
  const textarea = opts.textareaId ? document.getElementById(opts.textareaId) : null;
  if(!input || !wrap) return;

  const cfg = {
    btnId: opts.btnId,
    inputId: opts.inputId,
    wrapId: opts.wrapId,
    textareaId: opts.textareaId || null,
    barId: opts.barId || null,
    chipsId: opts.chipsId || null,
    updateBtnName: opts.updateBtnName || "updateComposerBtn",
  };
  WIRED_INPUTS.push(cfg);

  if(btn) btn.onclick = function(){
    /* Reset value first so re-selecting the same file fires `change`. */
    input.value = "";
    input.click();
  };
  input.onchange = async function(){
    if(!input.files || !input.files.length) return;
    const res = await addFiles(input.files, renderAndRefresh, updateProgressOnly, dedupToast);
    refreshAllSendBtns();
    if(res.rejected && res.rejected.length){
      if(btn) {
        btn.classList.add("has-error");
        setTimeout(function(){ btn.classList.remove("has-error"); }, 1500);
      }
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
    await addFiles(dt.files, renderAndRefresh, updateProgressOnly, dedupToast);
  });

  /* P_paste-attach — clipboard paste handler for the composer.
     When the user pastes an image (e.g. screenshot from clipboard),
     intercept it and send through addFiles() instead of dropping raw
     base64 text into the textarea. Text-only pastes pass through
     unchanged. */
  async function handlePasteFiles(e){
    const items = e.clipboardData && e.clipboardData.items;
    // TipTap/ProseMirror path (React composer) owns files when present —
    // only act when the event also carries direct File objects and no
    // editor handled it (legacy textarea-less composer, non-React mode).
    const files = [];
    if(items && items.length){
      for(let i = 0; i < items.length; i++){
        const item = items[i];
        if(item.kind === "file" && item.getAsFile){
          const f = item.getAsFile();
          if(f) files.push(f);
        }
      }
    } else if(e.clipboardData && e.clipboardData.files && e.clipboardData.files.length){
      for(let i = 0; i < e.clipboardData.files.length; i++) files.push(e.clipboardData.files[i]);
    }
    if(!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    const res = await addFiles(files, renderAndRefresh, updateProgressOnly, dedupToast);
    refreshAllSendBtns();
    if(res.added > 0){
      dedupToast(res.added + " file" + (res.added > 1 ? "s" : "") + " pasted");
    }
  }
  if(textarea){
    textarea.addEventListener("paste", handlePasteFiles);
  } else {
    // P_paste-attach-fallback — the single composer is a contenteditable
    // (TipTap) with no textarea id, and non-React mode has no editor
    // handlePaste. Listen on the wrap so clipboard images still attach
    // instead of falling through as unrenderable blobs.
    wrap.addEventListener("paste", handlePasteFiles);
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

/* Camera / photo-library pickers use their own inputs instead of mutating
 * the shared composer input. A dedicated `accept="image/*" capture` input
 * without `multiple` is what mobile browsers and the Android WebView need
 * to launch the camera directly (no intermediate chooser), and it keeps the
 * regular Upload action from inheriting a stale camera-only accept list. */
const MEDIA_INPUTS = {};
function mediaInput(kind){
  if(MEDIA_INPUTS[kind] && MEDIA_INPUTS[kind].isConnected) return MEDIA_INPUTS[kind];
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.hidden = true;
  input.id = kind === "camera" ? "cameraCaptureInput" : "photoPickerInput";
  if(kind === "camera") input.setAttribute("capture", "environment");
  else input.multiple = true;
  input.addEventListener("change", async function(){
    if(!input.files || !input.files.length) return;
    await addFiles(input.files, renderAndRefresh, updateProgressOnly, dedupToast);
    refreshAllSendBtns();
  });
  document.body.appendChild(input);
  MEDIA_INPUTS[kind] = input;
  return input;
}

export function openMediaPicker(kind){
  if(typeof document === "undefined" || !document.body) return;
  const input = mediaInput(kind === "camera" ? "camera" : "photos");
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
        wiredBarIds(w).forEach(function(barId){
          const bar = document.getElementById(barId);
          if(bar) bar.classList.add("drag-over-doc");
        });
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
        wiredBarIds(w).forEach(function(barId){
          const bar = document.getElementById(barId);
          if(bar) bar.classList.remove("drag-over-doc");
        });
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
      wiredBarIds(w).forEach(function(barId){
        const bar = document.getElementById(barId);
        if(bar) bar.classList.remove("drag-over-doc");
      });
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
    await addFiles(dt.files, renderAndRefresh, updateProgressOnly, dedupToast);
  });
}

let booted = false;
function autoWire(){
  if(booted) return;
  booted = true;
  wireDocumentDrag();
  /* P_composer-single — one shell, one wiring. barId names both view
     containers; only the visible one paints the drop hint. The paperclip
     button keeps its tools-menu listener (legacyShellListeners); this
     wiring owns the hidden file input, drop and paste only. */
  setupAttachmentInput({
    inputId: "composerAttachInput",
    wrapId: "composerInputWrap",
    textareaId: null,
    barId: ["chatInputBar", "topicSetup"],
    chipsId: "composerAttachmentChips",
    updateBtnName: "updateComposerBtn",
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
