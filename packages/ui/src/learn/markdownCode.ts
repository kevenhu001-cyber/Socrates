export interface MarkdownCodeRange {
  /** Inclusive start offset in the source string. */
  start: number;
  /** Exclusive end offset in the source string. */
  end: number;
}

function fencedCodeRanges(source: string): MarkdownCodeRange[] {
  const ranges: MarkdownCodeRange[] = [];
  let fence: { start: number; marker: string; length: number } | null = null;
  let lineStart = 0;

  while (lineStart <= source.length) {
    const newline = source.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? source.length : newline;
    const line = source.slice(lineStart, lineEnd).replace(/\r$/, '');
    if (fence) {
      const closing = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
      /* The tutor often closes a fence and its scaffold field on one line:
         "```</problem>". CommonMark would keep the fence open, swallow the
         closing tag into code and leave the whole card unmounted. A closing
         tag right after the fence ends the code at the backticks. */
      const glued = closing ? null : /^ {0,3}(`+|~+)[ \t]*(?=<\/[a-z][\w-]*>)/i.exec(line);
      const close = closing ?? glued;
      if (close && close[1][0] === fence.marker && close[1].length >= fence.length) {
        const end = glued ? lineStart + glued[0].length : (newline === -1 ? source.length : newline + 1);
        ranges.push({ start: fence.start, end });
        fence = null;
      }
    } else {
      const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (opening && (opening[1][0] !== '`' || !opening[2].includes('`'))) {
        fence = { start: lineStart, marker: opening[1][0], length: opening[1].length };
      }
    }

    if (newline === -1) break;
    lineStart = newline + 1;
  }

  if (fence) ranges.push({ start: fence.start, end: source.length });
  return ranges;
}

function isEscapedBacktick(source: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}

/**
 * Markdown code spans and fenced blocks, expressed as source offsets.
 *
 * Keeping this scanner DOM-free lets scaffold parsing and host renderers
 * consistently treat markup inside code as literal text.
 */
export function markdownCodeRanges(source: string): MarkdownCodeRange[] {
  const fenced = fencedCodeRanges(source);
  const runs: Array<{ start: number; end: number; length: number }> = [];
  let fenceIndex = 0;
  let index = 0;

  while (index < source.length) {
    while (fenceIndex < fenced.length && fenced[fenceIndex].end <= index) fenceIndex += 1;
    const fence = fenced[fenceIndex];
    if (fence && fence.start <= index && index < fence.end) {
      index = fence.end;
      continue;
    }
    if (source[index] !== '`' || isEscapedBacktick(source, index)) {
      index += 1;
      continue;
    }

    const start = index;
    while (source[index] === '`') index += 1;
    runs.push({ start, end: index, length: index - start });
  }

  const nextSameLength = new Array<number>(runs.length).fill(-1);
  const nextByLength = new Map<number, number>();
  for (let runIndex = runs.length - 1; runIndex >= 0; runIndex -= 1) {
    const run = runs[runIndex];
    nextSameLength[runIndex] = nextByLength.get(run.length) ?? -1;
    nextByLength.set(run.length, runIndex);
  }

  const inline: MarkdownCodeRange[] = [];
  for (let runIndex = 0; runIndex < runs.length;) {
    const closingIndex = nextSameLength[runIndex];
    if (closingIndex === -1) {
      runIndex += 1;
      continue;
    }
    inline.push({ start: runs[runIndex].start, end: runs[closingIndex].end });
    runIndex = closingIndex + 1;
  }

  return [...fenced, ...inline].sort((left, right) => left.start - right.start);
}
