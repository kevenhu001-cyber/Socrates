/**
 * RN-14 — every session's mistakes, not only the open one's. The one source
 * the mistake book panel lists and the sidebar's mistakes badge counts, so
 * the two never disagree.
 *
 * The open session's entries come live from the KB store; the rest from the
 * cross-session archive (and, for sessions this device has not opened, the
 * server mirror, fetched once per page when signed in).
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { mergeSessionMistakes, type SessionMistake } from '@socrates/ui/study-model';
import { useKbStore } from '../../store/index.ts';
import { getMistakeArchiveVersion, loadServerMistakes, otherSessionMistakes, subscribeMistakeArchive } from '../../tutor/mistakeArchive.ts';
import { useCurrentSessionId, useSessions } from '../session-list/sessionList.store.ts';
import { apiFetch } from '../../util/api.ts';
import type { MistakeStateEntry } from '../../state/kb.ts';
import { getCurrentUser } from '../legacy/gateway';

export function useAllSessionMistakes(): SessionMistake<MistakeStateEntry>[] {
  const mine = useKbStore((snapshot) => snapshot.mistakes);
  const sessionId = useCurrentSessionId();
  const sessions = useSessions();
  const archiveVersion = useSyncExternalStore(subscribeMistakeArchive, getMistakeArchiveVersion);
  useEffect(() => {
    /* The server mirror needs a signed-in user (a guest's 401 would trip the auth-expired flow). */
    if (!getCurrentUser()) return;
    const labels = (): Record<string, string> => Object.fromEntries(sessions.map((row) => [row.id, row.title || '']));
    void loadServerMistakes(() => apiFetch<{ items?: [] }>('/api/mistakes?limit=200'), labels);
  }, [sessions]);
  return useMemo(
    () => mergeSessionMistakes(mine as MistakeStateEntry[], sessionId, otherSessionMistakes()),
    // archiveVersion: the archive changed; otherSessionMistakes() reads it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mine, sessionId, archiveVersion],
  );
}
