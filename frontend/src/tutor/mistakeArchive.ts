/**
 * RN-14 — the mistake book across sessions.
 *
 * A session's `mistakes` array is the book's source of truth, but it only
 * lives in the session that is open. To show every session's mistakes (and
 * to give the home page's "mistakes into next questions" a full book), each
 * session's array is mirrored here, keyed by session id, whenever the
 * session is saved or opened. localStorage keeps it across reloads.
 *
 * Sessions this device has not opened since are filled in from the server
 * mirror (`GET /api/mistakes`, which every recorded mistake is also posted
 * to). Those rows carry no options or analysis, so a session the archive
 * knows always wins over its server rows, even when its book is now empty
 * (every mistake conquered).
 */
import type { MistakeStateEntry } from '../state/kb.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { MISTAKE_ARCHIVE_BASE, learnerStorageKey } from './learnerStorage.ts';

const SESSION_LIMIT = 200;
const PER_SESSION_LIMIT = 200;

interface ArchivedSession {
  label: string;
  at: number;
  mistakes: MistakeStateEntry[];
}

interface ArchiveShape {
  v: 1;
  sessions: Record<string, ArchivedSession>;
}

/** One session's mirrored book (the shape `mergeSessionMistakes` in packages/ui/src/study takes). */
export interface SessionMistakesInput<T> {
  sessionId: string;
  label?: string | null;
  mistakes: readonly T[];
}

export interface ServerMistakeRow {
  id?: unknown;
  sessionId?: unknown;
  nodeName?: unknown;
  questionContent?: unknown;
  userAnswer?: unknown;
  correctAnswer?: unknown;
  source?: unknown;
  isResolved?: unknown;
  collectedAt?: unknown;
}

let archive: ArchiveShape | null = null;
/** The storage key `archive` was read from; a different signed-in user re-reads. */
let archiveKey = '';
let serverRows: SessionMistakesInput<MistakeStateEntry>[] = [];
let serverLoaded = false;
let serverInflight: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emptyArchive(): ArchiveShape {
  return { v: 1, sessions: {} };
}

function readStored(key: string): ArchiveShape {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) as Partial<ArchiveShape> : null;
    if (!parsed || typeof parsed.sessions !== 'object' || !parsed.sessions) return emptyArchive();
    const sessions: Record<string, ArchivedSession> = {};
    for (const [id, value] of Object.entries(parsed.sessions)) {
      if (!value || typeof value !== 'object' || !Array.isArray((value as ArchivedSession).mistakes)) continue;
      const entry = value as ArchivedSession;
      sessions[id] = {
        label: typeof entry.label === 'string' ? entry.label : '',
        at: typeof entry.at === 'number' ? entry.at : 0,
        mistakes: entry.mistakes.filter((item) => item && typeof item.id === 'string'),
      };
    }
    return { v: 1, sessions };
  } catch (_) {
    return emptyArchive();
  }
}

function current(): ArchiveShape {
  const key = learnerStorageKey(MISTAKE_ARCHIVE_BASE);
  if (!archive || key !== archiveKey) {
    if (archive && key !== archiveKey) {
      /* Another account: the server rows belonged to the previous one. */
      serverRows = [];
      serverLoaded = false;
    }
    archiveKey = key;
    archive = readStored(key);
  }
  return archive;
}

function notify(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

function persist(next: ArchiveShape): void {
  archive = next;
  try { localStorage.setItem(archiveKey, JSON.stringify(next)); }
  catch (error) { reportSwallow(error, 'tutor/mistakeArchive.persist', 'expected'); }
  notify();
}

function sameMistakes(a: readonly MistakeStateEntry[], b: readonly MistakeStateEntry[]): boolean {
  return a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Mirror one session's book. An empty book is kept too: it tells the
 * merge that this session's server rows are stale (all conquered).
 */
export function archiveSessionMistakes(sessionId: string | null | undefined, label: string | null | undefined, mistakes: unknown): void {
  if (!sessionId || typeof sessionId !== 'string') return;
  const list = (Array.isArray(mistakes) ? mistakes : [])
    .filter((item): item is MistakeStateEntry => Boolean(item) && typeof (item as MistakeStateEntry).id === 'string')
    .slice(0, PER_SESSION_LIMIT);
  const state = current();
  const before = state.sessions[sessionId];
  const nextLabel = typeof label === 'string' ? label.trim() : '';
  if (before && before.label === nextLabel && sameMistakes(before.mistakes, list)) return;
  const sessions = { ...state.sessions, [sessionId]: { label: nextLabel, at: Date.now(), mistakes: list } };
  const ids = Object.keys(sessions);
  if (ids.length > SESSION_LIMIT) {
    ids.sort((a, b) => sessions[a].at - sessions[b].at);
    for (const stale of ids.slice(0, ids.length - SESSION_LIMIT)) delete sessions[stale];
  }
  persist({ v: 1, sessions });
}

/** A deleted session leaves the book with it. */
export function forgetArchivedSession(sessionId: string | null | undefined): void {
  if (!sessionId) return;
  const state = current();
  const hadServerRows = serverRows.some((row) => row.sessionId === sessionId);
  serverRows = serverRows.filter((row) => row.sessionId !== sessionId);
  if (!state.sessions[sessionId]) {
    if (hadServerRows) notify();
    return;
  }
  const sessions = { ...state.sessions };
  delete sessions[sessionId];
  persist({ v: 1, sessions });
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Server mirror rows → per-session books. Rows without a session cannot be redone, so they are left out. Exported for tests. */
export function serverRowsToSessions(items: readonly ServerMistakeRow[], labels: Record<string, string> = {}): SessionMistakesInput<MistakeStateEntry>[] {
  const bySession = new Map<string, MistakeStateEntry[]>();
  for (const item of items) {
    const sessionId = text(item?.sessionId);
    const question = text(item?.questionContent);
    const id = text(item?.id);
    if (!sessionId || !question || !id) continue;
    const at = typeof item.collectedAt === 'string' ? Date.parse(item.collectedAt) : NaN;
    const entry: MistakeStateEntry = {
      id: `srv:${id}`,
      type: item.source === 'practice' ? 'practice' : 'quiz',
      topic: '',
      node: text(item.nodeName) ?? undefined,
      q: question,
      options: [],
      correct: text(item.correctAnswer),
      userAnswer: text(item.userAnswer),
      timestamp: Number.isFinite(at) ? at : 0,
      resolved: item.isResolved === true,
    };
    const list = bySession.get(sessionId);
    if (list) list.push(entry);
    else bySession.set(sessionId, [entry]);
  }
  return [...bySession.entries()].map(([sessionId, mistakes]) => ({ sessionId, label: labels[sessionId] || '', mistakes }));
}

/**
 * Fetch the server mirror once per page (and again after `resetMistakeArchive`).
 * `labels` maps session ids to their titles for entries without a topic.
 */
export function loadServerMistakes(
  fetchList: () => Promise<{ items?: ServerMistakeRow[] } | null | undefined>,
  labels: () => Record<string, string>,
): Promise<void> {
  current();
  if (serverLoaded) return Promise.resolve();
  if (serverInflight) return serverInflight;
  serverInflight = fetchList()
    .then((response) => {
      serverLoaded = true;
      serverRows = serverRowsToSessions(Array.isArray(response?.items) ? response.items : [], labels());
      if (serverRows.length) notify();
    })
    .catch((error) => { reportSwallow(error, 'tutor/mistakeArchive.loadServer', 'expected'); })
    .finally(() => { serverInflight = null; });
  return serverInflight;
}

/**
 * Every other session's book: the archive first, then server rows for the
 * sessions the archive does not know. The open session's live entries are
 * merged in by the panel (`mergeSessionMistakes`), which also skips the
 * open session's archived copy.
 */
export function otherSessionMistakes(): SessionMistakesInput<MistakeStateEntry>[] {
  const state = current();
  const archived = Object.entries(state.sessions)
    .map(([sessionId, entry]) => ({ sessionId, label: entry.label, mistakes: entry.mistakes }));
  const known = new Set(Object.keys(state.sessions));
  return [...archived, ...serverRows.filter((row) => !known.has(row.sessionId))];
}

/** The archived entry for `id` (any session), for redo / next-question across sessions. */
export function findArchivedMistake(id: string): (MistakeStateEntry & { sessionId: string }) | null {
  for (const [sessionId, entry] of Object.entries(current().sessions)) {
    const found = entry.mistakes.find((item) => item.id === id);
    if (found) return { ...found, sessionId };
  }
  for (const row of serverRows) {
    const found = row.mistakes.find((item) => item.id === id);
    if (found) return { ...found, sessionId: row.sessionId };
  }
  return null;
}

export function getMistakeArchiveVersion(): number {
  return version;
}

export function subscribeMistakeArchive(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Account boundary / test seam: drop the in-memory copies (storage is cleared by the caller). */
export function resetMistakeArchive(): void {
  archive = null;
  archiveKey = '';
  serverRows = [];
  serverLoaded = false;
  serverInflight = null;
  notify();
}
