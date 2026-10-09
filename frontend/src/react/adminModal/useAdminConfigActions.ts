import type { FormEvent } from 'react';

import { removeEmbeddingProvider, saveEmbeddingProvider, saveSystemModel } from './adminApi';
import { publishAdminPatch } from './adminSnapshot';
import type { EmbeddingProviderConfig, SystemModelConfig } from './types';

interface AdminConfigActionsOptions {
  systemForm: SystemModelConfig | null;
  systemKey: string;
  setSystemForm: (form: SystemModelConfig | null) => void;
  setSystemKey: (key: string) => void;
  embeddingForm: EmbeddingProviderConfig | null;
  embeddingKey: string;
  setEmbeddingForm: (form: EmbeddingProviderConfig | null) => void;
  setEmbeddingKey: (key: string) => void;
  includeToken?: boolean;
  includeKeyHint?: boolean;
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function useAdminConfigActions({
  systemForm,
  systemKey,
  setSystemForm,
  setSystemKey,
  embeddingForm,
  embeddingKey,
  setEmbeddingForm,
  setEmbeddingKey,
  includeToken = true,
  includeKeyHint = false,
}: AdminConfigActionsOptions) {
  const submitSystem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!systemForm) return;
    publishAdminPatch({ savingSystem: true, error: null });
    try {
      const saved = await saveSystemModel(systemForm, systemKey, { includeToken, includeKeyHint });
      setSystemForm(saved);
      setSystemKey('');
      publishAdminPatch({ savingSystem: false, systemModel: saved, error: null });
    } catch (cause) {
      publishAdminPatch({ savingSystem: false, error: errorMessage(cause, 'Save failed.') });
    }
  };

  const submitEmbedding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!embeddingForm) return;
    publishAdminPatch({ savingEmbedding: true, error: null });
    try {
      const saved = await saveEmbeddingProvider(embeddingForm, embeddingKey, { includeToken, includeKeyHint });
      setEmbeddingForm(saved);
      setEmbeddingKey('');
      publishAdminPatch({ savingEmbedding: false, embedding: saved, error: null });
    } catch (cause) {
      publishAdminPatch({ savingEmbedding: false, error: errorMessage(cause, 'Save failed.') });
    }
  };

  const removeEmbedding = async () => {
    if (!embeddingForm?.id) return;
    publishAdminPatch({ savingEmbedding: true, error: null });
    try {
      await removeEmbeddingProvider(embeddingForm.id, includeToken);
      setEmbeddingForm(null);
      setEmbeddingKey('');
      publishAdminPatch({ savingEmbedding: false, embedding: null, error: null });
    } catch (cause) {
      publishAdminPatch({ savingEmbedding: false, error: errorMessage(cause, 'Delete failed.') });
    }
  };

  return { submitSystem, submitEmbedding, removeEmbedding };
}
