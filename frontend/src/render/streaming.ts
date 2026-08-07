/* Streaming-render helpers shared by the regular chat and agent paths.
 *
 * The renderer intentionally updates at a perceptual cadence instead of once
 * per network chunk. Fast models can deliver dozens of tiny deltas in a frame;
 * coalescing them keeps input, scrolling, and code-block painting responsive.
 */

export function getStreamRenderInterval(textLength: number | null | undefined): number {
  const len = Math.max(0, Number(textLength) || 0);
  if (len < 2000) return 50;   /* first screen: responsive, ~20 fps */
  if (len < 8000) return 80;   /* normal long answer: ~12 fps */
  return 120;              /* very long answer: protect the main thread */
}

/* PERF: counts non-overlapping occurrences without allocating. The previous
   form, `s.split(tok).length - 1`, allocated an array of every piece purely
   to read its length — and this runs over the WHOLE accumulated response on
   every render frame, so the garbage scaled with the answer. */
function countOccurrences(s: string, needle: string): number {
  let n = 0;
  let i = s.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = s.indexOf(needle, i + needle.length);
  }
  return n;
}

export function isStableMarkdownPrefix(text: string): boolean {
  const s = String(text || '');
  if (countOccurrences(s, '```') % 2 !== 0) return false;
  if (countOccurrences(s, '$$') % 2 !== 0) return false;
  if (countOccurrences(s, '\\[') !== countOccurrences(s, '\\]')) return false;
  /* No '<' means no <think> and no scaffold tags, so the remaining checks
     cannot fail. Skips the tag scan for ordinary prose, the common case. */
  if (s.indexOf('<') === -1) return true;
  if (countOccurrences(s, '<think>') !== countOccurrences(s, '</think>')) return false;
  /* Tutor scaffold bodies commonly contain blank lines. Do not promote a
     prefix containing an open <example>/<quiz>/... tag into the settled DOM,
     otherwise the remaining fields render outside the card and the next
     frame appears to duplicate or relocate the scaffold. A small stack is
     enough here because these tags are XML-like and the live renderer can
     safely keep the whole open block in its tail. */
  const scaffoldTags = new Set([
    'quiz', 'example', 'practice', 'definition', 'step', 'flashcard',
    'proof', 'theorem', 'key-point', 'derivation', 'q', 'o', 'title',
    'problem', 'solution', 'hint', 'front', 'back', 'statement', 'body',
    'term', 'correct',
  ]);
  const stack: string[] = [];
  const tagRe = /<\/?([a-z][\w-]*)(?:\s[^>]*)?\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(s)) !== null) {
    const tag = match[1].toLowerCase();
    if (!scaffoldTags.has(tag)) continue;
    const raw = match[0];
    if (raw.charAt(1) === '/') {
      if (stack.pop() !== tag) return false;
    } else if (!/\/\s*>$/.test(raw)) {
      stack.push(tag);
    }
  }
  if (stack.length > 0) return false;
  return true;
}

export interface StreamingSplit {
  prefix: string;
  tail: string;
}

/**
 * Pick a stable insertion offset for an inline tool row.
 *
 * Tool-use events can arrive while the model is still streaming a short
 * preamble. Mounting the row at the raw byte/character offset can split a
 * sentence in half (for example, "我先查一下这个" + tool row + "问题").
 * Prefer the latest completed paragraph or sentence. When the current
 * segment has no completed boundary, keep the whole unfinished sentence
 * together after the tool row by returning segmentStart.
 */
export function findInlineToolBoundary(text: string, segmentStart = 0): number {
  const full = String(text || '');
  const start = Math.max(0, Math.min(full.length, Number(segmentStart) || 0));
  if (start >= full.length) return full.length;

  const segment = full.slice(start);
  const paragraphMatch = /[\r\n]{2,}/g;
  let match: RegExpExecArray | null;
  let paragraphEnd = -1;
  while ((match = paragraphMatch.exec(segment))) paragraphEnd = match.index + match[0].length;
  if (paragraphEnd > 0) return start + paragraphEnd;

  // A sentence terminator is safe only when followed by whitespace or the
  // end of the currently available text. This avoids treating decimal dots
  // or punctuation inside identifiers as sentence boundaries.
  const sentenceMatch = /[。！？!?；;:：.](?=\s|$)/g;
  let sentenceEnd = -1;
  while ((match = sentenceMatch.exec(segment))) sentenceEnd = match.index + match[0].length;
  if (sentenceEnd > 0) {
    let end = sentenceEnd;
    while (end < segment.length && /\s/.test(segment.charAt(end))) end += 1;
    return start + end;
  }

  const newline = Math.max(segment.lastIndexOf('\n'), segment.lastIndexOf('\r'));
  if (newline >= 0) return start + newline + 1;
  return start;
}

/* Keep completed Markdown blocks in a stable DOM region and return only the
 * unfinished tail for frequent updates. The final renderer still reparses the
 * complete response once, so a conservative fallback here is always safe. */
export function splitStreamingMarkdown(text: string): StreamingSplit {
  const full = String(text || '');
  const cut = full.lastIndexOf('\n\n');
  if (cut <= 0) return { prefix: '', tail: full };
  const prefix = full.slice(0, cut);
  if (!isStableMarkdownPrefix(prefix)) return { prefix: '', tail: full };
  return { prefix, tail: full.slice(cut + 2) };
}
