/**
 * LLM proxy service — calls external chat completion APIs and streams
 * the response back in OpenAI-compatible SSE format.
 *
 * Supports: any OpenAI-compatible API (OpenAI, Anthropic via proxy, MiniMax, etc.)
 */
import { randomUUID } from 'node:crypto';
import dns from 'node:dns';
import { Agent, ProxyAgent, type Dispatcher } from 'undici';

/* ─── High-performance LLM HTTP Dispatcher ────────────────────────────────
 * Keeps connections alive across turns and tools (60s idle timeout), enables
 * TCP_NODELAY for immediate packet delivery, provides lightweight DNS caching,
 * and automatically honors LLM_PROXY / HTTPS_PROXY / HTTP_PROXY in restricted
 * or cross-border network environments (crucial for China network setups).
 *
 * Timeouts are tuned for TTFB, not throughput:
 *   connectTimeout 5s  — a cross-border TCP/TLS handshake that cannot finish
 *     in 5s will not finish in 10s either; fail fast so the retry/backoff
 *     path (or the next tool hop) starts sooner instead of parking the turn.
 *   headersTimeout 30s — undici's default waits 300s for response headers.
 *     A hung upstream (accepted socket, no first byte) must surface as an
 *     error the stream can retry, not a silent 5-minute stall. Streaming
 *     bodies themselves are unbounded (reasoning models think for minutes),
 *     so bodyTimeout stays at the undici default.
 */
let _llmDispatcher: Dispatcher | null = null;
const _dnsCache = new Map<string, { addresses: Array<{ address: string; family: number }>; expires: number }>();
const DNS_CACHE_TTL_MS = 60_000;

function cachedDnsLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addresses: Array<{ address: string; family: number }>) => void,
) {
  const now = Date.now();
  const cached = _dnsCache.get(hostname);
  if (cached && cached.expires > now) {
    return cb(null, cached.addresses);
  }
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return cb(err, []);
    const list = Array.isArray(addresses)
      ? addresses.map((a) => ({ address: a.address, family: a.family }))
      : [{ address: (addresses as any).address, family: (addresses as any).family }];
    _dnsCache.set(hostname, { addresses: list, expires: now + DNS_CACHE_TTL_MS });
    cb(null, list);
  });
}

export function getLlmDispatcher(): Dispatcher {
  if (_llmDispatcher) return _llmDispatcher;
  const proxyUrl = process.env.LLM_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.all_proxy;
  if (proxyUrl) {
    _llmDispatcher = new ProxyAgent({
      uri: proxyUrl,
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 300_000,
      connections: 64,
      pipelining: 1,
      connectTimeout: 5_000,
      headersTimeout: 30_000,
      connect: {
        keepAlive: true,
        keepAliveInitialDelay: 10_000,
        noDelay: true,
      },
    });
  } else {
    _llmDispatcher = new Agent({
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 300_000,
      connections: 64,
      pipelining: 1,
      connectTimeout: 5_000,
      headersTimeout: 30_000,
      connect: {
        lookup: cachedDnsLookup as never,
        keepAlive: true,
        keepAliveInitialDelay: 10_000,
        noDelay: true,
      },
    });
  }
  return _llmDispatcher;
}

let _lastLlmActivityTime = 0;
let _keepWarmTimer: ReturnType<typeof setInterval> | null = null;

export function markLlmActivity(): void {
  _lastLlmActivityTime = Date.now();
}

/** Keep upstream TLS connection hot so users experience 0ms connection setup overhead.
 * SenseNova and other API gateways close idle keepalive connections after ~10-15s.
 * This lightweight probe sends a HEAD request to the API host every 8s when idle,
 * keeping the warm TCP/TLS socket alive in undici's connection pool. */
export function startLlmKeepWarmWorker(targetBaseUrl?: string): void {
  if (_keepWarmTimer) return;
  const url = targetBaseUrl || process.env.BEAGLE_SYSTEM_URL || 'https://token.sensenova.cn/v1';
  let hostUrl: string;
  try {
    const parsed = new URL(url);
    hostUrl = `${parsed.protocol}//${parsed.host}`;
  } catch {
    hostUrl = 'https://token.sensenova.cn';
  }

  _keepWarmTimer = setInterval(async () => {
    // If an actual LLM request happened recently (< 8s ago), connection is already hot
    if (Date.now() - _lastLlmActivityTime < 8_000) return;
    try {
      await fetch(hostUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(4_000),
        dispatcher: getLlmDispatcher(),
      } as unknown as RequestInit).catch(() => {});
    } catch {
      // Swallowed: network probes never throw
    }
  }, 8_000);

  _keepWarmTimer.unref?.();
}

/* Streaming completions have no server-owned deadline. They continue until
 * the provider settles or the caller explicitly aborts (for example, Stop). */
/* P_provider-max-tokens — 32K was larger than the output budget accepted by
 * a number of OpenAI-compatible gateways.  Keep the public request ceiling
 * at 32K, but use a conservative default when the caller did not choose a
 * budget explicitly.  Operators can raise this for a known-compatible
 * provider without changing the API contract. */
const DEFAULT_MAX_TOKENS = Math.max(256, Number.parseInt(process.env.LLM_DEFAULT_MAX_TOKENS || '8192', 10) || 8192);

interface ChatCompletionRequestOptions {
  apiBase: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: unknown; [key: string]: unknown }>;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  reasoning_effort?: string;
  response_speed?: 'standard' | 'fast';
  extra_body?: Record<string, unknown>;
  tools?: Array<{ type: 'function'; function: { name: string; [key: string]: unknown } }>;
  tool_choice?: unknown;
  onPreferenceFallback?: (detail: {
    preference: 'response_speed';
    requested: 'fast';
    applied: 'standard';
  }) => void;
}

/** Preserve useful upstream context without exposing credentials. */
export class LlmProviderError extends Error {
  readonly status: number;
  readonly providerBody: string;

  constructor(status: number, body: string) {
    const compactBody = body.slice(0, 200);
    super(`LLM API error ${status}: ${compactBody}`);
    this.name = 'LlmProviderError';
    this.status = status;
    this.providerBody = compactBody;
  }
}

/* ─── P_rpm-backoff — retry policy for upstream failures ────────────────────
 *
 * A multi-step turn is many POSTs against one provider key: the tool loop
 * re-calls the model per hop, and retrieval / compression / summary each add
 * their own. So the odds that *some* hop meets an exhausted RPM window scale
 * with the number of steps — which is why this used to read as "multi-step
 * turns always 429".
 *
 * The old policy treated a 429 like a hiccup: 3 attempts with 1 s / 2 s
 * waits, i.e. ~3 s of total patience. An RPM window is normally ~60 s, so the
 * retries all landed inside the same exhausted window and the turn died with
 * the error the user sees. Rate limiting is therefore given its own, much
 * longer schedule; transient 5xx keeps a short one because those clear in
 * seconds.
 *
 * 500 is retryable here but 524 is not (it means the gateway gave up waiting
 * for a response that is still running upstream — replaying it would double
 * the bill). This mirrors the client's own STREAM_RETRYABLE_STATUS set.
 */
const RATE_LIMIT_STATUS = 429;
const TRANSIENT_RETRYABLE_STATUS = new Set([408, 425, 500, 502, 503, 504, 520, 522]);

/** Attempts for a rate-limited request: initial + 4 retries. */
const RATE_LIMIT_ATTEMPTS = 5;
/** Attempts for a transient upstream failure: initial + 2 retries. */
const TRANSIENT_ATTEMPTS = 3;

/** Ceiling on an upstream Retry-After we are willing to sit through. */
const RETRY_AFTER_CEILING_MS = 30_000;

function isRetryableUpstreamStatus(status: number): boolean {
  return status === RATE_LIMIT_STATUS || TRANSIENT_RETRYABLE_STATUS.has(status);
}

export function attemptsForUpstreamStatus(status: number): number {
  return status === RATE_LIMIT_STATUS ? RATE_LIMIT_ATTEMPTS : TRANSIENT_ATTEMPTS;
}

/**
 * Delay before the next attempt. A provider-sent `Retry-After` wins — it is
 * the only number that actually describes the window we are locked out of —
 * but it is capped so a hostile or misconfigured gateway cannot park a turn
 * indefinitely. Without one we escalate, with jitter: several tool hops
 * running per turn would otherwise retry in lockstep against the same
 * exhausted window and burn the remaining attempts simultaneously.
 */
export function upstreamRetryDelayMs(status: number, attempt: number, retryAfterHeader: string | null): number {
  const retryAfterSec = Number.parseFloat(retryAfterHeader || '');
  if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    return Math.min(Math.round(retryAfterSec * 1000), RETRY_AFTER_CEILING_MS);
  }
  if (status === RATE_LIMIT_STATUS) {
    /* 2 s, 4 s, 8 s, 16 s — ~30 s of patience, which outlasts a typical RPM
     * window instead of racing it. */
    return Math.min(2000 * 2 ** attempt, 20_000) + Math.floor(Math.random() * 500);
  }
  return (attempt === 0 ? 800 : 1600) + Math.floor(Math.random() * 400);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    /* Named AbortError so the callers' existing `name === 'AbortError'`
       guard treats a cancelled backoff as a cancellation, not as another
       provider failure worth retrying. */
    const aborted = () => reject(Object.assign(new Error('LLM request aborted'), { name: 'AbortError' }));
    if (signal?.aborted) {
      aborted();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }, ms);
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

function normalizeProviderMessages(messages: ChatCompletionRequestOptions['messages']) {
  /* OpenAI permits null assistant content alongside tool_calls. Several
   * compatibility layers do not, and reject the entire second tool hop with
   * a provider-side 400. Empty string is semantically equivalent here and is
   * accepted by both strict and permissive gateways. */
  return messages.map((message) => {
    let normalized = message;
    if ((message.role === 'assistant' && Array.isArray(message.tool_calls)) || message.role === 'tool') {
      normalized = { ...message, content: message.content == null ? '' : message.content };
    }
    /* Reasoning models need their thinking echoed back when the turn is
       replayed: DeepSeek reads `reasoning_content`, MiniMax requires the
       `reasoning_details` array form. Persisted history only carries
       reasoning_content — synthesize the details array when missing so a
       MiniMax hop does not see a bare assistant turn (its documented
       protocol violation for tool-call continuation). */
    if (
      normalized.role === 'assistant'
      && typeof (normalized as Record<string, unknown>).reasoning_content === 'string'
      && ((normalized as Record<string, unknown>).reasoning_content as string).length > 0
      && !Array.isArray((normalized as Record<string, unknown>).reasoning_details)
    ) {
      normalized = {
        ...normalized,
        reasoning_details: [
          { type: 'reasoning.text', text: (normalized as Record<string, unknown>).reasoning_content },
        ],
      } as typeof normalized;
    }
    return normalized;
  });
}

function requestBodyVariants(opts: ChatCompletionRequestOptions, stream: boolean) {
  const { model, messages, maxTokens, temperature = stream ? 0.7 : 0.3, reasoning_effort, response_speed, extra_body, tools, tool_choice } = opts;
  const base = {
    model,
    messages: normalizeProviderMessages(messages),
    max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
    temperature,
    stream,
    /* Ask the upstream to report what it actually billed. Without this a
       streaming response carries no `usage` object at all, which is why
       services/usageTracker.ts had nothing but a chars/4 estimate to work
       with. Non-streaming responses include `usage` unconditionally, so this
       only needs to be set for streams.

       Generic OpenAI-compatible gateways sometimes reject unknown top-level
       fields with a 400, so `stream_options` is stripped by the first
       compatibility variant below rather than being sent unconditionally. */
    ...(stream ? { stream_options: { include_usage: true } } : {}),
    ...(reasoning_effort ? { reasoning_effort } : {}),
    ...(response_speed === 'fast' ? { service_tier: 'priority' } : {}),
    ...(extra_body ? { ...extra_body } : {}),
  } as Record<string, unknown>;
  const hasTools = Array.isArray(tools) && tools.length > 0;
  const withTools: Record<string, unknown> = {
    ...base,
    ...(hasTools ? { tools, ...(tool_choice ? { tool_choice } : {}) } : {}),
  };

  /* Some gateways advertise chat completions but reject the native tools
   * field. A single no-tools retry recovers a normal answer and avoids
   * presenting a raw provider 400 to the user. This is deliberately a
   * request-local fallback, so a temporary incompatibility cannot disable
   * tools for every later conversation. */
  const variants: Array<{ body: Record<string, unknown>; reason: string; speedApplied: 'standard' | 'fast' }> = [
    { body: withTools, reason: 'initial', speedApplied: response_speed === 'fast' ? 'fast' : 'standard' },
  ];
  let compatibilityBase = withTools;

  /* `stream_options` is the newest field we send and a plausible source of a
   * 400 on an older OpenAI-compatible gateway. It is dropped by the FIRST
   * compatibility variant rather than by a variant of its own: each variant
   * costs another upstream round-trip, and losing exact usage accounting is
   * strictly cheaper than another request. Folding it in keeps the retry
   * count identical to what it was before usage accounting existed for every
   * request shape that already had a fallback. */
  const dropStreamOptions = (body: Record<string, unknown>) => {
    if (!stream) return body;
    const { stream_options: _streamOptions, ...rest } = body;
    return rest;
  };

  /* Priority service is provider-specific. Its fallback is deliberately the
     first compatibility variant so tools, reasoning_effort and extra_body
     survive when a generic OpenAI-compatible gateway rejects service_tier. */
  if (response_speed === 'fast') {
    const { service_tier: _serviceTier, ...withoutPriority } = compatibilityBase;
    compatibilityBase = dropStreamOptions(withoutPriority);
    variants.push({ body: compatibilityBase, reason: 'provider-400-without-priority', speedApplied: 'standard' });
  }
  if (hasTools) {
    const { tools: _tools, tool_choice: _toolChoice, ...withoutTools } = compatibilityBase;
    compatibilityBase = dropStreamOptions(withoutTools);
    variants.push({ body: compatibilityBase, reason: 'provider-400-with-tools', speedApplied: 'standard' });
  }
  /* Optional reasoning fields are another common source of 400s on generic
   * gateways. Only try this stricter form after the previous compatibility
   * variant, never on a successful request. */
  if (reasoning_effort || extra_body) {
    const { reasoning_effort: _effort, ...withoutReasoning } = compatibilityBase;
    const withoutOptional = dropStreamOptions({ ...withoutReasoning });
    for (const key of Object.keys(extra_body || {})) delete withoutOptional[key];
    variants.push({ body: withoutOptional, reason: 'provider-400-with-optional-fields', speedApplied: 'standard' });
  }
  /* Only when NO other compatibility variant exists does stream_options get
   * one of its own — otherwise a plain streaming request (no tools, no
   * priority, no reasoning fields) would have no recovery path at all for a
   * gateway that rejects the field, which is a capability the pre-usage code
   * never needed. */
  if (stream && variants.length === 1) {
    variants.push({
      body: dropStreamOptions(withTools),
      reason: 'provider-400-with-stream-options',
      speedApplied: response_speed === 'fast' ? 'fast' : 'standard',
    });
  }
  return variants;
}

export function isToolFinishReason(reason: unknown): boolean {
  return reason === 'tool_calls' || reason === 'tool_call' || reason === 'function_call';
}

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
export async function streamChatCompletion(
  opts: ChatCompletionRequestOptions,
  onChunk: (chunk: string) => void,
  onDone: (info: { finishReason: string | null; usage?: unknown }) => void,
  onError: (err: Error) => void,
  onReasoning?: (reasoning: string) => void,
  onToolUse?: (tc: { id: string; type: 'function'; function: { name: string; arguments: string } }) => void,
  onToolCallDelta?: (delta: { index: number; id?: string; name?: string; argumentsDelta?: string; arguments: string; final?: boolean }) => void,
) {
  const { apiBase, apiKey, signal, tools } = opts;

  try {
    if (Array.isArray(tools) && tools.length > 0) {
      /* P_privacy-leak — don't log the upstream model name. The
       * provider-agnostic tool names are enough to confirm what
       * capabilities we're sending; the model identity stays in the
       * DB only. */
      console.log('[DEBUG-LLM] Sending tools to upstream:', JSON.stringify(tools.map(t => t.function?.name)), 'tools.length:', tools.length);
    }
    let response: Response | undefined;
    /* P_llm-retry — rate limits (429 rpm exhausted) and transient 5xx
       errors kill the stream instantly. Retry the initial POST with
       exponential backoff BEFORE any byte is streamed downstream, so a
       rate-limited request gets a second chance instead of ending the
       turn. We never retry mid-stream: once streaming has started the
       caller has already forwarded content to the client.

       P_rpm-backoff: the attempt budget is now chosen per failure kind — a
       429 gets five attempts over ~30 s so the retry outlasts the RPM
       window instead of colliding with it. See upstreamRetryDelayMs. */
    let lastError: Error | null = null;
    const variants = requestBodyVariants(opts, true);
    let successfulVariant: (typeof variants)[number] | null = null;
    for (let variantIndex = 0; variantIndex < variants.length; variantIndex++) {
      const variant = variants[variantIndex];
      let tryNextVariant = false;
      /* The budget depends on how the provider answers, which we only know
         once we have asked, so it is read per attempt rather than fixed up
         front: a turn that first meets a 503 (3 attempts) and then a 429
         (5) spends the longer budget it now needs. */
      for (let attempt = 0; ; attempt++) {
        if (signal && signal.aborted) {
          onError(new Error('LLM request aborted'));
          return;
        }
        try {
          markLlmActivity();
          response = await fetch(`${apiBase}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'Accept-Encoding': 'identity',
            },
            body: JSON.stringify(variant.body),
            signal,
            dispatcher: getLlmDispatcher(),
          } as unknown as RequestInit);
          if (response.ok) {
            successfulVariant = variant;
            break;
          }

          const errBody = await response.text().catch(() => '');
          lastError = new LlmProviderError(response.status, errBody);
          if (response.status === 400 && variantIndex < variants.length - 1) {
            tryNextVariant = true;
            if (variants[variantIndex + 1]?.reason === 'provider-400-with-tools') {
              console.warn('[LLM] provider rejected native tool request; retrying with compatibility payload', JSON.stringify({
                status: response.status,
                toolCount: Array.isArray(tools) ? tools.length : 0,
                maxTokens: variant.body.max_tokens,
              }));
            } else {
              console.warn('[LLM] provider rejected optional request fields; retrying with compatibility payload', JSON.stringify({
                status: response.status,
                maxTokens: variant.body.max_tokens,
              }));
            }
            break;
          }
          if (!isRetryableUpstreamStatus(response.status)) break;
          /* Rate-limited / transient failure — wait and retry with a delay
             sized to the failure kind (see upstreamRetryDelayMs). */
          const total = attemptsForUpstreamStatus(response.status);
          if (attempt >= total - 1) break;
          const delayMs = upstreamRetryDelayMs(response.status, attempt, response.headers.get('retry-after'));
          console.warn('[LLM] upstream ' + response.status + '; retrying', JSON.stringify({
            attempt: attempt + 1,
            of: total,
            delayMs,
            variantIndex,
          }));
          await sleep(delayMs, signal);
          if (signal && signal.aborted) {
            onError(new Error('LLM request aborted'));
            return;
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') throw err; // let the outer catch classify it
          lastError = err as Error;
          if (attempt < TRANSIENT_ATTEMPTS - 1) {
            await sleep(1000);
            continue;
          }
          throw err;
        }
      }
      if (response?.ok) break;
      if (!tryNextVariant) break;
    }

    if (!response?.ok) {
      onError(lastError || new Error('LLM API request failed'));
      return;
    }

    if (opts.response_speed === 'fast' && successfulVariant?.speedApplied === 'standard') {
      opts.onPreferenceFallback?.({
        preference: 'response_speed',
        requested: 'fast',
        applied: 'standard',
      });
    }

    if (!response!.body) {
      onError(new Error('LLM API returned empty body'));
      return;
    }

    const reader = response!.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finishReason: string | null = null;
    /* Raw `usage` object from the upstream, if it sent one. Kept raw rather
       than normalised here so services/usageTracker.ts owns the per-provider
       shape handling in exactly one place. */
    let providerUsage: unknown = null;
    /* tool_call deltas arrive indexed by `index`. We accumulate them
       into full {id, type, function:{name, arguments}} objects that
       mirror what the model would have produced in a non-streaming
       response. Providers that omit `index` are tracked by id instead
       (see _accumulateToolCall). */
    const toolCallAcc = new Map();
    const _toolSlotById = new Map<string, number>();
    let _nextToolSlot = 0;
    let _lastToolSlot = -1;
    /* P_tool_stream_emit — throttle the tool_call_delta emission so a
       high-frequency upstream doesn't flood the SSE channel. We coalesce
       the per-delta callbacks to at most one per ~30 ms (or every 64
       bytes of accumulated arguments) so the client gets a smooth
       typewriter effect instead of jittery 1-char bursts. */
    let _lastDeltaEmit = 0;
    let _lastDeltaBytes = 0;
    const _emitToolDelta = (entry: { __index: number; id?: string; function: { name: string; arguments: string } }, full: string) => {
      if (typeof onToolCallDelta !== 'function') return;
      const now = Date.now();
      const bytes = (entry.function.arguments || '').length;
      if (now - _lastDeltaEmit < 30 && bytes - _lastDeltaBytes < 64) return;
      _lastDeltaEmit = now;
      _lastDeltaBytes = bytes;
      try { onToolCallDelta({
        index: entry.__index,
        id: entry.id,
        name: entry.function.name,
        arguments: entry.function.arguments,
      }); } catch { /* ignore listener errors */ }
    };
    const _accumulateToolCall = (tc: Record<string, unknown>, positionInDelta = 0, entriesInDelta = 1) => {
      const rawIndex = tc.index;
      const id = typeof tc.id === 'string' && tc.id ? tc.id : '';
      /* Slot resolution, most reliable signal first:
         1. `index` — the OpenAI contract, present on every delta of a call.
         2. a known id — the provider omits `index` but identifies the call.
         3. a NEW id with no index — a second call; it gets its own slot.
            Folding it onto slot 0 (the old fallback) overwrote the first
            call's arguments and lost one of the two calls entirely.
         4. several entries packed into one delta with neither field — the
            array position is the only ordering we have.
         5. a single anonymous entry — a continuation of the open call. */
      let slot: number;
      if (Number.isInteger(rawIndex)) slot = rawIndex as number;
      else if (id && _toolSlotById.has(id)) slot = _toolSlotById.get(id)!;
      else if (id) slot = _nextToolSlot;
      else if (entriesInDelta > 1) slot = positionInDelta;
      else slot = _lastToolSlot >= 0 ? _lastToolSlot : _nextToolSlot;
      if (id) _toolSlotById.set(id, slot);
      _nextToolSlot = Math.max(_nextToolSlot, slot + 1);
      _lastToolSlot = slot;

      const functionPart = tc.function && typeof tc.function === 'object'
        ? tc.function as Record<string, unknown>
        : undefined;
      const incomingName = functionPart?.name ?? tc.name;
      const incomingArguments = functionPart?.arguments ?? tc.arguments;
      const prev = toolCallAcc.get(slot) || {
        id: undefined,
        type: 'function',
        function: { name: '', arguments: '' },
        __index: slot,
        __argStream: createToolArgumentStream(),
      };
      /* The stream mode is per call slot, so a provider that snapshots
         arguments is detected once and then trusted for the whole call. */
      const argStream = appendToolArgumentDelta(prev.__argStream, incomingArguments);
      const next = {
        id: id || prev.id,
        type: 'function' as const,
        function: {
          name: mergeToolNameDelta(prev.function.name, incomingName),
          arguments: argStream.text,
        },
        __index: slot,
        __argStream: argStream,
      };
      toolCallAcc.set(slot, next);
      _emitToolDelta(next, next.function.arguments);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) {
          if (trimmed.startsWith('{')) {
            try {
              const errObj = JSON.parse(trimmed);
              if (errObj && (errObj.error || errObj.code || (errObj.base_resp && errObj.base_resp.status_code !== 0))) {
                const msg = typeof errObj.error === 'object'
                  ? errObj.error.message
                  : (errObj.error || errObj.message || errObj.base_resp?.status_msg || 'Upstream error');
                onError(new Error(msg));
                return;
              }
            } catch { /* ignore */ }
          }
          continue;
        }

        try {
          const json = JSON.parse(trimmed.slice(6));
          if (json.error) {
            const msg = typeof json.error === 'object' ? json.error.message : json.error;
            onError(new Error(msg || 'Upstream error in stream'));
            return;
          }
          /* Usage arrives in its OWN frame, after the last content delta,
             with `choices: []`. It must be read BEFORE the `!delta` guard
             below — that guard is why `stream_options.include_usage` data
             was silently discarded even on providers that honour it, leaving
             usageTracker with nothing but a chars/4 estimate. */
          if (json.usage && typeof json.usage === 'object') providerUsage = json.usage;
          const delta = json.choices?.[0]?.delta;
          if (!delta) {
            /* Still worth checking for finish_reason: some gateways send a
               final choices entry with no delta. */
            const finalChoice = json.choices?.[0];
            if (finalChoice && finalChoice.finish_reason) finishReason = finalChoice.finish_reason;
            continue;
          }
          /* P_deepseek-mode — reasoning_content arrives on a separate
             field on DeepSeek-family models when the request included
             `extra_body.thinking.type: enabled`. Surface it through a
             dedicated callback so the client can render it as a
             thinking pill and persist it on the assistant message
             for the next turn. */
          if (typeof onReasoning === 'function') {
            const reasoning = delta.reasoning_content;
            if (typeof reasoning === 'string' && reasoning.length > 0) {
              try { onReasoning(reasoning); } catch { /* ignore */ }
            }
          }
          /* Tool-call deltas. Each entry carries a partial id/name/
             arguments; we accumulate by `index` and flush once the
             upstream signals finish_reason='tool_calls'. We also
             forward a throttled delta to onToolCallDelta so the
             client can stream the in-progress JSON (e.g. Python
             source) live instead of waiting for completion. */
          if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
            /* Pass the array position as the fallback index: providers
               that omit `index` but pack several tool_calls into one
               delta must not collapse every entry into slot 0. */
            for (let i = 0; i < delta.tool_calls.length; i++) {
              _accumulateToolCall(delta.tool_calls[i], i, delta.tool_calls.length);
            }
          }
          /* Older OpenAI-compatible gateways use the pre-tools
             `delta.function_call` shape. Treat it as tool index 0 so a
             `finish_reason: function_call` response still reaches the same
             validation and execution path as native tool_calls. */
          if (delta.function_call && typeof delta.function_call === 'object') {
            _accumulateToolCall(delta.function_call as Record<string, unknown>);
          }
          /* finish_reason only appears on the last chunk of a stream.
             Capture it so onDone can dispatch the tool loop. */
          const choice = json.choices?.[0];
          if (choice && choice.finish_reason) finishReason = choice.finish_reason;
          const content = delta.content || '';
          if (content) onChunk(content);
        } catch {
          // Skip malformed frames
        }
      }
    }

    // Flush remaining buffer. Trim before the prefix check: upstreams
    // that end the stream with "\ndata: {...}" (no trailing newline)
    // leave leading whitespace in the buffer, and the old
    // `buffer.startsWith('data: ')` guard silently dropped that final
    // frame — truncating the tail of a streamed tool call.
    const tail = buffer.trim();
    if (tail.startsWith('data: ')) {
      try {
        const json = JSON.parse(tail.slice(6));
        /* The usage frame is the LAST frame of the stream, so it very often
           ends up here rather than in the loop above — the buffer keeps it
           when the upstream closes without a trailing newline. Read it
           before the `if (delta)` guard for the same reason as above. */
        if (json.usage && typeof json.usage === 'object') providerUsage = json.usage;
        const delta = json.choices?.[0]?.delta;
        if (delta) {
          if (typeof onReasoning === 'function') {
            const reasoning = delta.reasoning_content;
            if (typeof reasoning === 'string' && reasoning.length > 0) {
              try { onReasoning(reasoning); } catch { /* ignore */ }
            }
          }
          if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
            for (let i = 0; i < delta.tool_calls.length; i++) {
              _accumulateToolCall(delta.tool_calls[i], i, delta.tool_calls.length);
            }
          }
          if (delta.function_call && typeof delta.function_call === 'object') {
            _accumulateToolCall(delta.function_call as Record<string, unknown>);
          }
          const choice = json.choices?.[0];
          if (choice && choice.finish_reason) finishReason = choice.finish_reason;
          const content = delta.content || '';
          if (content) onChunk(content);
        }
      } catch { /* skip */ }
    }

    const shouldDispatchTools = isToolFinishReason(finishReason) || finishReason == null || finishReason === 'length';
    const finalizedToolCalls = Array.from(toolCallAcc.values()).map((entry) => ({
      ...entry,
      id: entry.id || (shouldDispatchTools ? `call_${randomUUID()}` : undefined),
    }));

    /* P_tool_stream_finalize — emit a final tool_call_delta so the
       client gets the last few bytes that were throttled out by
       _emitToolDelta's time/size guard. Without this, the UI may
       show a code body that's 1-3 characters short of the final
       argument string until the next onToolUse frame arrives. */
    if (typeof onToolCallDelta === 'function') {
      for (const entry of finalizedToolCalls) {
        try { onToolCallDelta({
          index: entry.__index,
          id: entry.id,
          name: entry.function.name,
          arguments: entry.function.arguments,
          final: true,
        }); } catch { /* ignore listener errors */ }
      }
    }

    /* Dispatch accumulated tool calls when the model decided to call
       a tool. The chat route listens for these in its tool-execution
       loop (Phase 3). Beyond the canonical tool finish reasons we also
       dispatch when the upstream omitted finish_reason entirely (null —
       some gateways never send the marker) or reported 'length': in both
       cases the accumulated calls would otherwise vanish silently and the
       turn would end with no answer. 'length' arguments are truncated and
       still fail argument parsing downstream, where they get the
       structured correction package — strictly better than a dead end.
       'stop'/'content_filter' finishes are honoured literally: a model
       that closed in prose is not invited to run the calls it may have
       streamed speculatively. */
    if (finalizedToolCalls.length > 0 && typeof onToolUse === 'function') {
      if (shouldDispatchTools) {
        for (const tc of finalizedToolCalls) {
          /* Hand out the protocol shape only — the accumulator's slot index
             and stream-mode state must not leak into the tool-call object
             the pipeline echoes back to the provider. */
          try { onToolUse({ id: tc.id, type: 'function', function: { ...tc.function } }); } catch { /* ignore listener errors */ }
        }
      } else {
        console.warn('[LLM] streamed tool calls dropped — upstream finish_reason was', JSON.stringify(finishReason));
      }
    }

    onDone({ finishReason, usage: providerUsage });
  } catch (err) {
    if ((signal && signal.aborted) || (err as Error | undefined)?.name === 'AbortError') {
      onDone({ finishReason: null });
    } else {
      const normalized = err instanceof Error
        ? err
        : new Error(typeof err === 'string' && err.length > 0 ? err : 'LLM request failed');
      onError(normalized);
    }
  }
}

/**
 * Make a non-streaming chat completion call.
 * Returns { content, reasoning_content?, tool_calls? } or throws.
 *
 * When `tools` is provided, the upstream may return tool_calls instead of
 * (or alongside) text content. The caller drives the next hop; this
 * function does NOT execute tools or loop — it only forwards the request
 * and returns the raw upstream payload.
 */
export async function callChatCompletion(opts: ChatCompletionRequestOptions) {
  const { apiBase, apiKey, signal, tools } = opts;

  let response: Response | undefined;
  const variants = requestBodyVariants(opts, false);
  let successfulVariant: (typeof variants)[number] | null = null;
  for (let variantIndex = 0; variantIndex < variants.length; variantIndex++) {
    const variant = variants[variantIndex];
    /* P_rpm-backoff — this path had no retry at all, so a single transient
       429 failed the whole call. That matters because it is not only the
       user-facing completion: retrieval (queryExpander), history
       compression and the turn summary all come through here, once per
       turn, and each was a chance to lose the turn to a rate limit the
       streaming path would simply have ridden out. */
    for (let attempt = 0; ; attempt++) {
      if (signal && signal.aborted) throw new Error('LLM request aborted');
      markLlmActivity();
      try {
        response = await fetch(`${apiBase}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Accept-Encoding': 'identity',
          },
          body: JSON.stringify(variant.body),
          signal,
          dispatcher: getLlmDispatcher(),
        } as unknown as RequestInit);
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        if (attempt >= TRANSIENT_ATTEMPTS - 1) throw err;
        await sleep(1000, signal);
        continue;
      }
      if (response.ok) {
        successfulVariant = variant;
        break;
      }
      const errBody = await response.text().catch(() => '');
      if (response.status === 400 && variantIndex < variants.length - 1) {
        console.warn('[LLM] provider rejected optional request fields; retrying with compatibility payload', JSON.stringify({
          status: response.status,
          toolCount: Array.isArray(tools) ? tools.length : 0,
          maxTokens: variant.body.max_tokens,
        }));
        break;
      }
      if (!isRetryableUpstreamStatus(response.status)
          || attempt >= attemptsForUpstreamStatus(response.status) - 1) {
        const { ApiError } = await import('../lib/errors.js');
        /* Forward the upstream status code so the client sees 429 (quota),
           401 (bad key), etc. instead of a generic 500. The error handler
           serialises ApiError with the correct HTTP status. */
        throw new ApiError(response.status, 'LLM_API_ERROR', `LLM API error ${response.status}: ${errBody.slice(0, 200)}`);
      }
      const delayMs = upstreamRetryDelayMs(response.status, attempt, response.headers.get('retry-after'));
      console.warn('[LLM] upstream ' + response.status + ' on the non-streaming path; retrying', JSON.stringify({
        attempt: attempt + 1,
        delayMs,
      }));
      await sleep(delayMs, signal);
    }
    if (response?.ok) break;
  }
  if (!response?.ok) throw new Error('LLM API request failed');

  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: unknown; tool_calls?: unknown }; finish_reason?: string | null }>;
    /* Non-streaming responses carry `usage` unconditionally on every
       OpenAI-compatible provider. It used to be parsed and thrown away,
       which is why even the non-streaming path billed from a chars/4
       estimate. Surfaced below so callers can prefer measured numbers. */
    usage?: unknown;
  };
  /* P_deepseek-mode — preserve reasoning_content on the final
     message so the client can persist it for the next turn. */
  const message = json.choices?.[0]?.message || {};
  const finishReason = json.choices?.[0]?.finish_reason || null;
  return {
    content: message.content || '',
    reasoning_content: typeof message.reasoning_content === 'string' ? message.reasoning_content : undefined,
    tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : undefined,
    finish_reason: finishReason,
    /* Raw upstream usage object, or undefined when the provider omitted it.
       Normalisation lives in services/usageTracker.ts (resolveUsage). */
    usage: json.usage,
    meta: {
      response_speed_applied: successfulVariant?.speedApplied || 'standard',
    },
  };
}
