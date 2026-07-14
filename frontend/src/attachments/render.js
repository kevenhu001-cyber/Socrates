// src/attachments/render.js — Phase C-2.4 extraction
// DOM-side rendering and event wiring for the attachment chip strip
// above the chat composer. Module state (the pending attachments
// array) lives in src/attachments.js; this module just mirrors it
// into the DOM and wires the paperclip button + drag/drop + paste.
//
// All inline handler references (window.renderAttachmentChips /
// window.setupAttachmentInput) are re-bound in src/windowExports.js.
import { attachments, addFiles, removeAttachment } from '../attachments.js';
import { updateSendBtn } from '../ui/topicSetup.js';

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

/* Render the pending-attachment chip strip above the textarea.
   Called after addFiles / removeAttachment / resetAttachments. */
export function renderAttachmentChips(){
  const wrap = document.getElementById("attachmentChips");
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
      updateSendBtn();
    };
    chip.appendChild(rm);

    wrap.appendChild(chip);
  });
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

/* Wire up the paperclip button → hidden <input type="file">, plus
   drag-and-drop on the input wrap. Called once on boot. */
export function setupAttachmentInput(){
  const btn = document.getElementById("attachBtn");
  const input = document.getElementById("attachInput");
  const wrap = document.getElementById("chatInputWrap");
  const textarea = document.getElementById("chatInputArea");
  if(!btn || !input || !wrap) return;

  btn.onclick = function(){
    /* Reset value first so re-selecting the same file fires `change`. */
    input.value = "";
    input.click();
  };
  input.onchange = async function(){
    if(!input.files || !input.files.length) return;
    const res = await addFiles(input.files);
    renderAttachmentChips();
    updateSendBtn();
    if(res.rejected && res.rejected.length){
      // Light up the button as an error indicator; the rejected
      // reasons are also surfaced via console for the user to see.
      btn.classList.add("has-error");
      setTimeout(function(){ btn.classList.remove("has-error"); }, 1500);
      surfaceRejectionToast(res);
    }
  };

  // Drag-and-drop: visual hint + accept drops on the input wrap.
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
    updateSendBtn();
    surfaceRejectionToast(res);
  });

  /* P_paste-attach — clipboard paste handler for the chat input.
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
      updateSendBtn();
      if(res.added > 0){
        toast(res.added + " file" + (res.added > 1 ? "s" : "") + " pasted");
      }
      surfaceRejectionToast(res);
    });
  }

  /* P_drag-drop-document — also accept file drag-and-drop on the full
     document body so dragging files from outside the browser onto the
     page shows visual feedback near the input bar. The wrap's own
     handlers above still fire for direct drops on the input bar. */
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
      wrap.classList.add("drag-over");
      const hint = document.getElementById("chatInputBar");
      if(hint) hint.classList.add("drag-over-doc");
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
      wrap.classList.remove("drag-over");
      const hint = document.getElementById("chatInputBar");
      if(hint) hint.classList.remove("drag-over-doc");
    }
  });
  document.addEventListener("drop", async function(e){
    if(!e.dataTransfer || !e.dataTransfer.types) return;
    let hasFile = false;
    for(let di = 0; di < e.dataTransfer.types.length; di++){
      if(e.dataTransfer.types[di] === "Files"){ hasFile = true; break; }
    }
    if(!hasFile) return;
    const hint = document.getElementById("chatInputBar");
    if(hint) hint.classList.remove("drag-over-doc");
    /* If the drop target is inside the wrap, the wrap's own handler
       already processed it — skip to avoid double-processing. */
    if(wrap && wrap.contains(e.target)) return;
    const dt = e.dataTransfer;
    if(!dt || !dt.files || !dt.files.length) return;
    e.preventDefault();
    e.stopPropagation();
    const res = await addFiles(dt.files);
    renderAttachmentChips();
    updateSendBtn();
    surfaceRejectionToast(res);
  });
}

/* Hook into module load — call once at boot. */
let wired = false;
function autoWire(){
  if(wired) return;
  wired = true;
  setupAttachmentInput();
}
if(typeof window !== "undefined"){
  window.addEventListener("DOMContentLoaded", autoWire);
  /* If the script runs after DOMContentLoaded (Vite HMR or inline
     execution), still attempt to wire it. */
  if(document.readyState !== "loading"){
    autoWire();
  }
}