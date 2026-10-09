import { useCallback, useState } from 'react';
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

export function useSessionRowActions(sessionId: string, closeMenu: () => void) {
  const [renaming, setRenaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<SessionProject[] | null>(null);

  const update = useCallback(async (patch: SessionRowUpdate) => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await getLegacyActions().sessions.updateSessionMetadata(sessionId, patch);
      setRenaming(false);
      setProjects(null);
      closeMenu();
    } catch {
      setError(copy('保存失败，请重试', 'Could not save. Try again.'));
    } finally {
      setSaving(false);
    }
  }, [closeMenu, saving, sessionId]);

  const loadProjects = useCallback(() => {
    const fetchApi = getApiFetch();
    if (!fetchApi) {
      setError(copy('项目加载失败，请重试', 'Could not load projects. Try again.'));
      return;
    }
    void refreshCachedProjects(() => fetchApi('/api/projects'))
      .then((rows) => setProjects([...rows]))
      .catch(() => setError(copy('项目加载失败，请重试', 'Could not load projects. Try again.')));
  }, []);

  return {
    renaming,
    setRenaming,
    saving,
    error,
    projects,
    setProjects,
    update,
    loadProjects,
  };
}
