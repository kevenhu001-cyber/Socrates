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
import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/index.js';
import { auditEvents } from '../db/schema.js';
import { safeUrl } from '../lib/log.js';

/**
 * Create an audit-logging middleware for a specific action.
 * @param {string} action - Action label (e.g. 'login', 'chat', 'create_api_key').
 * @param {function} getDetail - Optional (req) => object to extract detail fields.
 * @param {object} [opts]
 * @param {boolean} [opts.logFailures=true] Surface 4xx responses in the
 *   server log too (so operators see failed auth attempts in
 *   journalctl / server.log). The DB audit table requires a non-null
 *   user_id (foreign key to users.id), so failed pre-auth events
 *   CANNOT be persisted as a row — we mirror them to stdout instead,
 *   with the same [audit] prefix as success events so log greppers
 *   can find them. The previous build only logged 2xx, so a brute-force
 *   probe left no trace beyond rate-limit counters.
 */
export function audit(
  action: string,
  getDetail?: (req: Request) => Record<string, unknown>,
  opts: { logFailures?: boolean } = {},
) {
  const { logFailures = true } = opts;
  return (req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      const detail: Record<string, unknown> = typeof getDetail === 'function' ? getDetail(req) : {};

      // ── Failure path: no session yet, DB schema requires user_id.
      //    Mirror to server.log so operators see brute-force probes.
      if (!ok) {
        if (!logFailures) return;
        const path = safeUrl(req.originalUrl);
        const ua = (req.headers['user-agent'] || '').slice(0, 200);
        const email = detail.email ? String(detail.email).slice(0, 200) : '-';
        console.warn(
          `[audit] ${action}_failed status=${res.statusCode} ip=${req.ip || '-'} ` +
          `email=${email} path=${path} ua="${ua}"`
        );
        return;
      }

      // ── Success path: only record when we actually have a user.
      if (!req.userId) return;

      try {
        const db = getDb();
        // Strip tokens from the recorded URL — share / password-reset
        // tokens end up in `req.originalUrl` and would otherwise
        // give anyone with DB access a long-lived credential.
        db.insert(auditEvents).values({
          userId: req.userId,
          action,
          detail: { ...detail, method: req.method, path: safeUrl(req.originalUrl) },
          ip: req.ip ?? null,
          userAgent: (req.headers['user-agent'] || '').slice(0, 500),
        }).catch((err) => {
          console.warn('[audit] insert failed:', err.message);
        });
      } catch (err) {
        console.warn('[audit] setup failed:', (err as Error).message);
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
export async function recordAudit(userId: string, action: string, detail: Record<string, unknown> = {}) {
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
    console.warn('[audit] recordAudit error:', (err as Error).message);
  }
}