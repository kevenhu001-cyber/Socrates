/** Abbreviations that keep their trailing period.
 *
 * The period in "e.g." / "U.S." / "Dr." closes the abbreviation; it does not
 * end the sentence. Handing it to the Chinese full stop breaks the sentence
 * in half ("例如 e.g。这样写。"), so the whole token stays ASCII. The dotted
 * form is kept separate from the word form because a word may legitimately
 * carry a sentence period after it ("使用 Node.js。") while an abbreviation
 * never does. */
const ABBREVIATION_WORDS = [
  'Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Sr', 'Jr', 'St', 'Mt', 'Rev', 'Gen', 'Col',
  'Capt', 'Sgt', 'Lt', 'Maj', 'Hon', 'etc', 'vs', 'al', 'ca', 'cf', 'ibid', 'viz',
  'resp', 'approx', 'incl', 'excl', 'orig', 'trans', 'est', 'Min', 'Max', 'Avg',
  'Sec', 'No', 'Nos', 'Fig', 'Figs', 'Vol', 'Vols', 'Ch', 'Art', 'Para', 'Ref',
  'Eq', 'Eqs', 'Tab', 'Inc', 'Ltd', 'Co', 'Corp', 'Dept', 'Univ', 'Misc',
  'Ave', 'Blvd', 'Rd', 'Sq', 'Ft',
];
/* `(?:[A-Za-z]\.){2,}` covers the dotted initialisms — e.g. / i.e. / U.S. —
   including their final period; the alternation covers the word forms. */
const abbreviation = new RegExp(
  `(?:[A-Za-z]\\.){2,}|\\b(?:${ABBREVIATION_WORDS.join('|')})\\.`,
  'gi',
);

const protectedPatterns = [
  /https?:\/\/[^\s<>"'，。！？；（）]+|www\.[^\s<>"'，。！？；（）]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[a-z]:[\\/][^\s<>"'，。！？；（）]+|(?:\.{1,2}\/|\/)[\p{L}\p{N}_.~/-]+|[\p{L}\p{N}_-]+\.[a-z][a-z\d_-]*(?:\.[a-z\d_-]+)*|\d+(?:[.,:/-]\d+)+|\{[\w]+\}(?::\{[\w]+\})*|\$\$[\s\S]*?\$\$|\$[^\n$]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/giu,
  abbreviation,
  /\b[a-z_]\w*\([^\p{Script=Han}()\n]*\)/giu,
  /^\s*\d+[.)]\s+/gm,
];

const englishSentencePattern = /(?:^|[。！？\n])\s*([a-z][^\p{Script=Han}\n]*?[.!?])(?=\s|$)/giu;
const normalizablePunctuation = /[,.;:!?()"'“”‘’]/g;
const punctuationMap: Record<string, string> = {
  ',': '，', '.': '。', '!': '！', '?': '？', ':': '：', ';': '；', '(': '（', ')': '）',
};

interface QuoteState { doubleOpen: boolean; singleOpen: boolean }

function protectRegexMatches(text: string, protectedChars: Uint8Array): void {
  for (const pattern of protectedPatterns) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      protectedChars.fill(1, start, start + match[0].length);
    }
  }
}

function protectEnglishSentences(text: string, protectedChars: Uint8Array): void {
  for (const match of text.matchAll(englishSentencePattern)) {
    const start = (match.index ?? 0) + match[0].indexOf(match[1]);
    protectedChars.fill(1, start, start + match[1].length);
  }
}

function balancedJsonEnd(text: string, start: number): number {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let end = start; end < text.length; end++) {
    const char = text[end];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') depth--;
    if (depth === 0 && !quoted) return end;
  }
  return -1;
}

function protectValidJson(text: string, protectedChars: Uint8Array): void {
  for (let start = 0; start < text.length; start++) {
    if (protectedChars[start] || (text[start] !== '{' && text[start] !== '[')) continue;
    const end = balancedJsonEnd(text, start);
    if (end < 0) break;
    try {
      JSON.parse(text.slice(start, end + 1));
      protectedChars.fill(1, start, end + 1);
    } catch { /* empty-catch: intentional — ordinary bracketed prose is not JSON */ }
    start = end;
  }
}

function prepareProtectedChars(text: string): Uint8Array {
  const protectedChars = new Uint8Array(text.length);
  protectRegexMatches(text, protectedChars);
  protectEnglishSentences(text, protectedChars);
  protectValidJson(text, protectedChars);
  return protectedChars;
}

function updateExplicitQuote(char: string, state: QuoteState): string | null {
  if (char === '“' || char === '”') { state.doubleOpen = char === '“'; return char; }
  if (char === '‘' || char === '’') { state.singleOpen = char === '‘'; return char; }
  if (char === '"') { state.doubleOpen = !state.doubleOpen; return state.doubleOpen ? '“' : '”'; }
  if (char === "'") { state.singleOpen = !state.singleOpen; return state.singleOpen ? '‘' : '’'; }
  return null;
}

function isEnglishApostrophe(line: string, index: number): boolean {
  return /[a-z\d]/i.test(line[index - 1] || '') && /[a-z\d]/i.test(line[index + 1] || '');
}

function translatePunctuation(
  line: string,
  index: number,
  sourceOffset: number,
  chinese: boolean,
  protectedChars: Uint8Array,
  state: QuoteState,
): string {
  const char = line[index];
  if (protectedChars[sourceOffset + index]) return char;
  const quote = updateExplicitQuote(char, state);
  if (quote !== null) return quote;
  if (!chinese) return char;
  // Ellipses, contractions and apostrophes in English names are exact.
  if (char === '.' && (line[index - 1] === '.' || line[index + 1] === '.')) return char;
  if (char === "'" && isEnglishApostrophe(line, index)) return char;
  return punctuationMap[char] || char;
}

function normalizeLine(
  line: string,
  offset: number,
  protectedChars: Uint8Array,
  state: QuoteState,
): string {
  const chinese = /\p{Script=Han}/u.test(line);
  if (!chinese && !state.doubleOpen && !state.singleOpen) return line;
  return line.replace(normalizablePunctuation, (char, index: number) =>
    translatePunctuation(line, index, offset, chinese, protectedChars, state));
}

/** Chinese prose only. Call after Markdown parsing so syntax and attributes
 * never pass through this transform. Offsets stay stable: every edit is one
 * UTF-16 code unit, including paired Chinese quotes. */
export function normalizeChineseProse(text: string): string {
  if (!/\p{Script=Han}/u.test(text) || !/[,.;:!?()"']/.test(text)) return text;
  const protectedChars = prepareProtectedChars(text);
  const state: QuoteState = { doubleOpen: false, singleOpen: false };
  return text.replace(/[^\n]+/g, (line, offset: number) =>
    normalizeLine(line, offset, protectedChars, state));
}
