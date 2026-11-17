/**
 * Session save payload: the Zod shape and the pre-parse sanitizer.
 *
 * The sanitizer truncates over-capacity state before validation so a single
 * oversized save cannot 400 forever. `md5Hex` is shared with the chunk-index
 * dirty probe and must match the SQL-side digest exactly.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { normalizeTurnRuntime } from '@socrates/core/turnRuntime';
import { isUuid } from '../../lib/validate.js';

export function md5Hex(text: string): string {
  return createHash('md5').update(text, 'utf8').digest('hex');
}

// P6.x — zod schema caps field lengths and validates types; throws
// ZodError → errorHandler returns 400 with the offending path.
/**
 * One persisted message row accepted by the session save path.
 *
 * This is deliberately narrower than contracts.Message:
 * - `id`, `createdAt`, `feedback` and `citations` are server-owned/derived and
 *   are never accepted from a client save.
 * - unknown client-only fields are stripped by Zod; the route only persists
 *   the columns listed below.
 */
export const SessionMessageSchema = z.object({
  role: z.string(),
  rawText: z.string().max(200000).optional().nullable(),
  content: z.string().max(200000).optional().nullable(),
  html: z.string().max(500000).optional().nullable(),
  type: z.string().max(50).optional().nullable(),
  sources: z.array(z.unknown()).max(100).optional().nullable(),
  clientId: z.string().max(100).optional().nullable(),
  /* P_reasoning-persist — chain-of-thought text from reasoning
     models. Preserved so it survives session save/load. */
  reasoningContent: z.string().max(500000).optional().nullable(),
  turnRuntime: z.unknown().optional().transform((value) => normalizeTurnRuntime(value)),
  /* P_attachments — array of {id, kind, name, mime, fileId?, dataUrl?,
     text?, size, truncated?, error?} representing user-supplied files
     for this message. Persisted so a session reload restores chips,
     thumbnails and the durable file reference the model can re-read
     via read_attachment. fileId points at the files table row created
     by POST /api/files; dataUrl (still capped at 2 MB) is the legacy
     inline-image path kept for multimodal turns. */
  attachments: z.array(z.object({
    id: z.string().max(100),
    kind: z.string().max(50),
    docKind: z.string().max(20).optional(),
    name: z.string().max(500),
    mime: z.string().max(200),
    fileId: z.string().max(100).optional(),
    dataUrl: z.string().max(2_000_000).optional(),
    text: z.string().max(500_000).optional(),
    truncated: z.boolean().optional(),
    error: z.string().max(300).optional(),
    size: z.number().int().nonnegative().max(50 * 1024 * 1024),
  })).max(20).optional(),
  /* P_tool-history — tool calls the assistant made on this turn
   * (web_search, code_interpreter, etc). Each entry is rendered as
   * a collapsible card under the message on reload so the user can
   * see what tools ran. Capped to 20 calls per message and each
   * output field is bounded so a runaway tool can't bloat the
   * session row. */
  toolCalls: z.array(z.object({
    id: z.string().max(200),
    name: z.string().max(100),
    input: z.unknown().optional().nullable(),
    output: z.string().max(500_000).optional().nullable(),
    isError: z.boolean().optional().nullable(),
    /* Preserve structured native-tool output and bounded execution metadata
     * so a reload has the same cards as the live SSE stream. */
    plan: z.unknown().optional().nullable(),
    spec: z.unknown().optional().nullable(),
    executionId: z.string().max(200).optional().nullable(),
    durationMs: z.number().nonnegative().max(86_400_000).optional().nullable(),
    progressPhase: z.string().max(200).optional().nullable(),
    argumentsText: z.string().max(500_000).optional().nullable(),
    stderr: z.string().max(500_000).optional().nullable(),
    errorText: z.string().max(100_000).optional().nullable(),
    userMessage: z.string().max(500_000).optional().nullable(),
    detail: z.string().max(100_000).optional().nullable(),
    retryable: z.boolean().optional().nullable(),
    artifacts: z.array(z.object({
      id: z.string().max(100),
      mimeType: z.string().max(200).optional().nullable(),
      name: z.string().max(500).optional().nullable(),
    })).max(20).optional(),
    results: z.array(z.object({
      title: z.string().max(1000).optional(),
      url: z.string().max(3000).optional(),
      snippet: z.string().max(5000).optional(),
      date: z.string().max(200).optional().nullable(),
      source: z.string().max(100).optional().nullable(),
      matchedQuery: z.string().max(1000).optional().nullable(),
    }).passthrough()).max(20).optional(),
    /* P_inline-restore — character offset in the assistant's rawText
     * where this tool call split the reply, plus the native
     * visualization specs the run produced. These are needed to
     * rebuild the inline text→row→chart layout on reload/share. */
    textOffset: z.number().int().nonnegative().max(10_000_000).optional().nullable(),
    visualizations: z.array(z.unknown()).max(8).optional(),
    /* P_tool-run-restore — the Codex step log and the terminal status the
     * declarative renderer (frontend/src/react/tool-run) needs to rebuild a
     * run's state without the live SSE stream. Steps are capped client-side
     * too; the bound here keeps a hostile or buggy client from writing an
     * unbounded jsonb payload. */
    runId: z.string().max(200).optional().nullable(),
    status: z.string().max(60).optional().nullable(),
    /* Shape is validated where it is written (below) rather than here, so a
     * malformed step entry degrades to "no steps" instead of failing the
     * whole session save with a 400. */
    steps: z.array(z.unknown()).max(60).optional(),
  })).max(20).optional(),
});

export type SessionSaveMessage = z.infer<typeof SessionMessageSchema>;

export const SessionPayloadSchema = z.object({
  /* M3 — coerce instead of reject: a legacy/non-UUID client id used to
   * 400 here (the isUuid fallback below was dead code because parse ran
   * first). Non-UUID ids now become undefined so the route mints/adopts
   * a canonical UUID the same way an omitted id does. */
  id: z.preprocess((v) => (isUuid(v) ? v : undefined), z.string().uuid().optional()),
  topic: z.string().max(10000).optional().default(''),
  title: z.string().max(10000).optional(),
  domain: z.string().max(10000).optional().nullable(),
  /* M3 — unknown enum members (stale clients, future modes) degrade to
   * the default instead of failing the whole save with a 400. */
  mode: z.enum(['tutor', 'chat']).optional().default('chat').catch('chat'),
  phase: z.enum(['topic', 'diagnostic', 'chat']).optional().default('topic').catch('topic'),
  /* P_exam-history — top-level session "shape". 'exam' is set by the
   * front-end when saving a finished exam; the chat service still uses
   * 'tutor' / 'chat'. Default 'chat' keeps every existing client call
   * site working unchanged. */
  kind: z.enum(['chat', 'tutor', 'exam']).optional().default('chat').catch('chat'),
  /* P_exam-history — full rendered exam payload: {topic, difficulty,
   * count, lang, types, questions:[...], answers:{...}, submitted, results?}.
   * Lives on the same row as the session, so a single
   * POST /api/sessions carries the exam to the server and a single
   * GET /api/sessions/:id returns it for re-rendering. */
  examData: z.unknown().optional().nullable(),
  /* M3 — "" or a malformed id degrades to null (unfiled) instead of a
   * 400 that blocks the entire conversation save. */
  projectId: z.preprocess(
    (v) => (v == null || v === '' ? null : (isUuid(v) ? v : null)),
    z.string().uuid().optional().nullable(),
  ),
  assistantId: z.preprocess(
    (v) => (v === undefined ? undefined : (v == null || v === '' ? null : (isUuid(v) ? v : null))),
    z.string().uuid().optional().nullable(),
  ),
  messages: z.array(SessionMessageSchema).max(1000).optional(),
  kbNodes: z.array(z.unknown()).max(5000).optional(),
  mistakes: z.array(z.unknown()).max(1000).optional(),
  pinned: z.boolean().optional(),
  totalQ: z.number().int().nonnegative().max(1000000).optional(),
  currentNode: z.number().int().nonnegative().max(1000000).optional(),
  /* AUDIT-R1 — tutor teaching-state machine (Task 2.4). Previously
     these rode in on .passthrough() with zero validation AND were
     never persisted (the route ignored them entirely), so teaching
     progress silently reset on every reload. `.catch(...)` coerces a
     malformed value back to a safe default instead of failing the
     whole save with a 400 — a corrupted stage field shouldn't cost
     the user their conversation. */
  teachingStage: z.enum(['motivate', 'define', 'develop', 'illustrate', 'exercise', 'check'])
    .optional().catch(undefined),
  currentExampleIdx: z.number().int().nonnegative().max(100000).optional().catch(undefined),
  practiceAttempts: z.number().int().nonnegative().max(1000000).optional().catch(undefined),
  practicePhase: z.string().max(50).optional().catch(undefined),
  teachingPlan: z.unknown().optional().nullable(),
  boundariesHistory: z.array(z.unknown()).max(100).optional().catch(undefined),
  mistakeFilter: z.string().max(50).optional().catch(undefined),
  branchedFrom: z.object({}).passthrough().optional().nullable().catch(null),
}).passthrough();

/* M3 — pre-parse sanitizer: over-capacity payloads used to 400 the
 * entire save (sticky failure: every later save re-sent the same oversize
 * state and re-toasted). Truncate here so the schema max()s stay as a
 * backstop but never fire on real traffic. Budgets mirror the schema;
 * the AI summarizer (sessionCompressor) is the primary path for long
 * histories — this is the dumb fallback that guarantees a save lands. */
function clipStr(v: unknown, max: number): string | null | undefined {
  if (v == null) return v as null | undefined;
  const s = typeof v === 'string' ? v : String(v);
  return s.length > max ? s.slice(0, max) : s;
}

function clipArr<T>(v: unknown, max: number, keep: 'first' | 'last' = 'first'): T[] | undefined {
  if (!Array.isArray(v)) return undefined;
  if (v.length <= max) return v as T[];
  return (keep === 'last' ? v.slice(v.length - max) : v.slice(0, max)) as T[];
}

export function sanitizeSessionPayload(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const out: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  out.topic = clipStr(out.topic, 10000);
  out.title = clipStr(out.title, 10000);
  out.domain = out.domain == null ? out.domain : clipStr(out.domain, 10000);
  if (Array.isArray(out.messages)) {
    // Keep the most recent turns: the tail holds the live context.
    const msgs = clipArr<unknown>(out.messages, 1000, 'last') || [];
    out.messages = msgs.map((m: unknown) => {
      if (!m || typeof m !== 'object') return { role: 'user', rawText: '' };
      const c: Record<string, unknown> = { ...(m as Record<string, unknown>) };
      c.role = typeof c.role === 'string' && c.role ? c.role : 'user';
      c.rawText = clipStr(c.rawText, 200000);
      c.content = clipStr(c.content, 200000);
      c.html = clipStr(c.html, 500000);
      c.type = clipStr(c.type, 50);
      c.clientId = clipStr(c.clientId, 100);
      c.reasoningContent = clipStr(c.reasoningContent, 500000);
      if (c.sources !== undefined && c.sources !== null) {
        const s = clipArr(c.sources, 100) || [];
        c.sources = s;
      }
      if (Array.isArray(c.attachments)) {
        c.attachments = (clipArr<unknown>(c.attachments, 20) || []).map((a: unknown) => {
          if (!a || typeof a !== 'object') return { id: '', kind: 'file', name: 'file', mime: 'application/octet-stream', size: 0 };
          const x: Record<string, unknown> = { ...(a as Record<string, unknown>) };
          x.id = clipStr(x.id, 100) || '';
          x.kind = clipStr(x.kind, 50) || 'file';
          x.name = clipStr(x.name, 500) || 'file';
          x.mime = clipStr(x.mime, 200) || 'application/octet-stream';
          x.docKind = clipStr(x.docKind, 20);
          x.fileId = clipStr(x.fileId, 100);
          x.error = clipStr(x.error, 300);
          x.dataUrl = clipStr(x.dataUrl, 2_000_000);
          x.text = clipStr(x.text, 500_000);
          if (typeof x.size !== 'number' || !(x.size >= 0)) x.size = 0;
          else if (x.size > 50 * 1024 * 1024) x.size = 50 * 1024 * 1024;
          return x;
        });
      }
      if (Array.isArray(c.toolCalls)) {
        c.toolCalls = (clipArr<unknown>(c.toolCalls, 20) || []).map((t: unknown) => {
          if (!t || typeof t !== 'object') return { id: '', name: 'tool' };
          const x: Record<string, unknown> = { ...(t as Record<string, unknown>) };
          x.id = clipStr(x.id, 200) || '';
          x.name = clipStr(x.name, 100) || 'tool';
          x.output = clipStr(x.output, 500_000);
          x.argumentsText = clipStr(x.argumentsText, 500_000);
          x.stderr = clipStr(x.stderr, 500_000);
          x.errorText = clipStr(x.errorText, 100_000);
          x.userMessage = clipStr(x.userMessage, 500_000);
          /* detail must be a STRING per the schema — a structured value
             (e.g. the issue list planning tools return) used to sail
             through the sanitizer and then 400 the whole save. */
          if (x.detail != null && typeof x.detail !== 'string') {
            try { x.detail = JSON.stringify(x.detail); } catch { x.detail = null; }
          }
          x.detail = clipStr(x.detail, 100_000);
          x.progressPhase = clipStr(x.progressPhase, 200);
          x.executionId = clipStr(x.executionId, 200);
          x.runId = clipStr(x.runId, 200);
          x.status = clipStr(x.status, 60);
          if (Array.isArray(x.visualizations)) x.visualizations = x.visualizations.slice(0, 8);
          /* Loose truthy/falsy values (1, '1', 'yes') collapse to a
             boolean so z.boolean() never sees a non-boolean. */
          if (x.isError != null) x.isError = x.isError === true || x.isError === 'true' || x.isError === 1 || x.isError === '1';
          if (x.retryable != null) x.retryable = x.retryable === true || x.retryable === 'true' || x.retryable === 1 || x.retryable === '1';
          if (typeof x.durationMs === 'number') {
            x.durationMs = Math.min(Math.max(0, x.durationMs), 86_400_000);
          } else if (x.durationMs != null) x.durationMs = null;
          if (typeof x.textOffset === 'number') {
            x.textOffset = Math.min(Math.max(0, Math.trunc(x.textOffset)), 10_000_000);
          } else if (x.textOffset != null) x.textOffset = null;
          /* Nested collections are clipped BY FIELD, not just by array
             length — a single 20 KB `snippet` inside results[] used to
             blow past the 5 000-char schema bound and reject the entire
             session save with a 400. */
          if (Array.isArray(x.artifacts)) {
            x.artifacts = (clipArr<unknown>(x.artifacts, 20) || []).map((a: unknown) => {
              if (!a || typeof a !== 'object') return { id: '' };
              const y: Record<string, unknown> = { ...(a as Record<string, unknown>) };
              y.id = clipStr(y.id, 100) || '';
              y.mimeType = clipStr(y.mimeType, 200);
              y.name = clipStr(y.name, 500);
              return y;
            });
          }
          if (Array.isArray(x.results)) {
            x.results = (clipArr<unknown>(x.results, 20) || []).map((r: unknown) => {
              if (!r || typeof r !== 'object') return {};
              const y: Record<string, unknown> = { ...(r as Record<string, unknown>) };
              y.title = clipStr(y.title, 1000);
              y.url = clipStr(y.url, 3000);
              y.snippet = clipStr(y.snippet, 5000);
              y.date = clipStr(y.date, 200);
              y.source = clipStr(y.source, 100);
              y.matchedQuery = clipStr(y.matchedQuery, 1000);
              return y;
            });
          }
          if (Array.isArray(x.steps)) x.steps = clipArr(x.steps, 60);
          return x;
        });
      }
      return c;
    });
  }
  if (Array.isArray(out.kbNodes)) out.kbNodes = clipArr(out.kbNodes, 5000);
  if (Array.isArray(out.mistakes)) out.mistakes = clipArr(out.mistakes, 1000);
  if (Array.isArray(out.boundariesHistory)) out.boundariesHistory = clipArr(out.boundariesHistory, 100);
  if (typeof out.practicePhase === 'string' && out.practicePhase.length > 50) {
    out.practicePhase = out.practicePhase.slice(0, 50);
  }
  if (typeof out.mistakeFilter === 'string' && out.mistakeFilter.length > 50) {
    out.mistakeFilter = out.mistakeFilter.slice(0, 50);
  }
  return out;
}
