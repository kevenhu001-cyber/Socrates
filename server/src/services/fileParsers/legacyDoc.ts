/**
 * Legacy DOC text extractor — wraps word-extractor (pure JS, OLE-based).
 *
 * .doc is the pre-2007 OLE compound binary format; mammoth only reads
 * the modern OOXML .docx. word-extractor parses the WordDocument stream
 * in-process with no native helpers or office install, so it is safe
 * for the upload path.
 *
 * Output is capped like the other parsers so a large document cannot
 * blow the prompt budget or server memory before truncation.
 */
import WordExtractor from 'word-extractor';
import { cleanExtractedText, parseError, truncateHeadTail } from './text.js';

const MAX_OUTPUT_CHARS = 200 * 1024;

export async function extract(filepath: string) {
  let body: string;
  try {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(filepath);
    body = String((doc && doc.getBody && doc.getBody()) || '').replace(/\r\n/g, '\n');
  } catch (e) {
    const em = e as Error;
    if (/password|encrypt/i.test(String(em?.message || ''))) {
      throw parseError('ENCRYPTED', 'doc_encrypted: this DOC file is password-protected. Remove the password and upload it again.');
    }
    throw parseError('PARSE_FAILED', 'doc_parse_failed: ' + (em.message || em));
  }
  body = cleanExtractedText(body);
  const totalChars = body.length;
  let truncated = false;
  const meta: Record<string, unknown> = { format: 'doc' };
  if (body.length > MAX_OUTPUT_CHARS) {
    const cut = truncateHeadTail(body, MAX_OUTPUT_CHARS);
    body = cut.text;
    truncated = true;
    meta.omitted = `${cut.omittedChars} of ${totalChars} characters from the middle`;
  }
  return {
    text: body,
    truncated,
    meta,
  };
}
