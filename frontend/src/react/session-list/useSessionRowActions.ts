import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiFetch, getCurrentLang, getLegacyActions } from '../legacy/gateway.ts';
import { refreshCachedProjects } from '../../projects/projectCache.ts';

export interface SessionRowUpdate {
  title?: string;
  pinned?: boolean;
  projectId?: string;
}

export interface SessionProject {
  id: string;
  name: string;
}

function copy(zh: string, en: string): string {
  return getCurrentLang() === 'zh' ? zh : en;
}

export function useSessionRowActions(sessionId: string, onClose: () => void) {
  const [renaming, setRenaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<SessionProject[] | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectError, setProjectError] = useState('');
  const projectRequest = useRef(0);

  useEffect(() => () => { projectRequest.current += 1; }, [sessionId]);

  const resetProjects = useCallback(() => {
    projectRequest.current += 1;
    setProjects(null);
    setLoadingProjects(false);
    setProjectError('');
  }, []);

  const closeMenu = useCallback(() => {
    resetProjects();
    onClose();
  }, [onClose, resetProjects]);

  const update = useCallback(async (patch: SessionRowUpdate) => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await getLegacyActions().sessions.updateSessionMetadata(sessionId, patch);
      setRenaming(false);
      closeMenu();
    } catch {
      setError(copy('保存失败，请重试', 'Could not save. Try again.'));
    } finally {
      setSaving(false);
    }
  }, [closeMenu, saving, sessionId]);

  const loadProjects = useCallback(() => {
    const request = ++projectRequest.current;
    setProjects([]);
    setProjectError('');
    setLoadingProjects(true);
    const fetchApi = getApiFetch();
    if (!fetchApi) {
      setProjectError(copy('项目加载失败，请重试', 'Could not load projects. Try again.'));
      setLoadingProjects(false);
      return;
    }
    void refreshCachedProjects(() => fetchApi('/api/projects'))
      .then((rows) => {
        if (projectRequest.current === request) setProjects([...rows]);
      })
      .catch(() => {
        if (projectRequest.current === request) setProjectError(copy('项目加载失败，请重试', 'Could not load projects. Try again.'));
      })
      .finally(() => {
        if (projectRequest.current === request) setLoadingProjects(false);
      });
  }, []);

  return {
    renaming,
    setRenaming,
    saving,
    error,
    projects,
    loadingProjects,
    projectError,
    resetProjects,
    closeMenu,
    update,
    loadProjects,
  };
}
