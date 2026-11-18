import { and, count, desc, eq, exists, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type {
  SessionDetailDto,
  SessionListDto,
  SessionMessageCursor,
  SessionMessageDto,
  SessionMessagePageDto,
} from '@socrates/contracts';
import type { Database } from '../../db/index.js';
import { messages, sessions, sessionTags, tags } from '../../db/schema/index.js';
import { BadRequest } from '../../lib/errors.js';
import { requireOwnedSession } from '../../lib/sessionOwnership.js';
import { isUuid } from '../../lib/validate.js';

export function sessionReadLimit(raw: unknown, fallback: number): number {
  const parsed = typeof raw === 'string' ? parseInt(raw, 10) : NaN;
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : fallback, 1), 200);
}

interface SessionListCursor {
  updatedAt: string;
  id?: string;
}

const CURSOR_PREFIX = 'v2:';

export function parseSessionListCursor(raw: unknown): SessionListCursor | null {
  if (raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') throw new BadRequest('Invalid session cursor');
  if (raw.startsWith(CURSOR_PREFIX)) {
    const [updatedAt, id, extra] = raw.slice(CURSOR_PREFIX.length).split('|');
    if (extra !== undefined || !isUuid(id) || Number.isNaN(Date.parse(updatedAt))) {
      throw new BadRequest('Invalid session cursor');
    }
    return { updatedAt, id };
  }
  if (Number.isNaN(Date.parse(raw))) throw new BadRequest('Invalid session cursor');
  return { updatedAt: raw };
}

async function readSessionTags(db: Database, userId: string, ids: string[]) {
  const result = new Map<string, string[]>();
  if (!ids.length) return result;
  const rows = await db
    .select({ sessionId: sessionTags.sessionId, name: tags.name })
    .from(sessionTags)
    .innerJoin(tags, eq(tags.id, sessionTags.tagId))
    .where(and(eq(tags.userId, userId), inArray(sessionTags.sessionId, ids)));
  for (const row of rows) {
    const names = result.get(row.sessionId);
    if (names) names.push(row.name);
    else result.set(row.sessionId, [row.name]);
  }
  return result;
}

function preciseTimestamp(column: typeof sessions.updatedAt | typeof messages.createdAt) {
  return sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

export async function readSessionList(
  db: Database,
  userId: string,
  options: {
    limit: number;
    archived: boolean;
    cursor: SessionListCursor | null;
    versionedCursor: boolean;
  },
): Promise<SessionListDto> {
  const { limit, archived, cursor, versionedCursor } = options;
  const conditions = [eq(sessions.userId, userId)];
  if (!archived) conditions.push(isNull(sessions.archivedAt));
  if (cursor?.id) {
    conditions.push(
      sql`(${sessions.updatedAt}, ${sessions.id}) < (${cursor.updatedAt}::timestamptz, ${cursor.id}::uuid)`,
    );
  } else if (cursor) {
    conditions.push(sql`${sessions.updatedAt} < ${cursor.updatedAt}::timestamptz`);
  }

  const rows = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      topic: sessions.topic,
      mode: sessions.mode,
      phase: sessions.phase,
      kind: sessions.kind,
      domain: sessions.domain,
      projectId: sessions.projectId,
      pinned: sessions.pinned,
      archivedAt: sessions.archivedAt,
      preview: sessions.preview,
      totalQ: sessions.totalQ,
      currentNode: sessions.currentNode,
      branchedFrom: sessions.branchedFrom,
      updatedAt: sessions.updatedAt,
      createdAt: sessions.createdAt,
      cursorAt: preciseTimestamp(sessions.updatedAt),
    })
    .from(sessions)
    .where(and(...conditions))
    .orderBy(desc(sessions.updatedAt), desc(sessions.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = rows.length > limit ? page.at(-1) : undefined;
  const names = await readSessionTags(
    db,
    userId,
    page.map((row) => row.id),
  );
  return {
    sessions: page.map(({ cursorAt: _cursorAt, ...row }) => ({
      ...row,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      tags: names.get(row.id) ?? [],
    })),
    nextCursor: last
      ? versionedCursor || cursor?.id
        ? `${CURSOR_PREFIX}${last.cursorAt}|${last.id}`
        : last.updatedAt.toISOString()
      : null,
  };
}

/** Read metadata and HTML without returning the duplicate stored content column. */
const messageDetailColumns = {
  id: messages.id,
  sessionId: messages.sessionId,
  role: messages.role,
  rawText: messages.rawText,
  html: messages.html,
  type: messages.type,
  sources: messages.sources,
  parentId: messages.parentId,
  model: messages.model,
  tokenCount: messages.tokenCount,
  clientId: messages.clientId,
  reasoningContent: messages.reasoningContent,
  /* the model's retrospective, so a reloaded session
     shows the same Summary sheet the live turn produced. */
  summary: messages.summary,
  turnRuntime: messages.turnRuntime,
  attachments: messages.attachments,
  toolCalls: messages.toolCalls,
  agentRunId: messages.agentRunId,
  editedAt: messages.editedAt,
  createdAt: messages.createdAt,
};

function messageDto(
  row: Pick<typeof messages.$inferSelect, keyof typeof messageDetailColumns>,
): SessionMessageDto {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}

function messageSlice(
  db: Database,
  sessionId: string,
  limit: number,
  cursor: SessionMessageCursor | null,
  ownership?: SQL,
) {
  const conditions = [eq(messages.sessionId, sessionId)];
  if (cursor) {
    conditions.push(
      sql`(${messages.createdAt}, ${messages.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`,
    );
  }
  return db
    .select({
      ...messageDetailColumns,
      cursorAt: preciseTimestamp(messages.createdAt).as('cursor_at'),
    })
    .from(messages)
    .where(and(...conditions, ownership))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit + 1);
}

function formatMessagePage(
  rows: Array<Parameters<typeof messageDto>[0] & { cursorAt: string }>,
  limit: number,
): SessionMessagePageDto {
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  const oldest = page[0];
  return {
    messages: page.map(({ cursorAt: _cursorAt, ...row }) => messageDto(row)),
    hasMore,
    cursor: hasMore && oldest ? { createdAt: oldest.cursorAt, id: oldest.id } : null,
  };
}

export async function readSessionMessagePage(
  db: Database,
  sessionId: string,
  userId: string,
  limit: number,
  cursor: SessionMessageCursor | null,
): Promise<SessionMessagePageDto> {
  const owned = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  const rows = await messageSlice(db, sessionId, limit, cursor, exists(owned));
  // An empty page may come from an owned, empty transcript or an inaccessible session.
  if (!rows.length) await requireOwnedSession(db, sessionId, userId);
  return formatMessagePage(rows, limit);
}

export async function readSessionDetail(
  db: Database,
  session: typeof sessions.$inferSelect,
  tailLimit: number | null,
): Promise<SessionDetailDto> {
  if (tailLimit === null) {
    const rows = await db
      .select(messageDetailColumns)
      .from(messages)
      .where(eq(messages.sessionId, session.id))
      .orderBy(messages.createdAt);
    return { ...session, messages: rows.map(messageDto) };
  }

  const [rows, [total]] = await Promise.all([
    messageSlice(db, session.id, tailLimit, null),
    db.select({ value: count() }).from(messages).where(eq(messages.sessionId, session.id)),
  ]);
  const { messages: pageMessages, ...page } = formatMessagePage(rows, tailLimit);
  return {
    ...session,
    messages: pageMessages,
    messagesPage: { ...page, total: total?.value ?? pageMessages.length },
  };
}
