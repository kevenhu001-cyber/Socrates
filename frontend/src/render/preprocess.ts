/* ── Weak-model markdown preprocessors ──
   preprocessMarkdown — full, one-shot preprocessor used in
   final formatMsg pass.
   preprocessMarkdownForStreaming — streaming-safe variant that
   skips non-idempotent rules.
   Both imported by render/markdown.js. */

import { _autoWrapBareBracketMath, fixHeadingMarkers, fixMarkdownTableSeparators } from './helpers.js';

/* A line that is nothing but `$…$` is almost always a display formula the
   model forgot to double up (weak models put `$x^2$` on its own line), so it
   is promoted to `$$…$$`. Both preprocessors share this rule: when only the
   final pass applied it, a settled streaming block showed the formula inline
   and it jumped to a centred display formula at finish.

   `complete` says the text cannot grow any more — the final pass, a settled
   streaming block, a segment closed off by a tool row. Only then may the LAST
   line, which has no trailing newline, be promoted. On a live tail that line
   is still being typed: `$a$` there is as likely to continue as
   `$a$ 和 $b$ …` on the next token, and promoting it would flash a centred
   formula for one frame. */
const STANDALONE_MATH_LINE_RE = /(^|\n)\$([^$\n]+(?:\\\\[^$\n]*)*)\$(\s*\n|$)/g;
const STANDALONE_MATH_CLOSED_LINE_RE = /(^|\n)\$([^$\n]+(?:\\\\[^$\n]*)*)\$(\s*\n)/g;

export function promoteStandaloneInlineMath(s: string, complete: boolean): string {
  return s.replace(
    complete ? STANDALONE_MATH_LINE_RE : STANDALONE_MATH_CLOSED_LINE_RE,
    function (_, lead: string, math: string, tail: string) {
      return lead + '$$' + math + '$$' + tail;
    },
  );
}

export interface StreamingPreprocessOptions {
  /** The text cannot grow any more; see promoteStandaloneInlineMath. */
  complete?: boolean;
}

/* Pre-process raw assistant output to compensate for common
   formatting sloppiness in weak / small models. Returns a string
   with normalized delimiters and closed block structures so the
   downstream renderer (formatMsg / formatMsgProgressive) sees
   well-formed markdown + math. */
export function preprocessMarkdown(t: string | null | undefined): string {
  if (!t) return t as string;
  let s = String(t);
  s = s.replace(/\r\n?/g, '\n');
  s = s.replace(/<p>\s*/gi, '').replace(/\s*<\/p>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');

  const _ppStash: string[] = [];
  function _stash(replacement: string): string {
    const id = _ppStash.length;
    _ppStash.push(replacement);
    return '\x01PP' + id + '\x01';
  }
  function _protectFences(s: string): string {
    return s.replace(/```([\w-]*)\n?([\s\S]*?)```/g, function (_, lang: string, body: string) {
      return _stash('```' + lang + '\n' + body + '```');
    });
  }
  function _protectInlineCode(s: string): string {
    return s.replace(/`[^`\n]+`/g, function (m) { return _stash(m); });
  }

  s = _protectFences(s);
  s = _protectInlineCode(s);

  s = fixHeadingMarkers(s);

  s = s.replace(/\\\[([\s\S]+?)\\\]/g, function (m) {
    return _stash('\\[' + m.slice(2, -2).trim() + '\\]');
  });
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, function (m) {
    return _stash('\\(' + m.slice(2, -2).trim() + '\\)');
  });

  s = s.replace(/\$\$\s+([\s\S]+?)\s+\$\$/g, '$$$$' + '$1' + '$$$$');

  s = promoteStandaloneInlineMath(s, true);

  function _countUnescapedDollars(s: string): number {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      if (s.charAt(i) !== '$') continue;
      let bs = 0;
      let j = i - 1;
      while (j >= 0 && s.charAt(j) === '\\') { bs++; j--; }
      if (bs % 2 === 0) n++;
    }
    return n;
  }
  function _lastUnescapedDollar(s: string): number {
    for (let i = s.length - 1; i >= 0; i--) {
      if (s.charAt(i) !== '$') continue;
      let bs = 0;
      let j = i - 1;
      while (j >= 0 && s.charAt(j) === '\\') { bs++; j--; }
      if (bs % 2 === 0) return i;
    }
    return -1;
  }
  if (_countUnescapedDollars(s) % 2 === 1) {
    const idx = _lastUnescapedDollar(s);
    if (idx >= 0) {
      const prev = s.charAt(idx - 1), next = s.charAt(idx + 1);
      if (prev !== '$' && next !== '$') {
        s = s.slice(0, idx) + '\\$' + s.slice(idx + 1);
      }
    }
  }

  s = _autoWrapBareBracketMath(s);

  /* Promote a "---" / "----" / "-----" line that is *directly* preceded
     by non-blank text into a clearly-bounded horizontal rule. Without
     this padding, marked's setext-h2 rule fires first — the 3-or-more
     `-` row is interpreted as the underline of the preceding line and
     that line is silently promoted to <h2>, swallowing the `---`. The
     behaviour is intermittent because it hinges on whether the prior
     token had a blank line by the time the streaming buffer is
     committed; the user-facing symptom is "the model's `---` divider
     is sometimes a horizontal rule and sometimes gone." Padding the
     divider with a leading blank line forces marked into the thematic
     break path deterministically. We only touch ≥3 dashes (the bare
     minimum for a thematic break) and we only pad when the prior
     line is non-blank, so any existing properly-bounded `---` keeps
     its exact form. Side effect: a `text\n---` pair that the model
     genuinely intended as a setext h2 (3+ dashes is unusual for setext
     — usually a single `-` or `=`) gets the same padding and ends up
     as plain text followed by a horizontal rule; the trade-off favours
     the overwhelmingly common `--- = divider` case over the rare
     setext-with-3-dashes case. */
  s = s.replace(/([^\n])\n(-{3,})\s*(?=\n|$)/g, '$1\n\n$2');

  /* Strip blockquote markers from lines that contain only math.
     Weak models sometimes wrap a standalone formula in `> $$...$$`
     or `> $...$`, which marked parses as a blockquote and renders
     with a left border bar that looks like a spurious `>` symbol. */
  s = s.replace(/^[ \t]*>[ \t]*(\$\$[\s\S]*?\$\$)[ \t]*$/gm, '$1');
  s = s.replace(/^[ \t]*>[ \t]*(\$[^\n$]+\$)[ \t]*$/gm, '$1');

  const fenceMatch = s.match(/```/g);
  let fenceCount = fenceMatch ? fenceMatch.length : 0;
  fenceCount -= _ppStash.length * 2;
  if (fenceCount % 2 === 1) {
    if (!/```\s*$/.test(s)) s = s + '\n```';
  }

  s = s.replace(/(^|\n)\s*[•‣◦・·]\s+/g, '$1- ');

  s = fixMarkdownTableSeparators(s);

  s = (function () {
    const lines = s.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      const cur = lines[i];
      const nxt = lines[i + 1];
      if (!/^[ \t]*\|/.test(cur)) continue;
      if (nxt === '' || /^[ \t]*$/.test(nxt)) continue;
      if (/^[ \t]*\|[^\n]/.test(nxt)) continue;
      let j = i;
      while (j >= 0 && /^[ \t]*\|[^\n]/.test(lines[j])) j--;
      const sep = j + 2 < lines.length ? lines[j + 2] : '';
      if (!/^\s*\|[\s:|-]+\s*\|?\s*$/.test(sep)) continue;
      lines.splice(i + 1, 0, '');
      i++;
    }
    return lines.join('\n');
  })();

  s = s.replace(/\x01PP(\d+)\x01/g, function (_, id: string) { return _ppStash[parseInt(id)]; });
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, '$$$$$1$$$$');
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, '$$$1$$');
  return s;
}

/* Streaming-safe variant of preprocessMarkdown. Skips non-idempotent
   rules (stray-$ escape, unclosed-fence append, $$ whitespace trim) that
   cause drift when called repeatedly on a growing buffer. The standalone
   `$…$` display promotion is shared with the final pass, gated by
   `opts.complete` for the still-typing last line. */
export function preprocessMarkdownForStreaming(
  t: string | null | undefined,
  opts?: StreamingPreprocessOptions,
): string {
  if (!t) return t as string;
  const complete = opts?.complete === true;
  let s = String(t);
  s = s.replace(/\r\n?/g, '\n');
  s = s.replace(/<p>\s*/gi, '').replace(/\s*<\/p>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');

  const _ppStash: string[] = [];
  function _stash(replacement: string): string {
    const id = _ppStash.length;
    _ppStash.push(replacement);
    return '\x01PP' + id + '\x01';
  }
  s = s.replace(/```([\w-]*)\n?([\s\S]*?)```/g, function (_, lang: string, body: string) {
    return _stash('```' + lang + '\n' + body + '```');
  });
  s = s.replace(/`[^`\n]+`/g, function (m) { return _stash(m); });

  s = fixHeadingMarkers(s);

  s = s.replace(/\\\[([\s\S]+?)\\\]/g, function (m) {
    return _stash('\\[' + m.slice(2, -2).trim() + '\\]');
  });
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, function (m) {
    return _stash('\\(' + m.slice(2, -2).trim() + '\\)');
  });

  /* Same standalone-formula promotion as the final pass. Closed fences are
     stashed above, so a ``` still present here opens a fence that has not
     closed yet: everything from it on is code being typed and stays as-is
     (a LaTeX sample line would otherwise read `$$…$$` until the fence
     closes). */
  const openFence = s.indexOf('```');
  s = openFence === -1
    ? promoteStandaloneInlineMath(s, complete)
    : promoteStandaloneInlineMath(s.slice(0, openFence), false) + s.slice(openFence);

  s = _autoWrapBareBracketMath(s);
  /* Mirror the `---` horizontal-rule fix from preprocessMarkdown.
     Streaming buffers concatenate partial tokens, so a "first
     paragraph / `---` / next paragraph" sequence often shows up
     in the partial buffer as `<paragraph>\n---\n<next>` instead
     of the well-bounded `\n\n---\n\n` the model actually emitted.
     Pad the rule line so marked picks the thematic-break path. */
  s = s.replace(/([^\n])\n(-{3,})\s*(?=\n|$)/g, '$1\n\n$2');
  /* Strip blockquote markers from standalone math lines (mirrors
     the same fix in preprocessMarkdown). */
  s = s.replace(/^[ \t]*>[ \t]*(\$\$[\s\S]*?\$\$)[ \t]*$/gm, '$1');
  s = s.replace(/^[ \t]*>[ \t]*(\$[^\n$]+\$)[ \t]*$/gm, '$1');
  s = s.replace(/(^|\n)\s*[•‣◦・·]\s+/g, '$1- ');
  s = fixMarkdownTableSeparators(s);

  s = (function () {
    const lines = s.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      const cur = lines[i];
      const nxt = lines[i + 1];
      if (!/^[ \t]*\|/.test(cur)) continue;
      if (nxt === '' || /^[ \t]*$/.test(nxt)) continue;
      if (/^[ \t]*\|[^\n]/.test(nxt)) continue;
      let j = i;
      while (j >= 0 && /^[ \t]*\|[^\n]/.test(lines[j])) j--;
      const sep = j + 2 < lines.length ? lines[j + 2] : '';
      if (!/^\s*\|[\s:|-]+\s*\|?\s*$/.test(sep)) continue;
      lines.splice(i + 1, 0, '');
      i++;
    }
    return lines.join('\n');
  })();

  s = s.replace(/\x01PP(\d+)\x01/g, function (_, id: string) { return _ppStash[parseInt(id)]; });
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, '$$$$$1$$$$');
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, '$$$1$$');
  return s;
}