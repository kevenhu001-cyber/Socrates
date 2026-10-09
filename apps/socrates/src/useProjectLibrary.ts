import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Project, Session } from '@socrates/contracts';
import { useChatStore } from '@socrates/chat';
import { useAuthStore } from '@socrates/auth';
import { api } from './runtime';
import { appStringsNow } from './strings';

interface RefCell<T> {
  current: T;
}

interface UseProjectLibraryOptions {
  accountEpoch: RefCell<number>;
  loadAssistants: () => Promise<void>;
  projectFilter: string | null;
  setProjectFilter: Dispatch<SetStateAction<string | null>>;
}

/** Owns project/archived data, library synchronization, and project mutations. */
export function useProjectLibrary({ accountEpoch, loadAssistants, projectFilter, setProjectFilter }: UseProjectLibraryOptions) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [archived, setArchived] = useState<Session[]>([]);
  const syncEpoch = useRef(0);

  const reset = useCallback(() => {
    syncEpoch.current += 1;
    setProjects([]);
    setProjectsLoading(false);
    setProjectsError(null);
    setArchived([]);
  }, []);

  const syncLibrary = useCallback(async () => {
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) return;
    const epoch = accountEpoch.current;
    const sync = ++syncEpoch.current;
    const current = () => epoch === accountEpoch.current && sync === syncEpoch.current;
    setProjectsLoading(true);
    setProjectsError(null);
    void loadAssistants();
    try {
      const [fetchedProjects, fetchedSessions, fetchedArchived] = await Promise.all([
        api.projects.list(),
        api.sessions.list(),
        api.sessions.listArchived(),
      ]);
      if (!current()) return;
      setProjects(fetchedProjects);
      setArchived(fetchedArchived);
      useChatStore.getState().reconcileSessions(fetchedSessions);
    } catch (error) {
      if (current()) setProjectsError(error instanceof Error ? error.message : appStringsNow().syncFailed);
    } finally {
      if (current()) setProjectsLoading(false);
    }
  }, [accountEpoch, loadAssistants]);

  const createProject = useCallback(async (name: string) => {
    const epoch = accountEpoch.current;
    const project = await api.projects.create({ name });
    if (epoch !== accountEpoch.current) return;
    setProjects((previous) => [project, ...previous]);
    setProjectFilter(project.id);
    useChatStore.getState().selectProject(project.id);
  }, [accountEpoch, setProjectFilter]);

  const renameProject = useCallback(async (id: string, name: string) => {
    const epoch = accountEpoch.current;
    const updated = await api.projects.update(id, { name });
    if (epoch === accountEpoch.current) setProjects((previous) => previous.map((project) => project.id === id ? updated : project));
  }, [accountEpoch]);

  const deleteProject = useCallback(async (id: string) => {
    const store = useChatStore.getState();
    if (store.sessions.some((session) => session.id === store.turnSessionId && session.projectId === id)) {
      throw new Error(appStringsNow().stopBeforeDeleteProject);
    }
    const epoch = accountEpoch.current;
    await api.projects.remove(id);
    if (epoch !== accountEpoch.current) return;
    setProjects((previous) => previous.filter((project) => project.id !== id));
    useChatStore.getState().removeProject(id);
    if (projectFilter === id) setProjectFilter(null);
    else useChatStore.getState().selectProject(projectFilter);
  }, [accountEpoch, projectFilter, setProjectFilter]);

  const reportError = useCallback((message: string | null) => setProjectsError(message), []);

  return {
    projects,
    projectsLoading,
    projectsError,
    archived,
    setArchived,
    reset,
    syncLibrary,
    createProject,
    renameProject,
    deleteProject,
    reportError,
  };
}
