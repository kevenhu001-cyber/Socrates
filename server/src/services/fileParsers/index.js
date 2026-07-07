/**
 * Office / document text extraction — dispatcher.
 *
 * Each parser returns `{ text, truncated, meta }` where:
 *   - text:      extracted plain text (UTF-8, normalized line endings)
 *   - truncated: true if the output was capped at MAX_TEXT_BYTES
 *   - meta:      parser-specific info (sheetCount, slideCount, pageCount, …)
 *
 * On any parser-level failure (corrupt file, password-protected,
 * unsupported variant) the parser throws; the dispatcher translates
 * that into a `{ ok:false, error }` JSON response at the route level.
 *
 * Adding a new format = drop a new file under this folder that exports
 * `extract(filepath) → { text, truncated, meta }` and register it in
 * PARSERS below.
 */

import { extract as docxExtract } from './docx.js';
import { extract as xlsxExtract } from './xlsx.js';
import { extract as pptxExtract } from './pptx.js';
import { extract as epubExtract } from './epub.js';
import { extract as rtfExtract } from './rtf.js';

export const PARSERS = {
  'application/pdf': null, // PDF stays on pdf-parse (separate path in routes/fileExtract.js)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': docxExtract,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': xlsxExtract,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': pptxExtract,
  'application/epub+zip': epubExtract,
  'application/rtf': rtfExtract,
  'text/rtf': rtfExtract,
};

/**
 * Dispatch extraction by MIME type. Returns `{ text, truncated, meta }`
 * or throws on unsupported / parse failure.
 */
export async function extractText(mimeType, filepath) {
  const fn = PARSERS[mimeType];
  if (typeof fn !== 'function') {
    const err = new Error(`unsupported_mime:${mimeType}`);
    err.code = 'UNSUPPORTED_MIME';
    throw err;
  }
  return await fn(filepath);
}

export const SUPPORTED_MIMES = Object.keys(PARSERS).filter((m) => m !== 'application/pdf');