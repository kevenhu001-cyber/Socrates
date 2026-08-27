import { Router } from 'express';
import crypto from 'node:crypto';
import { getDb } from '../db/index.js';
import { sessions, messages, apiKeys } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { encrypt, deriveEncryptionKey } from '../lib/crypto.js';
import { ensureSessionWorkspaceForSession } from '../services/agentRuntime.js';

const router = Router();
router.use(requireAuth);

const ENC_KEY = deriveEncryptionKey(process.env.SESSION_SECRET || 'dev-secret');

/* POST /api/migrate — import localStorage data on first login */
router.post('/', async (req, res, next) => {
  try {
    const db = getDb();
    const { localSessions, localApi } = req.body;

    // Migrate sessions
    if (Array.isArray(localSessions)) {
      for (const s of localSessions) {
        const sessionId = s.id || crypto.randomUUID();
        await db.insert(sessions).values({
          id: sessionId,
          userId: req.userId!,
          topic: s.topic || '',
          title: s.title || s.topic || null,
          domain: s.domain || null,
          mode: s.mode || 'chat',
          phase: s.phase || 'topic',
          pinned: !!s.pinned,
          kbNodes: s.kbNodes || [],
          mistakes: s.mistakes || [],
          totalQ: s.totalQ || 0,
          currentNode: s.currentNode || 0,
        }).onConflictDoNothing();

        /* Imported conversations are real sessions too. Create their private
         * workspace immediately; the startup reconciliation remains a
         * backstop for records imported by an older server. */
        try {
          await ensureSessionWorkspaceForSession(req.userId!, sessionId, null);
        } catch (workspaceErr) {
          console.warn(`[migrate] workspace initialization deferred for ${sessionId}: ${(workspaceErr as Error).message}`);
        }

        if (Array.isArray(s.messages)) {
          for (const m of s.messages) {
            await db.insert(messages).values({
              sessionId,
              role: m.role || 'user',
              content: m.rawText || m.content || '',
              rawText: m.rawText || null,
              html: m.html || null,
              type: m.type || null,
              sources: m.sources || null,
            }).onConflictDoNothing();
          }
        }
      }
    }

    // Migrate API key if provided
    if (localApi?.key && localApi?.url) {
      await db.insert(apiKeys).values({
        userId: req.userId!,
        label: localApi.label || 'Migrated',
        url: localApi.url,
        model: localApi.model || 'gpt-4o',
        keyCiphertext: encrypt(localApi.key, ENC_KEY),
        keyHint: localApi.key.slice(0, 8),
        isActive: true,
      }).onConflictDoNothing();
    }

    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
