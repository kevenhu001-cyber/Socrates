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
 * P_tool-order-block — a tool row must never land in the middle of a
 * fenced code block, a math block, or a Markdown table row. Those spans
 * are atomic to the reader: splitting them breaks highlighting AND reads
 * as "the tool interrupted the AI mid-sentence". Offsets inside such a
 * span snap FORWARD to the end of the enclosing block (never backward —
 * already-painted text must not move).
 *
 * Shared by the write path (findInlineToolBoundary) and the read path
 * (react/tool-run buildTurnLayout) so both agree on the final position.
 */
export function snapToolOffsetOutOfBlock(text: string, offset: number): number {
  const full = String(text || '');
  let off = Math.max(0, Math.min(full.length, Math.floor(Number(offset) || 0)));
  if (off >= full.length) return off;

  /* Line table for the whole response so far. */
  const starts: number[] = [0];
  for (let i = 0; i < full.length; i += 1) {
    if (full.charCodeAt(i) === 10) starts.push(i + 1);
  }
  const ends: number[] = starts.map((s, i) => (i + 1 < starts.length ? starts[i + 1] - 1 : full.length));
  let li = 0;
  for (let i = 0; i < starts.length; i += 1) {
    if (starts[i] <= off) li = i;
    else break;
  }
  const isFenceLine = (idx: number): boolean => {
    const t = full.slice(starts[idx], ends[idx]).trimStart();
    return t.startsWith('```') || t.startsWith('~~~');
  };

  /* Fenced code / math blocks: a fence line toggles membership. */
  let inFence = false;
  for (let i = 0; i < li; i += 1) {
    if (isFenceLine(i)) inFence = !inFence;
  }
  if (inFence && !isFenceLine(li)) {
    for (let i = li; i < starts.length; i += 1) {
      if (isFenceLine(i)) return Math.min(full.length, ends[i] + 1);
    }
    /* Fence never closed (yet): hold at the end of streamed text. The
       live deferred-mount keeps the row hidden until the fence closes. */
    return full.length;
  }

  /* Table rows: a |…| line next to another table-ish line is atomic —
     hold the row until the line ends. */
  const lineText = full.slice(starts[li], ends[li]);
  if (lineText.trim().startsWith('|')) {
    const looksTable = (idx: number): boolean => {
      if (idx < 0 || idx >= starts.length) return false;
      const t = full.slice(starts[idx], ends[idx]).trim();
      return t.indexOf('|') !== -1 || /^[\s:|-]*[-:|][\s:|-]*$/.test(t);
    };
    if (looksTable(li - 1) || looksTable(li + 1)) {
      return Math.min(full.length, ends[li] + 1);
    }
  }
  return off;
}

/**
 * Pick a stable insertion offset for an inline tool row.
 *
 * Tool-use events can arrive while the model is still streaming a short
 * preamble. Mounting the row at the raw character offset can split a
 * finished sentence in half, so prefer the latest completed paragraph or
 * sentence boundary inside the current segment.
 *
 * P_tool-order-strict — a row may only follow a REAL sentence ending
 * (CJK / Latin terminators, or a newline). Colons and semicolons
 * (：；:;) do NOT end a sentence: "原因有三：" promises a continuation,
 * and parking a row there reads as interrupting the AI mid-thought.
 * The row waits for the period / newline instead (see the live
 * deferred-mount in react/tool-run).
 *
 * When the current segment holds no completed boundary at all, anchor at
 * the END of the streamed text rather than rewinding to segmentStart.
 * See the comment at that branch — rewinding is what made tool rows pile
 * up at the top of a bubble.
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
  if (paragraphEnd > 0) return snapToolOffsetOutOfBlock(full, start + paragraphEnd);

  // A sentence terminator is safe only when followed by whitespace or the
  // end of the currently available text. This avoids treating decimal dots
  // or punctuation inside identifiers as sentence boundaries.
  // P_tool-order-strict — colons/semicolons are NOT terminators (see above).
  const sentenceMatch = /[。！？!?\.](?=\s|$)/g;
  let sentenceEnd = -1;
  while ((match = sentenceMatch.exec(segment))) sentenceEnd = match.index + match[0].length;
  if (sentenceEnd > 0) {
    let end = sentenceEnd;
    while (end < segment.length && /\s/.test(segment.charAt(end))) end += 1;
    return snapToolOffsetOutOfBlock(full, start + end);
  }

  const newline = Math.max(segment.lastIndexOf('\n'), segment.lastIndexOf('\r'));
  if (newline >= 0) return snapToolOffsetOutOfBlock(full, start + newline + 1);

  /* No completed boundary anywhere in this segment: the model paused
     part-way through a sentence to call the tool.

     This branch used to `return start`, rewinding the anchor to the top
     of the segment — and that is precisely what made tool rows collect
     at the top of an assistant bubble. Every tool in a turn that had not
     yet emitted a sentence terminator resolved to the SAME offset, so:

       • each new row was spliced in before prose that was already
         painted, and the visible text jumped down underneath a growing
         stack of rows (the "unstable" feel), and
       • on reload, the HTML rebuilder that used to re-splice rows from
         stored offsets sorted several rows onto one identical offset and
         emitted them back-to-back at the top with the whole answer below
         them.

     Anchoring at the end of what has streamed so far fixes all of that:
     already-painted text never moves, consecutive tools get strictly
     increasing offsets so each row stays where it fired, and the only
     text a row can now interrupt is an UNFINISHED fragment — never a
     complete sentence, which is the constraint that actually matters to
     the reader. */
  return full.length;
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
