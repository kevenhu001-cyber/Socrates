import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { useAdminSnapshot } from './admin.bridge';
import { AdminUnauthorizedError, clearAdminToken, loadAdminConfiguration } from './adminApi';
import { publishAdminPatch } from './adminSnapshot';
import type { EmbeddingProviderConfig, SystemModelConfig } from './types';

export function useAdminConfiguration(
  authed: boolean | null,
  setAuthed: Dispatch<SetStateAction<boolean | null>>,
) {
  const snapshot = useAdminSnapshot();
  const [systemForm, setSystemForm] = useState<SystemModelConfig | null>(null);
  const [systemKey, setSystemKey] = useState('');
  const [embeddingForm, setEmbeddingForm] = useState<EmbeddingProviderConfig | null>(null);
  const [embeddingKey, setEmbeddingKey] = useState('');

  useEffect(() => {
    if (!authed) return undefined;
    let cancelled = false;
    publishAdminPatch({ loading: true, error: null });
    const load = async () => {
      try {
        const config = await loadAdminConfiguration();
        if (cancelled) return;
        setSystemForm(config.systemModel);
        setEmbeddingForm(config.embedding);
        publishAdminPatch({
          loading: false,
          error: null,
          ...config,
          isAdmin: true,
          adminGateError: null,
        });
      } catch (cause) {
        if (cancelled) return;
        if (cause instanceof AdminUnauthorizedError) {
          clearAdminToken();
          setAuthed(false);
          publishAdminPatch({ loading: false, error: null, isAdmin: false });
          return;
        }
        publishAdminPatch({
          loading: false,
          error: cause instanceof Error ? cause.message : 'Could not load admin configuration.',
          systemModel: null,
          embedding: null,
          isAdmin: false,
          adminGateError: null,
        });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [authed, setAuthed]);

  return {
    snapshot,
    systemForm,
    setSystemForm,
    systemKey,
    setSystemKey,
    embeddingForm,
    setEmbeddingForm,
    embeddingKey,
    setEmbeddingKey,
  };
}
