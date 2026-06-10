import crypto from 'node:crypto';

/**
 * Simple math captcha — generate a question and token.
 * The token is a hash of the answer so the server can verify
 * without storing state per user.
 */
const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || 'dev-captcha-secret';

/* Shared value pools — generation picks from these, verification
 * brute-forces the same pool. MUST be kept in sync. */
const A_POOL = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
const B_POOL = [1, 2, 3, 5, 7, 10, 15, 20, 25, 30, 35, 40, 45];

/**
 * Generate a captcha challenge.
 * Returns { token, question } where `question` is a human-readable
 * math expression and `token` is an HMAC that binds the answer.
 */
export function generateCaptcha() {
  const a = A_POOL[crypto.randomInt(A_POOL.length)];
  const b = B_POOL[crypto.randomInt(B_POOL.length)];
  const op = Math.random() > 0.5 ? '+' : '-';
  /* Ensure the result is always positive for subtraction */
  const answer = op === '+' ? a + b : Math.max(a, b) - Math.min(a, b);
  const question = op === '+' ? `${a} + ${b} = ?` : `${Math.max(a, b)} - ${Math.min(a, b)} = ?`;
  const token = crypto
    .createHmac('sha256', CAPTCHA_SECRET)
    .update(`${question}:${answer}`)
    .digest('hex')
    .slice(0, 16);

  return { token, question };
}

/**
 * Verify a captcha challenge.
 * Returns true if the answer matches the token.
 *
 * Stateless brute-force verification: tries every (a, b, op) tuple
 * that matches an answer within ±2 of the input. This avoids server-side
 * state while tolerating small input differences.
 */
export function verifyCaptcha(token, answer) {
  if (!token || answer === undefined || answer === null) return false;

  const n = parseInt(answer, 10);
  if (isNaN(n)) return false;

  for (let i = n - 2; i <= n + 2; i++) {
    for (const a of A_POOL) {
      for (const b of B_POOL) {
        for (const op of ['+', '-']) {
          const result = op === '+' ? a + b : a - b;
          if (result === i) {
            const check = crypto
              .createHmac('sha256', CAPTCHA_SECRET)
              .update(`${a} ${op} ${b} = ?:${result}`)
              .digest('hex')
              .slice(0, 16);
            if (check === token) return true;
          }
        }
      }
    }
  }

  return false;
}
