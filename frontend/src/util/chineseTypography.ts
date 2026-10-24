/** Chinese prose only. Call after Markdown parsing so syntax and attributes
 * never pass through this transform. Offsets stay stable: every edit is one
 * UTF-16 code unit, including paired Chinese quotes. */
export function normalizeChineseProse(text: string): string {
  if (!/\p{Script=Han}/u.test(text) || !/[,.;:!?()"']/.test(text)) return text;
  const protectedChars = new Uint8Array(text.length);
  const protect = (start: number, end: number) => protectedChars.fill(1, start, end);
  const technical = /https?:\/\/[^\s<>"'，。！？；（）]+|www\.[^\s<>"'，。！？；（）]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[a-z]:[\\/][^\s<>"'，。！？；（）]+|(?:\.{1,2}\/|\/)[\p{L}\p{N}_.~/-]+|[\p{L}\p{N}_-]+\.[a-z][a-z\d_-]*(?:\.[a-z\d_-]+)*|\d+(?:[.,:/-]\d+)+|\{[\w]+\}(?::\{[\w]+\})*|\$\$[\s\S]*?\$\$|\$[^\n$]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/giu;
  for (const match of text.matchAll(technical)) protect(match.index, match.index + match[0].length);
  for (const match of text.matchAll(/\b[a-z_]\w*\([^\p{Script=Han}()\n]*\)/giu)) protect(match.index, match.index + match[0].length);
  // Ordinals in headings and plain list labels are formatting, not prose.
  for (const match of text.matchAll(/^\s*\d+[.)]\s+/gm)) protect(match.index, match.index + match[0].length);
  // Keep complete English sentences in mixed-language paragraphs unchanged.
  for (const match of text.matchAll(/(?:^|[。！？\n])\s*([a-z][^\p{Script=Han}\n]*?[.!?])(?=\s|$)/giu)) {
    const start = match.index + match[0].indexOf(match[1]);
    protect(start, start + match[1].length);
  }
  // Unfenced JSON is still exact data. Recognize balanced, valid JSON rather
  // than treating every Chinese phrase in parentheses as a programming token.
  for (let start = 0; start < text.length; start++) {
    if (protectedChars[start] || (text[start] !== '{' && text[start] !== '[')) continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    let closed = false;
    for (let end = start; end < text.length; end++) {
      const char = text[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{' || char === '[') depth++;
      else if (char === '}' || char === ']') depth--;
      if (depth !== 0 || quoted) continue;
      closed = true;
      try {
        JSON.parse(text.slice(start, end + 1));
        protect(start, end + 1);
      } catch { /* empty-catch: intentional — ordinary bracketed prose is not JSON */ }
      start = end;
      break;
    }
    if (!closed) break;
  }
  const map: Record<string, string> = { ',': '，', '.': '。', '!': '！', '?': '？', ':': '：', ';': '；', '(': '（', ')': '）' };
  let doubleOpen = false;
  let singleOpen = false;
  return text.replace(/[^\n]+/g, (line, offset: number) => {
    const chinese = /\p{Script=Han}/u.test(line);
    if (!chinese && !doubleOpen && !singleOpen) return line;
    return line.replace(/[,.;:!?()"'“”‘’]/g, (char, index: number) => {
      if (protectedChars[offset + index]) return char;
      if (char === '“' || char === '”') { doubleOpen = char === '“'; return char; }
      if (char === '‘' || char === '’') { singleOpen = char === '‘'; return char; }
      if (!chinese && char !== '"' && char !== "'") return char;
      // Ellipses, contractions and apostrophes in English names are exact.
      if (char === '.' && (line[index - 1] === '.' || line[index + 1] === '.')) return char;
      if (char === "'" && /[a-z\d]/i.test(line[index - 1] || '') && /[a-z\d]/i.test(line[index + 1] || '')) return char;
      if (char === '"') { doubleOpen = !doubleOpen; return doubleOpen ? '“' : '”'; }
      if (char === "'") { singleOpen = !singleOpen; return singleOpen ? '‘' : '’'; }
      return map[char];
    });
  });
}
