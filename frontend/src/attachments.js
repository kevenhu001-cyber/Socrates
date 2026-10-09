/**
 * attachments.js — pending-attachment store for the chat composer.
 *
 * P_file-attachments — every accepted file is uploaded to
 * POST /api/v2/files (a durable `files` row) and the outgoing turn only
 * persists a reference: {id, kind, name, mime, size, fileId}. The model
 * then reads the file on demand through the server-side
 * `read_attachment` tool — paged text for documents, a vision
 * description for images, metadata for media — instead of receiving a
 * pre-parsed text dump in the prompt.
 *
 * Images additionally keep a compressed base64 dataUrl when the active
 * provider is multimodal, so vision-capable models still receive a
 * native image_url part (highest fidelity). For text-only providers the
 * image stays a file reference and the model reads it via the tool.
 *
 * Limits:
 *   - Up to 6 attachments per turn.
 *   - Any file ≤25 MB (the /api/files per-file cap).
 *   - Inline image dataUrls: ≤4 MB source, re-encoded under 1.9 M chars.
 *
 * The exposed API:
 *   attachments                      — module-level array (current turn)
 *   resetAttachments()               — clear the array (call on submit / cancel)
 *   snapshotAttachments()            — per-turn copy; marks entries sent
 *   addFiles(FileList|File[])        — async; uploads files, builds entries
 *   removeAttachment(id)             — abort + drop one chip, delete orphans
 *   retryAttachment(id, onUpdate)    — re-run a failed upload
 *   waitForAttachmentsReady(list)    — settle pending upload/encode jobs
 *   buildMessageContent(text, list)  — assemble { rawText, parts, attachmentList }
 *   attachmentPointerLine(att)       — the [Attached file: …] model pointer
 *   activeProviderSupportsImages()   — vision capability of the active model
 */

import { apiFetch } from './util/api.js';
import { reportSwallow } from './util/reportSwallow.ts';
import { classifyAttachmentFile, docKindFromFile } from './attachments/fileTypes.js';
import { compressImageFile, readFileAsDataUrl } from './attachments/imageCompression.js';
import { createBuildMessageContent } from './attachments/messageContent.js';
import {
  ATTACHMENT_READY_TIMEOUT_MS,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DATAURL_CHARS,
  MAX_IMAGE_SOURCE_BYTES_BEFORE_DATAURL,
  MAX_TOTAL_ATTACHMENTS,
  XHR_TIMEOUT_MS,
} from './attachments/limits.js';

export {
  ATTACHMENT_READY_TIMEOUT_MS,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DATAURL_CHARS,
  MAX_IMAGE_SOURCE_BYTES_BEFORE_DATAURL,
  MAX_TOTAL_ATTACHMENTS,
  XHR_TIMEOUT_MS,
} from './attachments/limits.js';
export { attachmentPointerLine, formatAttachmentSize } from './attachments/messageContent.js';

/* Pending attachments for the current turn. The store is
 * deliberately not React-ish / observable — main.js calls
 * `renderAttachmentChips()` after each mutation. */
export const attachments = [];

/* Per-entry readiness jobs: attachment id → Promise that settles when
   the entry's upload (+ optional image encode) finished, successfully
   or not. Entries may be snapshotted and reset before their job ends —
   the map (not the array membership) is what waitForAttachmentsReady
   tracks, so a cleared composer still resolves the outgoing turn. */
const READY_PROMISES = new Map();

function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      const v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch (e) { reportSwallow(e, 'attachments._t.prefLookup'); /* fall through */ }
  return fallback != null ? fallback : key;
}

function getActiveProvider() {
  if (typeof window === 'undefined' || typeof window.getActiveProvider !== 'function') return null;
  try { return window.getActiveProvider() || null; } catch (_) { return null; }
}

function providerSupportsImages(provider) {
  return !!(provider && (provider.vision === true || provider.isMultimodal === true));
}

/** True when the currently selected provider can consume image_url parts. */
export function activeProviderSupportsImages() {
  return providerSupportsImages(getActiveProvider());
}

function currentSessionId() {
  try {
    const store = (typeof window !== 'undefined') ? window.stateStore : null;
    if (store && typeof store.read === 'function') {
      const sid = store.read('currentSessionId');
      if (typeof sid === 'string' && sid) return sid;
    }
  } catch (e) { reportSwallow(e, 'attachments.store.sessionIdLookup'); /* fall through */ }
  return '';
}

/** Clear the pending attachments list. Called after submit + on cancel. */
export function resetAttachments() {
  /* Revoke blob URLs before clearing so the browser can GC the
     underlying Blob data immediately instead of holding it until
     the next garbage-collection cycle. READY_PROMISES entries are
     left alone: a snapshot taken before the reset must still resolve. */
  _revokeBlobUrls(attachments);
  attachments.length = 0;
  /* React migration bridge — publish the empty list so the React
     compatibility root drops the chip row. Legacy callers that follow
     up with renderAttachmentChips() also publish; this covers the
     reset-only path. */
  try {
    var bridge = (typeof window !== "undefined") ? window.__socratesAttachmentsBridge : null;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({ attachments: attachments.slice() });
    }
  } catch (e) { reportSwallow(e, 'attachments.bridge.publish'); /* swallow — bridge is best-effort */ }
}

/**
 * Wait until every attachment in `list` finished its upload/encode job.
 * Resolves (never rejects) once all jobs settle OR `timeoutMs` elapses —
 * a still-pending entry after the timeout is surfaced by
 * buildMessageContent as an "upload incomplete" note rather than
 * silently dropped.
 */
export function waitForAttachmentsReady(list, timeoutMs) {
  const items = Array.isArray(list) ? list : attachments;
  const waits = [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    const p = a && READY_PROMISES.get(a.id);
    if (p) waits.push(p);
  }
  if (!waits.length) return Promise.resolve();
  const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : ATTACHMENT_READY_TIMEOUT_MS;
  let timer = null;
  return Promise.race([
    Promise.allSettled(waits).then(() => undefined),
    new Promise((resolve) => { timer = setTimeout(resolve, ms); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

/** Generate a short id for chip keying. */
function shortId() {
  // crypto.randomUUID exists in evergreen browsers + Node 19+;
  // fall back to Math.random for the unlikely no-crypto case.
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return 'att-' + crypto.randomUUID().slice(0, 8);
    }
  } catch (e) { reportSwallow(e, 'attachments.shortId.cryptoRandomUUID'); /* fall through */ }
  return 'att-' + Math.random().toString(36).slice(2, 10);
}

/**
 * Upload one File to POST /api/v2/files — the durable store the
 * read_attachment tool and /api/files/:id/raw resolve against.
 * Calls onProgress(percent) during the upload. Resolves with
 * { fileId, kind, mimeType, size } or { error } — never rejects.
 * XHR (not fetch) because fetch does not expose upload progress.
 *
 * onXhr(xhr) receives the live request so the caller can keep an
 * abort handle on the entry — removing a chip (or a send-time
 * timeout) must actually cancel the transfer, not just orphan it.
 */
function uploadAttachmentFile(file, onProgress, onXhr) {
  return new Promise((resolve) => {
    const fd = new FormData();
    fd.append('file', file, file.name || 'file');
    /* Best-effort session link — the server re-validates ownership and
       adopts orphans at session save (P_file-session-link), so a null
       or draft id here is fine. */
    const sid = currentSessionId();
    if (sid) fd.append('sessionId', sid);
    const csrf = (typeof window !== 'undefined' && window.getCsrfToken)
      ? window.getCsrfToken() : '';
    const xhr = new XMLHttpRequest();
    if (typeof onXhr === 'function') onXhr(xhr);
    if (typeof onProgress === 'function' && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = function () {
      let data = null;
      try { data = JSON.parse(xhr.responseText || '{}'); } catch (e) { reportSwallow(e, 'attachments.csrf.parseResponse'); /* non-JSON error page */ }
      if (xhr.status >= 200 && xhr.status < 300 && data && data.id) {
        resolve({
          fileId: String(data.id),
          kind: data.kind || undefined,
          mimeType: data.mimeType || undefined,
          size: typeof data.size === 'number' ? data.size : undefined,
        });
      } else {
        const msg = (data && (data.message || data.error || data.detail)) || ('Upload failed (' + xhr.status + ')');
        resolve({ error: String(msg) });
      }
    };
    xhr.onerror = () => resolve({ error: _t('chat.attach.networkError', 'Network error during upload') });
    xhr.ontimeout = () => resolve({ error: _t('chat.attach.uploadTimeout', 'Upload timed out') });
    /* Aborted by removeAttachment / the send-time straggler cutoff —
       settle quietly; the entry is already gone or flagged. */
    xhr.onabort = () => resolve({ error: _t('chat.attach.cancelled', 'Upload cancelled') });
    /* /api/v2 — same CDN-bypass prefix apiFetch uses; the server and
       dev stub both strip it back to /api/files. */
    xhr.open('POST', '/api/v2/files');
    if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
    xhr.timeout = XHR_TIMEOUT_MS;
    xhr.send(fd);
  });
}

/**
 * The per-file async job: upload for a durable fileId, plus an inline
 * compressed dataUrl for images when the active provider is multimodal.
 * Mutates the entry in place; resolves { ok:true } when the attachment
 * is usable (fileId OR a readable inline image) or { error } when the
 * model would get nothing from it.
 */
function waitForAttachmentPaint() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(resolve);
    else setTimeout(resolve, 0);
  });
}

function abortHandleForXhr(entry, xhr) {
  entry._abort = () => {
    try { xhr.abort(); }
    catch (error) { reportSwallow(error, 'attachments.prepareAttachment.xhrAbort'); }
  };
}

async function loadInlineImageData(file, reportProgress) {
  const progress = (percent) => reportProgress(70 + Math.round(percent * 0.3));
  try {
    if (file.size > MAX_IMAGE_SOURCE_BYTES_BEFORE_DATAURL) {
      return await compressImageFile(file, progress);
    }
    const read = await readFileAsDataUrl(file, progress);
    return read.dataUrl;
  } catch (_) {
    return '';
  }
}

async function prepareInlineImage(entry, file, reportProgress) {
  const dataUrl = await loadInlineImageData(file, reportProgress);
  if (!dataUrl || dataUrl.length > MAX_IMAGE_DATAURL_CHARS) return;
  entry.dataUrl = dataUrl;
  const match = /^data:([^;,]+)/.exec(dataUrl);
  if (match) entry.mime = match[1];
  /* Approximate decoded byte size from the base64 body. */
  entry.size = Math.round((dataUrl.length - (dataUrl.indexOf(',') + 1)) * 3 / 4);
}

function finalizeAttachment(entry, uploadOutcome) {
  entry.pending = false;
  entry.progress = 100;
  const usable = !!(uploadOutcome && uploadOutcome.fileId) || !!entry.dataUrl;
  /* Keep failed-upload thumbnails so the error chip still shows the file. */
  if (usable && entry.thumbnailUrl) {
    try { URL.revokeObjectURL(entry.thumbnailUrl); }
    catch (error) { reportSwallow(error, 'attachments.prepareAttachment.revokeThumbnail'); }
    entry.thumbnailUrl = undefined;
  }
  if (uploadOutcome && uploadOutcome.fileId) {
    entry.fileId = uploadOutcome.fileId;
    if (uploadOutcome.mimeType) entry.mime = uploadOutcome.mimeType;
    return { ok: true };
  }
  if (entry.dataUrl) return { ok: true };
  return { ok: false, error: (uploadOutcome && uploadOutcome.error) || 'Upload failed' };
}

async function prepareAttachment(entry, file, reportProgress) {
  const wantsInlineImage = entry.kind === 'image'
    && activeProviderSupportsImages()
    && file.size <= MAX_IMAGE_BYTES;
  try {
    await waitForAttachmentPaint();
    let uploadOutcome = null;
    const uploadJob = uploadAttachmentFile(
      file,
      (percent) => reportProgress(wantsInlineImage ? Math.min(70, Math.round(percent * 0.7)) : percent),
      (xhr) => abortHandleForXhr(entry, xhr),
    ).then((outcome) => { uploadOutcome = outcome; });
    const jobs = [uploadJob];
    if (entry.kind === 'image' && wantsInlineImage) {
      jobs.push(prepareInlineImage(entry, file, reportProgress));
    }
    await Promise.all(jobs);
    return finalizeAttachment(entry, uploadOutcome);
  } catch (error) {
    entry.pending = false;
    entry.progress = 100;
    return { ok: false, error: (error && error.message) || 'read failed' };
  }
}

/**
 * Process a FileList / array of File objects, appending each accepted
 * one to the pending list. Returns a { added, rejected } summary so the
 * UI can toast a status.
 *
 * P_pending-feedback — each file pushes a pending stub into the
 * attachments[] array BEFORE any async work so the UI chip appears
 * immediately. The stub's `pending:true` and `progress:0-100` fields
 * drive a spinner + progress bar in renderAttachmentChips(). Once the
 * upload (+ optional image encode) finishes the stub is updated
 * in-place and onUpdate fires so the renderer swaps the spinner for
 * the final chip.
 *
 * P_attachments-ready — every file's async job is also tracked in
 * READY_PROMISES so a send that happens while an upload is still in
 * flight can wait for it (waitForAttachmentsReady) instead of losing
 * the fileId the model needs.
 *
 * @param {FileList|File[]} fileList
 * @param {function} [onUpdate] — called after each stub mutation so
 *   the caller can re-render chips (typically renderAttachmentChips).
 * @param {function} [onProgress] — forwarded to the per-file read /
 *   compression step; receives an integer percent (0-100).
 * @param {function} [onRejected] — invoked synchronously per rejection
 *   so a bad file's toast is not held hostage by a slow in-flight
 *   upload (the promise only resolves after every job settles).
 * @returns {Promise<{added:number, rejected:string[]}>}
 */
function createRejectReporter(result, onRejected) {
  return (message) => {
    result.rejected.push(message);
    if (!onRejected) return;
    try { onRejected(message); }
    catch (error) { reportSwallow(error, 'attachments.reject.onRejected'); }
  };
}

function createProgressNotifier(onUpdate, onProgress) {
  /* Coalesce frequent upload progress events into at most one render per frame. */
  let pendingFrame = 0;
  const scheduleFrame = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (callback) => setTimeout(callback, 16);
  return () => {
    if (pendingFrame) return;
    pendingFrame = scheduleFrame(() => {
      pendingFrame = 0;
      if (onProgress) onProgress();
      else if (onUpdate) onUpdate();
    });
  };
}

function inspectFile(file, reject) {
  if (attachments.length >= MAX_TOTAL_ATTACHMENTS) {
    reject(`${file.name || 'file'}: ${_t('chat.attach.maxReached', `max ${MAX_TOTAL_ATTACHMENTS} attachments per turn`)}`);
    return null;
  }
  const signature = `${file.name || ''}|${file.size}`;
  if (attachments.some((attachment) => attachment && attachment._sig === signature)) {
    reject(`${file.name || 'file'}: ${_t('chat.attach.duplicate', 'already attached')}`);
    return null;
  }
  const kind = classifyAttachmentFile(file);
  if (!kind) {
    reject(`${file.name || 'file'}: ${_t('chat.attach.unsupported', 'unsupported file type')}`);
    return null;
  }
  if (file.size > MAX_FILE_BYTES) {
    reject(`${file.name}: ${_t('chat.attach.fileTooLarge', `file exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB limit`)}`);
    return null;
  }
  return { kind, signature };
}

function createPendingEntry(file, { kind, signature }) {
  const entry = {
    id: shortId(), kind, pending: true, progress: 0,
    name: file.name || 'file',
    mime: file.type || 'application/octet-stream',
    size: file.size,
    /* Private fields support dedupe, retry, abort, and send-time ownership. */
    _sig: signature,
    _file: file,
  };
  if (kind === 'document') entry.docKind = docKindFromFile(file);
  if (kind === 'image'
      && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try { entry.thumbnailUrl = URL.createObjectURL(file); }
    catch (error) { reportSwallow(error, 'attachments.addFiles.createThumbnail'); }
  }
  return entry;
}

function trackAttachmentJob(entry, file, result, notifyProgress, onUpdate, reject) {
  const onFileProgress = (percent) => {
    entry.progress = percent;
    notifyProgress();
  };
  const job = prepareAttachment(entry, file, onFileProgress).then((outcome) => {
    if (outcome && outcome.error) {
      entry.error = outcome.error;
      /* A removed chip is deliberate cancellation, not a user rejection. */
      if (attachments.includes(entry)) reject(`${file.name}: ${outcome.error}`);
    } else {
      result.added += 1;
    }
    if (onUpdate) onUpdate();
  });
  READY_PROMISES.set(entry.id, job.finally(() => { READY_PROMISES.delete(entry.id); }));
  return job;
}

export async function addFiles(fileList, onUpdate, onProgress, onRejected) {
  const result = { added: 0, rejected: [] };
  const reject = createRejectReporter(result, onRejected);
  const notifyProgress = createProgressNotifier(onUpdate, onProgress);
  const jobs = [];
  for (const file of Array.from(fileList || [])) {
    const fileInfo = inspectFile(file, reject);
    if (!fileInfo) continue;
    const entry = createPendingEntry(file, fileInfo);
    attachments.push(entry);
    if (onUpdate) onUpdate();
    jobs.push(trackAttachmentJob(entry, file, result, notifyProgress, onUpdate, reject));
  }
  await Promise.all(jobs);
  return result;
}

/** Revoke blob URLs for a list of attachment entries. */
function _revokeBlobUrls(list) {
  for (let i = 0; i < list.length; i++) {
    const url = list[i].thumbnailUrl;
    if (url) {
      try { URL.revokeObjectURL(url); } catch (e) { reportSwallow(e, 'attachments._revokeBlobUrls.one'); /* noop */ }
    }
  }
}

/**
 * Immutable per-turn snapshot for the send paths. Returns a shallow
 * copy of the pending list AND marks the shared entries as claimed:
 * an entry referenced by an outgoing message must not be deleted by
 * a later chip removal, and its File handle is dropped (sent entries
 * can never be retried, so holding the Blob would just pin memory).
 */
export function snapshotAttachments() {
  const snap = attachments.slice();
  for (let i = 0; i < snap.length; i++) {
    const a = snap[i];
    if (!a) continue;
    a.sent = true;
    a._file = null;
  }
  return snap;
}

/**
 * Remove one attachment by id. Returns true if found.
 * A still-running upload is aborted so the transfer does not keep
 * burning bandwidth for a chip the user already discarded; when the
 * upload already finished, its files row is deleted best-effort —
 * an un-referenced upload would otherwise occupy the user quota
 * forever. Entries already claimed by a turn (sent) are never
 * deleted: the persisted message points at their fileId.
 */
export function removeAttachment(id) {
  const idx = attachments.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  const entry = attachments[idx];
  if (entry && entry.pending && typeof entry._abort === 'function') {
    try { entry._abort(); } catch (e) { reportSwallow(e, 'attachments.removeAttachment.abort'); /* noop */ }
  }
  if (entry && entry.fileId && !entry.sent) {
    /* Fire-and-forget — the chip is already gone; a failed delete just
       leaves the row for the usual orphan-adoption path. apiFetch adds
       the /api/v2 prefix, credentials, and CSRF header itself. */
    apiFetch(`/api/files/${encodeURIComponent(entry.fileId)}`, { method: 'DELETE' })
      .catch((error) => reportSwallow(error, 'attachments.removeAttachment.deleteOrphan'));
  }
  _revokeBlobUrls([entry]);
  attachments.splice(idx, 1);
  return true;
}

/**
 * Re-run the upload for an entry whose job failed. The chip stays in
 * place (same id) and flips back to pending — the File handle kept on
 * the entry means the user does not have to re-pick the file.
 */
export function retryAttachment(id, onUpdate) {
  const entry = attachments.find((a) => a && a.id === id);
  if (!entry || entry.pending || !entry.error || !entry._file) return false;
  entry.pending = true;
  entry.error = undefined;
  entry.progress = 0;
  if (entry.kind === 'image' && !entry.thumbnailUrl
      && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try { entry.thumbnailUrl = URL.createObjectURL(entry._file); } catch (e) { reportSwallow(e, 'attachments.retryAttachment.createThumbUrl'); /* noop */ }
  }
  if (onUpdate) onUpdate();
  const job = prepareAttachment(entry, entry._file, function (pct) {
    entry.progress = pct;
    if (onUpdate) onUpdate();
  }).then(function (outcome) {
    if (outcome && outcome.error) entry.error = outcome.error;
    if (onUpdate) onUpdate();
  });
  READY_PROMISES.set(entry.id, job.finally(function () { READY_PROMISES.delete(entry.id); }));
  return true;
}

const buildMessageContent = createBuildMessageContent({
  getAttachments: () => attachments,
  waitForReady: waitForAttachmentsReady,
  supportsImages: activeProviderSupportsImages,
});

export { buildMessageContent };
