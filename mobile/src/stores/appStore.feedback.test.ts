import { appStore } from './appStore';
import { messagesApi } from '../data/api/client';
import { sessionRepository } from '../data/repositories/sessionRepository';
import type { Session } from '@socrates/contracts';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const setState = (patch: object) =>
  (appStore as never as { setState: (p: object) => void }).setState(patch);

function sessionWith(feedback?: 'up' | 'down' | null): Session {
  return {
    id: 's-1',
    topic: 'Entropy',
    mode: 'chat',
    updatedAt: '2026-09-01T10:00:00.000Z',
    messages: [
      { id: 'u1', role: 'user', content: 'Explain entropy' },
      { id: 'm1', role: 'assistant', content: 'A measure of disorder.', feedback },
    ],
  };
}

describe('appStore.sendMessageFeedback', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    setState({ activeSession: sessionWith(), sessions: [sessionWith()], isIncognito: false });
    jest.spyOn(messagesApi, 'feedback').mockResolvedValue(undefined as never);
    jest.spyOn(sessionRepository, 'save').mockImplementation(async (session) => session as never);
  });

  it('persists the rating on the message and still calls the API', async () => {
    await appStore.sendMessageFeedback('m1', 'up');
    const snap = appStore.getSnapshot();
    expect(snap.activeSession?.messages?.[1].feedback).toBe('up');
    expect(snap.sessions[0].messages?.[1].feedback).toBe('up');
    expect(sessionRepository.save).toHaveBeenCalled();
    expect(messagesApi.feedback).toHaveBeenCalledWith('m1', 'up', undefined, 's-1');
  });

  it('does not bump updatedAt — a rating must not re-sort drawer recents', async () => {
    await appStore.sendMessageFeedback('m1', 'down');
    expect(appStore.getSnapshot().activeSession?.updatedAt).toBe('2026-09-01T10:00:00.000Z');
    expect(appStore.getSnapshot().sessions[0].updatedAt).toBe('2026-09-01T10:00:00.000Z');
  });

  it('toggling the same rating clears it to null', async () => {
    await appStore.sendMessageFeedback('m1', 'up');
    await appStore.sendMessageFeedback('m1', 'none');
    expect(appStore.getSnapshot().activeSession?.messages?.[1].feedback).toBeNull();
    expect(messagesApi.feedback).toHaveBeenLastCalledWith('m1', 'none', undefined, 's-1');
  });

  it('updates the message in incognito but skips persistence and the API', async () => {
    setState({ isIncognito: true });
    await appStore.sendMessageFeedback('m1', 'up');
    expect(appStore.getSnapshot().activeSession?.messages?.[1].feedback).toBe('up');
    expect(sessionRepository.save).not.toHaveBeenCalled();
    expect(messagesApi.feedback).not.toHaveBeenCalled();
  });
});
