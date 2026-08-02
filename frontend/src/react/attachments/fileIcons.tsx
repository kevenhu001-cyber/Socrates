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

const DOC_OUTLINE =
  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
  '<polyline points="14 2 14 8 20 8"/>';

/* Office letters — the model document outline with a single capital
 * letter centred in the body. The 12 11 baseline avoids descender
 * clipping; the 6 16 cap height keeps the letter visually balanced
 * inside the 20×20 doc body. */
const OFFICE_LETTER = (letter: string) =>
  `<text x="12" y="16" text-anchor="middle" font-size="9" font-weight="700" font-family="ui-sans-serif,system-ui,sans-serif" fill="currentColor" stroke="none">${letter}</text>`;

const WORD_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DOC_OUTLINE}${OFFICE_LETTER('W')}</svg>`;
const EXCEL_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DOC_OUTLINE}${OFFICE_LETTER('X')}</svg>`;
const POWERPOINT_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DOC_OUTLINE}${OFFICE_LETTER('P')}</svg>`;
/* PDF uses three short letters; smaller font and tighter baseline
 * so all three fit on one line. */
const PDF_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DOC_OUTLINE}<text x="12" y="16" text-anchor="middle" font-size="6.5" font-weight="700" font-family="ui-sans-serif,system-ui,sans-serif" fill="currentColor" stroke="none">PDF</text></svg>`;

const TEXT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  DOC_OUTLINE +
  '<line x1="8" y1="13" x2="16" y2="13"/>' +
  '<line x1="8" y1="17" x2="14" y2="17"/>' +
  '</svg>';

/* Code — angular brackets framing a slash. Matches the `< />` glyph
 * the user requested in the reference image. */
const CODE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<polyline points="8 7 3 12 8 17"/>' +
  '<polyline points="16 7 21 12 16 17"/>' +
  '<line x1="14" y1="5" x2="10" y2="19"/>' +
  '</svg>';

const IMAGE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>' +
  '<circle cx="8.5" cy="8.5" r="1.5"/>' +
  '<polyline points="21 15 16 10 5 21"/>' +
  '</svg>';

const FILE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  DOC_OUTLINE +
  '</svg>';

/* File-extension → category lookup. Lower-cased, dotted forms only.
 * Order doesn't matter: the first matcher in FILE_ICON_PICKER that
 * accepts the entry wins, so this list is grouped by specificity. */
const CODE_EXTENSIONS = new Set([
  'py', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'java', 'kt', 'kts', 'swift', 'go', 'rs', 'rb',
  'php', 'c', 'cc', 'cpp', 'cxx', 'h', 'hpp', 'm', 'mm',
  'cs', 'scala', 'sh', 'bash', 'zsh', 'sql', 'r',
  'lua', 'pl', 'dart', 'ex', 'exs', 'elm', 'clj',
  'html', 'htm', 'xml', 'vue', 'svelte', 'yaml', 'yml', 'toml',
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
function pickIcon(entry: AttachmentEntry): string {
  const docKind = String(entry.docKind || '').toLowerCase();
  if (docKind === 'docx') return WORD_ICON;
  if (docKind === 'xlsx') return EXCEL_ICON;
  if (docKind === 'pptx') return POWERPOINT_ICON;
  if (docKind === 'pdf') return PDF_ICON;
  if (docKind === 'epub' || docKind === 'rtf') return TEXT_ICON;

  const mime = String(entry.mime || '').toLowerCase();
  if (mime.startsWith('image/')) return IMAGE_ICON;
  if (mime === 'application/pdf') return PDF_ICON;
  if (mime.startsWith('text/')) return TEXT_ICON;

  const ext = getExtension(entry.name);
  if (ext && CODE_EXTENSIONS.has(ext)) return CODE_ICON;
  if (ext && TEXT_EXTENSIONS.has(ext)) return TEXT_ICON;

  return FILE_ICON;
}

export function getAttachmentIcon(entry: AttachmentEntry): string {
  return pickIcon(entry);
}
