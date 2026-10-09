import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Assistant, Session } from '@socrates/contracts';
import { useChatStore } from '@socrates/chat';
import { assistantConfigOf } from '@socrates/ui';
import type { AppScreen } from './appNavigation';
import { appStringsNow } from './strings';

interface UseCatalogActionsOptions {
  projectFilter: string | null;
  compact: boolean;
  setScreen: Dispatch<SetStateAction<AppScreen>>;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setAssistantMenuOpen: Dispatch<SetStateAction<boolean>>;
  setModelMenuOpen: Dispatch<SetStateAction<boolean>>;
  setProvidersReturn: Dispatch<SetStateAction<'settings' | 'chat'>>;
  loadAssistants(): Promise<void>;
  bindAssistantSession(id: string | null): Promise<void>;
  loadProviders(): Promise<void>;
  loadUsage(): Promise<void>;
  activateProvider(id: string): Promise<void>;
}

/** Coordinates catalog data actions with settings, picker, and new-chat flows. */
export function useCatalogActions({
  projectFilter,
  compact,
  setScreen,
  setSidebarOpen,
  setAssistantMenuOpen,
  setModelMenuOpen,
  setProvidersReturn,
  loadAssistants,
  bindAssistantSession,
  loadProviders,
  loadUsage,
  activateProvider,
}: UseCatalogActionsOptions) {
  const openProviders = useCallback(() => {
    setProvidersReturn('settings');
    setScreen('providers');
    void loadProviders();
  }, [loadProviders, setProvidersReturn, setScreen]);

  const openModelMenu = useCallback(() => {
    setModelMenuOpen(true);
    void loadProviders();
  }, [loadProviders, setModelMenuOpen]);

  const openSettings = useCallback(() => {
    setScreen('settings');
    void loadUsage();
    void loadProviders();
  }, [loadProviders, loadUsage, setScreen]);

  const pickModel = useCallback(async (id: string) => {
    setModelMenuOpen(false);
    try {
      await activateProvider(id);
    } catch (error) {
      useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().modelActivateFailed);
    }
  }, [activateProvider, setModelMenuOpen]);

  const openAssistantMenu = useCallback(() => {
    setAssistantMenuOpen(true);
    void loadAssistants();
  }, [loadAssistants, setAssistantMenuOpen]);

  const bindAssistant = useCallback((id: string | null) => {
    setAssistantMenuOpen(false);
    void bindAssistantSession(id);
  }, [bindAssistantSession, setAssistantMenuOpen]);

  const useAssistant = useCallback((assistant: Assistant) => {
    const config = assistantConfigOf(assistant);
    const id = `session-${Date.now()}`;
    const store = useChatStore.getState();
    const draftSession: Session = {
      id,
      title: assistant.title || 'New chat',
      topic: '',
      mode: 'chat',
      phase: 'chat',
      assistantId: assistant.id,
      messages: [],
    };
    if (projectFilter) draftSession.projectId = projectFilter;
    store.setSessions([draftSession, ...store.sessions]);
    store.setDraft(config.starter || '');
    store.selectSession(id);
    setScreen('chat');
    if (compact) setSidebarOpen(false);
  }, [compact, projectFilter, setScreen, setSidebarOpen]);

  return {
    openProviders,
    openModelMenu,
    openSettings,
    pickModel,
    openAssistantMenu,
    bindAssistant,
    useAssistant,
  };
}
