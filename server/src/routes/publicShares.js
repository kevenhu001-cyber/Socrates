import { Router } from 'express';
import { eq, and, isNull } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { shares, sessions, messages } from '../db/schema.js';

const router = Router();

/* GET /api/shares/:token — public read-only view of a shared session.
 *
 * Used by the front-end when a user opens a share link with ?share=TOKEN.
 * No authentication required — visibility is enforced by the share token.
 *
 * Returns the session metadata + the message list (HTML rendered by the
 * server? No — the front-end re-renders the same way as the live app).
 */
router.get('/:token', async (req, res, next) => {
  try {
    const db = getDb();
    const [share] = await db.select().from(shares).where(eq(shares.token, req.params.token)).limit(1);
    if (!share) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Share not found' });
    }
    if (share.visibility === 'private') {
      return res.status(403).json({ code: 'PRIVATE', message: 'This share is private' });
    }

    // Archived sessions are private/trash; an old share token must
    // not bypass that and expose the content to its holder.
    const [session] = await db.select().from(sessions)
      .where(and(eq(sessions.id, share.sessionId), isNull(sessions.archivedAt)))
      .limit(1);
    if (!session) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Session not found' });
    }

    /* P_share-attachments-privacy — public share tokens must NOT leak
     * private attachment data (base64 image dataUrls, extracted PDF
     * text, etc.) to anyone holding the link. Select an explicit
     * projection that omits the `attachments` jsonb column along with
     * other implementation-detail fields (rawText, sources, html) that
     * could leak PII or be used to re-derive the user's input style. */
    const msgs = await db.select({
      id: messages.id,
      sessionId: messages.sessionId,
      role: messages.role,
      content: messages.content,
      model: messages.model,
      tokenCount: messages.tokenCount,
      reasoningContent: messages.reasoningContent,
      parentId: messages.parentId,
      createdAt: messages.createdAt,
    }).from(messages)
      .where(eq(messages.sessionId, session.id))
      .orderBy(messages.createdAt)
      .limit(200);

    return res.json({
      title: session.title,
      topic: session.topic,
      domain: session.domain,
      mode: session.mode,
      /* P_exam-share — shareable exam sessions need kind + exam_data
       * so the read-only viewer can render the questions/answers
       * instead of (or in addition to) the chat-style message list.
       * exam_data itself may carry per-question attachments via
       * question stems; we keep it for now because it does not (yet)
       * store image dataUrls, only text. Re-evaluate if a future
       * question author uploads a figure. */
      kind: session.kind,
      examData: session.examData,
      createdAt: session.createdAt,
      visibility: share.visibility,
      messages: msgs,
    });
  } catch (err) { next(err); }
});

export default router;
