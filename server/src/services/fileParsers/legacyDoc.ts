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

const MAX_OUTPUT_CHARS = 200 * 1024;

export async function extract(filepath: string) {
  let body: string;
  try {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(filepath);
    body = String((doc && doc.getBody && doc.getBody()) || '').replace(/\r\n/g, '\n');
  } catch (e) {
    const em = e as Error;
    const err = new Error('doc_parse_failed: ' + (em.message || em)) as Error & { code: string };
    err.code = 'PARSE_FAILED';
    throw err;
  }
  let truncated = false;
  if (body.length > MAX_OUTPUT_CHARS) {
    body = body.slice(0, MAX_OUTPUT_CHARS);
    truncated = true;
  }
  return {
    text: body,
    truncated,
    meta: {},
  };
}
