/**
 * Composer tools menu bridge — M2 single-bridge migration.
 *
 * Legacy `ui/composerTools.js` publishes the menu open/close state
 * through `window.__socratesComposerToolsBridge.publish(...)`. The
 * factory owns the snapshot/reducer/listener loop; this module adds
 * the legacy alias and the React hooks consumed by
 * `ComposerToolsMenu.tsx`.
 */

import { createImmutableBridge, useBridge, useBridgeSelector } from '../../lib/bridge';
import { getLegacyActions, t as legacyT } from '../legacy/gateway';
import { loadPluginCatalog, normalisePluginId } from './pluginCatalog';
import type {
  ComposerMode,
  ComposerToolsAction,
  ComposerToolsBridge,
  ComposerToolsSnapshot,
} from './types';

declare global {
  interface Window {
    __socratesComposerToolsBridge?: ComposerToolsBridge;
  }
}

const HIDDEN: ComposerToolsSnapshot = Object.freeze({
  isOpen: false,
  mode: null,
  triggerId: null,
  revision: 0,
});

type Action = Omit<ComposerToolsSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<ComposerToolsSnapshot, Action>({
  initial: HIDDEN,
  reducer: (_state, action) => action,
});

const bridge: ComposerToolsBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as ComposerToolsBridge;

export function installComposerToolsBridge(): ComposerToolsBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesComposerToolsBridge) {
      window.__socratesComposerToolsBridge = bridge;
    }
    return window.__socratesComposerToolsBridge;
  }
  return bridge;
}

export function getComposerToolsSnapshot(): ComposerToolsSnapshot {
  return installComposerToolsBridge().getSnapshot();
}

export function subscribeToComposerTools(listener: () => void): () => void {
  return installComposerToolsBridge().subscribe(listener);
}

export function useComposerToolsSnapshot(): ComposerToolsSnapshot {
  return useBridge(factoryBridge);
}

export function useIsComposerToolsOpen(): boolean {
  return useBridgeSelector(factoryBridge, (snapshot) => snapshot.isOpen);
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
  composer.openAttachmentPicker(mode === 'topic' ? 'topicAttachInput' : 'attachInput');
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
    case 'webSearch':
      composer.toggleWebSearch?.();
      return;
    case 'createImage':
      void loadPluginCatalog(true).then((plugins) => {
        const jimeng = plugins.find((plugin) => normalisePluginId(plugin.id).includes('jimengai'));
        if (jimeng?.connectionStatus === 'connected') {
          composer.toggleExtensionByKey('createImage');
          return;
        }
        nav.openNav('plugins');
        showImageConnectionRequired();
      }).catch(() => {
        nav.openNav('plugins');
        showImageConnectionRequired();
      });
      return;
    case 'write':
      composer.composeAction();
      return;
    case 'research':
      composer.researchAction();
      return;
    case 'explore':
      composer.exploreAction?.();
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
    case 'managePlugins':
      nav.openNav('plugins');
      return;
  }
}

function showImageConnectionRequired(): void {
  const key = 'composer.createImage.connectRequired';
  const value = legacyT(key);
  getLegacyActions().messages.showToast?.(
    value !== key ? value : 'Connect Jimeng AI in Plugins to create an image.',
  );
}

export function useComposerToolsDispatch(): {
  pick: (action: ComposerToolsAction) => void;
} {
  return {
    pick: (action: ComposerToolsAction) => {
      const snap = getComposerToolsSnapshot();
      /* Close the menu before running the action. File pickers are opened
         with a synthetic input.click() that bubbles to the document-level
         outside-click handler; closing afterwards would toggle the menu
         back open behind the camera / file chooser. */
      const trigger = snap.triggerId ? document.getElementById(snap.triggerId) : null;
      const menu = document.getElementById('composerToolsMenu');
      if (trigger && snap.mode && menu && !menu.classList.contains('hidden')) {
        getLegacyActions().composer.toggleTools?.(trigger, snap.mode);
      }
      dispatchAction(action, snap.mode);
    },
  };
}
