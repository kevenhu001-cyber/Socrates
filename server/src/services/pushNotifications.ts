import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { notificationTokens } from '../db/schema.js';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  channelId?: string;
}

/**
 * Sends Android notifications through FCM's legacy endpoint when the
 * deployment provides FCM_SERVER_KEY. The database/token contract stays
 * provider-neutral, so replacing this transport with FCM HTTP v1 later does
 * not require changes in the mobile client or notification routes.
 */
export async function sendPushToUser(userId: string, message: PushMessage) {
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) return { configured: false, sent: 0 };

  const db = getDb();
  const rows = await db.select().from(notificationTokens).where(and(
    eq(notificationTokens.userId, userId),
    eq(notificationTokens.platform, 'android'),
  ));
  let sent = 0;
  await Promise.all(rows.map(async (row) => {
    try {
      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: { Authorization: `key=${serverKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: row.token, priority: 'high', notification: { title: message.title, body: message.body, channel_id: message.channelId || 'replies' }, data: message.data || {} }),
      });
      if (!response.ok) return;
      const result = await response.json().catch(() => null) as { success?: number; results?: Array<{ error?: string }> } | null;
      if (result?.success) sent += 1;
      const error = result?.results?.[0]?.error;
      if (error === 'NotRegistered' || error === 'InvalidRegistration') {
        await db.delete(notificationTokens).where(eq(notificationTokens.id, row.id));
      }
    } catch {
      // Notifications are best-effort and must never fail the chat request.
    }
  }));
  return { configured: true, sent };
}
