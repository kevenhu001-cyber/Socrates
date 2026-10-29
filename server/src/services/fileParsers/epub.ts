/**
 * EPUB text extractor — wraps the `epub` package.
 *
 * An EPUB is a ZIP of XHTML chapters with a `content.opf` manifest.
 * The `epub` package (v2.x) parses the OPF asynchronously, then
 * resolves each chapter via getChapter() which loads + decodes the
 * underlying HTML.
 *
 * The returned HTML is stripped to plain text with paragraph breaks
 * preserved for block elements (p, div, h1-6, li, tr, td).
 */
import EPub from 'epub';
import { decodeHtmlEntities, htmlToPlainText } from '../../lib/sanitize.js';

function htmlToText(html: string) {
  /* Decode first: `&lt;p&gt;` is a real paragraph tag once decoded, so
     block-break detection has to run on the decoded text and the tag
     strip has to follow it. Doing the strip first would both miss that
     paragraph and then emit a literal `<p>` into the extracted text. */
  const withBreaks = decodeHtmlEntities(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/(p|div|h[1-6]|li|tr|td)\s*>/gi, '\n');
  return htmlToPlainText(withBreaks)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extract(filepath: string) {
  const book = new EPub(filepath);
  await book.parse();

  /* Read the spine in order. EPUB 2.x puts ordered chapter ids in
     `flow`; fall back to `spine.contents` if flow is empty. */
  const spineIds = (book.flow && book.flow.length)
    ? book.flow.map((f) => f.id)
    : (book.spine && Array.isArray(book.spine.contents)
        ? book.spine.contents.map((c) => c.id)
        : []);

  const parts = [];
  let idx = 0;
  for (const id of spineIds) {
    idx++;
    let chapterHtml = '';
    try {
      chapterHtml = await book.getChapter(id);
    } catch {
      /* Skip individual unreadable chapters; partial text beats none. */
      parts.push(`### Chapter ${idx}\n[unreadable]\n`);
      continue;
    }
    const cleaned = htmlToText(chapterHtml);
    if (cleaned.length > 0) {
      parts.push(`### Chapter ${idx}\n${cleaned}\n`);
    }
  }

  return {
    text: parts.join('\n').replace(/\r\n/g, '\n'),
    truncated: false,
    meta: {
      chapterCount: parts.length,
      title: book.metadata && book.metadata.title ? book.metadata.title : '',
    },
  };
}