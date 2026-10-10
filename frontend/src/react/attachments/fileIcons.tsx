/**
 * SVG icons for the attachment chip row.
 *
 * Each icon is a 24×24 outline that lives inside a 28×28 rounded chip
 * background. Icons are tinted via `currentColor`, so the chip CSS
 * (color: hsl(var(--text-300)) in the dark theme) decides the final
 * hue. The reference design uses a single accent (a soft blue) across
 * every kind, so every glyph here shares the same stroke style and
 * we don't recolor per file type — picking the right glyph is the
 * visual signal.
 *
 * Add new kinds by appending to FILE_ICON_PICKER below; the picker
 * runs once per chip render and short-circuits at the first match.
 *
 * Glyph design rules (kept consistent so every chip looks like the
 * same family):
 *   - 24×24 viewBox, stroke 2px, round caps/joins, fill none.
 *   - The document outline is the same path for office/text kinds;
 *     the inner glyph (W, X, P, PDF, …) is the only thing that
 *     changes.
 *   - Code / image / generic use a distinct outline shape.
 */
import type { AttachmentEntry } from './types';

/* Structural subset the icon picker actually reads — widened so both
   the composer AttachmentEntry and the persisted domain attachment
   (optional id, ReadonlyArray rows) can drive it. */
export type IconSource = Pick<AttachmentEntry, 'kind' | 'docKind' | 'mime' | 'name'>;

const DOC_PATH =
  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
  '<polyline points="14 2 14 8 20 8"/>';

const OFFICE_BADGE = (color: string, letter: string) =>
  `<rect x="3" y="10" width="10" height="9" rx="1.5" fill="${color}" stroke="none"/>` +
  `<text x="8" y="17" text-anchor="middle" font-size="7" font-weight="800" font-family="ui-sans-serif,system-ui,sans-serif" fill="#ffffff" stroke="none">${letter}</text>`;

const WORD_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DOC_PATH}${OFFICE_BADGE('#2563eb', 'W')}</svg>`;
const EXCEL_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DOC_PATH}${OFFICE_BADGE('#16a34a', 'X')}</svg>`;
const POWERPOINT_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DOC_PATH}${OFFICE_BADGE('#ea580c', 'P')}</svg>`;
const PDF_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DOC_PATH}${OFFICE_BADGE('#dc2626', 'P')}</svg>`;

const TEXT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  DOC_PATH +
  '<line x1="8" y1="13" x2="16" y2="13"/>' +
  '<line x1="8" y1="17" x2="13" y2="17"/>' +
  '</svg>';

const EPUB_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 6c-2-1.5-5-2-8-2v14c3 0 6 0.5 8 2 2-1.5 5-2 8-2V4c-3 0-6 0.5-8 2z"/>' +
  '<line x1="12" y1="6" x2="12" y2="20"/>' +
  '</svg>';
const RTF_ICON = WORD_ICON;

const CODE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  DOC_PATH +
  '<polyline points="8 13 6 15 8 17" stroke-width="1.8"/>' +
  '<polyline points="12 13 14 15 12 17" stroke-width="1.8"/>' +
  '</svg>';

const IMAGE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>' +
  '<circle cx="8.5" cy="8.5" r="1.5"/>' +
  '<polyline points="21 15 16 10 5 21"/>' +
  '</svg>';

const FILE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  DOC_PATH +
  '</svg>';

const MEDIA_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  DOC_PATH +
  '<polygon points="9 12 14 15 9 18 9 12" fill="#8b5cf6" stroke="none"/>' +
  '</svg>';

/* File-extension → category lookup. Lower-cased, dotted forms only.
 * Order doesn't matter: the first matcher in FILE_ICON_PICKER that
 * accepts the entry wins, so this list is grouped by specificity. */
const CODE_EXTENSIONS = new Set([
  'py', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'java', 'kt', 'kts', 'swift', 'go', 'rs', 'rb',
  'php', 'c', 'cc', 'cpp', 'cxx', 'h', 'hpp', 'm', 'mm',
  'cs', 'scala', 'sh', 'bash', 'zsh', 'fish', 'sql', 'r',
  'lua', 'pl', 'dart', 'ex', 'exs', 'elm', 'clj',
  'html', 'htm', 'xml', 'vue', 'svelte', 'yaml', 'yml', 'toml',
  'css', 'scss', 'less', 'ipynb', 'diff', 'patch', 'proto',
  'ps1', 'bat', 'cmd',
]);
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'rst', 'log', 'json', 'csv', 'tsv']);

function getExtension(name: string | undefined): string {
  if (!name) return '';
  const i = name.lastIndexOf('.');
  if (i < 0 || i === name.length - 1) return '';
  return name.slice(i + 1).toLowerCase();
}

/**
 * Pick the right glyph for an attachment entry. Resolution order:
 *   1. `entry.docKind` (set by the server-side extractor — most
 *      authoritative for office formats).
 *   2. The MIME prefix (image/* → IMAGE_ICON, text/* → TEXT_ICON).
 *   3. The filename extension (CODE / TEXT categories).
 *   4. Fallback to FILE_ICON.
 */
function pickIcon(entry: IconSource): string {
  const docKind = String(entry.docKind || '').toLowerCase();
  if (docKind === 'docx' || docKind === 'doc') return WORD_ICON;
  if (docKind === 'xlsx' || docKind === 'xls') return EXCEL_ICON;
  if (docKind === 'pptx' || docKind === 'ppt') return POWERPOINT_ICON;
  if (docKind === 'pdf') return PDF_ICON;
  if (docKind === 'epub') return EPUB_ICON;
  if (docKind === 'rtf') return RTF_ICON;
  /* OpenDocument maps onto its closest Office cousin. */
  if (docKind === 'ods') return EXCEL_ICON;
  if (docKind === 'odp') return POWERPOINT_ICON;
  if (docKind === 'odt') return TEXT_ICON;

  const mime = String(entry.mime || '').toLowerCase();
  if (mime.startsWith('image/')) return IMAGE_ICON;
  if (mime === 'application/pdf') return PDF_ICON;
  if (mime.startsWith('audio/') || mime.startsWith('video/')) return MEDIA_ICON;
  if (mime.startsWith('text/')) return TEXT_ICON;

  /* Media files classified as kind 'file' by extension (the browser
     didn't supply a mime). */
  if (entry.kind === 'file') {
    const mediaExt = getExtension(entry.name);
    if (mediaExt && ['mp4', 'webm', 'mov', 'mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'].includes(mediaExt)) {
      return MEDIA_ICON;
    }
    const officeExt = getExtension(entry.name);
    if (officeExt === 'doc') return WORD_ICON;
    if (officeExt === 'xls') return EXCEL_ICON;
    if (officeExt === 'ppt') return POWERPOINT_ICON;
  }

  const ext = getExtension(entry.name);
  if (ext && CODE_EXTENSIONS.has(ext)) return CODE_ICON;
  if (ext && TEXT_EXTENSIONS.has(ext)) return TEXT_ICON;

  return FILE_ICON;
}

export function getAttachmentIcon(entry: IconSource): string {
  return pickIcon(entry);
}
