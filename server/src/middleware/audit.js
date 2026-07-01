/**
 * Audit logging middleware.
 *
 * Records user actions (login, logout, register, chat, api-key changes,
 * settings changes) into the audit_events table.
 *
 * Usage:
 *   router.post('/login', audit('login'), handler)
 *   router.use(audit('chat'))  — for a whole route group
 *
 * Implementation note: the previous version monkey-patched
 * `res.end` to intercept the response, which broke under
 * Express 5 (the response object is more strictly typed there
 * and `res.end` is awaited in some code paths). The current
 * implementation listens for the `finish` event instead, which
 * fires exactly once per response, after all bytes have been
 * flushed, and works for both regular JSON and SSE responses.
 */
import { getDb } from '../db/index.js';
import { auditEvents } from '../db/schema.js';
import { safeUrl } from '../lib/log.js';

/**
 * Create an audit-logging middleware for a specific action.
 * @param {string} action - Action label (e.g. 'login', 'chat', 'create_api_key').
 * @param {function} getDetail - Optional (req) => object to extract detail fields.
 */
export function audit(action, getDetail) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300 && req.userId) {
        const detail = typeof getDetail === 'function' ? getDetail(req) : {};
        try {
          const db = getDb();
          // Strip tokens from the recorded URL — share / password-reset
          // tokens end up in `req.originalUrl` and would otherwise
          // give anyone with DB access a long-lived credential.
          db.insert(auditEvents).values({
            userId: req.userId,
            action,
            detail: { ...detail, method: req.method, path: safeUrl(req.originalUrl) },
            ip: req.ip,
            userAgent: (req.headers['user-agent'] || '').slice(0, 500),
          }).catch((err) => {
            console.warn('[audit] insert failed:', err.message);
          });
        } catch (err) {
          console.warn('[audit] setup failed:', err.message);
        }
      }
    });
    next();
  };
}

/**
 * Direct audit event recorder for use in route handlers.
 * @param {string} userId
 * @param {string} action
 * @param {object} [detail]
 */
export async function recordAudit(userId, action, detail = {}) {
  try {
    const db = getDb();
    await db.insert(auditEvents).values({
      userId,
      action,
      detail,
    }).catch((err) => {
      console.warn('[audit] recordAudit failed:', err.message);
    });
  } catch (err) {
    console.warn('[audit] recordAudit error:', err.message);
  }
}