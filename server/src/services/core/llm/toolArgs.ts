/**
 * Streaming tool-call argument assembly.
 */
/** Normalize provider-specific tool argument streaming.
 *
 * OpenAI sends JSON fragments, while several compatible providers send an
 * object or repeat the complete accumulated JSON on every delta. The two
 * shapes need opposite handling (append vs replace), and no per-delta
 * heuristic can tell them apart safely: the previous implementation dropped
 * any delta that happened to be a suffix of what was already accumulated,
 * which silently truncated every call whose arguments end in `}}` (the
 * upstream emits the two closing braces as separate tokens) and corrupted
 * repeated tokens inside strings.
 *
 * So the mode is decided ONCE per tool call, on the second delta, and then
 * obeyed for the rest of the stream:
 *
 *   - snapshot — the delta repeats the accumulated prefix, or both the old
 *     and the new value are complete JSON objects in their own right;
 *   - fragment — anything else: deltas are appended verbatim, with no
 *     de-duplication, so no byte of the model's JSON can be lost.
 */
export type ToolArgumentStreamMode = 'unknown' | 'snapshot' | 'fragment';

export interface ToolArgumentStream {
  /** Accumulated argument text so far. */
  text: string;
  /** How this provider streams; 'unknown' until the second delta. */
  mode: ToolArgumentStreamMode;
}

export function createToolArgumentStream(): ToolArgumentStream {
  return { text: '', mode: 'unknown' };
}

/** Placeholders some gateways send before the real arguments start. */
const PLACEHOLDER_ARGUMENTS = new Set(['{}', '[]', 'null', '""']);

function isCompleteJsonObject(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return false;
  try {
    const value = JSON.parse(trimmed) as unknown;
    return !!value && typeof value === 'object' && !Array.isArray(value);
  } catch {
    return false;
  }
}

function incomingToText(incoming: unknown): { text: string; wasObject: boolean } {
  if (typeof incoming === 'string') return { text: incoming, wasObject: false };
  if (incoming && typeof incoming === 'object') {
    try { return { text: JSON.stringify(incoming), wasObject: true }; } catch { return { text: '', wasObject: true }; }
  }
  return { text: incoming == null ? '' : String(incoming), wasObject: false };
}

/**
 * Fold one streamed delta into `stream`, returning the updated state.
 *
 * The same function serves function names and argument text: a name stream
 * never looks like JSON, so it can only ever resolve to snapshot (the
 * provider repeats the prefix) or fragment (it appends).
 */
export function appendToolArgumentDelta(
  stream: ToolArgumentStream,
  incoming: unknown,
): ToolArgumentStream {
  const { text: next, wasObject } = incomingToText(incoming);
  if (!next) return stream;

  /* A provider that hands us a real object is authoritative and complete:
     there is nothing to append to and nothing to detect. */
  if (wasObject) return { text: next, mode: 'snapshot' };

  if (!stream.text) return { text: next, mode: stream.mode };

  /* `{}` (or `[]`/`null`) followed by the start of a real object is a
     placeholder, not the arguments. Replace it and leave the mode
     undecided: keeping the placeholder locked the accumulator and every
     later fragment was discarded, while deciding a mode here would
     mis-classify the very next delta. */
  if (PLACEHOLDER_ARGUMENTS.has(stream.text.trim()) && next.trim().startsWith('{')) {
    return { text: next, mode: stream.mode };
  }

  // Repeated opening braces are gateway keepalive snapshots, not evidence
  // that every following token is a cumulative snapshot. Keep detecting.
  if (stream.mode === 'unknown' && next === stream.text && /^\s*\{\s*$/.test(next)) return stream;

  let mode = stream.mode;
  if (mode === 'unknown') {
    if (next.startsWith(stream.text)) mode = 'snapshot';
    else if (isCompleteJsonObject(stream.text) && isCompleteJsonObject(next)) mode = 'snapshot';
    else mode = 'fragment';
  }

  if (mode === 'snapshot') return { text: next, mode };
  return { text: stream.text + next, mode };
}

/**
 * Stateless convenience wrapper: folds one delta with no memory of the
 * stream's mode. Prefer `appendToolArgumentDelta` with a persistent
 * `ToolArgumentStream` — without state, every delta re-runs mode detection.
 */
export function mergeToolArgumentDelta(previous: unknown, incoming: unknown): string {
  const prev = typeof previous === 'string' ? previous : String(previous ?? '');
  return appendToolArgumentDelta({ text: prev, mode: 'unknown' }, incoming).text;
}

export function mergeToolNameDelta(previous: unknown, incoming: unknown): string {
  const prev = typeof previous === 'string' ? previous : String(previous ?? '');
  const next = typeof incoming === 'string' ? incoming : String(incoming ?? '');
  if (!next) return prev;
  if (!prev) return next;
  /* A snapshot repeat in either direction resolves to the longer value; a
     genuine fragment is appended. Unlike the previous implementation this
     never drops a fragment that merely looks like the accumulated tail. */
  if (next.startsWith(prev)) return next.slice(0, 128);
  if (prev.startsWith(next)) return prev;
  return (prev + next).slice(0, 128);
}

/**
 * Stream a chat completion from an external LLM provider.
 *
 * @param {object} opts
 * @param {string} opts.apiBase  - Base URL of the provider API
 * @param {string} opts.apiKey   - API key
 * @param {string} opts.model    - Model name
 * @param {Array}  opts.messages - Array of {role, content}
 * @param {number} opts.maxTokens
 * @param {number} opts.temperature
 * @param {AbortSignal} opts.signal - Optional abort signal
 * @param {Array}  [opts.tools]       - OpenAI-style tool definitions
 * @param {string} [opts.tool_choice] - 'auto' | 'none' | 'required' | {type:'function', function:{name}}
 * @param {function} onChunk     - Called with each text chunk
 * @param {function} onDone      - Called when streaming completes; receives
 *                                { finishReason, usage } where `usage` is the raw
 *                                upstream usage object from the final
 *                                stream_options.include_usage frame (null when the
 *                                provider sent none, or the stream ended early). The
 *                                finishReason is used so the
 *                                  caller can decide whether to dispatch tool calls
 * @param {function} onError     - Called on error
 * @param {function} [onReasoning] - Called with each reasoning_content chunk (DeepSeek-style)
 * @param {function} [onToolUse]   - Called once per fully streamed tool_call when finish_reason
 *                                  is 'tool_calls'. Each callback receives
 *                                  { id, type:'function', function:{ name, arguments } }.
 *                                  Arguments is the raw JSON string the upstream streamed —
 *                                  callers must parse it themselves.
 * @param {function} [onToolCallDelta] - Called on each tool_call delta with the partial
 *                                  accumulated state. Receives
 *                                  { index, id?, name?, argumentsDelta, arguments }
 *                                  so the chat route can stream the in-progress JSON
 *                                  (e.g. Python source) to the client for live rendering
 *                                  instead of waiting for finish_reason='tool_calls'.
 */
