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
 *   addFiles(FileList|File[])        — async; uploads files, builds entries
 *   removeAttachment(id)             — drop one chip
 *   waitForAttachmentsReady(list)    — settle pending upload/encode jobs
 *   buildMessageContent(text, list)  — assemble { rawText, parts, attachmentList }
 *   attachmentPointerLine(att)       — the [Attached file: …] model pointer
 *   activeProviderSupportsImages()   — vision capability of the active model
 */

/* Limits — kept as named constants so the UI can show "max 6" hints
 * and the renderer can refuse oversized inputs without re-checking. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;   // 25 MB / file (server cap)
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;   // 4 MB / image for INLINE dataUrl
export const MAX_TOTAL_ATTACHMENTS = 6;
/* How long a send waits for in-flight uploads before giving up and
   marking the attachment incomplete. A 25 MB file on a slow link can
   take a while; 2 minutes is generous without being unbounded. */
export const ATTACHMENT_READY_TIMEOUT_MS = 120_000;
/* P_image-payload-alignment — the server caps every image payload at
   2,000,000 dataUrl chars (chat image_url Zod schema + persisted
   attachment schema). Anything above that is rejected with a 400/413
   the user perceives as "no response after uploading an image".
   Images whose dataUrl exceeds this target are re-encoded through a
   canvas (downscale + quality steps) until they fit. */
export const MAX_IMAGE_DATAURL_CHARS = 1_900_000; // safety margin under 2,000,000
/* A base64 data URL expands the source by roughly 4/3. Keep images below
   this conservative source-size threshold on the cheap FileReader path;
   larger images go straight from File/Blob to the image decoder so we do
   not allocate a large source data URL only to decode it again. */
export const MAX_IMAGE_SOURCE_BYTES_BEFORE_DATAURL = Math.floor(
  (MAX_IMAGE_DATAURL_CHARS - 64) * 3 / 4,
);

const ACCEPTED_IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/avif',
]);
/* Office / document formats — persisted via POST /api/v2/files and read
   back by the model through read_attachment (mammoth / SheetJS /
   PPTX / epub / rtf2text / pdf-parse on the server). */
const ACCEPTED_DOC_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/epub+zip',
  'application/rtf', 'text/rtf',
]);
const ACCEPTED_MEDIA_MIMES = new Set([
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg',
  'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/flac',
]);
/* application/* types that are really plain text — kept in sync with
   server/src/services/attachmentReader.ts. */
const TEXTUAL_APPLICATION_MIMES = new Set([
  'application/json', 'application/xml', 'application/javascript',
  'application/x-javascript', 'application/typescript', 'application/x-typescript',
  'application/yaml', 'application/x-yaml', 'application/x-sh',
  'application/sql', 'application/graphql', 'application/x-httpd-php',
  'application/toml', 'application/ld+json', 'application/x-ndjson', 'application/jsonl',
]);
/* Extension fallbacks for files the browser labels as
   application/octet-stream (code files on Windows, drag-and-drop with
   no mime sniffing). Mirrors the server-side sets. */
const TEXT_FILE_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.log', '.json', '.jsonl', '.ndjson',
  '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env', '.tex', '.bib',
  '.py', '.pyw', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.java', '.c', '.h',
  '.cpp', '.cc', '.cxx', '.hpp', '.hh', '.cs', '.go', '.rs', '.rb', '.php', '.swift',
  '.kt', '.kts', '.m', '.mm', '.scala', '.sh', '.bash', '.zsh', '.fish', '.pl', '.pm',
  '.lua', '.r', '.jl', '.sql', '.css', '.scss', '.less', '.vue', '.svelte', '.dart',
  '.ex', '.exs', '.erl', '.hrl', '.clj', '.cljs', '.hs', '.ml', '.fs', '.vb', '.ps1',
  '.bat', '.cmd', '.ipynb', '.diff', '.patch', '.gitignore', '.dockerignore', '.proto',
]);
const DOC_FILE_EXTENSIONS = new Set(['.pdf', '.docx', '.xlsx', '.pptx', '.epub', '.rtf']);
const LEGACY_OFFICE_EXTENSIONS = new Set(['.doc', '.xls', '.ppt']);
const MEDIA_FILE_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac']);

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
  } catch (_) { /* fall through */ }
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
  } catch (_) { /* fall through */ }
  return '';
}

function formatAttachmentSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' B';
}

/** The model-facing pointer line one attached file contributes to the
 * user message content. The routing hint + tool schema on the server
 * teach the model to call read_attachment with this fileId. */
export function attachmentPointerLine(a) {
  const name = String((a && a.name) || 'file');
  const mime = String((a && a.mime) || 'application/octet-stream');
  return `[Attached file: "${name}" (${mime}, ${formatAttachmentSize(a && a.size)}) — fileId: ${a.fileId}. Call read_attachment with this fileId to read its contents.]`;
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
  } catch (_) { /* swallow — bridge is best-effort */ }
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

/**
 * Read a File into a base64 dataUrl via FileReader.
 * Calls onProgress(percent) as the read progresses.
 * Returns { dataUrl, size }.
 */
function readFileAsDataUrl(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.onload = () => resolve({ dataUrl: String(reader.result || ''), size: file.size });
    if (typeof onProgress === 'function') {
      reader.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    reader.readAsDataURL(file);
  });
}

/**
 * P_image-payload-alignment — re-encode an oversized image through a
 * canvas until its dataUrl fits MAX_IMAGE_DATAURL_CHARS. The source is a
 * File/Blob, not a pre-built data URL, so large images do not pay for a
 * full base64 allocation followed by fetch(dataUrl) and a second decode.
 * Walks a downscale ladder (longest edge) and, per size, a quality ladder;
 * tries WebP first and falls back to JPEG when the browser encodes WebP as
 * PNG (Safari < 14 returns a PNG dataUrl from toDataURL). Transparency is
 * flattened onto white because JPEG has no alpha. Non-DOM environments
 * reject the oversized source with a clear message instead of silently
 * sending an oversized payload. Animated GIFs are flattened to their first
 * frame — a static image the model can see beats a 400 the user can't.
 *
 * P_perf-offscreen — uses createImageBitmap + OffscreenCanvas when
 * available so the decode and encode both run off the main thread.
 * Falls back to the legacy Image() + canvas approach otherwise.
 */
async function compressImageFile(file, onProgress) {
  if (!file) return null;
  const hasOffscreen = typeof OffscreenCanvas !== 'undefined';
  const hasCreateImageBitmap = typeof createImageBitmap === 'function';
  if (hasOffscreen && hasCreateImageBitmap) {
    const offscreen = await compressWithOffscreenCanvas(file, onProgress);
    if (offscreen) return offscreen;
  }
  return compressWithLegacyCanvas(file, onProgress);
}

/** OffscreenCanvas path — decode + encode away from the main thread. */
async function compressWithOffscreenCanvas(file, onProgress) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (_) {
    return null;
  }
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  if (!srcW || !srcH) { bitmap.close(); return null; }
  try {
    const EDGE_STEPS = [2048, 1600, 1280, 1024, 800];
    const QUALITY_STEPS = [0.85, 0.75, 0.6, 0.45];
    for (let edgeIndex = 0; edgeIndex < EDGE_STEPS.length; edgeIndex++) {
      const edge = EDGE_STEPS[edgeIndex];
      const scale = Math.min(1, edge / Math.max(srcW, srcH));
      const w = Math.max(1, Math.round(srcW * scale));
      const h = Math.max(1, Math.round(srcH * scale));
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      for (let qualityIndex = 0; qualityIndex < QUALITY_STEPS.length; qualityIndex++) {
        const q = QUALITY_STEPS[qualityIndex];
        try {
          const blob = await canvas.convertToBlob({ type: 'image/webp', quality: q });
          const out = await blobToDataUrl(blob, onProgress);
          if (out && out.length <= MAX_IMAGE_DATAURL_CHARS) return out;
        } catch (_) { /* try next quality */ }
        if (typeof onProgress === 'function') {
          const completed = edgeIndex * QUALITY_STEPS.length + qualityIndex + 1;
          onProgress(Math.min(90, 20 + Math.round(completed * 70 / (EDGE_STEPS.length * QUALITY_STEPS.length))));
        }
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}

/** Legacy canvas fallback — the encode itself is synchronous on the main thread. */
async function compressWithLegacyCanvas(file, onProgress) {
  if (typeof document === 'undefined' || typeof Image === 'undefined'
      || typeof document.createElement !== 'function') {
    return null;
  }
  let sourceUrl = '';
  let img;
  try {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    sourceUrl = URL.createObjectURL(file);
    img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image decode failed'));
      el.src = sourceUrl;
    });
  } catch (_) {
    if (sourceUrl) {
      try { URL.revokeObjectURL(sourceUrl); } catch (_) { /* noop */ }
    }
    return null;
  }
  const srcW = img.naturalWidth || img.width || 0;
  const srcH = img.naturalHeight || img.height || 0;
  if (!srcW || !srcH) {
    if (sourceUrl) {
      try { URL.revokeObjectURL(sourceUrl); } catch (_) { /* noop */ }
    }
    return null;
  }
  try {
    const EDGE_STEPS = [2048, 1600, 1280, 1024, 800];
    const QUALITY_STEPS = [0.85, 0.75, 0.6, 0.45];
    for (let edgeIndex = 0; edgeIndex < EDGE_STEPS.length; edgeIndex++) {
      const edge = EDGE_STEPS[edgeIndex];
      const scale = Math.min(1, edge / Math.max(srcW, srcH));
      const w = Math.max(1, Math.round(srcW * scale));
      const h = Math.max(1, Math.round(srcH * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      for (let qualityIndex = 0; qualityIndex < QUALITY_STEPS.length; qualityIndex++) {
        const q = QUALITY_STEPS[qualityIndex];
        let out = '';
        try { out = canvas.toDataURL('image/webp', q); } catch (_) { out = ''; }
        if (!out.startsWith('data:image/webp')) {
          try { out = canvas.toDataURL('image/jpeg', q); } catch (_) { out = ''; }
        }
        if (out && out.length <= MAX_IMAGE_DATAURL_CHARS) return out;
        if (typeof onProgress === 'function') {
          const completed = edgeIndex * QUALITY_STEPS.length + qualityIndex + 1;
          onProgress(Math.min(90, 20 + Math.round(completed * 70 / (EDGE_STEPS.length * QUALITY_STEPS.length))));
        }
      }
    }
    return null;
  } finally {
    if (sourceUrl) {
      try { URL.revokeObjectURL(sourceUrl); } catch (_) { /* noop */ }
    }
  }
}

/** Convert a Blob to a base64 dataUrl string. */
function blobToDataUrl(blob, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('blobToDataUrl failed'));
    if (typeof onProgress === 'function') {
      reader.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.min(99, 90 + Math.round((e.loaded / e.total) * 9)));
      };
    }
    reader.readAsDataURL(blob);
  });
}

/** Generate a short id for chip keying. */
function shortId() {
  // crypto.randomUUID exists in evergreen browsers + Node 19+;
  // fall back to Math.random for the unlikely no-crypto case.
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return 'att-' + crypto.randomUUID().slice(0, 8);
    }
  } catch (_) { /* fall through */ }
  return 'att-' + Math.random().toString(36).slice(2, 10);
}

function extOf(name) {
  const n = String(name || '').toLowerCase();
  const i = n.lastIndexOf('.');
  return i >= 0 ? n.slice(i) : '';
}

function isTextLikeMime(mime) {
  if (mime.startsWith('text/')) {
    /* HTML/XHTML are XSS-rejected at upload; RTF is a document. */
    return mime !== 'text/html' && mime !== 'text/xhtml' && mime !== 'text/rtf' && mime !== 'image/svg+xml';
  }
  return TEXTUAL_APPLICATION_MIMES.has(mime);
}

/** Decide whether `file` should be classified as image/text/document/file.
 * Unknown or unsafe MIMEs return null — the caller skips them with a toast. */
function classify(file) {
  if (!file) return null;
  const m = String(file.type || '').toLowerCase();
  /* Active-content types are rejected by the upload endpoint too — deny
     early so the toast matches what the server would say. */
  if (m === 'text/html' || m === 'application/xhtml+xml' || m === 'image/svg+xml') return null;
  if (ACCEPTED_IMAGE_MIMES.has(m)) return 'image';
  if (ACCEPTED_DOC_MIMES.has(m)) return 'document';
  if (isTextLikeMime(m)) return 'text';
  if (ACCEPTED_MEDIA_MIMES.has(m)) return 'file';
  /* Fallback: classify by extension when the browser couldn't determine
     the MIME (common with drag-and-drop on Windows / some download
     managers — they arrive as application/octet-stream or ''). */
  const ext = extOf(file.name);
  if (TEXT_FILE_EXTENSIONS.has(ext)) return 'text';
  if (DOC_FILE_EXTENSIONS.has(ext)) return 'document';
  if (MEDIA_FILE_EXTENSIONS.has(ext) || LEGACY_OFFICE_EXTENSIONS.has(ext)) return 'file';
  return null;
}

/** Map a classified document to the kind label used in the chip + parts. */
function docKindFromFile(file) {
  const m = String((file && file.type) || '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (m === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (m === 'application/msword') return 'doc';
  if (m === 'application/vnd.ms-excel') return 'xls';
  if (m === 'application/vnd.ms-powerpoint') return 'ppt';
  if (m === 'application/epub+zip') return 'epub';
  if (m === 'application/rtf' || m === 'text/rtf') return 'rtf';
  /* Extension fallback. */
  const name = String((file && file.name) || '').toLowerCase();
  for (const k of ['pdf', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'epub', 'rtf']) {
    if (name.endsWith('.' + k)) return k;
  }
  return 'document';
}

/**
 * Upload one File to POST /api/v2/files — the durable store the
 * read_attachment tool and /api/files/:id/raw resolve against.
 * Calls onProgress(percent) during the upload. Resolves with
 * { fileId, kind, mimeType, size } or { error } — never rejects.
 * XHR (not fetch) because fetch does not expose upload progress.
 */
function uploadAttachmentFile(file, onProgress) {
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
    if (typeof onProgress === 'function' && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = function () {
      let data = null;
      try { data = JSON.parse(xhr.responseText || '{}'); } catch (_) { /* non-JSON error page */ }
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
    xhr.onerror = () => resolve({ error: 'Network error during upload' });
    xhr.ontimeout = () => resolve({ error: 'Upload timed out' });
    /* /api/v2 — same CDN-bypass prefix apiFetch uses; the server and
       dev stub both strip it back to /api/files. */
    xhr.open('POST', '/api/v2/files');
    if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
    xhr.timeout = 300000; // 5 min — 25 MB on a slow link
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
async function prepareAttachment(entry, file, reportProgress) {
  const wantsInlineImage = entry.kind === 'image'
    && activeProviderSupportsImages()
    && file.size <= MAX_IMAGE_BYTES;
  try {
    /* Let the pending chip paint before encode/decode work starts. */
    await new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(resolve);
      else setTimeout(resolve, 0);
    });

    let uploadOutcome = null;
    const jobs = [];
    jobs.push(uploadAttachmentFile(file, function (pct) {
      reportProgress(wantsInlineImage ? Math.min(70, Math.round(pct * 0.7)) : pct);
    }).then(function (outcome) { uploadOutcome = outcome; }));

    if (entry.kind === 'image' && wantsInlineImage) {
      jobs.push((async function () {
        let dataUrl = '';
        try {
          if (file.size > MAX_IMAGE_SOURCE_BYTES_BEFORE_DATAURL) {
            dataUrl = await compressImageFile(file, function (pct) {
              reportProgress(70 + Math.round(pct * 0.3));
            });
          } else {
            const read = await readFileAsDataUrl(file, function (pct) {
              reportProgress(70 + Math.round(pct * 0.3));
            });
            dataUrl = read.dataUrl;
          }
        } catch (_) { dataUrl = ''; }
        if (dataUrl && dataUrl.length <= MAX_IMAGE_DATAURL_CHARS) {
          entry.dataUrl = dataUrl;
          const m = /^data:([^;,]+)/.exec(dataUrl);
          if (m) entry.mime = m[1];
          /* Approximate decoded byte size from the base64 body. */
          entry.size = Math.round((dataUrl.length - (dataUrl.indexOf(',') + 1)) * 3 / 4);
        }
      })());
    }

    await Promise.all(jobs);

    entry.pending = false;
    entry.progress = 100;
    /* The blob thumbnail was only needed until the durable file (or the
       inline dataUrl) existed — the chip now renders from
       /api/files/:id/raw or dataUrl. */
    if (entry.thumbnailUrl) {
      try { URL.revokeObjectURL(entry.thumbnailUrl); } catch (_) { /* noop */ }
      entry.thumbnailUrl = undefined;
    }

    if (uploadOutcome && uploadOutcome.fileId) {
      entry.fileId = uploadOutcome.fileId;
      if (uploadOutcome.mimeType) entry.mime = uploadOutcome.mimeType;
      return { ok: true };
    }
    /* Upload failed but a multimodal image still has its inline dataUrl:
       the model sees the image this turn; the attachment just won't be
       re-readable from storage after reload. */
    if (entry.dataUrl) return { ok: true };
    return { ok: false, error: (uploadOutcome && uploadOutcome.error) || 'Upload failed' };
  } catch (err) {
    entry.pending = false;
    entry.progress = 100;
    return { ok: false, error: (err && err.message) || 'read failed' };
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
 * @returns {Promise<{added:number, rejected:string[]}>}
 */
export async function addFiles(fileList, onUpdate, onProgress) {
  const files = Array.from(fileList || []);
  const result = { added: 0, rejected: [] };
  /* U/perf — coalesce per-tick progress into one repaint per animation
     frame. Upload progress events fire far faster than the browser can
     usefully re-render every chip; rAF (setTimeout fallback in non-DOM
     envs) de-bounces those into at most one callback per frame. Final
     states still call onUpdate() directly below, so the terminal chip
     is always accurate and the public API is unchanged. */
  let _progressRaf = 0;
  const _rafFn = (typeof requestAnimationFrame === 'function')
    ? requestAnimationFrame : function (cb) { return setTimeout(cb, 16); };
  function notifyProgress() {
    if (_progressRaf) return;
    _progressRaf = _rafFn(function () {
      _progressRaf = 0;
      if (onProgress) onProgress();
      else if (onUpdate) onUpdate();
    });
  }
  const jobs = [];
  for (const file of files) {
    if (attachments.length >= MAX_TOTAL_ATTACHMENTS) {
      result.rejected.push(`${file.name || 'file'}: max ${MAX_TOTAL_ATTACHMENTS} attachments per turn`);
      continue;
    }
    const kind = classify(file);
    if (!kind) {
      result.rejected.push(`${file.name || 'file'}: ${_t('chat.attach.unsupported', 'unsupported file type')}`);
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      result.rejected.push(`${file.name}: file exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB limit`);
      continue;
    }
    const pendingId = shortId();
    const entry = {
      id: pendingId, kind: kind, pending: true, progress: 0,
      name: file.name || 'file',
      mime: file.type || 'application/octet-stream',
      size: file.size,
    };
    if (kind === 'document') entry.docKind = docKindFromFile(file);
    if (kind === 'image'
        && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      /* P_perf-blob-url — the chip thumbnail appears instantly from the
         local blob while the upload runs; revoked once the durable
         file (or inline dataUrl) exists. */
      try { entry.thumbnailUrl = URL.createObjectURL(file); } catch (_) { /* noop */ }
    }
    attachments.push(entry);
    if (onUpdate) onUpdate();

    const job = prepareAttachment(entry, file, function (pct) {
      entry.progress = pct;
      notifyProgress();
    }).then(function (outcome) {
      if (outcome && outcome.error) {
        entry.error = outcome.error;
        result.rejected.push(`${file.name}: ${outcome.error}`);
      } else {
        result.added++;
      }
      if (onUpdate) onUpdate();
    });
    READY_PROMISES.set(pendingId, job.finally(function () { READY_PROMISES.delete(pendingId); }));
    jobs.push(job);
  }
  await Promise.all(jobs);
  return result;
}

/** Revoke blob URLs for a list of attachment entries. */
function _revokeBlobUrls(list) {
  for (let i = 0; i < list.length; i++) {
    const url = list[i].thumbnailUrl;
    if (url) {
      try { URL.revokeObjectURL(url); } catch (_) { /* noop */ }
    }
  }
}

/**
 * Remove one attachment by id. Returns true if found.
 * The in-flight upload job is left to settle on the detached entry —
 * cancelling mid-XHR is not worth the complexity for a 25 MB cap.
 */
export function removeAttachment(id) {
  const idx = attachments.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  _revokeBlobUrls([attachments[idx]]);
  attachments.splice(idx, 1);
  return true;
}

/**
 * Build the outgoing message payload from the user's text + pending
 * attachments. Returns:
 *   - rawText: the user's original text only (attachment chips in the
 *     bubble provide the visual representation).
 *   - parts: array of content parts for the LLM —
 *       · image_url for images when the provider is multimodal,
 *       · an [Attached file: … fileId: X] pointer text part for every
 *         uploaded file (the model reads it via read_attachment),
 *       · legacy [Parsed …] text for old inline-payload rows.
 *   - attachmentList: the metadata array persisted on the message row
 *     (fileId, name, mime, size, kind — never a pre-parsed text dump).
 *
 * P_attachments-ready — waits for in-flight uploads first so a send
 * clicked during a pending upload still ships the fileId.
 *
 * If there are no attachments we return `{ rawText: text, parts: text,
 * attachmentList: [] }` so callers can treat the result uniformly.
 */
export async function buildMessageContent(text, attachmentSnapshot) {
  const t = String(text || '');
  /* A send click may clear the live composer immediately so the input can
     collapse in the same frame as the user bubble appears. Accept an
     immutable per-turn snapshot to keep the asynchronous upload wait
     independent from the next draft's attachments. */
  const turnAttachments = Array.isArray(attachmentSnapshot)
    ? attachmentSnapshot.slice()
    : attachments.slice();
  if (!turnAttachments.length) {
    return { rawText: t, parts: t, attachmentList: [] };
  }

  /* Entries may still be uploading (pending:true). Wait for their jobs
     before assembling parts — dropping the fileId would leave the model
     a pointer it cannot resolve and the user a dead chip after reload. */
  await waitForAttachmentsReady(turnAttachments, ATTACHMENT_READY_TIMEOUT_MS);

  const multimodal = activeProviderSupportsImages();
  const parts = [];
  if (t) parts.push({ type: 'text', text: t });
  for (const a of turnAttachments) {
    if (!a) continue;
    if (a.pending) {
      /* Still pending after the ready window — tell the model honestly
         rather than emitting a dangling fileId. */
      parts.push({ type: 'text', text: `[Attached file: "${a.name || 'file'}" did not finish uploading in time. Tell the user you could not read it and suggest retrying.]` });
      continue;
    }
    if (a.kind === 'image' && a.dataUrl && multimodal) {
      /* No `detail` field: the allowed set differs per provider and
         MiniMax rejects "auto" outright with a 400. Omitting it lets
         the upstream use its default resolution. */
      parts.push({ type: 'image_url', image_url: { url: a.dataUrl } });
    }
    if (a.fileId) {
      parts.push({ type: 'text', text: attachmentPointerLine(a) });
      continue;
    }
    if (a.error) {
      parts.push({ type: 'text', text: `[Attached file: "${a.name || 'file'}" failed to upload (${a.error}). Tell the user you cannot read it and suggest retrying.]` });
      continue;
    }
    /* Legacy inline payloads (older rows persisted with text/dataUrl but
       no fileId) keep flowing so history rebuilds stay lossless. */
    if ((a.kind === 'text' || a.kind === 'document' || a.kind === 'pdf') && a.text) {
      const label = a.docKind
        ? `[Parsed ${String(a.docKind).toUpperCase()}: ${a.name || 'file'}]`
        : `[Parsed file: ${a.name || 'file'}]`;
      parts.push({ type: 'text', text: `${label}\n${a.text}` });
      continue;
    }
    if (a.kind === 'image' && a.dataUrl && !multimodal) {
      parts.push({ type: 'text', text: `[User attached an image "${a.name || 'image'}" but it could not be uploaded, so you cannot view it. Tell the user and suggest re-uploading.]` });
    }
  }

  /* Persisted metadata only — fileId + display fields. The server strips
     unknown keys anyway, but keeping the persisted shape explicit makes
     the contract obvious and keeps thumbnailUrl/pending/progress out of
     the session row. */
  const attachmentList = turnAttachments.slice(0, MAX_TOTAL_ATTACHMENTS).map((a) => ({
    id: a.id,
    kind: a.kind,
    docKind: a.docKind,
    name: a.name,
    mime: a.mime,
    fileId: a.fileId,
    /* P_file-attachments — once a durable fileId exists the base64 copy
       is redundant: the chip/history thumbnail renders from
       /api/files/:id/raw and the model re-reads via read_attachment.
       Keeping it anyway would write ~2 MB into every session save.
       Only upload-failed fallback images keep the inline payload. */
    dataUrl: a.fileId ? undefined : a.dataUrl,
    text: a.text,
    truncated: a.truncated,
    size: a.size,
    error: a.error || (a.pending ? 'upload_incomplete' : undefined),
  }));

  return { rawText: t, parts, attachmentList };
}
