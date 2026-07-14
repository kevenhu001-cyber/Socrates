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
export function isUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s);
}

export { UUID_RE };
