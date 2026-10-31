// src/attachments/render.ts — Phase C-2.4 extraction
// DOM-side rendering and event wiring for the attachment chip strip
// above the single composer. Module state (the pending attachments
// array) lives in src/attachments.ts; this module just mirrors it
// into the DOM and wires the paperclip button + drag/drop + paste.
// The composer shell moves between the landing slot and the chat slot
// (P_composer-single) but stays one node, so one wiring covers both.
//
// Application callers use direct module imports; React attachment actions
// use the typed legacy composer gateway.
import { attachments, addFiles, retryAttachment } from '../attachments.ts';
import { showToast } from '../ui/toast.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { createAttachmentMediaInput } from '../react/attachments/mediaPickerInputHost.tsx';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";
import { publishAttachmentsState } from '../ui/attachmentsState.ts';

type WiredInput = {
  btnId?: string;
  inputId: string;
  wrapId: string;
  textareaId: string | null;
  barId: string | string[] | null;
  chipsId: string | null;
  wrapEl?: HTMLElement | null;
  barEls?: HTMLElement[];
};


/* Rejections surface per-file through addFiles' onRejected callback
   (showToast) so a slow in-flight upload never delays them. Identical
   messages inside a short window collapse into one toast — selecting
   six over-quota files used to fire six identical toasts. */
let _lastToastMsg = '';
let _lastToastAt = 0;
function dedupToast(msg: string) {
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
const WIRED_INPUTS: WiredInput[] = [];

/* Render the pending-attachment chip strip into every wired chips
   container. Called after addFiles / removeAttachment /
   resetAttachments. */
export function renderAttachmentChips(){
  publishAttachmentsState(attachments);
}

/* RAF-throttled full rebuild — called on structural changes (add /
   remove / reset). Coalesces rapid progress-fire into a single anim
   frame so the DOM isn't rebuilt 30× per second per file. */
let _renderRAF: number|null = null;
function renderAndRefresh(){
  if (_renderRAF) return;
  _renderRAF = requestAnimationFrame(function(){
    _renderRAF = null;
    renderAttachmentChips();
  });
}

/* Error-chip retry — flips a failed upload back to pending and re-runs
   the job against the retained File handle, then re-syncs the send
   buttons (a failed chip still counts toward activation). */
export function retryComposerAttachment(id: string){
  const ok = retryAttachment(id, renderAndRefresh);
  return ok;
}

export async function addComposerFiles(files: File[], source: string){
  const list = Array.from(files || []);
  if(!list.length) return { added:0, rejected:[] };
  const res = await addFiles(list, renderAndRefresh, updateProgressOnly, dedupToast);
  if(source === "paste" && res.added > 0){
    dedupToast(res.added + " file" + (res.added > 1 ? "s" : "") + " pasted");
  }
  return res;
}

/* Lightweight progress-only update — rAF-coalesced module-store publish so the
   React chip row re-renders the "Uploading… n%" meta at most once per
   frame instead of rebuilding DOM per progress event. */
let _progressRAF: number|null = null;
function updateProgressOnly(){
  if (_progressRAF) return;
  _progressRAF = requestAnimationFrame(function(){
    _progressRAF = null;
    publishAttachmentsState(attachments);
  });
}

/* Bar ids for the doc-level drop hint. Accepts one id or an array —
   hidden ancestors never paint, so the single wiring names both the
   landing and chat containers and the visible one lights up. */
function wiredBarIds(w: Pick<WiredInput, 'barId'>){
  if(!w.barId) return [];
  return Array.isArray(w.barId) ? w.barId : [w.barId];
}

function getWiredWrapEl(w: WiredInput): HTMLElement | null {
  if (w.wrapEl && w.wrapEl.isConnected) return w.wrapEl;
  w.wrapEl = document.getElementById(w.wrapId);
  return w.wrapEl;
}

function getWiredBarEls(w: WiredInput): HTMLElement[] {
  if (w.barEls && w.barEls.length && w.barEls.every((b) => b.isConnected)) return w.barEls;
  const barIds = wiredBarIds(w);
  w.barEls = barIds.map((barId) => document.getElementById(barId)).filter((el): el is HTMLElement => Boolean(el));
  return w.barEls;
}

/* Returns the wired-input whose wrap contains the event target, or
   null if the event happened outside every registered wrap. */
function findWiredForTarget(target: EventTarget|null){
  if(!target) return null;
  for(let i = 0; i < WIRED_INPUTS.length; i++){
    const w = WIRED_INPUTS[i];
    const el = getWiredWrapEl(w);
    if(el && el.contains((target as Node | null))) return w;
  }
  return null;
}

function wirePickerButton(btn: HTMLElement | null, input: HTMLElement) {
  if (!btn) return;
  btn.onclick = function() {
    (input as HTMLInputElement).value = '';
    input.click();
  };
}

function wireInputFileChange(input: HTMLElement, btn: HTMLElement | null) {
  input.onchange = async function() {
    const files = (input as HTMLInputElement).files;
    if (!files || !files.length) return;
    const result = await addFiles(files, renderAndRefresh, updateProgressOnly, dedupToast);
    if (!result.rejected.length || !btn) return;
    btn.classList.add('has-error');
    setTimeout(function() { btn.classList.remove('has-error'); }, 1500);
  };
}

function wireComposerDrop(wrap: HTMLElement) {
  ['dragenter', 'dragover'].forEach(function(eventName) {
    wrap.addEventListener(eventName, function(event) {
      event.preventDefault();
      event.stopPropagation();
      wrap.classList.add('drag-over');
    });
  });
  ['dragleave', 'drop'].forEach(function(eventName) {
    wrap.addEventListener(eventName, function(event) {
      event.preventDefault();
      event.stopPropagation();
      wrap.classList.remove('drag-over');
    });
  });
  wrap.addEventListener('drop', async function(event) {
    const files = event.dataTransfer?.files;
    if (!files || !files.length) return;
    await addFiles(files, renderAndRefresh, updateProgressOnly, dedupToast);
  });
}

async function handlePasteFiles(event: ClipboardEvent) {
  const clipboard = event.clipboardData;
  const items = clipboard?.items;
  const files: File[] = [];
  if (items && items.length) {
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  } else if (clipboard?.files.length) {
    for (let index = 0; index < clipboard.files.length; index++) files.push(clipboard.files[index]);
  }
  if (!files.length) return;
  event.preventDefault();
  event.stopPropagation();
  const result = await addFiles(files, renderAndRefresh, updateProgressOnly, dedupToast);
  if (result.added > 0) {
    dedupToast(result.added + ' file' + (result.added > 1 ? 's' : '') + ' pasted');
  }
}

function wirePasteHandler(textarea: HTMLElement | null, wrap: HTMLElement) {
  const target = textarea || wrap;
  target.addEventListener('paste', function(event) {
    void handlePasteFiles(event as ClipboardEvent);
  });
}

function isWiredAlready(chipsId: string | null | undefined): boolean {
  return Boolean(chipsId && WIRED_INPUTS.some((w) => w.chipsId === chipsId));
}

function resolveBarEls(barId: string | string[] | null | undefined): HTMLElement[] {
  if (!barId) return [];
  const list = Array.isArray(barId) ? barId : [barId];
  return list.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => Boolean(el));
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
 * Called once for the single composer; safe to call multiple times for
 * the same ids (de-duplicated by chipsId). */
export function setupAttachmentInput(opts: WiredInput){
  if (!opts?.inputId || !opts?.wrapId) return;
  if (isWiredAlready(opts.chipsId)) return;

  const input = document.getElementById(opts.inputId);
  const wrap = document.getElementById(opts.wrapId);
  if (!input || !wrap) return;

  const btn = opts.btnId ? document.getElementById(opts.btnId) : null;
  const textarea = opts.textareaId ? document.getElementById(opts.textareaId) : null;
  const barEls = resolveBarEls(opts.barId);

  WIRED_INPUTS.push({
    btnId: opts.btnId,
    inputId: opts.inputId,
    wrapId: opts.wrapId,
    textareaId: opts.textareaId ?? null,
    barId: opts.barId ?? null,
    chipsId: opts.chipsId ?? null,
    wrapEl: wrap,
    barEls,
  });
  wirePickerButton(btn, input);
  wireInputFileChange(input, btn);
  wireComposerDrop(wrap);
  wirePasteHandler(textarea, wrap);
}

/* The compact composer menu owns the visible + button; file upload is one
 * of its actions rather than the only action. */
export function openAttachmentPicker(inputId: string){
  const input = document.getElementById(inputId);
  if(!input) return;
  (input as HTMLInputElement).value = "";
  input.click();
}

/* Camera / photo-library pickers use their own inputs instead of mutating
 * the shared composer input. A dedicated `accept="image/*" capture` input
 * without `multiple` is what mobile browsers and the Android WebView need
 * to launch the camera directly (no intermediate chooser), and it keeps the
 * regular Upload action from inheriting a stale camera-only accept list. */
const MEDIA_INPUTS: Record<string, ReturnType<typeof createAttachmentMediaInput>> = {};
function mediaInput(kind: string){
  if(MEDIA_INPUTS[kind] && MEDIA_INPUTS[kind].input.isConnected) return MEDIA_INPUTS[kind].input;
  const id = kind === "camera" ? "cameraCaptureInput" : "photoPickerInput";
  const mounted = createAttachmentMediaInput({
    id,
    accept: "image/*",
    capture: kind === "camera" ? "environment" : undefined,
    multiple: kind !== "camera",
    onChange: async function(files){
      if(!files.length) return;
      await addFiles(files, renderAndRefresh, updateProgressOnly, dedupToast);
    },
  });
  document.body.appendChild(mounted.host);
  MEDIA_INPUTS[kind] = mounted;
  return mounted.input;
}

export function openMediaPicker(kind: string){
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
        const el = getWiredWrapEl(w);
        if(el) el.classList.add("drag-over");
        getWiredBarEls(w).forEach(function(bar){
          bar.classList.add("drag-over-doc");
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
        const el = getWiredWrapEl(w);
        if(el) el.classList.remove("drag-over");
        getWiredBarEls(w).forEach(function(bar){
          bar.classList.remove("drag-over-doc");
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
      getWiredBarEls(w).forEach(function(bar){
        bar.classList.remove("drag-over-doc");
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
  // The authenticated React shell is mounted after DOMContentLoaded. Keep the
  // early pass cheap and retry when ComposerShell commits its native picker.
  if(!document.getElementById("composerAttachInput") || !document.getElementById("composerInputWrap")) return;
  booted = true;
  wireDocumentDrag();
  /* P_composer-single — one shell, one wiring. barId names both view
     containers; only the visible one paints the drop hint. The React tools
     button owns its click handler; this wiring owns the hidden file input,
     drop and paste only. */
  setupAttachmentInput({
    inputId: "composerAttachInput",
    wrapId: "composerInputWrap",
    textareaId: null,
    barId: ["chatInputBar", "topicSetup"],
    chipsId: "composerAttachmentChips",
  });
}
/* P_timing-DCL — the Vite IIFE evaluates before the DOM is ready,
 * so any module-level code that queries getElementById returns null.
 * The only reliable way to wire DOM-dependent behaviour is
 * DOMContentLoaded, which fires once after the document is fully
 * parsed — see DOMContentLoaded support table. */
let dclRan = false;
function dcl(){
  if(dclRan)return; dclRan=true;
  autoWire();
}
function onComposerReady(){
  try { autoWire(); }
  catch (error) { reportSwallow(error, 'attachments/render.ts:composerready'); }
}
if(typeof window !== "undefined"){
  browserWindow.addEventListener("DOMContentLoaded", dcl);
  document.addEventListener("socrates:composerready", onComposerReady);
  /* If the script runs after DOMContentLoaded (rare — Vite HMR,
     extension injection, SSR hydration), fire immediately. */
  if(document.readyState !== "loading"){ try{ dcl(); }catch (error) { reportSwallow(error, 'attachments/render.ts:403'); } }
}
