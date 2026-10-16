import { getDb } from '../../db/index.js';
import { auditEvents } from '../../db/schema.js';

/**
 * Direct audit event recorder for use in services and route handlers.
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
