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
 * Shared by the write path (the raw fire position, already paragraph-
 * aware via toolRowAnchorOffset) and the read path (react/tool-run
 * buildTurnLayout) so both agree on the final position.
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
 * P_tool-order-paragraph — a tool row belongs to the paragraph during
 * which it fired, never in the middle of it and never before it. The
 * model routinely calls the tool mid-paragraph and only writes the
 * framing sentence ("我来搜索一下…") afterwards; parking the row at the
 * last COMPLETED paragraph (the old sentence-level rule) stranded it
 * BEFORE its own paragraph, which reads as obviously misplaced.
 *
 * Pure helpers over (text, offset), shared by the write path (the raw
 * fire position recorded by streamingTurn) and the read path
 * (react/tool-run buildTurnLayout) so both agree on the final position:
 *
 * - isParagraphStart: offset 0 or right after a blank line. A tool that
 *   fired exactly here already follows a finished block — stay.
 * - paragraphEndAfter: the end of the blank-line run terminating the
 *   enclosing paragraph, or EOF for the trailing paragraph.
 * - toolRowAnchorOffset: stay at a clean start, otherwise advance to the
 *   paragraph end. Callers still run the result through
 *   snapToolOffsetOutOfBlock (code/table atomicity) afterwards.
 */
export function isParagraphStart(text: string, offset: number): boolean {
  const full = String(text || '');
  const off = Math.max(0, Math.min(full.length, Math.floor(Number(offset) || 0)));
  if (off <= 0) return true;
  return /(?:\r?\n){2}$/.test(full.slice(0, off));
}

export function paragraphEndAfter(text: string, offset: number): number {
  const full = String(text || '');
  const off = Math.max(0, Math.min(full.length, Math.floor(Number(offset) || 0)));
  const rest = full.slice(off);
  const m = /(\r?\n){2,}/.exec(rest);
  if (m && typeof m.index === 'number') return off + m.index + m[0].length;
  return full.length;
}

export function toolRowAnchorOffset(text: string, offset: number): number {
  const full = String(text || '');
  const off = Math.max(0, Math.min(full.length, Math.floor(Number(offset) || 0)));
  if (isParagraphStart(full, off)) return off;
  return paragraphEndAfter(full, off);
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
