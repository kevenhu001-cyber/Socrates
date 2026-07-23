/**
 * DOCX text extractor — wraps mammoth.extractRawText.
 *
 * mammoth is the de-facto DOCX→text/HTML converter for Node. We use
 * extractRawText (not convertToHtml) because the consumer is an LLM
 * prompt, not a browser. The library handles tables, lists, and
 * headings by emitting them as paragraph runs with implicit breaks.
 *
 * .docx is a ZIP of OOXML — mammoth handles unzip + XML parse
 * internally. We just hand it the file path.
 */
import mammoth from 'mammoth';

export async function extract(filepath: string) {
  let result;
  try {
    result = await mammoth.extractRawText({ path: filepath });
  } catch (e) {
    const em = e as Error;
    const err = new Error('docx_parse_failed: ' + (em.message || em)) as Error & { code: string };
    err.code = 'PARSE_FAILED';
    throw err;
  }
  const text = String((result && result.value) || '').replace(/\r\n/g, '\n');
  // mammoth.messages contains warnings (e.g. unsupported styles).
  // We surface the count as meta so the route can include it in
  // the response without leaking raw XML warnings to the client.
  const messageCount = Array.isArray(result && result.messages) ? result.messages.length : 0;
  return {
    text,
    truncated: false,
    meta: { warnings: messageCount },
  };
}