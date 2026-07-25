import { useSyncExternalStore } from 'react';

import {
  getComposerToolsSnapshot,
  subscribeToComposerTools,
} from './composerToolsStore';
import type {
  ComposerMode,
  ComposerToolsAction,
  ComposerToolsSnapshot,
} from './types';
import { getLegacyActions } from '../legacy/gateway';

declare global {
  interface Window {
    toggleComposerTools?: (trigger: HTMLElement, mode: ComposerMode) => void;
    openAttachmentPicker?: (inputId: string) => void;
    composeAction?: () => void;
    researchAction?: () => void;
    toggleExtensionByKey?: (key: string) => void;
    openPromptTemplatesModal?: () => void;
  }
}

function dispatchAction(action: ComposerToolsAction, mode: ComposerMode | null): void {
  const nav = getLegacyActions().navigation;
  const composer = getLegacyActions().composer;
  switch (action) {
    case 'upload':
      composer.openAttachmentPicker(mode === 'topic' ? 'topicAttachInput' : 'attachInput');
      return;
    case 'write':
      composer.composeAction();
      return;
    case 'research':
      composer.researchAction();
      return;
    case 'deepResearch':
    case 'exam':
      composer.toggleExtensionByKey(action);
      return;
    case 'skills':
      nav.openPromptTemplatesModal();
      return;
  }
}

export function useComposerToolsSnapshot(): ComposerToolsSnapshot {
  return useSyncExternalStore(
    subscribeToComposerTools,
    getComposerToolsSnapshot,
    getComposerToolsSnapshot,
  );
}

export function useIsComposerToolsOpen(): boolean {
  return useSyncExternalStore(
    subscribeToComposerTools,
    () => getComposerToolsSnapshot().isOpen,
    () => false,
  );
}

export function useComposerToolsDispatch(): {
  pick: (action: ComposerToolsAction) => void;
} {
  return {
    pick: (action: ComposerToolsAction) => {
      const snap = getComposerToolsSnapshot();
      dispatchAction(action, snap.mode);
    },
  };
}