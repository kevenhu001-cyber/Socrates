import { useEffect, useState } from 'react';

import { useAdminSnapshot } from './admin.bridge';
import { publishAdminSnapshot } from './legacyApi';
import type { EmbeddingProviderConfig, SystemModelConfig } from './types';

const ADMIN_API = '/api/system-models';
const EMBEDDING_API = '/api/embedding-config';

async function errorMessage(response: Response): Promise<string> {
  const detail = await response.json().catch(() => ({ message: 'Admin access required' }));
  return detail.message || 'Admin access required';
}

export function useAdminModalConfiguration() {
  const snapshot = useAdminSnapshot();
  const [systemForm, setSystemForm] = useState<SystemModelConfig | null>(null);
  const [systemKey, setSystemKey] = useState('');
  const [embeddingForm, setEmbeddingForm] = useState<EmbeddingProviderConfig | null>(null);
  const [embeddingKey, setEmbeddingKey] = useState('');

  useEffect(() => {
    if (!snapshot.open) return undefined;
    let cancelled = false;
    const load = async () => {
      publishAdminSnapshot({ open: true, loading: true, error: null });
      try {
        const [systemResponse, embeddingResponse] = await Promise.all([
          fetch(ADMIN_API, { credentials: 'same-origin' }),
          fetch(EMBEDDING_API, { credentials: 'same-origin' }),
        ]);
        if (systemResponse.status === 403 || embeddingResponse.status === 403) {
          const deniedResponse = systemResponse.status === 403 ? systemResponse : embeddingResponse;
          const message = await errorMessage(deniedResponse);
          if (cancelled) return;
          publishAdminSnapshot({
            open: true,
            loading: false,
            error: null,
            systemModel: null,
            embedding: null,
            isAdmin: false,
            adminGateError: message,
          });
          return;
        }
        const systemModel = systemResponse.ok ? await systemResponse.json() : null;
        const embeddingPayload = embeddingResponse.ok ? await embeddingResponse.json() : null;
        const embedding = Array.isArray(embeddingPayload) ? embeddingPayload[0] ?? null : embeddingPayload;
        if (cancelled) return;
        setSystemForm(systemModel);
        setEmbeddingForm(embedding);
        publishAdminSnapshot({
          open: true,
          loading: false,
          error: null,
          systemModel,
          embedding,
          isAdmin: true,
          adminGateError: null,
        });
      } catch (cause) {
        if (cancelled) return;
        publishAdminSnapshot({
          open: true,
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
  }, [snapshot.open]);

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
