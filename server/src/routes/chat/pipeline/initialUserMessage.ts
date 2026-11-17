/**
 * Persist the first user message and touch the session without putting two
 * serial DB round-trips on the path to the first token.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import { messages, sessions } from '../../../db/schema/index.js';
import { sanitizePlainText, sanitizeStoredHtml } from '../../../lib/sanitize.js';
import { contentText, isRecord, requestMessages } from './requestBody.js';
import type { ChatStreamPipelineContext } from './types.js';

export function persistInitialUserMessage({
  req,
  sessionId,
  turnId,
}: {
  req: ChatStreamPipelineContext['req'];
  sessionId: string | null;
  turnId: string | null;
}): void {
  /* P_ttfb-background-persist — this insert + touch does not feed the
       upstream request, so awaiting it here would park two serial DB
       round-trips on the path to the first token. It runs detached: the
       client already rendered the message optimistically, the turn's
       inputSnapshot covers detached recovery, and the write is idempotent
       (onConflictDoNothing / pre-existence check), so a late write is
       indistinguishable from an early one. Failures keep the
       warn-and-continue contract. */
  if (sessionId && req.userId) {
    void (async () => {
      try {
        const db = getDb();
        const requestBody = isRecord(req.body as unknown)
          ? (req.body as unknown as Record<string, unknown>)
          : {};
        const rawUserMsgs = requestMessages(requestBody);
        let lastUserMsg: Record<string, unknown> | null = null;
        for (let i = rawUserMsgs.length - 1; i >= 0; i--) {
          if (rawUserMsgs[i].role === 'user') {
            lastUserMsg = rawUserMsgs[i];
            break;
          }
        }
        if (lastUserMsg) {
          const userContentStr = contentText(lastUserMsg.content);
          const userRaw =
            typeof lastUserMsg.rawText === 'string' && lastUserMsg.rawText
              ? lastUserMsg.rawText
              : userContentStr;
          const clientTurn = isRecord(requestBody.clientTurn) ? requestBody.clientTurn : {};
          const userClientId =
            (typeof lastUserMsg.clientId === 'string' ? lastUserMsg.clientId : null) ||
            (typeof clientTurn.userClientId === 'string' ? clientTurn.userClientId : null) ||
            (turnId ? `user-${turnId}` : null);
          const userAttachments = Array.isArray(lastUserMsg.attachments)
            ? lastUserMsg.attachments
            : [];

          const safeUserContent = sanitizeStoredHtml(userContentStr);
          const safeUserRaw = sanitizePlainText(userRaw);

          if (userClientId) {
            await db
              .insert(messages)
              .values({
                sessionId: sessionId,
                role: 'user',
                content: safeUserContent,
                html: safeUserContent,
                rawText: safeUserRaw,
                clientId: userClientId,
                attachments: userAttachments,
              })
              .onConflictDoNothing();
          } else {
            const [existingRecent] = await db
              .select({ id: messages.id })
              .from(messages)
              .where(
                and(
                  eq(messages.sessionId, sessionId),
                  eq(messages.role, 'user'),
                  eq(messages.rawText, userRaw),
                ),
              )
              .limit(1);
            if (!existingRecent) {
              await db.insert(messages).values({
                sessionId: sessionId,
                role: 'user',
                content: safeUserContent,
                html: safeUserContent,
                rawText: safeUserRaw,
                attachments: userAttachments,
              });
            }
          }
          await db
            .update(sessions)
            .set({ updatedAt: new Date() })
            .where(and(eq(sessions.id, sessionId), eq(sessions.userId, req.userId)));
        }
      } catch (err) {
        console.warn(
          '[chat/stream] persisting initial user message skipped:',
          (err as Error).message,
        );
      }
    })();
  }
}
