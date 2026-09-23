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

/* File-picker accept list — mirrors the upload allow-list in
   server/src/routes/files.ts (images, text/code, PDF, Office, EPUB/RTF,
   media). Kept in one constant so index.html's static accept attribute
   and this mobile picker never diverge by accident. */
const ATTACHMENT_ACCEPT = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/avif',
  'text/*',
  'application/json', 'application/pdf', 'application/rtf', 'text/rtf',
  'application/epub+zip',
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/flac',
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.log', '.json', '.jsonl',
  '.yaml', '.yml', '.toml', '.xml',
  '.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.c', '.h', '.cpp', '.cs',
  '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.sh', '.sql', '.css',
  '.ipynb',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.epub', '.rtf',
  '.mp4', '.webm', '.mov', '.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac',
].join(',');

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
      input.accept = ATTACHMENT_ACCEPT;
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
    case 'webSearch':
      if (typeof window.toggleWebSearch === 'function') window.toggleWebSearch();
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
      dispatchAction(action, snap.mode);
      const trigger = snap.triggerId ? document.getElementById(snap.triggerId) : null;
      if (trigger && snap.mode && typeof window.toggleComposerTools === 'function') {
        window.toggleComposerTools(trigger, snap.mode);
      }
    },
  };
}
