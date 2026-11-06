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
