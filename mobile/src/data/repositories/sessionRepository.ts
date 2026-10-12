import type { Message, Session } from '@socrates/contracts';
import { sessionsApi } from '../api/client';
import { cacheSession, readCachedSession, readCachedSessions } from '../offline/sqlite';

type StoppedMessage = Message & { stopped?: boolean };

function stableMessageKey(message: Message) {
  if (message.clientId) return `client:${message.clientId}`;
  if (message.id) return `id:${message.id}`;
  return null;
}

function comparableRawText(value: string | null | undefined) {
  return typeof value === 'string'
    ? value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim()
    : '';
}

/**
 * The backend's established Message schema intentionally has no `stopped`
 * field. Keep that local-only UI state in the device cache and reapply it only
 * when the fetched assistant row still has the same stable ID and text.
 */
function restoreLocalStoppedState(remote: Session, cached: Session | null, preserveCachedMessagesWhenMissing = false): Session {
  const cachedMessages = cached?.messages || [];
  const remoteMessages = remote.messages;
  if (!Array.isArray(remoteMessages)) {
    return preserveCachedMessagesWhenMissing && cachedMessages.length
      ? { ...remote, messages: cachedMessages }
      : remote;
  }
  if (preserveCachedMessagesWhenMissing && remoteMessages.length === 0 && cachedMessages.length) {
    return { ...remote, messages: cachedMessages };
  }
  if (!cachedMessages.length) return remote;

  const stoppedByKey = new Map<string, StoppedMessage>();
  for (const message of cachedMessages) {
    const key = stableMessageKey(message);
    if (message.role === 'assistant' && (message as StoppedMessage).stopped === true && key) {
      stoppedByKey.set(key, message as StoppedMessage);
    }
  }
  if (!stoppedByKey.size) return remote;

  const messages = remoteMessages.map((message) => {
    if (message.role !== 'assistant') return message;
    const key = stableMessageKey(message);
    const cachedMessage = key ? stoppedByKey.get(key) : undefined;
    if (!cachedMessage || comparableRawText(message.rawText) !== comparableRawText(cachedMessage.rawText)) {
      return message;
    }
    return { ...message, stopped: true } as StoppedMessage;
  });
  return { ...remote, messages };
}

export const sessionRepository = {
  async list() {
    try {
      const result = await sessionsApi.list();
      result.sessions.forEach((session) => {
        const cached = readCachedSession(session.id);
        cacheSession(restoreLocalStoppedState(session, cached, true));
      });
      return result.sessions;
    } catch {
      return readCachedSessions();
    }
  },
  async get(id: string) {
    try {
      const session = await sessionsApi.get(id);
      const restored = restoreLocalStoppedState(session, readCachedSession(id));
      cacheSession(restored);
      return restored;
    } catch {
      return readCachedSession(id);
    }
  },
  async save(session: Session, messages: Message[]) {
    const saved = await sessionsApi.upsert({ ...session, messages });
    cacheSession({ ...saved, messages });
    return saved;
  },
};
