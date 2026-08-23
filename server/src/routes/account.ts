import { Router } from 'express';
import { eq, count, sql, and, gte, desc, isNull } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { comparePassword } from '../lib/crypto.js';
import { Unauthorized, BadRequest, NotFound } from '../lib/errors.js';
import {
  users, sessions, messages, apiKeys, usageEvents, tags, sessionTags,
  projects, mistakes, memories, artifacts, artifactVersions, prompts,
  files, workspaces, workspaceMembers,
} from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { parseScopes } from '../middleware/scopes.js';
import { createAgentKey } from '../services/agentKeys.js';
import { agentApiKeys } from '../db/schema.js';
import { audit } from '../middleware/audit.js';

const router = Router();
router.use(requireAuth);

/* Match the server-side password cap so the re-auth guard rejects
 * absurd inputs before they reach bcrypt. */
const MAX_PASSWORD_LENGTH = 64;

/**
 * POST /api/account/cancel — mark a paid subscription to cancel at period end.
 * Instead of immediately downgrading to the free tier, this sets a
 * `cancelAtPeriodEnd` flag so the subscription stays active until the
 * current billing period expires. Idempotent: calling it on an already-cancelled
 * or free user returns 200 with the current state.
 */
router.post('/cancel', async (req, res, next) => {
  try {
    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.userId!))
      .limit(1);
    if (!user) {
      return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    if (user.tier !== 'diophantus' && !user.cancelAtPeriodEnd) {
      await db
        .update(users)
        .set({ cancelAtPeriodEnd: true })
        .where(eq(users.id, req.userId!));
      return res.json({ ok: true, cancelAtPeriodEnd: true, tier: user.tier });
    }
    return res.json({ ok: true, cancelAtPeriodEnd: !!user.cancelAtPeriodEnd, tier: user.tier || 'diophantus' });
  } catch (err) { next(err); }
});

/**
 * Plan/tier definitions matching the front-end buildCards() expectations.
 * rank: 0=Free, 1=Basic, 2=Standard, 3=Premium
 */
const TIER_PLANS: Record<string, { name: string; price: number; rank: number; maxSessions: number; maxKeys: number }> = {
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
      .where(eq(users.id, req.userId!))
      .limit(1);
    if (!user) {
      return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }

    // 2) Count sessions for this user
    const [sessionResult] = await db
      .select({ value: count() })
      .from(sessions)
      .where(eq(sessions.userId, req.userId!));
    const sessionCount = sessionResult?.value ?? 0;

    // 3) Count API keys for this user
    const [keyResult] = await db
      .select({ value: count() })
      .from(apiKeys)
      .where(eq(apiKeys.userId, req.userId!));
    const providerCount = keyResult?.value ?? 0;

    // 4) Knowledge-graph node count (aggregated in SQL).
    const [nodeResult] = await db
      .select({ value: sql`COALESCE(SUM(jsonb_array_length(${sessions.kbNodes})), 0)::int` })
      .from(sessions)
      .where(eq(sessions.userId, req.userId!));
    const graphNodes = nodeResult?.value ?? 0;

    // 5) Beagle monthly token usage — tier-based quota
    const BEAGLE_QUOTAS: Record<string, number> = {
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
        .select({ value: sql<number>`COALESCE(SUM(${usageEvents.totalTokens}), 0)::int` })
        .from(usageEvents)
        .where(and(eq(usageEvents.userId, req.userId!), gte(usageEvents.createdAt, monthStart)));
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
      cancelAtPeriodEnd: !!user.cancelAtPeriodEnd,
      subscriptionEnd,
      isGuest: !!user.isGuest,
      verifiedAt: user.verifiedAt,
      createdAt: user.createdAt,
      customInstructions: user.customInstructions,
      preferences: user.preferences ?? {},
      defaultModel: user.defaultModel,
      paymentMethod: (user.preferences && (user.preferences as Record<string, unknown>).paymentMethod) || null,
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
 * POST /api/account/payment-method — store non-sensitive payment method
 * metadata (brand, last4, expiry month/year). Full card number and CVC
 * are NEVER sent or stored — the frontend strips them before the request.
 */
router.post('/payment-method', async (req, res, next) => {
  try {
    const db = getDb();
    const { brand, last4, expMonth, expYear } = req.body || {};

    if (!brand || !last4 || !expMonth || !expYear) {
      return res.status(400).json({ code: 'INVALID_INPUT', message: 'brand, last4, expMonth, expYear are required' });
    }
    if (!/^\d{4}$/.test(String(last4))) {
      return res.status(400).json({ code: 'INVALID_LAST4', message: 'last4 must be exactly 4 digits' });
    }

    const pm = { brand, last4, expMonth: parseInt(expMonth, 10), expYear: parseInt(expYear, 10), updatedAt: new Date().toISOString() };

    await db
      .update(users)
      .set({
        preferences: sql`jsonb_set(COALESCE(preferences, '{}'::jsonb), '{paymentMethod}', ${JSON.stringify(pm)}::jsonb)`,
      })
      .where(eq(users.id, req.userId!));

    return res.json({ ok: true, paymentMethod: pm });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/account/payment-method — remove saved payment method metadata.
 */
router.delete('/payment-method', async (req, res, next) => {
  try {
    const db = getDb();
    await db
      .update(users)
      .set({
        preferences: sql`COALESCE(preferences, '{}'::jsonb) #- '{paymentMethod}'`,
      })
      .where(eq(users.id, req.userId!));
    return res.json({ ok: true });
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
    const hours = Math.min(Math.max(parseInt(req.query.hours as string, 10) || 168, 24), 168);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const rows = await db
      .select({
        hour: sql<string>`date_trunc('hour', ${usageEvents.createdAt})`,
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
 * GET|POST /api/account/export — download all user data as a JSON file.
 * Returns a Content-Disposition: attachment response so the browser
 * saves the file rather than displaying it inline.
 *
 * P_export-reauth — M7 audit fix. The export endpoint returns the
 * user's entire dataset (sessions, messages, API keys, mistakes,
 * memories, ...). A stolen session cookie alone is enough to
 * trigger a full exfiltration under the previous build. Require
 * the caller to re-submit their current password via the
 * `X-Reauth-Password` header (header instead of body so the value
 * never lands in request logs, history, or the access log that
 * ships to the audit table). The header is constant-time compared
 * via bcrypt.compare. A failed re-auth does NOT increment the
 * login-failure counter (this is a per-user check, not a
 * brute-force channel) and does NOT log the attempted password.
 *
 * POST mode accepts the password via `req.body.password` (form or JSON)
 * for reliable form-based downloads from the marketing-site account page.
 */
router.get('/export', async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.userId!;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }

    // Re-auth: caller must re-submit the current password.
    // Guest accounts (no password) cannot export.
    const reauth = req.get('X-Reauth-Password') || req.body?.password || '';
    if (!user.passwordHash) {
      throw new Unauthorized('REAUTH_REQUIRED');
    }
    if (typeof reauth !== 'string' || reauth.length === 0 || reauth.length > MAX_PASSWORD_LENGTH) {
      throw new Unauthorized('REAUTH_REQUIRED');
    }
    const reauthOk = await comparePassword(reauth, user.passwordHash);
    if (!reauthOk) {
      throw new Unauthorized('REAUTH_FAILED');
    }
    // Destructure out only the fields that actually exist on the users row.
    // passwordHash MUST be excluded — it is a bcrypt hash but still a
    // credential that should never appear in a downloadable export.
    const { passwordHash: _pw, ...safeUser } = user;

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

/**
 * GET /api/account/usage-trend — daily token totals for a line chart.
 * Returns an array of {day, tokens, calls} for each day in the last N days
 * (default 30). Days with no usage still appear with tokens=0 so the
 * front-end can draw a continuous line. */router.get('/usage-trend', async (req, res, next) => {
  try {
    const db = getDb();
    const daysNum = Math.min(Math.max(parseInt(req.query.days as string, 10) || 30, 7), 90);
    const since = new Date(Date.now() - daysNum * 86400000);
    const dayExpr = sql`to_char(${usageEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
    const rows = await db
      .select({
        day: dayExpr,
        tokens: sql`COALESCE(SUM(${usageEvents.totalTokens}), 0)::int`,
        calls: sql`COUNT(*)::int`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.userId} = ${req.userId} AND ${usageEvents.source} = 'chat' AND ${usageEvents.createdAt} >= ${since}`)
      .groupBy(dayExpr)
      .orderBy(dayExpr);
    /* Fill in zero-days so the chart is continuous. */
    const byDay = new Map();
    for (const r of rows) byDay.set(r.day, { day: r.day, tokens: r.tokens, calls: r.calls });
    const filled = [];
    const startMs = new Date(since);
    startMs.setUTCHours(0, 0, 0, 0);
    for (let t = startMs.getTime(), end = Date.now(); t <= end; t += 86400000) {
      const key = new Date(t).toISOString().slice(0, 10);
      filled.push(byDay.get(key) || { day: key, tokens: 0, calls: 0 });
    }
    const totalTokens = filled.reduce((s, b) => s + b.tokens, 0);
    const totalCalls = filled.reduce((s, b) => s + b.calls, 0);
    return res.json({ days: daysNum, entries: filled, totalTokens, totalCalls });
  } catch (err) { next(err); }
});

/* ─── Agent API keys (Phase D) ──────────────────────────────
 * Long-lived scoped credentials for headless agents. The plaintext secret
 * is returned exactly once by the create call; only its SHA-256 lives in
 * the database afterwards. */
const MAX_AGENT_KEYS = 50;
const MAX_KEY_LABEL_LENGTH = 100;
const MAX_KEY_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function serializeAgentKeyRow(row: typeof agentApiKeys.$inferSelect) {
  return {
    id: row.id,
    keyId: row.keyId,
    label: row.label,
    scopes: row.scopes,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

/**
 * POST /api/account/agent-keys — mint a scoped key for an agent.
 * Body: { label: string, scopes: string[], expiresAt?: ISO string }.
 * Response includes `credential` ("<keyId>.<secret>") exactly once.
 */
router.post('/agent-keys', audit('create_agent_key', (req) => ({ label: req.body?.label })), async (req, res, next) => {
  try {
    const db = getDb();
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    if (!label || label.length > MAX_KEY_LABEL_LENGTH) {
      throw new BadRequest('label is required (max 100 chars)');
    }
    const scopes = parseScopes(req.body?.scopes);
    if (!scopes || scopes.length === 0) {
      throw new BadRequest('scopes must be a non-empty array drawn from the supported scope list');
    }

    let expiresAt: Date | null = null;
    if (req.body?.expiresAt != null && req.body.expiresAt !== '') {
      const parsed = new Date(String(req.body.expiresAt));
      if (Number.isNaN(parsed.getTime())) throw new BadRequest('expiresAt must be an ISO date string');
      if (parsed.getTime() <= Date.now()) throw new BadRequest('expiresAt must be in the future');
      if (parsed.getTime() - Date.now() > MAX_KEY_TTL_MS) throw new BadRequest('expiresAt cannot exceed one year');
      expiresAt = parsed;
    }

    const [activeCount] = await db
      .select({ value: count() })
      .from(agentApiKeys)
      .where(and(eq(agentApiKeys.ownerUserId, req.userId!), isNull(agentApiKeys.revokedAt)));
    if ((activeCount?.value ?? 0) >= MAX_AGENT_KEYS) {
      throw new BadRequest(`Agent key limit reached (${MAX_AGENT_KEYS}). Revoke unused keys first.`);
    }

    const issued = await createAgentKey({
      ownerUserId: req.userId!,
      label,
      scopes,
      expiresAt,
    });
    return res.status(201).json({ ok: true, ...issued });
  } catch (err) { next(err); }
});

/**
 * GET /api/account/agent-keys — list this account's agent keys
 * (newest first). Never includes any credential material.
 */
router.get('/agent-keys', async (req, res, next) => {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(agentApiKeys)
      .where(eq(agentApiKeys.ownerUserId, req.userId!))
      .orderBy(desc(agentApiKeys.createdAt));
    return res.json({ keys: rows.map(serializeAgentKeyRow) });
  } catch (err) { next(err); }
});

/**
 * POST /api/account/agent-keys/:id/revoke — revoke one of this account's
 * keys. Idempotent: revoking an already-revoked key returns ok.
 */
router.post('/agent-keys/:id/revoke', audit('revoke_agent_key'), async (req, res, next) => {
  try {
    const db = getDb();
    const id = String(req.params.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequest('invalid key id');
    const [row] = await db
      .select()
      .from(agentApiKeys)
      .where(and(eq(agentApiKeys.id, id), eq(agentApiKeys.ownerUserId, req.userId!)))
      .limit(1);
    if (!row) throw new NotFound('Agent key not found');
    if (!row.revokedAt) {
      await db
        .update(agentApiKeys)
        .set({ revokedAt: new Date() })
        .where(eq(agentApiKeys.id, row.id));
    }
    return res.json({ ok: true, revokedAt: row.revokedAt ?? new Date() });
  } catch (err) { next(err); }
});

export default router;
