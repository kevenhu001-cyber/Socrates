import { validateIntelligentUi } from './intelligentUiValidation.js';

/** Recover display-only UI serialized into prose by an upstream model.
 * Never dispatch tools from text. Recovered programs still pass through the
 * normal UI validation and sandbox; original message offsets stay unchanged.
 */
export interface SerializedUiBlock {
  start: number;
  end: number;
  source: string;
  format?: 'openui';
  open: boolean;
}

const PROVIDER_SEPARATOR = /\]<\]minimax\[>\[/g;
const MAX_SERIALIZED_LENGTH = 100_000;

function recoveredProgram(body: string): Pick<SerializedUiBlock, 'source' | 'format'> {
  if (body.length > MAX_SERIALIZED_LENGTH) return { format: 'openui', source: '' };
  const clean = body.replace(PROVIDER_SEPARATOR, '');
  const nodes: string[] = [];
  for (const match of clean.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    if (nodes.length >= 80) break;
    const item = match[1];
    const id = /<id>([\s\S]*?)<\/id>/.exec(item)?.[1].trim();
    const type = /<type>([\s\S]*?)<\/type>/.exec(item)?.[1].trim();
    const source = /<source>([\s\S]*?)<\/source>/.exec(item)?.[1];
    // Only recover the declarative program we understand. Other XML is not
    // guessed into tool arguments or converted into executable operations.
    if (id && type === 'openui' && source?.trim()) nodes.push(JSON.stringify({ id, type, source }));
  }
  return nodes.length ? { source: nodes.join('\n') } : { format: 'openui', source: '' };
}

/** Skip fenced/inline code examples; consume an incomplete call to EOF so
 * partially streamed protocol markup never becomes markdown headings. */
export function serializedUiBlocks(text: string): SerializedUiBlock[] {
  if (!text.includes('<invoke')) return [];
  const blocks: SerializedUiBlock[] = [];
  const tokens = /(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\1|$)|(`+)[^\n]*?\2|<invoke\s+name\s*=\s*(["'])render_intelligent_ui\3\s*>/g;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(text))) {
    if (!match[0].startsWith('<invoke')) continue;
    const bodyStart = tokens.lastIndex;
    const close = text.indexOf('</invoke>', bodyStart);
    const open = close < 0;
    let end = open ? text.length : close + '</invoke>'.length;
    // A tool_call envelope and vendor separators may surround the invoke.
    const prefix = text.slice(0, match.index).match(/<tool_call>(?:\s|\]<\]minimax\[>\[)*$/);
    const start = prefix ? match.index - prefix[0].length : match.index;
    if (!open) {
      const suffix = /^(?:\s|\]<\]minimax\[>\[)*(?:<\/tool_call>)?/.exec(text.slice(end));
      end += suffix?.[0].length ?? 0;
      const trailing = text.slice(end);
      if (trailing && (']<]minimax[>['.startsWith(trailing) || '</tool_call>'.startsWith(trailing))) end = text.length;
    }
    blocks.push({ start, end, open, ...recoveredProgram(text.slice(bodyStart, open ? text.length : close)) });
    tokens.lastIndex = end;
  }
  return blocks;
}


/** Models occasionally omit the socrates-ui fence or label it as JSON.
 * Only a versioned, validated display document is recovered; ordinary JSON
 * and code examples remain prose. Scan braces with JSON string escaping. */
export function serializedDocumentBlocks(text: string): SerializedUiBlock[] {
  if (!text.includes('"nodes"')) return [];
  const blocks: SerializedUiBlock[] = [];
  const tokens = /(`{3,}|~{3,})([^\n]*)\n[\s\S]*?(?:\1|(?![\s\S]))|(`+)[^\n]*?\3|^([ \t]*)(?=\{\s*"version"\s*:\s*1\s*,\s*"nodes"\s*:)/gm;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(text))) {
    if (match[3]) continue;
    const fenced = Boolean(match[1]);
    if (fenced && !['', 'json'].includes(match[2].trim().toLowerCase())) continue;
    const start = fenced ? match.index : match.index + match[0].length;
    if (!fenced) tokens.lastIndex = start + 1;
    const bodyStart = fenced ? text.indexOf('\n', start) + 1 : start;
    let depth = 0, quoted = false, escaped = false, end = -1;
    for (let i = bodyStart; i < Math.min(text.length, bodyStart + MAX_SERIALIZED_LENGTH); i++) {
      const char = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{' || char === '[') depth++;
      else if (char === '}' || char === ']') { if (--depth === 0) { end = i + 1; break; } }
      else if (depth === 0 && !/\s/.test(char)) break;
    }
    if (end < 0) {
      if (!fenced && /^\{\s*"version"\s*:\s*1\s*,\s*"nodes"\s*:\s*\[/.test(text.slice(bodyStart))) {
        blocks.push({ start, end: text.length, source: '', open: true });
        break;
      }
      continue;
    }
    try {
      const source = text.slice(bodyStart, end);
      const document: unknown = JSON.parse(source);
      if (!validateIntelligentUi(document).ok) continue;
      // A JSON fence must contain the document alone.
      if (fenced && text.slice(end, tokens.lastIndex).replace(/[`~]+\s*$/, '').trim()) continue;
      blocks.push({ start, end: fenced ? tokens.lastIndex : end, source, open: false });
      if (!fenced) tokens.lastIndex = end;
    } catch { /* incomplete or ordinary JSON is left readable */ }
  }
  return blocks;
}
