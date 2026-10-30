/**
 * Composer tools menu bridge — M2 single-bridge migration.
 *
 * Legacy `ui/composerTools.ts` publishes the menu open/close state
 * through `window.__socratesComposerToolsBridge.publish(...)`. The
 * factory owns the snapshot/reducer/listener loop; this module adds
 * the legacy alias and the React hooks consumed by
 * `ComposerToolsMenu.tsx`.
 */

import { createImmutableBridge, useBridge, useBridgeSelector } from '../../lib/bridge';
import { getLegacyActions, t as legacyT } from '../legacy/gateway.ts';
import { loadPluginCatalog, normalisePluginId } from '../../composer/pluginCatalog.ts';
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
