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
import { extract as legacyDocExtract } from './legacyDoc.js';
import { extract as legacyXlsExtract } from './legacyXls.js';
import { extractOdt, extractOds, extractOdp } from './odf.js';

type ExtractResult = {
  text: string;
  truncated: boolean;
  meta: Record<string, unknown>;
};

type Parser = (filepath: string) => Promise<ExtractResult>;

export const PARSERS: Record<string, Parser | null> = {
  'application/pdf': null, // PDF stays on pdf-parse (separate path in routes/fileExtract.js)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': docxExtract,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': xlsxExtract,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': pptxExtract,
  'application/epub+zip': epubExtract,
  'application/rtf': rtfExtract,
  'text/rtf': rtfExtract,
  /* Legacy Office — OLE/BIFF binaries via word-extractor / SheetJS. */
  'application/msword': legacyDocExtract,
  'application/vnd.ms-excel': legacyXlsExtract,
  /* OpenDocument — ZIP+XML via the same JSZip+xml2js stack as PPTX. */
  'application/vnd.oasis.opendocument.text': extractOdt,
  'application/vnd.oasis.opendocument.spreadsheet': extractOds,
  'application/vnd.oasis.opendocument.presentation': extractOdp,
  /* Legacy .ppt has no pure-JS extractor — intentionally unmapped so
     callers fall back to the metadata-only note instead of crashing. */
};

/**
 * Dispatch extraction by MIME type. Returns `{ text, truncated, meta }`
 * or throws on unsupported / parse failure.
 */
export async function extractText(mimeType: string, filepath: string) {
  const fn = PARSERS[mimeType];
  if (typeof fn !== 'function') {
    const err = new Error(`unsupported_mime:${mimeType}`) as Error & { code: string };
    err.code = 'UNSUPPORTED_MIME';
    throw err;
  }
  return await fn(filepath);
}

export const SUPPORTED_MIMES = Object.keys(PARSERS).filter((m) => m !== 'application/pdf');