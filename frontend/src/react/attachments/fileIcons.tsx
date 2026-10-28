/** Attachment glyphs use the shared rounded document shell. Office badges keep
 * their familiar semantic colors; neutral files inherit the current theme. */
import { interfaceIcon, interfaceIconInnerHtml } from '../../ui/icons/interfaceIcons';
import type { AttachmentEntry } from './types';

/* Structural subset the icon picker actually reads — widened so both
   the composer AttachmentEntry and the persisted domain attachment
   (optional id, ReadonlyArray rows) can drive it. */
export type IconSource = Pick<AttachmentEntry, 'kind' | 'docKind' | 'mime' | 'name'>;

const DOC_PATH = interfaceIconInnerHtml('document');
const OFFICE_BADGE = (color: string, letter: string) =>
  `<rect x="3" y="10" width="10" height="9" rx="2.5" fill="${color}" stroke="none"/>` +
  `<text x="8" y="17" text-anchor="middle" font-size="7" font-weight="800" font-family="Geist Sans,Arial,sans-serif" fill="#ffffff" stroke="none">${letter}</text>`;

const WORD_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DOC_PATH}${OFFICE_BADGE('#2563eb', 'W')}</svg>`;
const EXCEL_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DOC_PATH}${OFFICE_BADGE('#16a34a', 'X')}</svg>`;
const POWERPOINT_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DOC_PATH}${OFFICE_BADGE('#ea580c', 'P')}</svg>`;
const PDF_ICON =
  `<svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DOC_PATH}${OFFICE_BADGE('#dc2626', 'P')}</svg>`;

const TEXT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  DOC_PATH +
  '<line x1="8" y1="13" x2="16" y2="13"/>' +
  '<line x1="8" y1="17" x2="13" y2="17"/>' +
  '</svg>';

const EPUB_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 6c-2-1.5-5-2-8-2v14c3 0 6 0.5 8 2 2-1.5 5-2 8-2V4c-3 0-6 0.5-8 2z"/>' +
  '<line x1="12" y1="6" x2="12" y2="20"/>' +
  '</svg>';
const RTF_ICON = WORD_ICON;

const CODE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  DOC_PATH +
  '<polyline points="8 13 6 15 8 17" stroke-width="1.8"/>' +
  '<polyline points="12 13 14 15 12 17" stroke-width="1.8"/>' +
  '</svg>';

const IMAGE_ICON = interfaceIcon('image');

const FILE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  DOC_PATH +
  '</svg>';

const MEDIA_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
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
const MEDIA_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac']);
const DOC_KIND_ICONS = new Map<string, string>([
  ['docx', WORD_ICON], ['doc', WORD_ICON],
  ['xlsx', EXCEL_ICON], ['xls', EXCEL_ICON], ['ods', EXCEL_ICON],
  ['pptx', POWERPOINT_ICON], ['ppt', POWERPOINT_ICON], ['odp', POWERPOINT_ICON],
  ['pdf', PDF_ICON], ['epub', EPUB_ICON], ['rtf', RTF_ICON], ['odt', TEXT_ICON],
]);

function getExtension(name: string | undefined): string {
  if (!name) return '';
  const i = name.lastIndexOf('.');
  if (i < 0 || i === name.length - 1) return '';
  return name.slice(i + 1).toLowerCase();
}

function iconForMime(mime: string): string | null {
  if (mime.startsWith('image/')) return IMAGE_ICON;
  if (mime === 'application/pdf') return PDF_ICON;
  if (mime.startsWith('audio/') || mime.startsWith('video/')) return MEDIA_ICON;
  if (mime.startsWith('text/')) return TEXT_ICON;
  return null;
}

function iconForFileKind(entry: IconSource): string | null {
  if (entry.kind !== 'file') return null;
  const extension = getExtension(entry.name);
  if (MEDIA_EXTENSIONS.has(extension)) return MEDIA_ICON;
  if (extension === 'doc') return WORD_ICON;
  if (extension === 'xls') return EXCEL_ICON;
  if (extension === 'ppt') return POWERPOINT_ICON;
  return null;
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
  const documentIcon = DOC_KIND_ICONS.get(docKind);
  if (documentIcon) return documentIcon;

  const mime = String(entry.mime || '').toLowerCase();
  const mimeIcon = iconForMime(mime);
  if (mimeIcon) return mimeIcon;

  /* Media files classified as kind 'file' by extension when no MIME exists. */
  const fileKindIcon = iconForFileKind(entry);
  if (fileKindIcon) return fileKindIcon;

  const ext = getExtension(entry.name);
  if (ext && CODE_EXTENSIONS.has(ext)) return CODE_ICON;
  if (ext && TEXT_EXTENSIONS.has(ext)) return TEXT_ICON;

  return FILE_ICON;
}

export function getAttachmentIcon(entry: IconSource): string {
  return pickIcon(entry);
}
