/**
 * Common validation helpers used by every route.
 *
 * Centralised so a malformed id consistently returns a 400 (or 404)
 * rather than crashing the DB driver with `invalid input syntax for
 * type uuid`. The previous pattern (inline regex in every route
 * file) made it easy to forget the check and surface a 500.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {unknown} s
 * @returns {boolean} true when s is a string matching a v4 UUID shape.
 */
export function isUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s);
}

/**
 * Structural e-mail check.
 *
 * The obvious one-liner (`[^\s@]+@[^\s@]+\.[^\s@]+`) puts two unbounded
 * `+` quantifiers around a literal, which backtracks polynomially on a
 * long run of characters that almost matches (CWE-1333). Splitting at the
 * last `@` and validating the halves with bounded, non-overlapping tests
 * keeps the check linear while still rejecting whitespace, missing
 * domains, and a trailing dot.
 */
export function isEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length < 3 || value.length > 254) return false;
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length > 64 || domain.length > 253) return false;
  if (/[\s@]/.test(local) || /[\s@]/.test(domain)) return false;
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

export { UUID_RE };
