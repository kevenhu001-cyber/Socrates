/**
 * modelCapabilities — the declarative per-model capability registry.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The request builder used to infer capabilities from a brand substring:
 *
 *   if (/qwen|qwq/.test(name))              -> enable_thinking / chat_template_kwargs
 *   else if (/minimax|deepseek|glm|kimi/)   -> thinking: { type: 'disabled' }
 *
 * Those guesses are wrong in ways that cost turns and money, because a
 * capability belongs to a MODEL, not to a brand substring:
 *
 *   - `kimi-k3` and `kimi-k2.7-code` do not accept `thinking.type=disabled`
 *     at all — the provider answers 400.
 *   - `glm-5.3` rejects `thinking.type=disabled` with an explicit error.
 *   - thinking-only Qwen variants (`qwen3.8-2.4t-a95b`, `qwen3.7-max-preview`)
 *     ignore `enable_thinking=false`, so "Instant" silently stayed thinking.
 *   - DeepSeek has no `reasoning_effort: medium`; the provider maps it to
 *     `high`, so the app's Medium was not the app's Medium.
 *
 * Every entry below is verified against the vendor's own documentation and
 * the source is recorded next to it. An entry that is not verified is not
 * added: an unverified entry silently changes model behaviour, which is the
 * exact failure this registry exists to remove.
 *
 * WHAT "UNKNOWN" MEANS
 * --------------------
 * A model that matches no entry is UNKNOWN, and unknown is a declared state,
 * not a fallback guess:
 *
 *   - Instant is expressed with the OpenAI-standard `reasoning_effort: none`
 *     and no vendor-specific field. A provider that does not know the field
 *     says so, and the turn fails loudly instead of silently thinking.
 *   - A reasoning-effort level is NOT sent. The browser used to guess this
 *     from the model name and sent nothing for most models, so the wire is
 *     unchanged for every undeclared model — while the declared families
 *     finally get the level the user actually picked.
 *   - The context window is unknown, so the conservative fallback budget
 *     applies. A window is never invented.
 *
 * The registry describes MODELS. Per-provider overrides that an operator can
 * set (the `api_keys.is_multimodal` precedent) are deliberately out of scope
 * here; a capability column on the provider row would be the natural next
 * step and would remove the one remaining endpoint-shaped guess below.
 */

import { ApiError } from './errors.js';

export type ThinkingSupport =
  /** The model can be told not to think. */
  | 'supported'
  /** The model always thinks; asking for no-thinking is an error. */
  | 'unsupported'
  /** The model always thinks; the switch is accepted and then ignored. */
  | 'ignored'
  /** The model never thinks; no switch is needed. */
  | 'not_applicable'
  /** Not declared — only the OpenAI-standard field is used. */
  | 'unknown';

export type EffortSupport =
  /** The provider accepts a reasoning-effort level. */
  | 'supported'
  /** The provider rejects the field. */
  | 'unsupported'
  /** The provider accepts the field but it has no effect. */
  | 'ignored'
  /** Not declared — the standard value is forwarded. */
  | 'unknown';

export type InstantEncoding =
  /** `reasoning_effort: "none"` — the OpenAI-standard spelling. */
  | 'reasoning_effort_none'
  /** `thinking: { type: "disabled" }`. */
  | 'thinking_disabled'
  /** `enable_thinking: false`. */
  | 'enable_thinking_false'
  /** `chat_template_kwargs: { enable_thinking: false }`. */
  | 'chat_template_kwargs';

export interface ModelCapability {
  /** Stable identifier; also used in log lines. */
  id: string;
  /** Anchored match against the model id's last path segment. */
  match: RegExp;
  /** Official documentation this entry was verified against. */
  source: string;
  /** Whether the user may ask for "no thinking at all". */
  thinking: ThinkingSupport;
  /** How "no thinking" is encoded on the wire. */
  instantEncoding?: InstantEncoding;
  /**
   * Endpoint-scoped override for the instant encoding.
   *
   * Only used where the SAME model is served by two documented, incompatible
   * endpoints. The endpoint host is the only signal available to tell them
   * apart, so it is recorded here explicitly instead of hiding a host regex
   * inside the request builder. See the qwen3 entry for the known limitation.
   */
  instantEncodingByHost?: { host: RegExp; encoding: InstantEncoding };
  /** Whether the provider accepts a reasoning-effort level. */
  effort: EffortSupport;
  /** Native effort levels, weakest first. */
  effortScale?: readonly string[];
  /** Effort to send when the caller did not ask for one. */
  defaultEffort?: string;
  /** Native name of the output-token cap. */
  maxTokensParam: 'max_tokens' | 'max_completion_tokens';
  /** Whether temperature has an effect. */
  supportsTemperature: boolean;
  /** Whether service_tier is accepted. */
  supportsServiceTier: boolean;
  /** Whether reasoning content arrives in its own channel. */
  supportsReasoningSplit: boolean;
  /**
   * The model always thinks and accepts `thinking: { type: "adaptive" }`.
   *
   * The mode is pinned explicitly so a provider-side default change cannot
   * silently alter how the model behaves.
   */
  adaptiveThinking?: boolean;
  /** Total context window in tokens; undefined when the vendor publishes none. */
  contextWindow?: number;
  /**
   * Maximum tokens the model accepts as INPUT.
   *
   * When the vendor states it directly this wins. Otherwise it is derived
   * from the total window minus the maximum output, because a "context
   * window" is shared between input and output.
   */
  maxInputTokens?: number;
  /** Maximum output tokens. */
  maxOutputTokens?: number;
  /**
   * The provider rejects `temperature` unless reasoning is switched off.
   *
   * The GPT-6 family documents exactly this: "when reasoning effort is not
   * `none`, remove `temperature`, `top_p`, and `top_logprobs`".
   */
  temperatureRequiresNoReasoning?: boolean;
}

/* ── Registry ────────────────────────────────────────────────────────────
 * Order matters: the first match wins, so the narrow families come first.
 * `MiniMax-M3.1-Flash` must be matched before `MiniMax-M3`, and the
 * thinking-only Qwen ids before the hybrid Qwen family. */
const MODEL_CAPABILITIES: readonly ModelCapability[] = [
  {
    id: 'minimax-m3.1-flash',
    match: /^minimax-m3\.1-flash(?:$|[-:._])/i,
    source: 'https://platform.minimax.io/docs/api-reference/text-chat-openai.md',
    thinking: 'unsupported',
    effort: 'supported',
    effortScale: ['low', 'medium', 'high', 'xhigh', 'max'],
    /* M3.1 Flash defaults to `max`. The app's own default is Medium, and a
     * background summary must not silently run at the provider's maximum. */
    defaultEffort: 'medium',
    maxTokensParam: 'max_completion_tokens',
    supportsTemperature: false,
    supportsServiceTier: false,
    supportsReasoningSplit: true,
    adaptiveThinking: true,
    contextWindow: 1_000_000,
    maxOutputTokens: 524_288,
  },
  {
    id: 'minimax-m3',
    match: /^minimax-m3(?:$|[-:._])/i,
    source: 'https://platform.minimax.io/docs/api-reference/text-chat-openai.md',
    thinking: 'supported',
    instantEncoding: 'thinking_disabled',
    /* M3 accepts the field but only M3.1 Flash tunes thinking depth. */
    effort: 'ignored',
    maxTokensParam: 'max_completion_tokens',
    supportsTemperature: false,
    supportsServiceTier: true,
    supportsReasoningSplit: true,
    contextWindow: 1_000_000,
    maxOutputTokens: 524_288,
  },
  {
    id: 'minimax-m2',
    match: /^minimax-m2(?:$|[-:._])/i,
    source: 'https://platform.minimax.io/docs/api-reference/text-chat-openai.md',
    /* M2.x cannot turn thinking off; `disabled` is accepted and ignored. */
    thinking: 'ignored',
    effort: 'ignored',
    maxTokensParam: 'max_completion_tokens',
    supportsTemperature: false,
    supportsServiceTier: true,
    supportsReasoningSplit: true,
  },
  {
    id: 'deepseek-v4',
    match: /^deepseek-(?:flash|v4-(?:flash|pro))/i,
    source: 'https://api-docs.deepseek.com/api/list-models',
    thinking: 'supported',
    instantEncoding: 'thinking_disabled',
    effort: 'supported',
    /* No `medium` and no `none`: the provider maps `medium` to `high`. */
    effortScale: ['low', 'high', 'max'],
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
    contextWindow: 1_048_576,
    maxOutputTokens: 393_216,
  },
  {
    id: 'deepseek-legacy',
    match: /^deepseek-(?:chat|reasoner|r1|v3)/i,
    source: 'https://api-docs.deepseek.com/guides/thinking_mode',
    thinking: 'supported',
    instantEncoding: 'thinking_disabled',
    effort: 'supported',
    effortScale: ['low', 'high', 'max'],
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
    /* The vendor no longer publishes a window for the retired names
     * (`deepseek-chat`, `deepseek-reasoner` are gone from the model list),
     * so none is claimed here. The fallback budget applies. */
  },
  {
    id: 'qwen3-thinking-only',
    match: /^qwen3\.(?:8-2\.4t-a95b|7-max-(?:preview|2026-05-17))(?:$|[-:._])/i,
    source: 'https://help.aliyun.com/zh/model-studio/deep-thinking',
    /* "始终在回复前进行思考，无法关闭" — no request parameter turns it off. */
    thinking: 'unsupported',
    effort: 'unsupported',
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
  },
  {
    id: 'qwen3-hybrid',
    match: /^qwen3(?:\.\d+)?(?:$|[-:._])/i,
    source: 'https://help.aliyun.com/zh/model-studio/deep-thinking',
    thinking: 'supported',
    /* Model Studio documents the TOP-LEVEL `enable_thinking` field. A
     * self-hosted vLLM exposes the same switch as
     * `chat_template_kwargs.enable_thinking`. The endpoint host is the only
     * signal available to tell the two apart; a relay in front of Model
     * Studio is therefore mis-detected, and vLLM silently ignores
     * `enable_thinking`. This is the one remaining endpoint-shaped guess in
     * the registry and it is why an operator-settable capability column
     * (api_keys) is the right follow-up. */
    instantEncoding: 'chat_template_kwargs',
    instantEncodingByHost: { host: /dashscope|aliyuncs/i, encoding: 'enable_thinking_false' },
    effort: 'unsupported',
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
  },
  {
    id: 'qwq',
    match: /^qwq(?:$|[-:._])/i,
    source: 'https://help.aliyun.com/zh/model-studio/deep-thinking',
    /* QwQ is a thinking-only model: the vendor's rule for thinking-only
     * models is that thinking cannot be turned off. */
    thinking: 'unsupported',
    effort: 'unsupported',
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
  },
  {
    id: 'qwen-non-thinking',
    match: /^qwen-(?:plus|flash|turbo)(?:$|[-:._])/i,
    source: 'https://help.aliyun.com/zh/model-studio/deep-thinking',
    thinking: 'not_applicable',
    effort: 'unsupported',
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
  },
  {
    id: 'glm-5.3',
    match: /^glm-5\.3(?:$|[-:._])/i,
    source: 'https://docs.bigmodel.cn/cn/guide/capabilities/thinking.md',
    /* "GLM-5.3 不再支持关闭思考（thinking.type 传 disabled 将会报错）". */
    thinking: 'unsupported',
    effort: 'supported',
    effortScale: ['low', 'high', 'max'],
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
  },
  {
    id: 'glm-5.2',
    match: /^glm-5\.2(?:$|[-:._])/i,
    source: 'https://docs.bigmodel.cn/cn/guide/capabilities/thinking.md',
    thinking: 'supported',
    instantEncoding: 'thinking_disabled',
    effort: 'supported',
    effortScale: ['low', 'medium', 'high', 'xhigh', 'max'],
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
    contextWindow: 1_000_000,
    maxOutputTokens: 131_072,
  },
  {
    id: 'glm-5',
    match: /^glm-5(?:$|[-:._])/i,
    source: 'https://docs.bigmodel.cn/cn/guide/capabilities/thinking.md',
    thinking: 'supported',
    instantEncoding: 'thinking_disabled',
    /* `reasoning_effort` is a GLM-5.2+ feature. */
    effort: 'unsupported',
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
  },
  {
    id: 'glm-4',
    match: /^glm-4(?:$|[-:._])/i,
    source: 'https://docs.bigmodel.cn/cn/guide/capabilities/thinking.md',
    thinking: 'supported',
    instantEncoding: 'thinking_disabled',
    effort: 'unsupported',
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
  },
  {
    id: 'kimi-k3',
    match: /^kimi-k3(?:$|[-:._])/i,
    source: 'https://platform.kimi.ai/docs/guide/use-thinking-models.md',
    /* "does not support the `thinking` parameter" — thinking is always on. */
    thinking: 'unsupported',
    effort: 'supported',
    effortScale: ['low', 'high', 'max'],
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
    contextWindow: 1_000_000,
  },
  {
    id: 'kimi-k2.7',
    match: /^kimi-k2\.7(?:$|[-:._])/i,
    source: 'https://platform.kimi.ai/docs/guide/use-thinking-models.md',
    /* Only `{"type":"enabled"}` is accepted; `disabled` is an error. */
    thinking: 'unsupported',
    effort: 'unsupported',
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
    contextWindow: 262_144,
  },
  {
    id: 'kimi-k2.6',
    match: /^kimi-k2\.6(?:$|[-:._])/i,
    source: 'https://platform.kimi.ai/docs/guide/use-thinking-models.md',
    thinking: 'supported',
    instantEncoding: 'thinking_disabled',
    effort: 'unsupported',
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
    contextWindow: 262_144,
  },
  {
    id: 'kimi-k2-thinking',
    match: /^kimi-k2-thinking(?:$|[-:._])/i,
    source: 'https://platform.kimi.ai/docs/guide/use-thinking-models.md',
    thinking: 'unsupported',
    effort: 'unsupported',
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
  },
  {
    id: 'gpt-6-astra',
    match: /^gpt-6-astra(?:$|[-:._])/i,
    source: 'https://developers.openai.com/api/docs/models/gpt-6-astra',
    /* `none` returns HTTP 400 on this model. */
    thinking: 'unsupported',
    effort: 'supported',
    effortScale: ['low', 'medium', 'high', 'xhigh', 'max'],
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    temperatureRequiresNoReasoning: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
    contextWindow: 1_050_000,
    maxInputTokens: 922_000,
    maxOutputTokens: 128_000,
  },
  {
    id: 'gpt-6.1-sol',
    match: /^gpt-6\.1-sol(?:$|[-:._])/i,
    source: 'https://developers.openai.com/api/docs/models/gpt-6.1-sol',
    /* "none and minimal reasoning efforts are not supported". */
    thinking: 'unsupported',
    effort: 'supported',
    effortScale: ['low', 'medium', 'high', 'xhigh', 'max'],
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    temperatureRequiresNoReasoning: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
    contextWindow: 1_050_000,
    maxInputTokens: 922_000,
    maxOutputTokens: 128_000,
  },
  {
    id: 'gpt-6-sol',
    match: /^gpt-6-sol(?:$|[-:._])/i,
    source: 'https://developers.openai.com/api/docs/models/gpt-6-sol',
    thinking: 'supported',
    instantEncoding: 'reasoning_effort_none',
    effort: 'supported',
    effortScale: ['low', 'medium', 'high', 'xhigh', 'max'],
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    temperatureRequiresNoReasoning: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
    contextWindow: 1_050_000,
    maxInputTokens: 922_000,
    maxOutputTokens: 128_000,
  },
  {
    id: 'gpt-6-luna',
    match: /^gpt-6-luna(?:$|[-:._])/i,
    source: 'https://developers.openai.com/api/docs/models/gpt-6-luna',
    thinking: 'supported',
    instantEncoding: 'reasoning_effort_none',
    effort: 'supported',
    effortScale: ['low', 'medium', 'high', 'xhigh', 'max'],
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    temperatureRequiresNoReasoning: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
    contextWindow: 1_050_000,
    maxInputTokens: 922_000,
    maxOutputTokens: 128_000,
  },
  {
    id: 'gpt-5.6',
    match: /^gpt-5\.6-(?:sol|terra|luna)(?:$|[-:._])/i,
    source: 'https://developers.openai.com/api/docs/models/gpt-5.6-sol',
    thinking: 'supported',
    instantEncoding: 'reasoning_effort_none',
    effort: 'supported',
    effortScale: ['low', 'medium', 'high', 'xhigh', 'max'],
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
    contextWindow: 1_050_000,
    maxInputTokens: 922_000,
    maxOutputTokens: 128_000,
  },
  {
    id: 'gpt-4.1',
    match: /^gpt-4\.1(?:$|[-:._])/i,
    source: 'https://developers.openai.com/api/docs/models/gpt-4.1',
    /* "without a reasoning step" — it never thinks, so Instant needs no
     * switch and an effort level is meaningless. */
    thinking: 'not_applicable',
    effort: 'unsupported',
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
    contextWindow: 1_047_576,
    maxOutputTokens: 32_768,
  },
  {
    id: 'gpt-5.2',
    match: /^gpt-5\.(?:1|2)(?:$|[-:._])/i,
    source: 'https://developers.openai.com/api/docs/models/gpt-5.2',
    thinking: 'supported',
    instantEncoding: 'reasoning_effort_none',
    effort: 'supported',
    effortScale: ['low', 'medium', 'high', 'xhigh'],
    /* `max_tokens` is deprecated on Chat Completions in favour of
     * `max_completion_tokens`, but it is still accepted here and it does not
     * fold the reasoning tokens into the output budget. Switching would
     * silently shrink the room an answer gets on a reasoning model. */
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
  },
  {
    id: 'gpt-5-mini',
    match: /^gpt-5-(?:mini|nano)(?:$|[-:._])/i,
    source: 'https://developers.openai.com/api/docs/guides/reasoning',
    /* The model pages for these two omit the supported-effort sentence
     * entirely, so nothing is declared: Instant keeps the OpenAI-standard
     * spelling and no effort level is sent. */
    thinking: 'unknown',
    effort: 'unknown',
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
  },
  {
    id: 'gpt-5',
    match: /^gpt-5(?:$|[-:._])/i,
    source: 'https://developers.openai.com/api/docs/models/gpt-5',
    /* The model page lists minimal/low/medium/high — `none` is not among the
     * supported values, so this generation cannot be told not to reason. */
    thinking: 'unsupported',
    effort: 'supported',
    effortScale: ['minimal', 'low', 'medium', 'high'],
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
  },
  {
    id: 'gpt-4o',
    match: /^gpt-4o(?:$|[-:._])/i,
    source: 'https://developers.openai.com/api/docs/models/gpt-4o',
    /* A non-reasoning model: it never thinks, so Instant needs no switch
     * and a reasoning-effort level is meaningless (the API rejects it). */
    thinking: 'not_applicable',
    effort: 'unsupported',
    maxTokensParam: 'max_tokens',
    supportsTemperature: true,
    supportsServiceTier: true,
    supportsReasoningSplit: false,
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
  },
];

/**
 * The declared state of a model that matches no entry.
 *
 * Everything here is the OpenAI-standard behaviour: send the standard field,
 * send `max_tokens`, keep temperature, let the compatibility chain resolve a
 * provider that rejects the field. Nothing is inferred.
 */
export const UNKNOWN_CAPABILITY: ModelCapability = Object.freeze({
  id: 'unknown',
  match: /$^/,
  source: 'n/a — no vendor entry',
  thinking: 'unknown',
  effort: 'unknown',
  maxTokensParam: 'max_tokens',
  supportsTemperature: true,
  supportsServiceTier: true,
  supportsReasoningSplit: false,
});

/**
 * The model id's last path segment.
 *
 * Vendors publish ids with a namespace (`Qwen/Qwen3-8B`, `moonshotai/Kimi-K3`)
 * and the family must still be recognised. Matching the segment instead of
 * the whole string also stops a substring in the middle of a custom name
 * (`my-deepseek-proxy`) from being mistaken for the family.
 */
export function modelIdSegment(model: string): string {
  const raw = typeof model === 'string' ? model.trim() : '';
  const withoutNamespace = raw.includes('/') ? raw.slice(raw.lastIndexOf('/') + 1) : raw;
  return withoutNamespace.toLowerCase();
}

/** Resolve the declared capabilities of a model id. */
export function resolveModelCapability(model: string): ModelCapability {
  const segment = modelIdSegment(model);
  if (!segment) return UNKNOWN_CAPABILITY;
  for (const capability of MODEL_CAPABILITIES) {
    if (capability.match.test(segment)) return capability;
  }
  return UNKNOWN_CAPABILITY;
}

/** The declared capabilities of every registered model, for diagnostics. */
export function listModelCapabilities(): readonly ModelCapability[] {
  return MODEL_CAPABILITIES;
}

/* The app's own effort vocabulary, weakest first. `none` (Instant) is not a
 * level: it is handled by the thinking switch, not by an effort value. */
const APP_EFFORT_LEVELS = ['low', 'medium', 'high'] as const;

/**
 * Translate an app-level effort into the provider's native value.
 *
 * The app speaks `low | medium | high`; providers do not agree on the
 * vocabulary (DeepSeek has no `medium`, GLM-5.3 has no `medium` or `xhigh`).
 * The rule is deliberately conservative:
 *
 *   1. the same level name wins whenever the provider has it;
 *   2. otherwise the level is mapped onto the provider's scale by position
 *      (Medium to the middle rung, High to its strongest);
 *   3. the result is never weaker than what the user asked for.
 *
 * Returns undefined when the provider does not accept an effort at all — the
 * caller then sends no field rather than a field the provider ignores.
 */
export function mapEffortLevel(capability: ModelCapability, level: string): string | undefined {
  if (capability.effort === 'unsupported' || capability.effort === 'ignored') return undefined;
  /* An undeclared model gets no effort field at all. The browser used to
   * decide this with a brand regex and sent nothing for most models, so this
   * keeps the wire identical for them — while the declared families finally
   * get the level the user picked. */
  if (capability.effort === 'unknown') return undefined;
  const scale = capability.effortScale;
  if (!scale || scale.length === 0) return level;
  if (scale.includes(level)) return level;
  const appIndex = APP_EFFORT_LEVELS.indexOf(level as (typeof APP_EFFORT_LEVELS)[number]);
  if (appIndex < 0) return undefined;
  if (appIndex === APP_EFFORT_LEVELS.length - 1) return scale[scale.length - 1];
  return scale[Math.round((scale.length - 1) / 2)];
}

/**
 * The wire encoding for "no thinking", if this model supports one.
 *
 * `undefined` means "do not send a switch": either the model never thinks
 * (the switch would be meaningless) or nothing is declared (the caller falls
 * back to the OpenAI-standard `reasoning_effort: none`).
 */
export function instantEncodingFor(capability: ModelCapability, apiBase?: string): InstantEncoding | undefined {
  if (capability.thinking !== 'supported') return undefined;
  const scoped = capability.instantEncodingByHost;
  if (scoped && apiBase) {
    let host = '';
    try { host = new URL(apiBase).hostname; } catch { /* URL validated at provider configuration */ }
    if (host && scoped.host.test(host)) return scoped.encoding;
  }
  return capability.instantEncoding;
}

/**
 * Reject a request that asks for a thinking mode the model cannot deliver.
 *
 * The failure is local: no upstream call is made, so the user gets an
 * explicit capability error instead of a provider 400 — and, more
 * importantly, instead of silently thinking when they asked for Instant.
 */
export function assertThinkingModeSupported(
  capability: ModelCapability,
  effort: string | undefined,
  extra?: Record<string, unknown>,
): void {
  const requestedDisabled = effort === 'none'
    || (extra?.thinking as { type?: unknown } | undefined)?.type === 'disabled';
  if (!requestedDisabled) return;
  if (capability.thinking === 'unsupported' || capability.thinking === 'ignored') {
    throw new ApiError(
      400,
      'MODEL_MODE_UNSUPPORTED',
      capability.thinking === 'ignored'
        ? 'This model always reasons and cannot turn thinking off. Choose a model that supports Instant, or select Low, Medium or High thinking.'
        : 'This model does not support Instant. Select Low, Medium or High thinking, or choose a model that supports Instant.',
      undefined,
      false,
    );
  }
}

/* ── Context budget ──────────────────────────────────────────────────── */

/**
 * Budget used when the vendor publishes no context window.
 *
 * Deliberately unchanged from the previous global constant so that a model
 * with no registry entry behaves exactly as it did before the registry
 * existed. It is a floor for unknown models, never a substitute for a
 * declared window.
 */
export const DEFAULT_CONTEXT_BUDGET_TOKENS = 100_000;

/**
 * Cushion between the model's window and the conversation budget.
 *
 * The token estimator is a heuristic (and an optimistic one), the system
 * prompt and the tool schemas are not counted in the conversation estimate,
 * and providers count their own overhead differently. The cushion keeps the
 * request below the window instead of exactly at it.
 */
export const CONTEXT_SAFETY_MARGIN_TOKENS = 8_192;

export interface ContextBudgetOptions {
  /** Operator override (CHAT_CONTEXT_MAX_TOKENS). */
  overrideTokens?: number | undefined;
  /** Tokens reserved for the model's reply. */
  reserveTokens?: number | undefined;
}

export interface ContextBudget {
  /** Conversation tokens allowed before the history is compressed. */
  budget: number;
  /** Where the budget came from. */
  source: 'override' | 'model-window' | 'fallback';
  /** The model's declared window, when there is one. */
  contextWindow?: number;
}

/**
 * Derive the conversation budget from the model's own context window.
 *
 * Before the registry this was one global constant (100 000 tokens) for
 * every model. That is wrong in both directions: a 1M-token model was
 * compressed at 100 K (paying for a summary it did not need), and a model
 * with a smaller window was allowed past the point where the provider
 * rejects the request with a context-length 400 — a failure the
 * compatibility chain treats as terminal.
 */
export function resolveContextBudget(model: string, opts: ContextBudgetOptions = {}): ContextBudget {
  const capability = resolveModelCapability(model);
  const override = Number(opts.overrideTokens);
  if (Number.isFinite(override) && override > 0) {
    return { budget: Math.floor(override), source: 'override', contextWindow: capability.contextWindow };
  }
  const reserve = Number.isFinite(Number(opts.reserveTokens)) ? Math.max(0, Number(opts.reserveTokens)) : 0;
  /* The basis is the number of tokens the model accepts as INPUT. A context
   * window is shared between input and output, so a total window is not the
   * input limit — using it as one is exactly how a request ends up larger
   * than the model accepts. */
  const inputLimit = capability.maxInputTokens
    ?? (capability.contextWindow !== undefined
      ? (capability.maxOutputTokens !== undefined
        ? capability.contextWindow - capability.maxOutputTokens
        : capability.contextWindow)
      : undefined);
  if (inputLimit !== undefined) {
    const usable = inputLimit - reserve - CONTEXT_SAFETY_MARGIN_TOKENS;
    if (usable > 0) {
      return { budget: Math.floor(usable), source: 'model-window', contextWindow: capability.contextWindow };
    }
  }
  return { budget: DEFAULT_CONTEXT_BUDGET_TOKENS, source: 'fallback', contextWindow: capability.contextWindow };
}
