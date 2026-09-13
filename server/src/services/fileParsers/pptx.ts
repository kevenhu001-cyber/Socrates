/**
 * PPTX text extractor — hand-rolled on top of JSZip + xml2js.
 *
 * Why no library: the popular `pptx-parser` package pulls in
 * `phantomjs`-era `window` globals that fail in Node. PPTX is just a
 * ZIP of OOXML — `ppt/slides/slide{N}.xml` holds each slide's text
 * runs inside `<a:t>` elements. We unzip, list slides, and concatenate
 * the text content with slide headers.
 *
 * We intentionally ignore:
 *   - notesSlide*.xml (speaker notes) — not needed for LLM context
 *   - tables, charts, SmartArt — these have text in tables/charts XML
 *     but parsing them all is heavy; cover the common case first.
 *   - embedded media (images, video) — not text.
 */
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';

const SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/i;

/* Same output budget as xlsx — stop materializing slides once the
   cap is hit so a huge deck cannot blow memory before truncation. */
const MAX_OUTPUT_CHARS = 200 * 1024;
const MAX_SLIDES = 200;

function collectTextRuns(node: unknown, out: string[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) collectTextRuns(child, out);
    return;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    /* `<a:t>...</a:t>` runs hold the visible text. */
    if (obj['a:t'] !== undefined) {
      const at = obj['a:t'];
      if (Array.isArray(at)) {
        for (const t of at) out.push(String(t));
      } else {
        out.push(String(at));
      }
    }
    for (const key of Object.keys(obj)) {
      if (key === '$') continue;
      collectTextRuns(obj[key], out);
    }
  }
}

export async function extract(filepath: string) {
  let zip;
  try {
    const fs = await import('node:fs/promises');
    const buf = await fs.readFile(filepath);
    zip = await JSZip.loadAsync(buf);
  } catch (e) {
    const em = e as Error;
    const err = new Error('pptx_unzip_failed: ' + (em.message || em)) as Error & { code: string };
    err.code = 'PARSE_FAILED';
    throw err;
  }

  /* Collect slide entries, sort by slide number. */
  const slides: { name: string; n: number }[] = [];
  for (const entry of Object.keys(zip.files)) {
    const m = entry.match(SLIDE_PATH);
    if (m) slides.push({ name: entry, n: parseInt(m[1], 10) });
  }
  if (slides.length === 0) {
    /* .pptx with no slides, or not a real pptx — bail so the caller
       can show a friendly "no slides found" error. */
    const err = new Error('pptx_no_slides') as Error & { code: string };
    err.code = 'EMPTY_DOCUMENT';
    throw err;
  }
  slides.sort((a, b) => a.n - b.n);

  const parts = [];
  let outChars = 0;
  let truncated = slides.length > MAX_SLIDES;
  for (const slide of slides.slice(0, MAX_SLIDES)) {
    if (outChars >= MAX_OUTPUT_CHARS) {
      truncated = true;
      break;
    }
    let xml;
    try {
      xml = await zip.files[slide.name].async('string');
    } catch (e) {
      /* Skip individual unreadable slides rather than failing the
         whole document — partial text is better than nothing. */
      parts.push(`### Slide ${slide.n}\n[unreadable]\n`);
      continue;
    }
    let parsed;
    try {
      parsed = await parseStringPromise(xml, {
        explicitArray: true,
        mergeAttrs: false,
        trim: true,
        explicitCharkey: false,
      });
    } catch (e) {
      parts.push(`### Slide ${slide.n}\n[xml_parse_failed]\n`);
      continue;
    }
    const textRuns: string[] = [];
    collectTextRuns(parsed, textRuns);
    const body = textRuns
      .map((s) => String(s).trim())
      .filter(Boolean)
      .join('\n');
    const chunk = `### Slide ${slide.n}\n${body}\n`;
    if (outChars + chunk.length > MAX_OUTPUT_CHARS) {
      const room = MAX_OUTPUT_CHARS - outChars;
      if (room > 0) parts.push(chunk.slice(0, room));
      outChars = MAX_OUTPUT_CHARS;
      truncated = true;
      break;
    }
    parts.push(chunk);
    outChars += chunk.length;
  }

  return {
    text: parts.join('\n').replace(/\r\n/g, '\n'),
    truncated,
    meta: { slideCount: slides.length },
  };
}