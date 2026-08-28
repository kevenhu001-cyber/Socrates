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

function openMobileAttachmentPicker(
  mode: ComposerMode | null,
  kind: 'camera' | 'photos' | 'upload',
): void {
  const inputId = mode === 'topic' ? 'topicAttachInput' : 'attachInput';
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  if (input) {
    if (kind === 'camera') {
      input.accept = 'image/*';
      input.setAttribute('capture', 'environment');
    } else if (kind === 'photos') {
      input.accept = 'image/*';
      input.removeAttribute('capture');
    } else {
      input.accept = 'image/jpeg,image/png,image/gif,image/webp,text/plain,text/csv,text/markdown,application/json,application/pdf,.txt,.md,.csv,.json,.log,.pdf';
      input.removeAttribute('capture');
    }
  }
  getLegacyActions().composer.openAttachmentPicker(inputId);
}

function dispatchAction(action: ComposerToolsAction, mode: ComposerMode | null): void {
  const nav = getLegacyActions().navigation;
  const composer = getLegacyActions().composer;
  switch (action) {
    case 'camera':
    case 'photos':
    case 'upload':
      openMobileAttachmentPicker(mode, action);
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
    case 'extensiveThinking':
      composer.toggleExtensionByKey(action);
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
