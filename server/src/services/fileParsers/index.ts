/**
 * Office / document text extraction — entry point.
 *
 * Runs extractions in a worker thread pool (via pool.ts) to isolate
 * synchronous, CPU-intensive parsing libraries (mammoth, exceljs, pdf-parse,
 * jszip, etc.) from the main Node.js event loop.
 *
 * Each parser returns `{ text, truncated, meta }` where:
 *   - text:      extracted plain text (UTF-8, normalized line endings)
 *   - truncated: true if the output was capped at MAX_TEXT_BYTES
 *   - meta:      parser-specific info (sheetCount, slideCount, pageCount, …)
 */

import { cleanExtractedText, parseError } from './text.js';
import {
  dispatchParser,
  PARSERS,
  SUPPORTED_MIMES,
  type ExtractResult,
  type Parser,
} from './dispatcher.js';
import { extractInWorker, stopFileParserPool } from './pool.js';

export {
  PARSERS,
  SUPPORTED_MIMES,
  stopFileParserPool,
  dispatchParser,
  type ExtractResult,
  type Parser,
};

/**
 * Dispatch extraction by MIME type. Runs in an isolated worker thread by default.
 * Returns `{ text, truncated, meta }` or throws on unsupported / parse failure.
 *
 * Every result passes through the same whitespace cleanup, so the model
 * never pays tokens for control characters, zero-width junk, trailing
 * spaces or long runs of blank lines, whatever the source format.
 */
export async function extractText(mimeType: string, filepath: string): Promise<ExtractResult> {
  if (!SUPPORTED_MIMES.includes(mimeType)) {
    throw parseError('UNSUPPORTED_MIME', `unsupported_mime:${mimeType}`);
  }

  const result = await extractInWorker(mimeType, filepath);
  return {
    text: cleanExtractedText(result?.text),
    truncated: !!result?.truncated,
    meta: result?.meta || {},
  };
}
