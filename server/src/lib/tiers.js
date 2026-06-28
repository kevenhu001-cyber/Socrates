/**
 * Tier / plan definitions shared by every route that needs to
 * know the per-tier limits (session count, key count, monthly
 * token quota).  Centralised so the front-end buildCards() and the
 * back-end enforcement can never drift apart — the same source of
 * truth is used by /api/account/usage, /api/chat monthly caps,
 * /api/api-key tier limits, and the TIER_SESSION_LIMITS check in
 * /api/sessions.
 *
 * rank: 0=Free, 1=Basic, 2=Standard, 3=Premium (front-end expectation)
 */

export const TIERS = {
  diophantus: {
    name: 'Diophantus',
    rank: 0,
    price: 0,
    maxSessions: 5,
    maxKeys: 2,
    beagleTokenQuota: 1_000_000,
  },
  riemann: {
    name: 'Riemann',
    rank: 1,
    price: 12,
    maxSessions: 30,
    maxKeys: 10,
    beagleTokenQuota: 100_000_000,
  },
  descartes: {
    name: 'Descartes',
    rank: 2,
    price: 29,
    maxSessions: 100,
    maxKeys: 50,
    beagleTokenQuota: 300_000_000,
  },
  euclid: {
    name: 'Euclid',
    rank: 3,
    price: 99,
    maxSessions: 0, // 0 = unlimited
    maxKeys: 999,
    beagleTokenQuota: 800_000_000,
  },
};

export const DEFAULT_TIER = 'diophantus';

/**
 * Resolve the plan object for a user row, falling back to the
 * default tier for unknown / null values.
 */
export function getTierPlan(tier) {
  return TIERS[tier] || TIERS[DEFAULT_TIER];
}

/**
 * Resolve the per-tier monthly token quota for the built-in
 * Beagle / MiniMax provider. 0 means unlimited.
 */
export function getBeagleQuota(tier) {
  return getTierPlan(tier).beagleTokenQuota;
}

/**
 * Maximum number of sessions a user is allowed to own under
 * the given tier. 0 means unlimited (Euclid).
 */
export function getSessionLimit(tier) {
  return getTierPlan(tier).maxSessions;
}

/**
 * Maximum number of API keys / providers a user is allowed to
 * register under the given tier.
 */
export function getApiKeyLimit(tier) {
  return getTierPlan(tier).maxKeys;
}
