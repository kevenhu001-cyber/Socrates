import type { Message, Session } from '@socrates/contracts';
import { sessionsApi } from '../api/client';
import { cacheSession, readCachedSession, readCachedSessions } from '../offline/sqlite';

export const sessionRepository = {
  async list() {
    try {
      const result = await sessionsApi.list();
      result.sessions.forEach(cacheSession);
      return result.sessions;
    } catch {
      return readCachedSessions();
    }
  },
  async get(id: string) {
    try {
      const session = await sessionsApi.get(id);
      cacheSession(session);
      return session;
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
