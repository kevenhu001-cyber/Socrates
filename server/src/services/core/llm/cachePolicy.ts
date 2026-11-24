/** Provider-specific prompt cache hints for the existing Chat Completions
 * transport. Never infer protocol support from a model name alone.
 * Automatic caches need a stable prefix, not extra parameters.
 */
import { createHmac } from 'node:crypto';
import type { ChatCompletionRequestOptions } from './types.js';

export type CacheProvider = 'openrouter' | 'openai' | 'deepseek' | 'dashscope' | 'ark' | 'gemini' | 'anthropic-compat' | 'minimax' | 'moonshot' | 'zhipu' | 'other';

export function cacheProvider(apiBase: string): CacheProvider {
  let host: string;
  try {
    const url = new URL(apiBase);
    if (url.protocol !== 'https:' || url.username || url.password) return 'other';
    host = url.hostname.toLowerCase();
  } catch { return 'other'; }
  if (host === 'openrouter.ai') return 'openrouter';
  if (host === 'api.openai.com') return 'openai';
  if (host === 'api.deepseek.com') return 'deepseek';
  if (host === 'dashscope.aliyuncs.com' || host === 'dashscope-intl.aliyuncs.com' || host === 'dashscope-us.aliyuncs.com') return 'dashscope';
  if (/^ark\.[a-z0-9-]+\.volces\.com$/.test(host)) return 'ark';
  if (host === 'generativelanguage.googleapis.com') return 'gemini';
  if (host === 'api.anthropic.com') return 'anthropic-compat';
  if (host === 'api.minimax.io' || host === 'api.minimax.chat' || host === 'api.minimaxi.com') return 'minimax';
  if (host === 'api.moonshot.cn' || host === 'api.moonshot.ai') return 'moonshot';
  if (host === 'open.bigmodel.cn' || host === 'api.z.ai') return 'zhipu';
  return 'other';
}

export function promptCacheFields(opts: ChatCompletionRequestOptions): Record<string, unknown> {
  if (process.env.CHAT_PROVIDER_CACHE_HINTS === '0' || !opts.userId || !opts.cacheSessionId || !opts.apiKey) return {};
  const provider = cacheProvider(opts.apiBase);
  // Stable per account, session, model and API credential; do not disclose raw
  // database IDs, prompt text, or share an affinity key across tenants.
  const key = createHmac('sha256', opts.apiKey)
    .update(JSON.stringify(['socrates-cache-v1', opts.userId, opts.cacheSessionId, opts.model]))
    .digest('hex');
  if (provider === 'openrouter') {
    return {
      session_id: key,
      // Claude needs explicit cache activation through the router. The short
      // default TTL avoids automatically paying for extended retention.
      ...(/^anthropic\/claude-/i.test(opts.model) && process.env.CHAT_OPENROUTER_CLAUDE_CACHE !== '0'
        ? { cache_control: { type: 'ephemeral' } } : {}),
    };
  }
  if (provider === 'openai') {
    // Current GPT-5.6+ models route automatically; earlier models benefit
    // from the optional affinity key. Do not force 24h storage.
    const version = /^gpt-(\d+)(?:\.(\d+))?/i.exec(opts.model);
    if (version && (+version[1] > 5 || (+version[1] === 5 && +(version[2] || 0) >= 6))) return {};
    return { prompt_cache_key: key };
  }
  if (provider === 'ark') return { prompt_cache_key: key };
  // DeepSeek and supported Gemini/DashScope models use implicit caching.
  // Direct Anthropic OpenAI compatibility does not expose native caching.
  // MiniMax, Moonshot, Zhipu and unknown gateways: no speculative parameters.
  return {};
}
