/**
 * Tolerant reader for `Visualization(...)` calls inside OpenUI source text.
 *
 * Used where the program could not be rendered (the server rejected it, or
 * it is still streaming): it recovers the real title for the card header and,
 * when the payload is a plain JSON literal, the data for "view as table".
 * It never evaluates anything; expressions and $state references simply make
 * the payload unavailable.
 */
export interface VisualizationCallSource {
  template: string | null;
  title: string | null;
  payload: Record<string, unknown> | null;
}

function readString(source: string, start: number): { value: string; end: number } | null {
  const quote = source[start];
  if (quote !== '"' && quote !== "'") return null;
  let value = '';
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    if (char === '\\') { value += source[index + 1] ?? ''; index++; continue; }
    if (char === quote) {
      if (quote === '"') {
        try { return { value: JSON.parse(source.slice(start, index + 1)) as string, end: index + 1 }; } catch { /* empty-catch: intentional — fall back to the raw scan */ }
      }
      return { value, end: index + 1 };
    }
    value += char;
  }
  return null;
}

function readBalanced(source: string, start: number): { text: string; end: number } | null {
  if (source[start] !== '{') return null;
  let depth = 0;
  let quote = '';
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === '\\') { index++; continue; }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') {
      depth--;
      if (depth === 0) return { text: source.slice(start, index + 1), end: index + 1 };
    }
  }
  return null;
}

function skipSpaceAndComma(source: string, index: number): number {
  while (index < source.length && /[\s,]/.test(source[index])) index++;
  return index;
}

export function extractVisualizationCalls(source: unknown, limit = 8): VisualizationCallSource[] {
  if (typeof source !== 'string' || !source.includes('Visualization')) return [];
  const calls: VisualizationCallSource[] = [];
  const pattern = /\bVisualization\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) && calls.length < limit) {
    let index = skipSpaceAndComma(source, match.index + match[0].length);
    const template = readString(source, index);
    if (template) index = skipSpaceAndComma(source, template.end);
    const title = template ? readString(source, index) : null;
    if (title) index = skipSpaceAndComma(source, title.end);
    let payload: Record<string, unknown> | null = null;
    const literal = title ? readBalanced(source, index) : null;
    if (literal) {
      try {
        const parsed = JSON.parse(literal.text.replace(/,\s*([}\]])/g, '$1')) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
      } catch { /* empty-catch: intentional — a non-JSON payload (expressions, $state) has no static table */ }
    }
    calls.push({ template: template?.value ?? null, title: title?.value ?? null, payload });
  }
  return calls;
}

/* Arguments cut off mid-stream are not JSON, but the escaped `source`
   strings inside them still carry the title and often the whole payload. */
function sourcesFromBrokenJson(text: string): string[] {
  const sources: string[] = [];
  const pattern = /"source"\s*:\s*"((?:[^"\\]|\\.)*)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) && sources.length < 8) {
    const body = match[1].replace(/\\$/, '');
    try { sources.push(JSON.parse(`"${body}"`) as string); } catch { /* empty-catch: intentional — unreadable fragment */ }
  }
  return sources;
}

/** The OpenUI sources of a render_intelligent_ui argument object. */
export function openUiSourcesOf(input: unknown): string[] {
  let value: unknown = input;
  if (typeof input === 'string') {
    try { value = JSON.parse(input); } catch { return sourcesFromBrokenJson(input); }
  }
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const raw = record.__raw;
  if (!Array.isArray(record.nodes) && typeof raw === 'string') return openUiSourcesOf(raw);
  if (!Array.isArray(record.nodes)) return [];
  return record.nodes
    .map((node) => (node && typeof node === 'object' ? (node as Record<string, unknown>).source : null))
    .filter((item): item is string => typeof item === 'string');
}
