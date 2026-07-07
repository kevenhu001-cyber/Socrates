/**
 * attachments.js — pending-attachment store for the chat composer.
 *
 * Each attachment is a plain object describing an inlined image, a
 * parsed text file, or a server-extracted PDF body. We persist the
 * attachments column on the message row so reloads restore thumbnails
 * without re-uploading; see server/src/routes/sessions.js for the
 * server-side schema.
 *
 * Limits (per the plan at /home/ubuntu/.claude/plans/tingly-zooming-pebble.md):
 *   - Up to 6 attachments per turn.
 *   - Images: ≤4 MB each, inlined as base64 dataUrl.
 *   - Text/PDF: ≤200 KB extracted text each (capped client-side too).
 *   - PDFs are sent via POST /api/files/extract (multipart) and only
 *     the parsed text comes back — no PDF persistence on the server.
 *
 * The exposed API:
 *   attachments                  — module-level array (current turn)
 *   resetAttachments()           — clear the array (call on submit / cancel)
 *   addFiles(FileList|File[])    — async; reads files, builds entries
 *   removeAttachment(id)         — drop one chip
 *   buildMessageContent(text)    — assemble { rawText, parts, attachmentList }
 *
 * Export is intentionally named (not `export {}`) so the file can be
 * imported as a side-effect module from main.js without needing named
 * binding destructuring everywhere.
 */

/* Limits — kept as named constants so the UI can show "max 6" hints
 * and the renderer can refuse oversized inputs without re-checking. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;   // 4 MB / image
export const MAX_TEXT_BYTES = 200 * 1024;         // 200 KB / text or PDF body
export const MAX_TOTAL_ATTACHMENTS = 6;

const ACCEPTED_IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
]);
const ACCEPTED_TEXT_MIMES = new Set([
  'text/plain', 'text/csv', 'text/markdown', 'application/json',
]);
/* Office / document formats — extracted server-side via
   POST /api/files/extract which dispatches to mammoth / SheetJS /
   our JSZip-based PPTX parser / epub / rtf2text. */
const ACCEPTED_DOC_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/epub+zip',
  'application/rtf', 'text/rtf',
]);

/* Pending attachments for the current turn. The store is
 * deliberately not React-ish / observable — main.js calls
 * `renderAttachmentChips()` after each mutation. */
export const attachments = [];

/** Clear the pending attachments list. Called after submit + on cancel. */
export function resetAttachments() {
  attachments.length = 0;
}

/**
 * Read a File into a base64 dataUrl via FileReader.
 * Returns { dataUrl, size }.
 */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.onload = () => resolve({ dataUrl: String(reader.result || ''), size: file.size });
    reader.readAsDataURL(file);
  });
}

/** Read a File as plain UTF-8 text. */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsText(file);
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

/** Decide whether `file` should be classified as image/text/document.
 * Unknown MIMEs return null — the caller skips them with a toast. */
function classify(file) {
  if (!file || !file.type) return null;
  if (ACCEPTED_IMAGE_MIMES.has(file.type)) return 'image';
  if (ACCEPTED_TEXT_MIMES.has(file.type)) return 'text';
  if (ACCEPTED_DOC_MIMES.has(file.type)) return 'document';
  // Fallback: classify by extension when the browser couldn't determine
  // the MIME (common with drag-and-drop on Windows / some download managers).
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.csv')
      || name.endsWith('.json') || name.endsWith('.log')) {
    return 'text';
  }
  if (name.endsWith('.pdf')) return 'document';
  if (name.endsWith('.docx')) return 'document';
  if (name.endsWith('.xlsx')) return 'document';
  if (name.endsWith('.pptx')) return 'document';
  if (name.endsWith('.epub')) return 'document';
  if (name.endsWith('.rtf')) return 'document';
  return null;
}

/** Map a classified document to the kind label used in the chip + parts. */
function docKindFromFile(file) {
  const m = String((file && file.type) || '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (m === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (m === 'application/epub+zip') return 'epub';
  if (m === 'application/rtf' || m === 'text/rtf') return 'rtf';
  /* Extension fallback. */
  const name = String((file && file.name) || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.xlsx')) return 'xlsx';
  if (name.endsWith('.pptx')) return 'pptx';
  if (name.endsWith('.epub')) return 'epub';
  if (name.endsWith('.rtf')) return 'rtf';
  return 'document';
}

/**
 * Extract text from a PDF / DOCX / XLSX / PPTX / EPUB / RTF by POSTing
 * the file to /api/files/extract. Returns { text, truncated, meta, error? }.
 *
 * The endpoint is mounted in server/src/routes/fileExtract.js and
 * dispatches to the appropriate parser based on the file's MIME type.
 * We use multipart/form-data with a single `file` field. Errors surface
 * as a non-throwing { error } so the caller can keep the chip and show
 * a banner instead of crashing the chat send.
 */
async function extractDocumentText(file) {
  const fd = new FormData();
  fd.append('file', file, file.name || 'document');
  const csrf = (typeof window !== 'undefined' && window.getCsrfToken)
    ? window.getCsrfToken() : '';
  const headers = csrf ? { 'X-CSRF-Token': csrf } : {};
  const res = await fetch('/api/files/extract', {
    method: 'POST',
    body: fd,
    credentials: 'same-origin',
    headers,
  });
  if (!res.ok) {
    return { text: '', truncated: false, meta: {}, error: `Extract failed (${res.status})` };
  }
  const data = await res.json().catch(() => ({}));
  if (data && data.ok === false) {
    return { text: '', truncated: false, meta: {}, error: data.error || 'Extract failed' };
  }
  return {
    text: data.text || '',
    truncated: !!data.truncated,
    meta: data.meta || {},
    kind: data.kind || 'document',
    error: data.error || undefined,
  };
}

/**
 * Process a FileList / array of File objects, appending each accepted
 * one to the pending list. Silently drops rejections (oversized,
 * unsupported type, count cap reached) and returns a { added, rejected }
 * summary so the UI can toast a status.
 *
 * @param {FileList|File[]} fileList
 * @returns {Promise<{added:number, rejected:string[]}>}
 */
export async function addFiles(fileList) {
  const files = Array.from(fileList || []);
  const result = { added: 0, rejected: [] };
  /* P_attachments-multimodal — proactive gate for image attachments.
   * We refuse to even chip an image if the active provider is not
   * flagged as multimodal, because shipping the base64 to a text-
   * only model results in a confusing upstream 400. Text/PDF
   * attachments don't depend on vision, so they pass through.
   *
   * We resolve the active provider lazily so this module is usable
   * in isolation (the function may be undefined in tests). */
  const activeProvider = (typeof window !== 'undefined' && typeof window.getActiveProvider === 'function')
    ? window.getActiveProvider() : null;
  const activeIsMultimodal = !!(activeProvider && activeProvider.isMultimodal === true);
  for (const file of files) {
    if (attachments.length >= MAX_TOTAL_ATTACHMENTS) {
      result.rejected.push(`${file.name || 'file'}: max ${MAX_TOTAL_ATTACHMENTS} attachments per turn`);
      continue;
    }
    const kind = classify(file);
    if (!kind) {
      result.rejected.push(`${file.name || 'file'}: unsupported file type`);
      continue;
    }
    try {
      if (kind === 'image') {
        /* P_attachments-multimodal — refuse images for non-multimodal
         * active providers. The i18n key `attach.notMultimodal` is
         * surfaced by the main.js caller via showToast(). */
        if (!activeIsMultimodal) {
          result.rejected.push(`${file.name}: active provider is not multimodal`);
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          result.rejected.push(`${file.name}: image exceeds ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
          continue;
        }
        const { dataUrl } = await readFileAsDataUrl(file);
        attachments.push({
          id: shortId(),
          kind: 'image',
          name: file.name || 'image',
          mime: file.type,
          dataUrl,
          size: file.size,
        });
        result.added++;
      } else if (kind === 'text') {
        let text = await readFileAsText(file);
        let truncated = false;
        if (text.length > MAX_TEXT_BYTES) {
          text = text.slice(0, MAX_TEXT_BYTES);
          truncated = true;
        }
        attachments.push({
          id: shortId(),
          kind: 'text',
          name: file.name || 'file.txt',
          mime: file.type || 'text/plain',
          text,
          truncated,
          size: file.size,
        });
        result.added++;
      } else if (kind === 'document') {
        if (file.size > MAX_IMAGE_BYTES * 6) { // ~25 MB cap, matches /api/files/extract
          result.rejected.push(`${file.name}: file exceeds 25 MB limit`);
          continue;
        }
        const docKind = docKindFromFile(file);
        const { text, truncated, meta, error } = await extractDocumentText(file);
        const baseMime = file.type || ({
          pdf: 'application/pdf',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          epub: 'application/epub+zip',
          rtf: 'application/rtf',
        })[docKind] || 'application/octet-stream';
        if (error) {
          result.rejected.push(`${file.name}: ${error}`);
          attachments.push({
            id: shortId(),
            kind: 'document',
            docKind,
            name: file.name || `document.${docKind}`,
            mime: baseMime,
            text: '',
            truncated: false,
            meta: {},
            size: file.size,
            error,
          });
          continue;
        }
        attachments.push({
          id: shortId(),
          kind: 'document',
          docKind,
          name: file.name || `document.${docKind}`,
          mime: baseMime,
          text,
          truncated,
          meta,
          size: file.size,
        });
        result.added++;
      }
    } catch (err) {
      result.rejected.push(`${file.name || 'file'}: ${err.message || 'read failed'}`);
    }
  }
  return result;
}

/**
 * Remove one attachment by id. Returns true if found.
 */
export function removeAttachment(id) {
  const idx = attachments.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  attachments.splice(idx, 1);
  return true;
}

/**
 * Build the outgoing message payload from the user's text + pending
 * attachments. Returns:
 *   - rawText: the user's original text only (attachment chips in the
 *     bubble provide the visual representation — no text placeholders).
 *   - parts: array of content parts for the LLM (image_url for
 *     vision-capable models, plain text otherwise — the server
 *     degrades images to text-only for non-multimodal models).
 *   - attachmentList: the array we persist to the DB.
 *
 * If there are no attachments we return `{ rawText: text, parts: text,
 * attachmentList: [] }` so callers can treat the result uniformly.
 */
export function buildMessageContent(text) {
  const t = String(text || '');
  if (!attachments.length) {
    return { rawText: t, parts: t, attachmentList: [] };
  }

  const rawText = t;

  const parts = [];
  if (t) parts.push({ type: 'text', text: t });
  for (const a of attachments) {
    if (a.kind === 'image' && a.dataUrl) {
      parts.push({
        type: 'image_url',
        image_url: { url: a.dataUrl, detail: 'auto' },
      });
    } else if (a.kind === 'text' && a.text) {
      parts.push({
        type: 'text',
        text: `[Parsed file: ${a.name}]\n${a.text}`,
      });
    } else if (a.kind === 'document' && a.text) {
      const label = a.docKind
        ? `[Parsed ${a.docKind.toUpperCase()}: ${a.name}]`
        : `[Parsed document: ${a.name}]`;
      parts.push({ type: 'text', text: `${label}\n${a.text}` });
    }
    // Documents with no extracted text (parse error) contribute
    // nothing to the LLM content — the attachment chip still tells
    // the user what they attached.
  }

  // Defensive: the server caps to 20; trim here too.
  const attachmentList = attachments.slice(0, 20).map((a) => ({
    id: a.id,
    kind: a.kind,
    docKind: a.docKind,
    name: a.name,
    mime: a.mime,
    dataUrl: a.dataUrl,
    text: a.text,
    truncated: a.truncated,
    pageCount: a.pageCount,
    meta: a.meta,
    size: a.size,
    error: a.error,
  }));

  return { rawText, parts, attachmentList };
}