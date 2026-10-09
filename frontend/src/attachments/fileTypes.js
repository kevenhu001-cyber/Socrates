/* File type policy for chat attachments. Keep this browser-only module
   independent from upload state so accepted formats and fallbacks are
   reviewable and testable without an XHR or DOM. */

const ACCEPTED_IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/avif',
]);

const DOCUMENT_MIME_KINDS = new Map([
  ['application/pdf', 'pdf'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
  ['application/msword', 'doc'],
  ['application/vnd.ms-excel', 'xls'],
  ['application/vnd.ms-powerpoint', 'ppt'],
  ['application/epub+zip', 'epub'],
  ['application/rtf', 'rtf'],
  ['text/rtf', 'rtf'],
  ['application/vnd.oasis.opendocument.text', 'odt'],
  ['application/vnd.oasis.opendocument.spreadsheet', 'ods'],
  ['application/vnd.oasis.opendocument.presentation', 'odp'],
]);
const ACCEPTED_DOC_MIMES = new Set(DOCUMENT_MIME_KINDS.keys());

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

/* Extension fallbacks cover code files whose browser MIME is empty or
   application/octet-stream (common with Windows drag-and-drop). */
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
const DOCUMENT_EXTENSIONS = new Set([
  '.pdf', '.docx', '.xlsx', '.pptx', '.epub', '.rtf', '.odt', '.ods', '.odp', '.doc', '.xls',
]);
const DOCUMENT_KIND_BY_EXTENSION = new Map([
  ['.pdf', 'pdf'], ['.docx', 'docx'], ['.xlsx', 'xlsx'], ['.pptx', 'pptx'],
  ['.doc', 'doc'], ['.xls', 'xls'], ['.ppt', 'ppt'], ['.epub', 'epub'],
  ['.rtf', 'rtf'], ['.odt', 'odt'], ['.ods', 'ods'], ['.odp', 'odp'],
]);
/* .doc/.xls are parsed server-side; .ppt remains metadata-only. */
const MEDIA_FILE_EXTENSIONS = new Set([
  '.mp4', '.webm', '.mov', '.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.ppt',
]);
const UNSAFE_MIMES = new Set([
  'text/html', 'text/xhtml', 'application/xhtml+xml', 'image/svg+xml',
]);

function extOf(name) {
  const normalized = String(name || '').toLowerCase();
  const index = normalized.lastIndexOf('.');
  return index >= 0 ? normalized.slice(index) : '';
}

function isTextLikeMime(mime) {
  if (mime.startsWith('text/')) return mime !== 'text/rtf';
  return TEXTUAL_APPLICATION_MIMES.has(mime);
}

/** Return image, text, document, file, or null for an unsupported type. */
export function classifyAttachmentFile(file) {
  if (!file) return null;
  const mime = String(file.type || '').toLowerCase();
  if (UNSAFE_MIMES.has(mime)) return null;
  if (ACCEPTED_IMAGE_MIMES.has(mime)) return 'image';
  if (ACCEPTED_DOC_MIMES.has(mime)) return 'document';
  if (isTextLikeMime(mime)) return 'text';
  if (ACCEPTED_MEDIA_MIMES.has(mime)) return 'file';

  const extension = extOf(file.name);
  if (TEXT_FILE_EXTENSIONS.has(extension)) return 'text';
  if (DOCUMENT_EXTENSIONS.has(extension)) return 'document';
  if (MEDIA_FILE_EXTENSIONS.has(extension)) return 'file';
  return null;
}

/** Map a classified document to the kind label used in chips and parts. */
export function docKindFromFile(file) {
  const mime = String((file && file.type) || '').toLowerCase();
  const mimeKind = DOCUMENT_MIME_KINDS.get(mime);
  if (mimeKind) return mimeKind;
  return DOCUMENT_KIND_BY_EXTENSION.get(extOf(file && file.name)) || 'document';
}
