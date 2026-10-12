export const INTELLIGENCE_UI_FENCE = 'socrates-ui';

const MAX_NODES = 80;
const MAX_ID_LENGTH = 80;
const SAFE_ID = /^[A-Za-z0-9._:-]+$/;
const BLOCK_START = /^```(?:socrates-ui|sui)[ \t]*\r?$/gm;
const BLOCK_END = /^```[ \t]*\r?$/gm;
const FORBIDDEN_PATH_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export type IntelligenceUiNodeType =
  | 'panel'
  | 'stack'
  | 'grid'
  | 'text'
  | 'metric'
  | 'progress'
  | 'divider'
  | 'callout'
  | 'slider'
  | 'choice'
  | 'button'
  | 'table';

const NODE_TYPES = new Set<IntelligenceUiNodeType>([
  'panel',
  'stack',
  'grid',
  'text',
  'metric',
  'progress',
  'divider',
  'callout',
  'slider',
  'choice',
  'button',
  'table',
]);

export type IntelligenceUiState = Record<string, unknown>;

export interface IntelligenceUiNode {
  id: string;
  type: IntelligenceUiNodeType;
  parent?: string;
  state?: IntelligenceUiState;
  [key: string]: unknown;
}

export interface IntelligenceUiBlockSegment {
  kind: 'ui';
  source: string;
  start: number;
  end: number;
  open: boolean;
}

export interface IntelligenceUiTextSegment {
  kind: 'text';
  text: string;
  start: number;
  end: number;
}

export type IntelligenceUiSegment = IntelligenceUiBlockSegment | IntelligenceUiTextSegment;

export interface IntelligenceUiValueContext {
  state: IntelligenceUiState;
  tools?: ReadonlyArray<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNode(value: unknown): IntelligenceUiNode | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const type = typeof value.type === 'string' ? value.type.trim() as IntelligenceUiNodeType : null;
  if (!id || id.length > MAX_ID_LENGTH || !SAFE_ID.test(id) || !type || !NODE_TYPES.has(type)) return null;
  const parent = typeof value.parent === 'string' ? value.parent.trim() : '';
  const state = isRecord(value.state) ? value.state : undefined;
  return {
    ...value,
    id,
    type,
    parent: parent && SAFE_ID.test(parent) ? parent.slice(0, MAX_ID_LENGTH) : undefined,
    state,
  };
}

/**
 * Parse the JSONL payload used by Socrates Intelligent UI.
 *
 * Each complete non-empty line is one independent node. This is deliberate:
 * while the model is streaming, already-complete lines can render immediately
 * and the trailing half-written JSON object is simply deferred until the next
 * token batch. No eval, HTML, CSS, or arbitrary JavaScript is accepted.
 */
export function parseIntelligenceUiRecords(source: string): IntelligenceUiNode[] {
  const nodes: IntelligenceUiNode[] = [];
  const seen = new Set<string>();
  const lines = String(source || '').split(/\r?\n/);

  for (const line of lines) {
    if (nodes.length >= MAX_NODES) break;
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const node = normalizeNode(JSON.parse(trimmed));
      if (!node || seen.has(node.id)) continue;
      seen.add(node.id);
      nodes.push(node);
    } catch {
      /* Streaming contract: malformed or incomplete lines are not fatal.
         A later render receives the longer source and retries the line. */
    }
  }
  return nodes;
}

function nextFenceEnd(text: string, from: number): RegExpExecArray | null {
  BLOCK_END.lastIndex = from;
  return BLOCK_END.exec(text);
}

/** Split public prose from native Intelligent UI fences without touching tool offsets. */
export function splitIntelligenceUiText(text: string): IntelligenceUiSegment[] {
  const source = String(text || '');
  const segments: IntelligenceUiSegment[] = [];
  let cursor = 0;
  BLOCK_START.lastIndex = 0;

  for (;;) {
    const startMatch = BLOCK_START.exec(source);
    if (!startMatch) break;
    const fenceStart = startMatch.index;
    if (fenceStart > cursor) {
      segments.push({ kind: 'text', text: source.slice(cursor, fenceStart), start: cursor, end: fenceStart });
    }

    let bodyStart = BLOCK_START.lastIndex;
    if (source[bodyStart] === '\n') bodyStart += 1;
    const endMatch = nextFenceEnd(source, bodyStart);
    if (!endMatch) {
      segments.push({ kind: 'ui', source: source.slice(bodyStart), start: fenceStart, end: source.length, open: true });
      cursor = source.length;
      BLOCK_START.lastIndex = source.length;
      break;
    }

    const bodyEnd = endMatch.index;
    segments.push({ kind: 'ui', source: source.slice(bodyStart, bodyEnd), start: fenceStart, end: BLOCK_END.lastIndex, open: false });
    cursor = BLOCK_END.lastIndex;
    if (source[cursor] === '\n') cursor += 1;
    BLOCK_START.lastIndex = cursor;
  }

  if (cursor < source.length) {
    segments.push({ kind: 'text', text: source.slice(cursor), start: cursor, end: source.length });
  }
  if (!segments.length && source) {
    segments.push({ kind: 'text', text: source, start: 0, end: source.length });
  }
  return segments;
}

export function stripIntelligenceUiBlocks(text: string): string {
  return splitIntelligenceUiText(text)
    .filter((segment): segment is IntelligenceUiTextSegment => segment.kind === 'text')
    .map((segment) => segment.text)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function initialStateForNodes(nodes: ReadonlyArray<IntelligenceUiNode>): IntelligenceUiState {
  const state: IntelligenceUiState = {};
  for (const node of nodes) {
    if (!node.parent && node.state) {
      for (const [key, value] of Object.entries(node.state)) {
        if (!(key in state) && key.length <= MAX_ID_LENGTH && SAFE_ID.test(key)) state[key] = value;
      }
    }
  }
  return state;
}

function readPath(root: unknown, path: string): unknown {
  if (!path) return root;
  let current = root;
  for (const rawPart of path.split('.')) {
    if (FORBIDDEN_PATH_KEYS.has(rawPart)) return undefined;
    if (Array.isArray(current)) {
      const index = Number(rawPart);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
      continue;
    }
    if (!isRecord(current) || !(rawPart in current)) return undefined;
    current = current[rawPart];
  }
  return current;
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function toolValue(ref: Record<string, unknown>, tools: ReadonlyArray<unknown>): unknown {
  const records = tools.filter(isRecord);
  const selector = ref.tool;
  let tool: Record<string, unknown> | undefined;
  if (typeof selector === 'number' && Number.isInteger(selector) && selector >= 0) tool = records[selector];
  if (typeof selector === 'string') tool = records.find((entry) => entry.id === selector);
  if (!tool) return undefined;
  return readPath(tool, typeof ref.path === 'string' ? ref.path : '');
}

function resolveArgs(value: Record<string, unknown>, context: IntelligenceUiValueContext): unknown[] {
  const args = Array.isArray(value.args) ? value.args : [];
  return args.map((arg) => resolveIntelligenceUiValue(arg, context));
}

function numericPair(args: unknown[]): [number, number] | null {
  const left = finiteNumber(args[0]);
  const right = finiteNumber(args[1]);
  return left == null || right == null ? null : [left, right];
}

/** Evaluate the small declarative expression language. Never executes model code. */
export function resolveIntelligenceUiValue(value: unknown, context: IntelligenceUiValueContext): unknown {
  if (!isRecord(value)) {
    if (Array.isArray(value)) return value.map((item) => resolveIntelligenceUiValue(item, context));
    return value;
  }

  if (typeof value.state === 'string' && Object.keys(value).length <= 2) return context.state[value.state];
  if (('tool' in value) && context.tools) return toolValue(value, context.tools);
  if (typeof value.op !== 'string') return value;

  const args = resolveArgs(value, context);
  const pair = numericPair(args);
  switch (value.op) {
    case 'add': return args.reduce<number>((sum, item) => sum + (finiteNumber(item) ?? 0), 0);
    case 'sub': return pair ? pair[0] - pair[1] : undefined;
    case 'mul': return args.reduce<number>((product, item) => product * (finiteNumber(item) ?? 1), 1);
    case 'div': return pair && pair[1] !== 0 ? pair[0] / pair[1] : undefined;
    case 'round': {
      const number = finiteNumber(args[0]);
      return number == null ? undefined : Math.round(number);
    }
    case 'floor': {
      const number = finiteNumber(args[0]);
      return number == null ? undefined : Math.floor(number);
    }
    case 'ceil': {
      const number = finiteNumber(args[0]);
      return number == null ? undefined : Math.ceil(number);
    }
    case 'min': {
      const numbers = args.map(finiteNumber).filter((item): item is number => item != null);
      return numbers.length ? Math.min(...numbers) : undefined;
    }
    case 'max': {
      const numbers = args.map(finiteNumber).filter((item): item is number => item != null);
      return numbers.length ? Math.max(...numbers) : undefined;
    }
    case 'eq': return args[0] === args[1];
    case 'neq': return args[0] !== args[1];
    case 'gt': return pair ? pair[0] > pair[1] : false;
    case 'gte': return pair ? pair[0] >= pair[1] : false;
    case 'lt': return pair ? pair[0] < pair[1] : false;
    case 'lte': return pair ? pair[0] <= pair[1] : false;
    case 'and': return args.every(Boolean);
    case 'or': return args.some(Boolean);
    case 'not': return !args[0];
    case 'if': return args[0] ? args[1] : args[2];
    case 'concat': return args.map((item) => item == null ? '' : String(item)).join('');
    default: return undefined;
  }
}

export function displayIntelligenceUiValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  if (typeof value === 'string') return value;
  return '';
}
