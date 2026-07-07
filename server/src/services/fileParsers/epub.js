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

function htmlToText(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/(p|div|h[1-6]|li|tr|td)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extract(filepath) {
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