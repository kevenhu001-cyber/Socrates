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

declare global {
  interface Window {
    toggleComposerTools?: (trigger: HTMLElement, mode: ComposerMode) => void;
    openAttachmentPicker?: (inputId: string) => void;
    composeAction?: () => void;
    researchAction?: () => void;
    toggleExtensionByKey?: (key: string) => void;
    openPromptTemplatesModal?: () => void;
    t?: (key: string) => string;
  }
}

function dispatchAction(action: ComposerToolsAction, mode: ComposerMode | null): void {
  switch (action) {
    case 'upload':
      if (typeof window.openAttachmentPicker === 'function') {
        window.openAttachmentPicker(mode === 'topic' ? 'topicAttachInput' : 'attachInput');
      }
      return;
    case 'write':
      if (typeof window.composeAction === 'function') window.composeAction();
      return;
    case 'research':
      if (typeof window.researchAction === 'function') window.researchAction();
      return;
    case 'deepResearch':
    case 'exam':
      if (typeof window.toggleExtensionByKey === 'function') window.toggleExtensionByKey(action);
      return;
    case 'skills':
      if (typeof window.openPromptTemplatesModal === 'function') window.openPromptTemplatesModal();
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