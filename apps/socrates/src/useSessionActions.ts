import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Session } from '@socrates/contracts';
import { useAuthStore } from '@socrates/auth';
import { isLocalSessionId, useChatStore } from '@socrates/chat';
import { buildTeachingPlanFromKB, syncCurrentNodeFromTeachingPlan, type TutorProgressNode } from '@socrates/ui';
import { api } from './runtime';
import { appStringsNow } from './strings';

interface EpochRef {
  current: number;
}

interface LoadingDetailsRef {
  current: Set<string>;
}

interface UseSessionActionsOptions {
  accountEpoch: EpochRef;
  archived: Session[];
  compact: boolean;
  loadingDetails: LoadingDetailsRef;
  projectFilter: string | null;
  onReturnToChat: () => void;
  setArchived: Dispatch<SetStateAction<Session[]>>;
  setConfirmDelete: Dispatch<SetStateAction<boolean>>;
  setProjectFilter: Dispatch<SetStateAction<string | null>>;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
}

/** Rebuild saved Tutor ordering before a lazy detail enters the chat store. */
function normalizeRestoredTutorSession(session: Session): Session {
  if (session.mode !== 'tutor' || !Array.isArray(session.kbNodes) || session.kbNodes.length === 0) return session;
  const nodes = session.kbNodes as unknown as TutorProgressNode[];
  const plan = buildTeachingPlanFromKB(nodes);
  const synced = plan ? syncCurrentNodeFromTeachingPlan(plan, nodes) : null;
  return {
    ...session,
    teachingPlan: (synced?.teachingPlan ?? plan ?? session.teachingPlan) as Session['teachingPlan'],
    currentNode: synced?.currentNode ?? session.currentNode ?? 0,
    substantiveCount: 0,
    practicePhase: session.practicePhase || 'foundation',
    practiceAttempts: session.practiceAttempts || 0,
  };
}

/** Own selection and recents mutations, including their server/local split. */
export function useSessionActions({
  accountEpoch,
  archived,
  compact,
  loadingDetails,
  projectFilter,
  onReturnToChat,
  setArchived,
  setConfirmDelete,
  setProjectFilter,
  setSidebarOpen,
}: UseSessionActionsOptions) {
  const select = useCallback((id: string) => {
    const store = useChatStore.getState();
    store.selectSession(id);
    if (compact) setSidebarOpen(false);
    // Lazy detail: list rows carry no messages; fetch once for server ids.
    const session = store.sessions.find((row) => row.id === id);
    const owner = useAuthStore.getState().user;
    if (session && !(session.messages?.length) && !isLocalSessionId(id) && owner && !owner.isGuest) {
      const epoch = accountEpoch.current;
      loadingDetails.current.add(id);
      void api.sessions.get(id).then((detail) => {
        if (epoch !== accountEpoch.current) return;
        const current = useChatStore.getState();
        if (current.turnSessionId === id || current.sessions.find((row) => row.id === id)?.messages?.length) return;
        current.patchSession(id, normalizeRestoredTutorSession({ ...detail, messages: detail.messages ?? [] }));
      }).catch((error) => {
        if (epoch === accountEpoch.current) {
          useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().couldNotLoadConversation);
        }
      }).finally(() => {
        if (epoch === accountEpoch.current) loadingDetails.current.delete(id);
      });
    }
  }, [accountEpoch, compact, loadingDetails, setSidebarOpen]);

  const createSession = useCallback(() => {
    const id = `session-${Date.now()}`;
    const store = useChatStore.getState();
    const draftSession: Session = { id, title: 'New chat', topic: '', mode: 'chat', phase: 'chat', messages: [] };
    if (projectFilter) draftSession.projectId = projectFilter;
    store.setSessions([draftSession, ...store.sessions]);
    select(id);
  }, [projectFilter, select]);

  const archiveSession = useCallback(async (id: string) => {
    const epoch = accountEpoch.current;
    const owner = useAuthStore.getState().user;
    try {
      if (useChatStore.getState().turnSessionId === id) throw new Error(appStringsNow().stopBeforeArchive);
      if (!isLocalSessionId(id) && owner && !owner.isGuest) await api.sessions.archive(id);
      if (epoch !== accountEpoch.current) return;
      const row = useChatStore.getState().sessions.find((session) => session.id === id);
      useChatStore.getState().archiveSession(id, projectFilter);
      if (row) setArchived((previous) => previous.some((session) => session.id === id)
        ? previous
        : [{ ...row, archivedAt: new Date().toISOString() }, ...previous]);
    } catch (error) {
      if (epoch === accountEpoch.current) {
        useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().archiveFailed);
      }
    }
  }, [accountEpoch, projectFilter, setArchived]);

  const unarchiveSession = useCallback(async (id: string) => {
    const epoch = accountEpoch.current;
    const owner = useAuthStore.getState().user;
    try {
      const row = archived.find((session) => session.id === id) || useChatStore.getState().sessions.find((session) => session.id === id) || null;
      if (!isLocalSessionId(id) && owner && !owner.isGuest) await api.sessions.unarchive(id);
      if (epoch !== accountEpoch.current) return;
      useChatStore.getState().unarchiveSession(id, row || undefined);
      setArchived((previous) => previous.filter((session) => session.id !== id));
      select(id);
    } catch (error) {
      if (epoch === accountEpoch.current) {
        useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().restoreFailed);
      }
    }
  }, [accountEpoch, archived, select, setArchived]);

  const deleteSession = useCallback(async (id: string) => {
    const epoch = accountEpoch.current;
    const owner = useAuthStore.getState().user;
    try {
      if (useChatStore.getState().turnSessionId === id) throw new Error(appStringsNow().stopBeforeDelete);
      if (!isLocalSessionId(id) && owner && !owner.isGuest) await api.sessions.remove(id);
      if (epoch !== accountEpoch.current) return;
      useChatStore.getState().deleteSession(id, projectFilter);
      setArchived((previous) => previous.filter((session) => session.id !== id));
    } catch (error) {
      if (epoch === accountEpoch.current) {
        useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().deleteFailed);
      }
    } finally {
      if (epoch === accountEpoch.current) setConfirmDelete(false);
    }
  }, [accountEpoch, projectFilter, setArchived, setConfirmDelete]);

  const moveSessionToProject = useCallback(async (sessionId: string, targetId: string | null) => {
    const epoch = accountEpoch.current;
    const owner = useAuthStore.getState().user;
    if (!isLocalSessionId(sessionId) && owner && !owner.isGuest) {
      await api.sessions.patch(sessionId, { projectId: targetId });
    }
    if (epoch !== accountEpoch.current) return;
    useChatStore.getState().patchSession(sessionId, { projectId: targetId });
    const next = useChatStore.getState().selectProject(projectFilter);
    if (next) select(next);
  }, [accountEpoch, projectFilter, select]);

  const selectProject = useCallback((id: string | null) => {
    setProjectFilter(id);
    const next = useChatStore.getState().selectProject(id);
    if (next) select(next);
  }, [select, setProjectFilter]);

  const openSearchSession = useCallback(async (id: string) => {
    const epoch = accountEpoch.current;
    try {
      const store = useChatStore.getState();
      if (!store.sessions.some((session) => session.id === id)) {
        const owner = useAuthStore.getState().user;
        if (!owner || owner.isGuest) throw new Error(appStringsNow().signInToOpen);
        const detail = await api.sessions.get(id);
        if (epoch !== accountEpoch.current) return;
        const current = useChatStore.getState();
        if (!current.sessions.some((session) => session.id === id)) {
          current.setSessions([normalizeRestoredTutorSession(detail), ...current.sessions]);
        }
      }
      if (epoch !== accountEpoch.current) return;
      onReturnToChat();
      select(id);
    } catch (error) {
      if (epoch === accountEpoch.current) {
        useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().couldNotOpenConversation);
      }
    }
  }, [accountEpoch, onReturnToChat, select]);

  return {
    select,
    createSession,
    archiveSession,
    unarchiveSession,
    deleteSession,
    moveSessionToProject,
    selectProject,
    openSearchSession,
  };
}
