/**
 * Rolling per-engine health tracker for the web-search pipeline.
 *
 * Records the outcome of every (engine, languageCluster) pair across
 * recent queries. Used by webSearch() to decide whether to skip an
 * engine on the next call. Specifically targets engines that:
 *   - Are returning empty / captcha-blocked for a query language cluster
 *   - Are returning wrong-language results (e.g. cn.bing.com on English)
 *
 * Decay: 30 minutes. Older outcomes are dropped automatically.
 * Floor: 2 engines must always run, regardless of health — never let
 * the pipeline collapse to a single engine.
 *
 * Stats: ring buffer of recent outcomes (last 200 events). Each event
 * is { engine, langCluster, outcome, ts } where outcome is one of:
 *   - 'ok'       (results returned)
 *   - 'empty'    (parsed but 0 results)
 *   - 'captcha'  (response detected as captcha / blocked)
 *   - 'error'    (network / timeout / parse throw)
 *   - 'langBad'  (results returned but no overlap with query language)
 */

const _ring = [];
const RING_MAX = 200;
const DECAY_MS = 30 * 60 * 1000;
const MIN_ENGINES = 2;

/**
 * Record an engine outcome.
 * @param {string} engine
 * @param {string} langCluster  'cjk' | 'latin' | 'cyrillic' | 'other'
 * @param {string} outcome      'ok' | 'empty' | 'captcha' | 'error' | 'langBad'
 */
export function record(engine, langCluster, outcome) {
  if (!engine) return;
  _ring.push({ engine, langCluster, outcome, ts: Date.now() });
  if (_ring.length > RING_MAX) _ring.shift();
}

/**
 * Decide which engines to skip for a given language cluster.
 * Conservative: only skip when ≥80% of recent outcomes for that
 * (engine, langCluster) are 'captcha' | 'empty' | 'error' | 'langBad',
 * AND we have at least 3 observations.
 *
 * @param {string[]} engines    all engines in the pipeline
 * @param {string}   langCluster
 * @returns {string[]}         engines to skip (subset of `engines`)
 */
export function shouldSkip(engines, langCluster) {
  if (!Array.isArray(engines) || engines.length <= MIN_ENGINES) return [];
  const cutoff = Date.now() - DECAY_MS;

  const byEngine = new Map(); // engine → {bad, total}
  for (const e of _ring) {
    if (e.ts < cutoff) continue;
    if (e.langCluster !== langCluster) continue;
    const s = byEngine.get(e.engine) || { bad: 0, total: 0 };
    s.total++;
    if (e.outcome !== 'ok') s.bad++;
    byEngine.set(e.engine, s);
  }

  const skip = [];
  for (const engine of engines) {
    const s = byEngine.get(engine);
    if (!s || s.total < 3) continue;
    if (s.bad / s.total >= 0.8) skip.push(engine);
  }

  // Enforce floor: never skip so many that we'd drop below MIN_ENGINES.
  const maxSkip = engines.length - MIN_ENGINES;
  return skip.slice(0, Math.max(0, maxSkip));
}

/**
 * Diagnostics for monitoring.
 * @returns {Array<{engine:string, langCluster:string, ok:number, bad:number, total:number}>}
 */
export function snapshot() {
  const cutoff = Date.now() - DECAY_MS;
  const agg = new Map();
  for (const e of _ring) {
    if (e.ts < cutoff) continue;
    const key = `${e.engine}|${e.langCluster}`;
    const s = agg.get(key) || { engine: e.engine, langCluster: e.langCluster, ok: 0, bad: 0, total: 0 };
    s.total++;
    if (e.outcome === 'ok') s.ok++;
    else s.bad++;
    agg.set(key, s);
  }
  return [...agg.values()];
}

/** Reset all history (for tests / manual flush). */
export function _reset() { _ring.length = 0; }