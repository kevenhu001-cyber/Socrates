/**
 * Server-side query expansion for web search.
 *
 * Takes the user's natural-language query and asks the LLM to produce
 * 2 alternative search-engine-friendly variants. We then search the
 * original + 2 variants (3 total) in parallel and merge the results
 * with RRF. This dramatically improves recall for conversational or
 * ambiguous queries ("那个最近的 X"  → 2 reformulations that match
 * what people actually wrote about X).
 *
 * Design notes:
 *   - 6-second hard timeout on the LLM call. Slow expansions should
 *     never block the search.
 *   - In-memory LRU cache (256 entries). Repeated topic refreshes
 *     (the SPA calls web search every 5 turns on a topic) hit the
 *     cache and skip the LLM roundtrip.
 *   - Fallback to [query] on ANY failure (no key, timeout, parse
 *     error, empty variants). Search still works, just with one
 *     variant.
 *   - Uses the user's active LLM provider (same one the chat route
 *     uses). No separate model needed.
 */

import { callChatCompletion } from './llm.js';
import { getActiveApiKey } from './apiKey.js';

const _cache = new Map<string, string[]>();
const CACHE_MAX = 256;

/**
 * @param {number} [count=4]  how many variants to generate
 */
function buildSystemPrompt(count: number): string {
  return [
    'You generate precise web search queries.',
    `Given a user question, produce EXACTLY ${count} alternative search queries`,
    'that would each independently find the information the user wants.',
    '',
    'Rules:',
    '- Keep named entities, dates, numbers, and proper nouns from the original.',
    `- Each variant: 4-12 words.`,
    `- Use different angles: one precise / phrased like an encyclopedic query,`,
    `  one more colloquial or "how do I" style, one with synonyms, one from a different domain perspective.`,
    '- Do NOT add explanations, headings, or surrounding prose.',
    `- Output ONLY a JSON array of ${count} strings, e.g. ["q1","q2","q3","q4"].`,
  ].join(' ');
}

/**
 * @param {string} query
 * @param {object} [opts]
 * @param {string} [opts.userId]   - for picking the user's active LLM key
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<string[]>} 1-(variantCount+1) deduped queries; the original is always first.
 */
export async function expandQuery(query: string, opts: { userId?: string | null; signal?: AbortSignal; variantCount?: number } = {}): Promise<string[]> {
  if (!query || !String(query).trim()) return [query];
  const q = String(query).trim();
  const variantCount = Math.max(1, Math.min(8, opts.variantCount ?? 4));

  if (_cache.has(q)) return _cache.get(q)!;

  let cfg;
  try {
    cfg = await getActiveApiKey(opts.userId as string | null);
  } catch (e) {
    return [q];
  }
  if (!cfg || !cfg.keyPlaintext || !cfg.url || !cfg.model) {
    return [q];
  }

  const timer = AbortSignal.timeout(6_000);
  const merged = opts.signal ? AbortSignal.any([opts.signal, timer]) : timer;

  try {
    const { content } = await callChatCompletion({
      apiBase: cfg.url,
      apiKey: cfg.keyPlaintext,
      model: cfg.model,
      messages: [
        { role: 'system', content: buildSystemPrompt(variantCount) },
        { role: 'user', content: q.slice(0, 500) },
      ],
      maxTokens: 300,
      temperature: 0.4,
      signal: merged,
    });

    const arr = parseVariants(content);
    if (!arr.length) return [q];

    // Always include the original first; cap at variantCount + 1 total.
    const all = [q, ...arr].map((s) => String(s).trim()).filter(Boolean);
    const dedup = [...new Set(all)].slice(0, variantCount + 1);
    if (_cache.size >= CACHE_MAX) _cache.clear();
    _cache.set(q, dedup);
    return dedup;
  } catch (e) {
    if (e && (e as Error).name !== 'AbortError' && (e as Error).message && (e as Error).message.indexOf('silence-timeout') < 0) {
      console.warn('[queryExpander] LLM call failed:', (e as Error).message || e);
    }
    return [q];
  }
}

/**
 * Parse the LLM's reply into a string[] of variants.
 * Tolerates common failure modes:
 *   - The LLM wraps the array in ```json ... ``` fences
 *   - The LLM adds a leading sentence ("Here are two variants: [...]")
 *   - The LLM produces a single string (return that as 1 variant)
 */
function parseVariants(content: unknown): string[] {
  if (!content) return [];
  const s = String(content);

  // Strip code fences
  let cleaned = s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');

  // Try to find the first JSON array
  const m = cleaned.match(/\[[\s\S]*?\]/);
  if (m) {
    try {
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr)) {
        return arr
          .filter((x) => typeof x === 'string' && x.trim().length > 0)
          .map((x) => x.trim());
      }
    } catch { /* fall through */ }
  }

  // Last resort: pull quoted strings from the response
  const quoted: string[] = [];
  const re = /"([^"\\]{4,200})"/g;
  let mm;
  while ((mm = re.exec(s)) !== null) {
    const v = mm[1].trim();
    if (v && v.indexOf('"') === -1) quoted.push(v);
    if (quoted.length >= 2) break;
  }
  return quoted;
}

/**
 * Exposed for tests / diagnostics. Not used at runtime.
 */
export function _clearCache() { _cache.clear(); }
