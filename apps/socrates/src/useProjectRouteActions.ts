import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Session } from '@socrates/contracts';
import type { AppScreen } from './appNavigation';
import { appStringsNow } from './strings';

interface UseProjectRouteActionsOptions {
  sessions: Session[];
  movePickSession: string | null;
  moveSessionToProject(sessionId: string, targetId: string | null): Promise<void>;
  selectProject(id: string | null): void;
  setMovePickSession: Dispatch<SetStateAction<string | null>>;
  setScreen: Dispatch<SetStateAction<AppScreen>>;
  reportError(message: string | null): void;
}

/** Keeps project selection and the move-session picker flow together. */
export function useProjectRouteActions({
  sessions,
  movePickSession,
  moveSessionToProject,
  selectProject,
  setMovePickSession,
  setScreen,
  reportError,
}: UseProjectRouteActionsOptions) {
  const pickSession = movePickSession
    ? sessions.find((session) => session.id === movePickSession) || null
    : null;

  const closeProjects = useCallback(() => {
    setMovePickSession(null);
    setScreen('chat');
  }, [setMovePickSession, setScreen]);

  const selectProjectTarget = useCallback((targetId: string | null) => {
    if (!movePickSession) {
      selectProject(targetId);
      return;
    }

    const movingSessionId = movePickSession;
    void moveSessionToProject(movingSessionId, targetId).then(() => {
      setMovePickSession(null);
      setScreen('chat');
    }).catch((error) => {
      reportError(error instanceof Error ? error.message : appStringsNow().moveFailed);
    });
  }, [movePickSession, moveSessionToProject, reportError, selectProject, setMovePickSession, setScreen]);

  return { pickSession, closeProjects, selectProjectTarget };
}
