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
  const ids = WIRED_INPUTS.map(function(w){ return w.chipsId; }).filter(Boolean);
  if(!ids.length){
    // Backwards-compat: legacy single chat-mode chips container.
    const fallback = document.getElementById("attachmentChips");
    if(fallback) ids.push("attachmentChips");
  }
  ids.forEach(function(id){
    const wrap = document.getElementById(id);
    if(!wrap) return;
    // Clear previous chips.
    while(wrap.firstChild) wrap.removeChild(wrap.firstChild);
    if(!attachments.length){
      wrap.classList.add("hidden");
      return;
    }
    wrap.classList.remove("hidden");

    attachments.forEach(function(a){
      const chip = document.createElement("div");
      chip.className = "attachment-chip" + (a.error ? " error" : "");
      chip.dataset.id = a.id;

      if(a.kind === "image" && a.dataUrl){
        const img = document.createElement("img");
        img.className = "attachment-chip-thumb";
        img.src = a.dataUrl;
        img.alt = a.name || "";
        chip.appendChild(img);
      } else {
        // File-type icon — generic doc glyph for text / pdf.
        const icon = document.createElement("span");
        icon.className = "attachment-chip-icon";
        icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
        chip.appendChild(icon);
      }

      const name = document.createElement("span");
      name.className = "attachment-chip-name";
      name.textContent = a.name || "file";
      chip.appendChild(name);

      if(a.truncated){
        const meta = document.createElement("span");
        meta.className = "attachment-chip-meta";
        meta.textContent = "(truncated)";
        chip.appendChild(meta);
      }

      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "attachment-chip-remove";
      rm.setAttribute("aria-label", "Remove attachment");
      rm.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
      rm.onclick = function(){
        removeAttachment(a.id);
        renderAttachmentChips();
        refreshAllSendBtns();
      };
      chip.appendChild(rm);

      wrap.appendChild(chip);
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
  if(!opts || !opts.btnId || !opts.inputId || !opts.wrapId) return;
  // De-dup: if a config with the same chipsId is already wired, skip.
  if(opts.chipsId && WIRED_INPUTS.some(function(w){ return w.chipsId === opts.chipsId; })) return;

  const btn = document.getElementById(opts.btnId);
  const input = document.getElementById(opts.inputId);
  const wrap = document.getElementById(opts.wrapId);
  const textarea = opts.textareaId ? document.getElementById(opts.textareaId) : null;
  const bar = opts.barId ? document.getElementById(opts.barId) : null;
  if(!btn || !input || !wrap) return;

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

  btn.onclick = function(){
    /* Reset value first so re-selecting the same file fires `change`. */
    input.value = "";
    input.click();
  };
  input.onchange = async function(){
    if(!input.files || !input.files.length) return;
    const res = await addFiles(input.files);
    renderAttachmentChips();
    refreshAllSendBtns();
    if(res.rejected && res.rejected.length){
      btn.classList.add("has-error");
      setTimeout(function(){ btn.classList.remove("has-error"); }, 1500);
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
    const res = await addFiles(dt.files);
    renderAttachmentChips();
    refreshAllSendBtns();
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
      const res = await addFiles(files);
      renderAttachmentChips();
      refreshAllSendBtns();
      if(res.added > 0){
        toast(res.added + " file" + (res.added > 1 ? "s" : "") + " pasted");
      }
      surfaceRejectionToast(res);
    });
  }
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
    const res = await addFiles(dt.files);
    renderAttachmentChips();
    refreshAllSendBtns();
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
    btnId: "attachBtn",
    inputId: "attachInput",
    wrapId: "chatInputWrap",
    textareaId: "chatInputArea",
    barId: "chatInputBar",
    chipsId: "attachmentChips",
    updateBtnName: "updateSendBtn",
  });
  // Tutor-mode topic setup.
  setupAttachmentInput({
    btnId: "topicAttachBtn",
    inputId: "topicAttachInput",
    wrapId: "topicInputWrap",
    textareaId: "topicInput",
    barId: "topicSetup",
    chipsId: "topicAttachmentChips",
    updateBtnName: "updateStartBtn",
  });
}
if(typeof window !== "undefined"){
  window.addEventListener("DOMContentLoaded", autoWire);
  /* If the script runs after DOMContentLoaded (Vite HMR or inline
     execution), still attempt to wire it. */
  if(document.readyState !== "loading"){
    autoWire();
  }
}