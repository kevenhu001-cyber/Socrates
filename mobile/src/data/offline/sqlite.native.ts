import * as SQLite from 'expo-sqlite';
import type { OutboxItem, Session } from '@socrates/contracts';

let database: SQLite.SQLiteDatabase | null = null;

function getDb() {
  if (database) return database;
  const db = SQLite.openDatabaseSync('socrates.db');
  db.execSync(`
  CREATE TABLE IF NOT EXISTS cached_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS cached_messages (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    client_id TEXT,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS drafts (
    session_id TEXT PRIMARY KEY NOT NULL,
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS canvas_edits (
    canvas_id TEXT PRIMARY KEY NOT NULL,
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);
  database = db;
  return db;
}

export function cacheSession(session: Session) {
  const db = getDb();
  const updatedAt = session.updatedAt || new Date().toISOString();
  db.runSync('INSERT OR REPLACE INTO cached_sessions (id, payload, updated_at) VALUES (?, ?, ?)', session.id, JSON.stringify(session), updatedAt);
  for (const message of session.messages || []) {
    const id = message.id || message.clientId;
    if (!id) continue;
    db.runSync('INSERT OR REPLACE INTO cached_messages (id, session_id, client_id, payload, created_at) VALUES (?, ?, ?, ?, ?)', id, session.id, message.clientId || null, JSON.stringify(message), message.createdAt || updatedAt);
  }
}

export function readCachedSessions() {
  const db = getDb();
  return db.getAllSync<{ payload: string }>('SELECT payload FROM cached_sessions ORDER BY updated_at DESC LIMIT 50').map((row) => JSON.parse(row.payload) as Session);
}

export function readCachedSession(id: string) {
  const db = getDb();
  const row = db.getFirstSync<{ payload: string }>('SELECT payload FROM cached_sessions WHERE id = ?', id);
  return row ? JSON.parse(row.payload) as Session : null;
}

export function saveDraft(sessionId: string, content: string) {
  const db = getDb();
  db.runSync('INSERT OR REPLACE INTO drafts (session_id, content, updated_at) VALUES (?, ?, ?)', sessionId, content, new Date().toISOString());
}

export function readDraft(sessionId: string) {
  const db = getDb();
  const row = db.getFirstSync<{ content: string }>('SELECT content FROM drafts WHERE session_id = ?', sessionId);
  return row?.content || '';
}

/** Canvas edits are local device state, matching the web client's editedText
 * state without overwriting the canonical assistant response on the API. */
export function saveCanvasEdit(canvasId: string, content: string) {
  const db = getDb();
  if (!content) {
    db.runSync('DELETE FROM canvas_edits WHERE canvas_id = ?', canvasId);
    return;
  }
  db.runSync(
    'INSERT OR REPLACE INTO canvas_edits (canvas_id, content, updated_at) VALUES (?, ?, ?)',
    canvasId,
    content,
    new Date().toISOString(),
  );
}

export function readCanvasEdit(canvasId: string) {
  const db = getDb();
  const row = db.getFirstSync<{ content: string }>('SELECT content FROM canvas_edits WHERE canvas_id = ?', canvasId);
  return row?.content || '';
}

export function enqueue(item: OutboxItem) {
  const db = getDb();
  db.runSync('INSERT OR REPLACE INTO outbox (id, session_id, client_id, operation, payload, retry_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', item.id, item.sessionId, item.clientId, item.operation, JSON.stringify(item.payload), item.retryCount, item.createdAt);
}

export function readOutbox() {
  const db = getDb();
  return db.getAllSync<OutboxItem & { payload: string }>('SELECT * FROM outbox ORDER BY created_at ASC').map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
}

export function removeOutbox(id: string) {
  const db = getDb();
  db.runSync('DELETE FROM outbox WHERE id = ?', id);
}

export function incrementOutboxRetry(id: string) {
  const db = getDb();
  db.runSync('UPDATE outbox SET retry_count = retry_count + 1 WHERE id = ?', id);
}
