import { Router } from 'express';
import { eq, count, sql, and, gte } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import {
  users, sessions, messages, apiKeys, usageEvents, tags, sessionTags,
  projects, mistakes, memories, artifacts, artifactVersions, prompts,
  files, workspaces, workspaceMembers,
} from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/**
 * POST /api/account/cancel — downgrade a paid subscription back to the
 * free Diophantus tier. Mirrors the front-end My Account "Cancel
 * Subscription" action. Idempotent: calling it on an already-free user
 * is a no-op (returns 200 with the unchanged tier).
 */
router.post('/cancel', async (req, res, next) => {
  try {
    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.userId))
      .limit(1);
    if (!user) {
      return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    if (user.tier !== 'diophantus') {
      await db
        .update(users)
        .set({ tier: 'diophantus', plan: null })
        .where(eq(users.id, req.userId));
    }
    return res.json({ ok: true, tier: 'diophantus' });
  } catch (err) { next(err); }
});

/**
 * Plan/tier definitions matching the front-end buildCards() expectations.
 * rank: 0=Free, 1=Basic, 2=Standard, 3=Premium
 */
const TIER_PLANS = {
  diophantus: { name: 'Diophantus', price: 0, rank: 0, maxSessions: 5, maxKeys: 2 },
  riemann:    { name: 'Riemann',    price: 12, rank: 1, maxSessions: 30, maxKeys: 10 },
  descartes:  { name: 'Descartes',  price: 29, rank: 2, maxSessions: 100, maxKeys: 50 },
  euclid:     { name: 'Euclid',     price: 99, rank: 3, maxSessions: 0, maxKeys: 999 },
};

/**
 * GET /api/account/usage — consolidated user + plan + usage data
 * for the My Account dashboard page.
 */
router.get('/usage', async (req, res, next) => {
  try {
    const db = getDb();

    // 1) Fetch the user row
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.userId))
      .limit(1);
    if (!user) {
      return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }

    // 2) Count sessions for this user
    const [sessionResult] = await db
      .select({ value: count() })
      .from(sessions)
      .where(eq(sessions.userId, req.userId));
    const sessionCount = sessionResult?.value ?? 0;

    // 3) Count API keys for this user
    const [keyResult] = await db
      .select({ value: count() })
      .from(apiKeys)
      .where(eq(apiKeys.userId, req.userId));
    const providerCount = keyResult?.value ?? 0;

    // 4) Knowledge-graph node count (aggregated in SQL).
    const [nodeResult] = await db
      .select({ value: sql`COALESCE(SUM(jsonb_array_length(${sessions.kbNodes})), 0)::int` })
      .from(sessions)
      .where(eq(sessions.userId, req.userId));
    const graphNodes = nodeResult?.value ?? 0;

    // 5) Beagle monthly token usage — tier-based quota
    const BEAGLE_QUOTAS = {
      diophantus: 1_000_000,
      riemann:    100_000_000,
      descartes:  300_000_000,
      euclid:     800_000_000,
    };
    const beagleLimit = BEAGLE_QUOTAS[user.tier] || BEAGLE_QUOTAS.diophantus;
    let beagleUsed = 0;
    {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const [beagleRow] = await db
        .select({ value: sql`COALESCE(SUM(${usageEvents.totalTokens}), 0)::int` })
        .from(usageEvents)
        .where(and(eq(usageEvents.userId, req.userId), gte(usageEvents.createdAt, monthStart)));
      beagleUsed = beagleRow?.value ?? 0;
    }

    // 6) Determine plan details from user tier
    const tier = user.tier || 'diophantus';
    const planDef = TIER_PLANS[tier] || TIER_PLANS.diophantus;

    // subscriptionEnd: if user has a plan (paid), estimate 30 days from now
    // as a placeholder; real billing integration would use a subscriptions table.
    const subscriptionEnd = user.plan
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : null;

    // 6) Build user payload (mirrors publicUser shape with subscriptionEnd added)
    const userPayload = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      tier: user.tier,
      plan: user.plan ?? null,
      isGuest: !!user.isGuest,
      verifiedAt: user.verifiedAt,
      createdAt: user.createdAt,
      customInstructions: user.customInstructions,
      preferences: user.preferences ?? {},
      defaultModel: user.defaultModel,
      subscriptionEnd,
    };

    return res.json({
      user: userPayload,
      plan: planDef,
      usage: {
        sessionCount,
        providerCount,
        graphNodes,
        beagleUsed,
        beagleLimit,
      },
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/account/usage-heatmap — hourly token-usage buckets for
 * the heatmap widget on the My Account dashboard. Returns one row
 * per hour for the last 7 days (168 buckets). Hours with no usage
 * are still returned with tokens=0 so the front-end can paint a
 * consistent grid without gap-detection logic.
 *
 * Each bucket carries:
 *   - hour      : ISO timestamp at hour granularity (UTC)
 *   - tokens    : total tokens (prompt + completion) consumed in that hour
 *   - calls     : number of chat completions in that hour
 *
 * The heatmap colors each cell based on its tokens relative to the
 * user's 95th-percentile hour over the window — a percentile-based
 * scale (instead of absolute) keeps the visualisation meaningful for
 * both light and heavy users. */
router.get('/usage-heatmap', async (req, res, next) => {
  try {
    const db = getDb();
    const hours = Math.min(Math.max(parseInt(req.query.hours, 10) || 168, 24), 168);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const rows = await db
      .select({
        hour: sql`date_trunc('hour', ${usageEvents.createdAt})`,
        tokens: sql`COALESCE(SUM(${usageEvents.totalTokens}), 0)::int`,
        calls: sql`COUNT(*)::int`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.userId} = ${req.userId} AND ${usageEvents.createdAt} >= ${since}`)
      .groupBy(sql`date_trunc('hour', ${usageEvents.createdAt})`)
      .orderBy(sql`date_trunc('hour', ${usageEvents.createdAt})`);

    /* Fill in zero-buckets for any hour with no activity so the
       front-end can render a continuous grid without gaps. */
    const byHour = new Map();
    for (const r of rows) {
      byHour.set(new Date(r.hour).toISOString(), { hour: r.hour, tokens: r.tokens, calls: r.calls });
    }
    const filled = [];
    const startMs = Math.floor(since.getTime() / 3600000) * 3600000;
    const endMs = Math.floor(Date.now() / 3600000) * 3600000;
    for (let t = startMs; t <= endMs; t += 3600000) {
      const key = new Date(t).toISOString();
      const existing = byHour.get(key);
      filled.push(existing || { hour: key, tokens: 0, calls: 0 });
    }

    /* Totals + 95th percentile for the heatmap color scale. */
    const totalTokens = filled.reduce((s, b) => s + b.tokens, 0);
    const totalCalls = filled.reduce((s, b) => s + b.calls, 0);
    const sortedNonZero = filled.map((b) => b.tokens).filter((t) => t > 0).sort((a, b) => a - b);
    const p95 = sortedNonZero.length
      ? sortedNonZero[Math.min(sortedNonZero.length - 1, Math.floor(sortedNonZero.length * 0.95))]
      : 0;

    return res.json({
      hours,
      totalTokens,
      totalCalls,
      p95,
      buckets: filled,
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/account/export — download all user data as a JSON file.
 * Returns a Content-Disposition: attachment response so the browser
 * saves the file rather than displaying it inline.
 */
router.get('/export', async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.userId;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    const {
      passwordHash, verifyToken, verifyTokenExpiresAt,
      resetToken, resetTokenExpiresAt,
      ...safeUser
    } = user;

    const userSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(sessions.createdAt);

    const sessionIds = userSessions.map((s) => s.id);
    const allMessages = sessionIds.length > 0
      ? await db
          .select()
          .from(messages)
          .where(sql`${messages.sessionId} = ANY(ARRAY[${sql.join(sessionIds.map((id) => sql`${id}`), sql`, `)}]::uuid[])`)
          .orderBy(messages.createdAt)
      : [];

    const userKeys = await db
      .select({
        id: apiKeys.id,
        label: apiKeys.label,
        url: apiKeys.url,
        model: apiKeys.model,
        keyHint: apiKeys.keyHint,
        isActive: apiKeys.isActive,
        isBuiltIn: apiKeys.isBuiltIn,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(apiKeys.createdAt);

    const userUsage = await db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.userId, userId))
      .orderBy(usageEvents.createdAt);

    const userMistakes = await db
      .select()
      .from(mistakes)
      .where(eq(mistakes.userId, userId))
      .orderBy(mistakes.createdAt);

    const userMemories = await db
      .select()
      .from(memories)
      .where(eq(memories.userId, userId))
      .orderBy(memories.createdAt);

    const userTags = await db
      .select()
      .from(tags)
      .where(eq(tags.userId, userId))
      .orderBy(tags.name);

    const userSessionTags = sessionIds.length > 0
      ? await db
          .select()
          .from(sessionTags)
          .where(sql`${sessionTags.sessionId} = ANY(ARRAY[${sql.join(sessionIds.map((id) => sql`${id}`), sql`, `)}]::uuid[])`)
      : [];

    const userProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(projects.createdAt);

    const userPrompts = await db
      .select()
      .from(prompts)
      .where(eq(prompts.userId, userId))
      .orderBy(prompts.createdAt);

    const userArtifacts = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.userId, userId))
      .orderBy(artifacts.createdAt);

    const artifactIds = userArtifacts.map((a) => a.id);
    const userArtifactVersions = artifactIds.length > 0
      ? await db
          .select()
          .from(artifactVersions)
          .where(sql`${artifactVersions.artifactId} = ANY(ARRAY[${sql.join(artifactIds.map((id) => sql`${id}`), sql`, `)}]::uuid[])`)
          .orderBy(artifactVersions.createdAt)
      : [];

    const userFiles = await db
      .select({
        id: files.id,
        name: files.name,
        mimeType: files.mimeType,
        size: files.size,
        kind: files.kind,
        width: files.width,
        height: files.height,
        pages: files.pages,
        sha256: files.sha256,
        sessionId: files.sessionId,
        uploadedAt: files.uploadedAt,
      })
      .from(files)
      .where(eq(files.userId, userId))
      .orderBy(files.uploadedAt);

    const userMemberships = await db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId));

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: 1,
      user: safeUser,
      stats: {
        sessionCount: userSessions.length,
        messageCount: allMessages.length,
        apiKeyCount: userKeys.length,
        usageEventCount: userUsage.length,
        mistakeCount: userMistakes.length,
        memoryCount: userMemories.length,
        tagCount: userTags.length,
        projectCount: userProjects.length,
        promptCount: userPrompts.length,
        artifactCount: userArtifacts.length,
        fileCount: userFiles.length,
      },
      sessions: userSessions,
      messages: allMessages,
      apiKeys: userKeys,
      usage: userUsage,
      mistakes: userMistakes,
      memories: userMemories,
      tags: userTags,
      sessionTags: userSessionTags,
      projects: userProjects,
      prompts: userPrompts,
      artifacts: userArtifacts,
      artifactVersions: userArtifactVersions,
      files: userFiles,
      workspaceMemberships: userMemberships,
    };

    const json = JSON.stringify(exportData, null, 2);
    const filename = `socrates-data-${userId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(json));
    return res.end(json);
  } catch (err) { next(err); }
});

export default router;
