import type { Message, Session } from '@socrates/contracts';

type CachedRow = { payload: string; updated_at: string };
const durableSqliteRows = new Map<string, CachedRow>();
const sqliteDatabase = {
  execSync: jest.fn((_sql: string) => undefined),
  runSync: jest.fn((sql: string, ...parameters: unknown[]) => {
    if (sql.startsWith('INSERT OR REPLACE INTO cached_sessions')) {
      const [id, payload, updatedAt] = parameters as [string, string, string];
      durableSqliteRows.set(id, { payload, updated_at: updatedAt });
    }
  }),
  getFirstSync: jest.fn(<T>(sql: string, ...parameters: unknown[]) => {
    if (sql.includes('FROM cached_sessions')) {
      return (durableSqliteRows.get(String(parameters[0])) || null) as T | null;
    }
    return null;
  }),
  getAllSync: jest.fn(<T>(sql: string) => {
    if (sql.includes('FROM cached_sessions')) {
      return [...durableSqliteRows.values()].map((row) => ({ payload: row.payload })) as T[];
    }
    return [] as T[];
  }),
};

let remoteSession: Session | null = null;

function installRepositoryModules() {
  jest.doMock('../offline/sqlite', () => jest.requireActual('../offline/sqlite.native'));
  jest.doMock('expo-sqlite', () => ({ openDatabaseSync: jest.fn(() => sqliteDatabase) }));
  jest.doMock('../api/client', () => ({
    sessionsApi: {
      list: jest.fn(async () => ({
        sessions: remoteSession
          ? [{ id: remoteSession.id, topic: remoteSession.topic, mode: remoteSession.mode, updatedAt: remoteSession.updatedAt }]
          : [],
      })),
      get: jest.fn(async () => remoteSession),
      upsert: jest.fn(async (payload: Session) => {
        // Mirror the existing server schema: stopped is absent from the nested
        // message schema and the database column mapping.
        const messages = (payload.messages || []).map((message) => {
          const { stopped: _stopped, ...serverMessage } = message as Message & { stopped?: boolean };
          return serverMessage as Message;
        });
        remoteSession = { ...payload, messages };
        const { messages: _messages, ...savedSession } = remoteSession;
        return savedSession as Session;
      }),
    },
  }));
}

describe('sessionRepository local terminal-state persistence', () => {
  beforeEach(() => {
    durableSqliteRows.clear();
    remoteSession = null;
    jest.resetModules();
    installRepositoryModules();
  });

  it('survives a process-style module reload, remote list refresh, and remote detail rehydrate', async () => {
    const sessionId = 'stopped-session';
    const user = { clientId: 'user-1', role: 'user', type: 'user', rawText: 'Question', content: 'Question' } as Message;
    const stopped = {
      clientId: 'assistant-1', role: 'assistant', type: 'assistant', rawText: 'Partial answer', content: 'Partial answer', stopped: true,
    } as Message & { stopped: boolean };
    const session = {
      id: sessionId, mode: 'chat', topic: 'Stop persistence', updatedAt: '2026-10-05T00:00:00.000Z', messages: [user, stopped],
    } as unknown as Session;

    const firstProcess = require('./sessionRepository').sessionRepository;
    await firstProcess.save(session, [user, stopped]);
    const savedRow = JSON.parse(durableSqliteRows.get(sessionId)?.payload || '{}') as Session;
    expect((savedRow.messages?.[1] as Message & { stopped?: boolean }).stopped).toBe(true);

    // Re-import the actual native adapter and repository. Only the simulated
    // SQLite file and server row survive this process-style restart.
    jest.resetModules();
    installRepositoryModules();
    const restartedProcess = require('./sessionRepository').sessionRepository;
    await restartedProcess.list();
    const loaded = await restartedProcess.get(sessionId) as (Session & { messages: Array<Message & { stopped?: boolean }> }) | null;

    expect(loaded?.messages.find((message) => message.clientId === 'assistant-1')).toMatchObject({
      rawText: 'Partial answer',
      type: 'assistant',
      stopped: true,
    });
  });
});
