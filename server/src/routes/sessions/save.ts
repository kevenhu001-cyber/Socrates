/**
 * Session create/upsert path.
 *
 * The route shell owns only writeLimiter + auth; this module owns the
 * transaction: ownership, tier limit, graph upsert, message reconciliation,
 * attachment ownership and chunk indexing.
 */
import type { NextFunction, Request, Response } from 'express';
import { rebaseTurnRuntimeText } from '@socrates/core/turnRuntimeText';
import { and, count, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { artifacts, files, messages, mistakes, sessions } from '../../db/schema/index.js';
import { getDb } from '../../db/index.js';
import { BadRequest, Forbidden } from '../../lib/errors.js';
import { sanitizePlainText, sanitizeStoredHtml } from '../../lib/sanitize.js';
import { getSessionLimit } from '../../lib/tiers.js';
import { isUuid } from '../../lib/validate.js';
import { indexMessageChunks } from '../../services/embeddings/chunkIndex.js';
import { ensureSessionWorkspaceForSession } from '../../services/tools/agentRuntime.js';
import { md5Hex, SessionPayloadSchema, sanitizeSessionPayload } from './payload.js';

/* P_workspace-ensure-once — see the save handler. Bounded so a long-lived
   process cannot grow it without limit. */
const WORKSPACE_ENSURE_MEMO_MAX = 5_000;
const _workspaceEnsured = new Set<string>();

/** Create or upsert one session graph. */
export async function saveSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<unknown> {
  try {
    const db = getDb();
    // M3: sanitize before validate (see sanitizeSessionPayload) so
    // over-capacity states truncate instead of 400-looping forever.
    // zod still throws ZodError on structurally malformed input → errorHandler returns 400.
    const {
      id,
      topic,
      title,
      domain,
      mode,
      phase,
      kind,
      examData,
      projectId,
      assistantId,
      messages: msgs,
      kbNodes,
      mistakes,
      pinned,
      totalQ,
      currentNode,
      teachingStage,
      currentExampleIdx,
      practiceAttempts,
      practicePhase,
      teachingPlan,
      boundariesHistory,
      mistakeFilter,
      branchedFrom,
    } = SessionPayloadSchema.parse(sanitizeSessionPayload(req.body));

    /* M3 — automatic context compression was REMOVED from this path.
     *
     * It was called here with the intent that the summary would REPLACE
     * the older turns ("older turns discarded"). It never did: this route
     * only ever upserts, and there is no DELETE on `messages` anywhere in
     * the save path (the deletes live in routes/messages.ts for the
     * explicit discardFollowing / delete-one flows, and in the whole-
     * session teardown routes). So every message written by an earlier
     * save stayed in the table, and compression achieved nothing except:
     *   - one synchronous LLM round trip on EVERY save of a long session
     *     (this route awaits it, so it sits directly on the save's
     *     critical path and competes with the live SSE stream), and
     *   - an extra "[Context summary — N earlier messages compressed]"
     *     row at the top of the transcript. GET /:id has no type filter,
     *     so that row rendered next to the full conversation it claimed
     *     to replace.
     *
     * Context-window compression still happens where it belongs, purely
     * in memory, in routes/chat/prepare/request.ts when building the messages
     * sent to the model. Persisting the conversation is now lossless:
     * what the user sees is exactly what is stored.
     *
     * If bounded storage is wanted later, that is a product decision
     * about user history (delete vs. flag-and-hide), not something to
     * smuggle in via a lossy transform on the save path.
     */
    const persistMsgs = msgs;

    /* ─── Atomic transaction ───
     * Wraps the existence check + upsert in a transaction to prevent a
     * race with the DELETE handler. Without this, a DELETE transaction
     * that fires between the POST's SELECT (line ~181) and its INSERT
     * (line ~235) causes the POST to see a missing row, generate a
     * fresh UUID, and INSERT a new session — resurrecting a deleted
     * conversation with the same content under a new ID.
     *
     * Within the transaction we use FOR UPDATE on the existence check
     * so the DELETE's locking delete transaction (which awaits the
     * same row lock) serialises after our check. */
    const sessionId = await db
      .transaction(async (tx) => {
        let sid: string;
        let indexedRows: Array<{
          id: string;
          rawText: string | null;
          role: string;
          clientId: string | null;
        }> = [];
        if (isUuid(id)) {
          const [owner] = await tx
            .select({ userId: sessions.userId })
            .from(sessions)
            .where(eq(sessions.id, id))
            .for('update')
            .limit(1);
          if (owner && owner.userId === req.userId) {
            sid = id;
          } else {
            // No row yet for this UUID — try to find a recent sibling.
            const safeTopic = (topic || '').trim();
            const safeTitle = (title || topic || '').trim();
            if (safeTopic || safeTitle) {
              const recent = await tx
                .select({ id: sessions.id })
                .from(sessions)
                .where(
                  and(
                    eq(sessions.userId, req.userId!),
                    eq(sessions.topic, safeTopic),
                    eq(sessions.title, safeTitle),
                    gt(sessions.createdAt, sql`NOW() - INTERVAL '5 seconds'`),
                  ),
                )
                .orderBy(sql`${sessions.createdAt} DESC`)
                .limit(1);
              if (recent.length > 0) {
                sid = recent[0].id;
              } else {
                sid = id;
              }
            } else {
              sid = id;
            }
          }
        } else {
          sid = randomUUID();
        }

        /* Tier-based session limit — only enforce when creating a NEW
         * session. Updates to existing sessions are always allowed. */
        const [existingSession] = await tx
          .select({ id: sessions.id, assistantId: sessions.assistantId })
          .from(sessions)
          .where(eq(sessions.id, sid))
          .limit(1);
        if (!existingSession) {
          const tier = req.user?.tier || 'diophantus';
          const maxSessions = getSessionLimit(tier);
          if (maxSessions > 0) {
            const [sessCount] = await tx
              .select({ value: count() })
              .from(sessions)
              .where(eq(sessions.userId, req.userId!));
            if ((sessCount?.value || 0) >= maxSessions) {
              throw new Forbidden(
                'FORBIDDEN',
                `Session limit reached for ${tier} plan (${maxSessions} sessions). Upgrade your plan to create more.`,
              );
            }
          }
        }

        if (assistantId) {
          const [ownedAssistant] = await tx
            .select({ id: artifacts.id })
            .from(artifacts)
            .where(
              and(
                eq(artifacts.id, assistantId),
                eq(artifacts.userId, req.userId!),
                eq(artifacts.type, 'assistant'),
              ),
            )
            .limit(1);
          if (!ownedAssistant)
            throw new BadRequest('assistantId does not reference one of your assistants');
        }
        const storedAssistantId =
          assistantId === undefined ? existingSession?.assistantId || null : assistantId;

        // Upsert session
        await tx
          .insert(sessions)
          .values({
            id: sid,
            userId: req.userId!,
            topic: topic || '',
            title: title || topic || null,
            domain: domain || null,
            mode: mode || 'chat',
            phase: phase || 'topic',
            kind: kind || 'chat',
            examData: examData || null,
            projectId: projectId || null,
            assistantId: storedAssistantId,
            pinned: !!pinned,
            kbNodes: kbNodes || [],
            mistakes: mistakes || [],
            totalQ: totalQ || 0,
            currentNode: currentNode || 0,
            /* AUDIT-R1 — persist the teaching-state machine so a reloaded
             * tutor session resumes at the right stage instead of
             * restarting at motivate/0. */
            teachingStage: teachingStage || null,
            currentExampleIdx: currentExampleIdx ?? null,
            practiceAttempts: practiceAttempts ?? null,
            practicePhase: practicePhase || null,
            teachingPlan: teachingPlan || null,
            boundariesHistory: boundariesHistory || null,
            mistakeFilter: mistakeFilter || null,
            branchedFrom: branchedFrom || null,
          })
          .onConflictDoUpdate({
            target: sessions.id,
            set: {
              topic: sql`EXCLUDED.topic`,
              title: sql`EXCLUDED.title`,
              domain: sql`EXCLUDED.domain`,
              mode: sql`EXCLUDED.mode`,
              phase: sql`EXCLUDED.phase`,
              kind: sql`EXCLUDED.kind`,
              examData: sql`EXCLUDED.exam_data`,
              projectId: sql`EXCLUDED.project_id`,
              assistantId: sql`EXCLUDED.assistant_id`,
              pinned: sql`EXCLUDED.pinned`,
              kbNodes: sql`EXCLUDED.kb_nodes`,
              mistakes: sql`EXCLUDED.mistakes`,
              totalQ: sql`EXCLUDED.total_q`,
              currentNode: sql`EXCLUDED.current_node`,
              teachingStage: sql`EXCLUDED.teaching_stage`,
              currentExampleIdx: sql`EXCLUDED.current_example_idx`,
              practiceAttempts: sql`EXCLUDED.practice_attempts`,
              practicePhase: sql`EXCLUDED.practice_phase`,
              teachingPlan: sql`EXCLUDED.teaching_plan`,
              boundariesHistory: sql`EXCLUDED.boundaries_history`,
              mistakeFilter: sql`EXCLUDED.mistake_filter`,
              branchedFrom: sql`EXCLUDED.branched_from`,
              updatedAt: sql`NOW()`,
            },
          });

        // P_message-dedup — atomic upsert using the (sessionId, clientId)
        // unique constraint. Dedupe by clientId before the multi-row INSERT
        // because PostgreSQL's ON CONFLICT clause handles collisions with
        // EXISTING rows but NOT with other rows in the same INSERT. Without
        // this dedup, a session re-save that contains two messages with the
        // same clientId (placeholder + finalised, or a duplicate tool card)
        // throws 23505 and the POST returns 500.
        if (Array.isArray(persistMsgs) && persistMsgs.length) {
          /* P_chunk-dirty — the sessionChunks index and its embeddings are
           derived purely from `rawText` (see indexMessageChunks, which is
           called with row.rawText below). A row whose rawText is unchanged
           therefore already has a correct index, so re-indexing it is pure
           waste — and it was not cheap: each call runs a chunk DELETE+INSERT,
           an uncached embedding-config lookup, an external embedding round
           trip, and up to 64 per-chunk UPDATEs, all awaited serially. On a
           240-message session that is ~120 assistant messages × ~68 serial
           round trips = thousands of round trips on EVERY save, competing
           with the live SSE stream for the same pool.

           Read the current md5(raw_text) for this session once — a small
           fixed-width projection, one round trip — and re-index only the
           rows whose text actually changed (new rows are absent from the
           map, so they always qualify).

           Two properties make this safe. (1) If the two md5
           implementations ever disagreed, every row would look changed and
           the route would fall back to re-indexing everything — i.e. the
           old slow-but-correct behaviour, never a skipped update.
           (2) A message whose text is unchanged keeps its existing
           vectors, so enabling an embedding provider later yields vectors
           only for new/edited messages. searchSessionChunksHybrid already
           filters on isNotNull(embedding) and fuses with BM25 via RRF, so
           the older messages still rank through the BM25 leg rather than
           disappearing. Backfilling those vectors is a deliberate
           follow-up, not something to pay for on every save. */
          const priorRawTextHashes = new Map<string, string>();
          /* P_hash-probe-scope — this probe used to read md5(rawText) for EVERY
           * message in the session on EVERY save, so a 240-message transcript
           * paid a 240-row index scan per turn even when the delta carried two
           * rows — and a save that only changed a session scalar (title
           * generation, phase, pinned) changed no message at all yet still paid
           * it in full.
           *
           * The map is only ever consulted for the rows being written:
           * `dedupedRows.filter(r => priorRawTextHashes.get(r.clientId) !==
           * md5Hex(...))` and the RETURNING filter below. A delta clientId that
           * the probe does not return is by definition not in the table yet, and
           * the full probe would not have returned it either — `.get()` yields
           * undefined on both paths, the row is treated as new, and it is
           * upserted and re-indexed. So restricting the probe to the delta's
           * clientIds is behaviour-preserving. */
          const probeClientIds = Array.from(
            new Set(
              persistMsgs
                .map((m) => m.clientId)
                .filter((c): c is string => typeof c === 'string' && c.length > 0),
            ),
          );
          if (probeClientIds.length > 0) {
            try {
              const prior = await tx
                .select({
                  clientId: messages.clientId,
                  hash: sql<string>`md5(coalesce(${messages.rawText}, ''))`,
                })
                .from(messages)
                .where(
                  and(eq(messages.sessionId, sid), inArray(messages.clientId, probeClientIds)),
                );
              for (const p of prior) {
                if (p.clientId != null) priorRawTextHashes.set(p.clientId, p.hash);
              }
            } catch (hashErr) {
              /* Never block the save on this optimisation. An empty map degrades
               to the previous behaviour: every assistant row is re-indexed. */
              console.warn(
                '[sessions] rawText hash probe failed, re-indexing all assistant rows:',
                (hashErr as Error).message,
              );
            }
          }
          const _insertBase = Date.now();
          const rows = persistMsgs.map((m, i) => {
            const contentRaw = m.rawText || m.content || '';
            const cleanRaw = sanitizePlainText(contentRaw);
            /* P_sanitize-once — `content` was derived from the same source as
             `html`, so calling sanitizeStoredHtml on both independently parsed
             the identical markup twice for every message on every save. On a
             240-message session that is 240 redundant DOM parses per turn.
             Sanitize the html once and reuse the result; fall back to the raw
             text only when the message carries no html. */
            const cleanHtml = m.html ? sanitizeStoredHtml(m.html) : null;
            const cleanContent = cleanHtml !== null ? cleanHtml : sanitizeStoredHtml(contentRaw);
            return {
              role: m.role || 'user',
              content: cleanContent,
              rawText: cleanRaw,
              html: cleanHtml,
              type: m.type || null,
              sources: m.sources || null,
              clientId: m.clientId || null,
              reasoningContent: m.reasoningContent || null,
              turnRuntime: rebaseTurnRuntimeText(m.turnRuntime, contentRaw, cleanRaw),
              attachments: Array.isArray(m.attachments) ? m.attachments.slice(0, 20) : [],
              /* P_tool-history — persist the tool-calls log so reload
               * re-renders the cards. Normalise to plain values so the
               * jsonb payload is deterministic across clients. */
              toolCalls: Array.isArray(m.toolCalls)
                ? m.toolCalls.slice(0, 20).map(function (tc) {
                    return {
                      id: String(tc.id || ''),
                      name: String(tc.name || ''),
                      input: tc.input == null ? null : tc.input,
                      output: tc.output == null ? null : String(tc.output),
                      isError: tc.isError === true,
                      plan: tc.plan == null ? null : tc.plan,
                      spec: tc.spec == null ? null : tc.spec,
                      executionId: tc.executionId == null ? null : String(tc.executionId),
                      durationMs: typeof tc.durationMs === 'number' ? tc.durationMs : null,
                      progressPhase: tc.progressPhase == null ? null : String(tc.progressPhase),
                      argumentsText: tc.argumentsText == null ? null : String(tc.argumentsText),
                      stderr: tc.stderr == null ? null : String(tc.stderr),
                      errorText: tc.errorText == null ? null : String(tc.errorText),
                      userMessage: tc.userMessage == null ? null : String(tc.userMessage),
                      detail: tc.detail == null ? null : String(tc.detail),
                      retryable: tc.retryable === true,
                      artifacts: Array.isArray(tc.artifacts)
                        ? tc.artifacts.slice(0, 20).map(function (a) {
                            return {
                              id: String(a.id || ''),
                              mimeType: a.mimeType || null,
                              name: a.name || null,
                            };
                          })
                        : [],
                      /* P_inline-restore — round-trip the pieces the client
                       * needs to rebuild the inline tool layout: search
                       * results (row source lists), the rawText split
                       * offset, and native visualization specs. */
                      results: Array.isArray(tc.results) ? tc.results.slice(0, 20) : [],
                      textOffset: typeof tc.textOffset === 'number' ? tc.textOffset : null,
                      visualizations: Array.isArray(tc.visualizations)
                        ? tc.visualizations.slice(0, 8)
                        : [],
                      runId: tc.runId == null ? null : String(tc.runId).slice(0, 200),
                      status: tc.status == null ? null : String(tc.status).slice(0, 60),
                      /* Well-formed only, and capped: the renderer ignores a
                       * partial log rather than drawing half a checklist, so a
                       * malformed entry here costs that run its steps — which is
                       * still better than persisting junk or rejecting the save. */
                      steps: Array.isArray(tc.steps)
                        ? tc.steps
                            .filter(
                              (step): step is Record<string, unknown> =>
                                step !== null &&
                                typeof step === 'object' &&
                                !Array.isArray(step) &&
                                'stepId' in step &&
                                step.stepId != null &&
                                String(step.stepId).trim() !== '',
                            )
                            .slice(0, 60)
                            .map(function (step) {
                              const clean: Record<string, unknown> = {
                                stepId: String(step.stepId).slice(0, 200),
                              };
                              /* 2 kB per field: a step line is a sentence, and the
                               * full tool output already lives in the run's result. */
                              for (const field of [
                                'kind',
                                'title',
                                'detail',
                                'command',
                                'status',
                                'output',
                                'diffStat',
                              ] as const) {
                                const value = step[field];
                                if (typeof value === 'string') clean[field] = value.slice(0, 2_000);
                                else if (value == null) continue;
                                else clean[field] = String(value).slice(0, 2_000);
                              }
                              for (const field of ['exitCode', 'durationMs'] as const) {
                                if (typeof step[field] === 'number') clean[field] = step[field];
                              }
                              return clean;
                            })
                        : [],
                    };
                  })
                : [],
              sessionId: sid,
              createdAt: new Date(_insertBase + i),
            };
          });
          /* P_message-dedup-in-stmt — drop duplicate (sessionId, clientId)
           * rows so the multi-row INSERT below does not trip the unique
           * index on (session_id, client_id). Last write wins: the latest
           * entry in the batch represents the freshest UI state. Rows
           * without a clientId are keyed by their position so two
           * legacy messages can still coexist. */
          const dedupedRows: typeof rows = [];
          const seenClientIds = new Map<string, number>();
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const key = r.clientId;
            if (key == null) {
              dedupedRows.push(r);
              continue;
            }
            const prev = seenClientIds.get(key);
            if (prev === undefined) {
              seenClientIds.set(key, dedupedRows.length);
              dedupedRows.push(r);
            } else {
              dedupedRows[prev] = r;
            }
          }
          /* P_upsert-dirty — gate the multi-row upsert on the same probe.
           The client re-POSTs the whole transcript on every save, so the
           statement was rewriting all N message rows each turn even when
           a single row had changed. Filtering to genuinely-dirty rows
           turns a 240-row write into a 1-2 row write, and the RETURNING
           below then yields just those rows, which is what
           `indexedRows` (and therefore the chunk index) is built from.

           A row is kept when it is new (absent from the probe map) or its
           rawText moved. Rows WITHOUT a clientId cannot be matched
           against the map (their conflict key is positional), so they are
           always kept — preserving the existing legacy behaviour rather
           than risking a dropped write.

           Side effect, and a better one: `createdAt` is no longer bumped
           for untouched messages, so a message's timestamp is its own
           again instead of "whenever the session was last saved". Row
           ORDER is unaffected — the client already sends
           createdAt = base + index, so ordering was and remains
           index-ordered. */
          const upsertRows = dedupedRows.filter(
            (r) =>
              r.clientId == null || priorRawTextHashes.get(r.clientId) !== md5Hex(r.rawText || ''),
          );
          /* P_session-chunks — RETURNING covers both new inserts and
           conflict updates, so a re-save of an existing session
           re-indexes in place. The sessionChunks index is written
           outside the session transaction (see the .then() below). */
          if (upsertRows.length > 0) {
            const upserted = await tx
              .insert(messages)
              .values(upsertRows)
              .onConflictDoUpdate({
                target: [messages.sessionId, messages.clientId],
                set: {
                  role: sql`EXCLUDED.role`,
                  content: sql`EXCLUDED.content`,
                  rawText: sql`EXCLUDED.raw_text`,
                  html: sql`EXCLUDED.html`,
                  type: sql`EXCLUDED.type`,
                  sources: sql`EXCLUDED.sources`,
                  reasoningContent: sql`EXCLUDED.reasoning_content`,
                  turnRuntime: sql`COALESCE(EXCLUDED.turn_runtime, ${messages.turnRuntime})`,
                  attachments: sql`EXCLUDED.attachments`,
                  toolCalls: sql`EXCLUDED.tool_calls`,
                  createdAt: sql`EXCLUDED.created_at`,
                },
              })
              .returning({
                id: messages.id,
                rawText: messages.rawText,
                role: messages.role,
                clientId: messages.clientId,
              });
            /* P_chunk-dirty — RETURNING only ever contains rows that were new
             or whose rawText moved (see P_upsert-dirty), so every assistant
             row here genuinely needs a fresh chunk index. The extra hash
             check is kept as a cheap invariant guard: if the gate above is
             ever loosened, this still refuses to re-index identical text. */
            indexedRows = upserted.filter(
              (r) =>
                r.role === 'assistant' &&
                !!r.rawText &&
                priorRawTextHashes.get(r.clientId ?? '') !== md5Hex(r.rawText),
            );
          }

          /* P_file-session-link — adopt attachment uploads into this
           * session. Composer uploads hit POST /api/files before the
           * session row exists (or while its id is still a client draft),
           * so they land as orphans (session_id IS NULL). Now that the
           * session is durable, any orphan file referenced by these
           * messages takes its id so file lifecycle and share visibility
           * follow the conversation. The userId guard makes a foreign
           * fileId a silent no-op — a client cannot bind someone else's
           * upload by guessing its id. */
          const referencedFileIds = new Set<string>();
          for (const m of persistMsgs) {
            if (!Array.isArray(m.attachments)) continue;
            for (const a of m.attachments) {
              const fid =
                a && typeof a === 'object' && typeof a.fileId === 'string' ? a.fileId.trim() : '';
              if (fid && isUuid(fid)) referencedFileIds.add(fid);
            }
          }
          if (referencedFileIds.size) {
            await tx
              .update(files)
              .set({ sessionId: sid })
              .where(
                and(
                  eq(files.userId, req.userId!),
                  isNull(files.sessionId),
                  inArray(files.id, [...referencedFileIds]),
                ),
              );
          }
        }

        const [session] = await tx.select().from(sessions).where(eq(sessions.id, sid)).limit(1);
        return { session, wasNew: !existingSession, indexedRows, sid };
      })
      .then(async (txResult) => {
        /* The sessionChunks index is intentionally written outside the
         session transaction. Chunking is O(N) in text length; holding
         the sessions row lock during it would inflate the contention
         window for the chat surface's session-save hot path. A
         chunking failure is logged and swallowed — the next re-save
         of the same session will re-index. */
        for (const row of txResult.indexedRows) {
          try {
            await indexMessageChunks(row.id, txResult.sid, row.rawText || '');
          } catch (idxErr) {
            console.warn(
              `[sessions] chunk index failed for ${row.id}: ${(idxErr as Error).message}`,
            );
          }
        }
        return txResult;
      });

    /* Workspace creation is intentionally after the session transaction: a
     * slow filesystem or a concurrent save must never hold the sessions row
     * lock. It is safe to retry here, and the agent-run path repeats the same
     * idempotent ensure before starting Codex.
     *
     * P_workspace-ensure-once — this ran on EVERY save. For a session that
     * already has a workspace, getOrCreateWorkspace is a SELECT plus an
     * UPDATE that only touches lastUsedAt/updatedAt/status, followed by a
     * blocking mkdirSync — two more round-trips and a synchronous filesystem
     * call, on the response path of a request the user is waiting on. The
     * folder only has to exist before the first agent turn, and the run path
     * calls getOrCreateWorkspace itself, so remembering that we already did it
     * is safe and self-repairing: if the row or directory is removed
     * underneath us, the next agent run recreates it.
     *
     * The id is recorded BEFORE the await so two concurrent saves cannot both
     * miss and stampede the same ensure. Session ids are server-minted UUIDs
     * and never reused, so a stale entry cannot outlive its session in a way
     * that matters; the bound below keeps the set from growing without limit. */
    if (sessionId.session?.id && !_workspaceEnsured.has(sessionId.session.id)) {
      _workspaceEnsured.add(sessionId.session.id);
      if (_workspaceEnsured.size > WORKSPACE_ENSURE_MEMO_MAX) {
        const oldest = _workspaceEnsured.values().next();
        if (!oldest.done) _workspaceEnsured.delete(oldest.value);
      }
      try {
        await ensureSessionWorkspaceForSession(
          req.userId!,
          sessionId.session.id,
          sessionId.session.projectId || null,
        );
      } catch (workspaceErr) {
        /* Let a later save retry rather than pinning the failure. */
        _workspaceEnsured.delete(sessionId.session.id);
        console.warn(
          `[sessions] workspace initialization deferred for ${sessionId.session.id}: ${(workspaceErr as Error).message}`,
        );
      }
    }
    /* P_save-response — the client just POSTed this row, so echoing the
       whole record back was pure waste: kbNodes / mistakes / teachingPlan /
       boundariesHistory / examData are large JSONB blobs (hundreds of KB on
       a mature session) and the save handler reads none of them. The one
       field the web client actually consumes is `id` (to adopt a
       server-minted UUID), so keep every scalar and drop the blobs. */
    const saved = sessionId.session;
    return res.status(id ? 200 : 201).json(
      saved
        ? {
            id: saved.id,
            userId: saved.userId,
            topic: saved.topic,
            title: saved.title,
            phase: saved.phase,
            mode: saved.mode,
            kind: saved.kind,
            totalQ: saved.totalQ,
            currentNode: saved.currentNode,
            teachingStage: saved.teachingStage,
            currentExampleIdx: saved.currentExampleIdx,
            practiceAttempts: saved.practiceAttempts,
            practicePhase: saved.practicePhase,
            mistakeFilter: saved.mistakeFilter,
            branchedFrom: saved.branchedFrom,
            pinned: saved.pinned,
            projectId: saved.projectId,
            archivedAt: saved.archivedAt,
            streamingText: saved.streamingText,
            createdAt: saved.createdAt,
            updatedAt: saved.updatedAt,
          }
        : {},
    );
  } catch (err) {
    next(err);
  }
}
