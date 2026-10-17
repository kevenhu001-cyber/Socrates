/* Recover a lost display-math closer when the model has already moved on to
   an unmistakable Markdown ATX heading.

   Why this lives before the normal Markdown preprocessor:
   - the tolerant math renderer intentionally treats an unclosed `$$` / `\[` as
     extending to end-of-message so a truncated formula can still render;
   - that is correct until the next line is clearly Markdown. Without a
     boundary recovery, `### Heading` is swallowed as TeX and never reaches
     fixHeadingMarkers / marked.

   The repair is deliberately narrow: only ATX heading-shaped lines end an
   unclosed display formula. Fenced code is opaque, inline/prose `#` is ignored,
   preprocessor/shebang-looking lines are ignored, and already-closed formulas
   are unchanged. */

type DisplayMathMode = '$$' | '\\[' | null;

const FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const HEADING_BOUNDARY_RE =
  /^(?:[ \t]|\u200b|\u200c|\u200d|\u2060|\ufeff|\u00a0|\u3000)*([#＃]+)(?![#＃])([ \t\u00a0\u3000]*)(\S.*)$/;
const BOLD_WRAPPED_HEADING_RE = /^([ \t]{0,3})(\*\*|__)[ \t]*(#{1,6}|＃{1,6})[ \t]*(\S.*?)[ \t]*\2[ \t]*$/;
const HEADING_DIRECTIVE_RE = /^(?:include|define|pragma|ifdef|ifndef|elif|else|endif|error|warning|line|undef|import|using|region|endregion|!)/;
const NUMBERED_TITLE_RE = /^\d{1,3}[.．、)）]\s*\S/;

function isEscapedAt(line: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && line.charAt(i) === '\\'; i--) slashes++;
  return slashes % 2 === 1;
}

function isHeadingBoundary(line: string): boolean {
  if (BOLD_WRAPPED_HEADING_RE.test(line)) return true;
  const match = line.match(HEADING_BOUNDARY_RE);
  if (!match) return false;
  const runLength = match[1].length;
  const hasSpace = match[2].length > 0;
  const rest = match[3].trimStart();
  if (!rest) return false;
  /* Mirror fixHeadingMarkers: `#1` / `##3 条` (unspaced) are prose enumerations,
     while `# 1 标题` / `## 1 Introduction` (spaced) or `###1. 方法` / `##4、标题`
     are headings. */
  if (runLength <= 2 && !hasSpace && /^\d/.test(rest) && !NUMBERED_TITLE_RE.test(rest)) return false;
  if (HEADING_DIRECTIVE_RE.test(rest)) return false;
  return true;
}

function scanDisplayMath(line: string, initial: DisplayMathMode): DisplayMathMode {  let mode = initial;
  for (let i = 0; i < line.length; i++) {
    if (mode === null) {
      if (line.startsWith('$$', i) && !isEscapedAt(line, i)) {
        mode = '$$';
        i += 1;
        continue;
      }
      if (line.startsWith('\\[', i) && !isEscapedAt(line, i)) {
        mode = '\\[';
        i += 1;
      }
      continue;
    }

    if (mode === '$$') {
      if (line.startsWith('$$', i) && !isEscapedAt(line, i)) {
        mode = null;
        i += 1;
      }
      continue;
    }

    if (line.startsWith('\\]', i) && !isEscapedAt(line, i)) {
      mode = null;
      i += 1;
    }
  }
  return mode;
}

/**
 * True when the display-math region that is open at `start` is closed later
 * in the message. A closed region means the candidate heading line is TeX
 * source (`$$\n#notmath\nx+y\n$$`), so inserting a closer would corrupt the
 * formula. Only a region with no remaining closer is genuinely lost.
 */
function hasClosingDelimiter(lines: string[], start: number, mode: DisplayMathMode): boolean {
  let current = mode;
  for (let i = start; i < lines.length; i++) {
    current = scanDisplayMath(lines[i], current);
    if (current === null) return true;
  }
  return false;
}

/**
 * Insert a missing display-math closer immediately before a Markdown heading
 * that would otherwise be consumed by the tolerant unclosed-math renderer.
 * Idempotent: once the closer is inserted, a second pass sees balanced math.
 */
export function recoverUnclosedDisplayMathBeforeHeading(source: string | null | undefined): string {
  if (!source) return source as string;
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let mode: DisplayMathMode = null;
  let inFence = false;
  let fenceChar = '';

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fence = line.match(FENCE_RE);
    if (fence) {
      const char = fence[1].charAt(0);
      if (!inFence) {
        inFence = true;
        fenceChar = char;
      } else if (char === fenceChar) {
        inFence = false;
        fenceChar = '';
      }
      out.push(line);
      continue;
    }

    if (inFence) {
      out.push(line);
      continue;
    }

    if (mode && isHeadingBoundary(line) && !hasClosingDelimiter(lines, index, mode)) {
      out.push(mode === '$$' ? '$$' : '\\]');
      mode = null;
    }

    out.push(line);
    mode = scanDisplayMath(line, mode);
  }

  return out.join('\n');
}
