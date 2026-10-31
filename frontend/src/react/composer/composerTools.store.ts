/** React hooks and action routing for the composer tools menu. */

import { getComposerToolsSnapshot as readComposerToolsSnapshot, publishComposerToolsState, useComposerToolsState } from './composerTools.state';
import { getLegacyActions, t as legacyT } from '../legacy/gateway.ts';
import { loadPluginCatalog, normalisePluginId } from '../../composer/pluginCatalog.ts';
import type { ComposerMode, ComposerToolsAction, ComposerToolsSnapshot } from './types';

export function getComposerToolsSnapshot(): ComposerToolsSnapshot {
  return readComposerToolsSnapshot();
}

export function closeComposerTools(): void {
  const snapshot = getComposerToolsSnapshot();
  if (!snapshot.isOpen) return;
  publishComposerToolsState({ isOpen: false, mode: null, triggerId: null });
}

export function toggleComposerTools(trigger: HTMLElement, mode: string): void {
  const snapshot = getComposerToolsSnapshot();
  if (snapshot.isOpen && snapshot.triggerId === trigger.id) {
    closeComposerTools();
    return;
  }
  publishComposerToolsState({
    isOpen: true,
    mode: mode === 'topic' ? 'topic' : 'chat',
    triggerId: trigger.id,
  });
}

export function useComposerToolsSnapshot(): ComposerToolsSnapshot {
  return useComposerToolsState();
}

export function useIsComposerToolsOpen(): boolean {
  return useComposerToolsState((snapshot) => snapshot.isOpen);
}

function openMobileAttachmentPicker(
  mode: ComposerMode | null,
  kind: 'camera' | 'photos' | 'upload',
): void {
  const composer = getLegacyActions().composer;
  if (kind !== 'upload' && composer.openMediaPicker) {
    composer.openMediaPicker(kind);
    return;
  }
  composer.openAttachmentPicker('composerAttachInput');
}

type LegacyActionContext = ReturnType<typeof getLegacyActions>;
type ComposerActionHandler = (actions: LegacyActionContext) => void;

const COMPOSER_ACTION_HANDLERS: Partial<Record<ComposerToolsAction, ComposerActionHandler>> = {
  webSearch: ({ composer }) => composer.toggleWebSearch?.(),
  write: ({ composer }) => composer.composeAction(),
  research: ({ composer }) => composer.researchAction(),
  explore: ({ composer }) => composer.exploreAction?.(),
  deepResearch: ({ composer }) => composer.deepResearchAction(),
  extensiveThinking: ({ composer }) => composer.toggleExtensionByKey('extensiveThinking'),
  analyze: ({ composer }) => composer.analyzeAction(),
  exam: ({ composer }) => composer.toggleExtensionByKey('exam'),
  skills: ({ navigation }) => navigation.openPromptTemplatesModal(),
  managePlugins: ({ navigation }) => navigation.openNav('plugins'),
};

function isMobileAttachmentAction(
  action: ComposerToolsAction,
): action is 'camera' | 'photos' | 'upload' {
  return action === 'camera' || action === 'photos' || action === 'upload';
}

function startImageCreation(actions: LegacyActionContext): void {
  const showPlugins = (): void => {
    actions.navigation.openNav('plugins');
    showImageConnectionRequired();
  };
  void loadPluginCatalog(true).then((plugins) => {
    const jimeng = plugins.find((plugin) => normalisePluginId(plugin.id).includes('jimengai'));
    if (jimeng?.connectionStatus === 'connected') {
      actions.composer.toggleExtensionByKey('createImage');
      return;
    }
    showPlugins();
  }).catch(showPlugins);
}

function showImageConnectionRequired(): void {
  const key = 'composer.createImage.connectRequired';
  const value = legacyT(key);
  getLegacyActions().messages.showToast?.(
    value !== key ? value : 'Connect Jimeng AI in Plugins to create an image.',
  );
}

function dispatchAction(action: ComposerToolsAction, mode: ComposerMode | null): void {
  if (isMobileAttachmentAction(action)) {
    openMobileAttachmentPicker(mode, action);
    return;
  }
  const actions = getLegacyActions();
  if (action === 'createImage') {
    startImageCreation(actions);
    return;
  }
  COMPOSER_ACTION_HANDLERS[action]?.(actions);
}

export function useComposerToolsDispatch(): {
  pick: (action: ComposerToolsAction) => void;
} {
  return {
    pick: (action: ComposerToolsAction) => {
      const snap = getComposerToolsSnapshot();
      /* Close before opening a native picker. Its synthetic input click must
         never leave the menu open behind the camera or file chooser. */
      closeComposerTools();
      dispatchAction(action, snap.mode);
    },
  };
}
