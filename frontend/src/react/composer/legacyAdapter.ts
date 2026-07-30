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
    analyzeAction?: () => void;
    toggleExtensionByKey?: (key: string) => void;
    openPromptTemplatesModal?: () => void;
    exploreAction?: () => void;
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
    case 'explore':
      /* Explore ships as a window-level action (windowExports.js) — the
         typed legacy gateway predates it, so fall through to window. */
      if (typeof window.exploreAction === 'function') window.exploreAction();
      return;
    case 'deepResearch':
      composer.deepResearchAction();
      return;
    case 'analyze':
      composer.analyzeAction();
      return;
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
      const trigger = snap.triggerId ? document.getElementById(snap.triggerId) : null;
      if (trigger && snap.mode && typeof window.toggleComposerTools === 'function') {
        window.toggleComposerTools(trigger, snap.mode);
      }
    },
  };
}
