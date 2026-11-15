/* Pure attachment → preview-kind mapping.
   Kept free of DOM/network so it is unit-testable and usable from both the
   message list (deciding click behavior) and the drawer view (routing). */

import type { PreviewKind } from './types.ts';

/** Formats rendered locally by a lazy engine. */
const ENGINE_KINDS = new Map<string, PreviewKind>([
  ['pdf', 'pdf'],
  ['docx', 'docx'],
  ['pptx', 'pptx'],
  ['xlsx', 'xlsx'],
]);

/* Formats the server already extracts text from (attachmentReader.ts): the
   drawer shows that text and keeps the download action. .ppt stays
   metadata-only server-side, but the drawer is still the better surface than
   a forced download because it can offer the original alongside. */
const SERVER_TEXT_KINDS = new Map<string, PreviewKind>([
  ['doc', 'text'],
  ['xls', 'text'],
  ['ppt', 'text'],
  ['rtf', 'text'],
  ['odt', 'text'],
  ['ods', 'text'],
  ['odp', 'text'],
  ['epub', 'text'],
]);

const KINDS_BY_MIME = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ['application/msword', 'doc'],
  ['application/vnd.ms-excel', 'xls'],
  ['application/vnd.ms-powerpoint', 'ppt'],
  ['application/rtf', 'rtf'],
  ['text/rtf', 'rtf'],
  ['application/epub+zip', 'epub'],
  ['application/vnd.oasis.opendocument.text', 'odt'],
  ['application/vnd.oasis.opendocument.spreadsheet', 'ods'],
  ['application/vnd.oasis.opendocument.presentation', 'odp'],
]);

function extensionOf(name: string): string {
  const normalized = name.toLowerCase();
  const dot = normalized.lastIndexOf('.');
  return dot >= 0 ? normalized.slice(dot + 1) : '';
}

/** Route an attachment to its preview kind; 'unsupported' keeps the old link. */
export function previewKindFor(name: string, mime?: string, docKind?: string): PreviewKind {
  const byEngine = ENGINE_KINDS.get(extensionOf(name)) ?? ENGINE_KINDS.get(String(docKind || '').toLowerCase());
  if (byEngine) return byEngine;
  const byServer = SERVER_TEXT_KINDS.get(extensionOf(name)) ?? SERVER_TEXT_KINDS.get(String(docKind || '').toLowerCase());
  if (byServer) return 'text';
  const mimeKind = mime ? KINDS_BY_MIME.get(mime.toLowerCase()) : undefined;
  if (mimeKind) {
    return ENGINE_KINDS.get(mimeKind) ?? 'text';
  }
  return 'unsupported';
}
