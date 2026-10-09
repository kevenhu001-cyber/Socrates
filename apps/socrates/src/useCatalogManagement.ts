import { useCallback, useState } from 'react';
import type { Assistant, ProviderKey } from '@socrates/contracts';
import { isLocalSessionId, useChatStore } from '@socrates/chat';
import { useAuthStore } from '@socrates/auth';
import { api } from './runtime';
import { appStringsNow } from './strings';

type RefCell<T> = { current: T };

export interface AssistantDraftInput {
  title: string;
  description: string;
  instructions: string;
  starter: string;
}

export interface ProviderDraftInput {
  label: string;
  url: string;
  model: string;
  key: string;
  isMultimodal: boolean;
}

interface UseCatalogManagementOptions {
  accountEpoch: RefCell<number>;
}

function assistantSource(entry: AssistantDraftInput): string {
  return JSON.stringify({ description: entry.description, instructions: entry.instructions, starter: entry.starter });
}

/** Owns provider/assistant server data and mutations; the app shell owns navigation. */
export function useCatalogManagement({ accountEpoch }: UseCatalogManagementOptions) {
  const [providers, setProviders] = useState<ProviderKey[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [assistantsLoading, setAssistantsLoading] = useState(false);
  const [assistantsError, setAssistantsError] = useState<string | null>(null);

  const resetProviders = useCallback(() => {
    setProviders([]);
    setProvidersError(null);
  }, []);

  const reset = useCallback(() => {
    resetProviders();
    setProvidersLoading(false);
    setAssistants([]);
    setAssistantsLoading(false);
    setAssistantsError(null);
  }, [resetProviders]);

  const loadAssistants = useCallback(async () => {
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { setAssistants([]); return; }
    const epoch = accountEpoch.current;
    setAssistantsLoading(true);
    setAssistantsError(null);
    try {
      const rows = await api.assistants.list();
      if (epoch === accountEpoch.current) setAssistants(rows);
    } catch (error) {
      if (epoch === accountEpoch.current) setAssistantsError(error instanceof Error ? error.message : appStringsNow().assistantsLoadFailed);
    } finally {
      if (epoch === accountEpoch.current) setAssistantsLoading(false);
    }
  }, [accountEpoch]);

  const loadProviders = useCallback(async () => {
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { setProviders([]); return; }
    const epoch = accountEpoch.current;
    setProvidersLoading(true);
    setProvidersError(null);
    try {
      const rows = await api.providers.list();
      if (epoch === accountEpoch.current) setProviders(rows);
    } catch (error) {
      if (epoch === accountEpoch.current) setProvidersError(error instanceof Error ? error.message : appStringsNow().syncFailed);
    } finally {
      if (epoch === accountEpoch.current) setProvidersLoading(false);
    }
  }, [accountEpoch]);

  const activateProvider = useCallback(async (id: string) => {
    const epoch = accountEpoch.current;
    await api.providers.patch(id, { isActive: true });
    if (epoch === accountEpoch.current) setProviders((previous) => previous.map((row) => ({ ...row, isActive: row.id === id })));
  }, [accountEpoch]);

  const createProvider = useCallback(async (entry: ProviderDraftInput) => {
    const epoch = accountEpoch.current;
    const created = await api.providers.create(entry);
    if (epoch !== accountEpoch.current) return;
    setProviders((previous) => [{ ...created, isActive: true }, ...previous.map((row) => ({ ...row, isActive: false }))]);
  }, [accountEpoch]);

  const deleteProvider = useCallback(async (id: string) => {
    const epoch = accountEpoch.current;
    await api.providers.remove(id);
    if (epoch === accountEpoch.current) setProviders((previous) => previous.filter((row) => row.id !== id));
  }, [accountEpoch]);

  const bindAssistant = useCallback(async (id: string | null) => {
    const store = useChatStore.getState();
    const sessionId = store.activeSessionId;
    if (!sessionId) return;
    const epoch = accountEpoch.current;
    try {
      if (!isLocalSessionId(sessionId)) await api.sessions.patch(sessionId, { assistantId: id });
      if (epoch !== accountEpoch.current) return;
      useChatStore.getState().patchSession(sessionId, { assistantId: id });
    } catch (error) {
      useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().assistantBoundFailed);
    }
  }, [accountEpoch]);

  const createAssistant = useCallback(async (entry: AssistantDraftInput) => {
    const epoch = accountEpoch.current;
    const created = await api.assistants.create({ title: entry.title, source: assistantSource(entry) });
    if (epoch === accountEpoch.current) setAssistants((previous) => [created, ...previous]);
  }, [accountEpoch]);

  const updateAssistant = useCallback(async (id: string, entry: AssistantDraftInput) => {
    const epoch = accountEpoch.current;
    const updated = await api.assistants.update(id, { title: entry.title, source: assistantSource(entry) });
    if (epoch === accountEpoch.current) setAssistants((previous) => previous.map((row) => row.id === id ? updated : row));
  }, [accountEpoch]);

  const deleteAssistant = useCallback(async (id: string) => {
    const epoch = accountEpoch.current;
    await api.assistants.remove(id);
    if (epoch !== accountEpoch.current) return;
    setAssistants((previous) => previous.filter((row) => row.id !== id));
    const store = useChatStore.getState();
    for (const session of store.sessions) {
      if (session.assistantId !== id) continue;
      store.patchSession(session.id, { assistantId: null });
      if (!isLocalSessionId(session.id)) void api.sessions.patch(session.id, { assistantId: null }).catch(() => undefined);
    }
  }, [accountEpoch]);

  return {
    providers,
    providersLoading,
    providersError,
    assistants,
    assistantsLoading,
    assistantsError,
    reset,
    resetProviders,
    loadAssistants,
    loadProviders,
    activateProvider,
    createProvider,
    deleteProvider,
    bindAssistant,
    createAssistant,
    updateAssistant,
    deleteAssistant,
  };
}
