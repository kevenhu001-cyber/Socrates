import { installModalA11y } from '../ui/modalA11y.ts';
import { bootstrapReactCompatibilityRuntime } from '../react/bootstrap.tsx';
import { mountAuthGate } from '../react/auth/authGateHost.tsx';
import { mountAuthListeners } from '../auth/index.ts';
import { mountLegacyShellListeners } from '../ui/legacyShellListeners.ts';
import { bootstrapOutbox } from '../session/mutationOutbox.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


/**
 * Functions required by the legacy shell and the React compatibility gateway.
 * Keeping this contract at the composition root makes boot ordering explicit
 * while the individual domains are migrated out of main.js.
 */

/** Boot the app after the legacy bridge has been assembled. */
export function bootstrapApp(options: { syncModelPills: any; syncWebSearchUI: any; syncExtensionsUI: any; syncAppModeUI: any; syncSidebarForMode: any; loadTonePreset: any; loadMemories: any; toggleSidebar: any; startNewChat: any; toggleIncognito: any; openFind: any; openShare: any; openSettings?: (() => void)|undefined; startSession: any; sendMessage: any; toggleComposerTools: any; toggleEffort: any; selectMode: any; toggleMobileMode: any; searchRecents: any; switchTab: any; toggleSidebarView: any; }) {
  options.syncModelPills();
  options.syncWebSearchUI();
  options.syncExtensionsUI();
  options.syncAppModeUI();
  options.syncSidebarForMode();
  options.loadTonePreset();
  options.loadMemories();
  /* The gate markup is a React tree now, so it has to be committed before the
     auth listeners bind to `#authGate` by selector. */
  mountAuthGate();
  mountAuthListeners();
  /* P0.1 A4 — replay message edits/deletes that never reached the server
     (the user edited while offline, closed the tab, and came back). Runs
     once here for a cold start and then on every `online` event. */
  bootstrapOutbox();

  installModalA11y({ overlayId: 'cmdKOverlay', closeFn: () => browserWindow.closeCmdK?.() });
  installModalA11y({ overlayId: 'shareOverlay', closeFn: () => browserWindow.closeShareModal?.() });
  installModalA11y({ overlayId: 'usageOverlay', closeFn: () => browserWindow.closeUsageModal?.() });
  installModalA11y({ overlayId: 'profileOverlay', closeFn: () => browserWindow.closeProfile?.() });

  try {
    bootstrapReactCompatibilityRuntime();
  } catch (error) {
    console.error('[react-migration] compatibility runtime failed to initialize', error);
  }

  mountLegacyShellListeners({
    toggleSidebar: options.toggleSidebar,
    startNewChat: options.startNewChat,
    toggleIncognito: options.toggleIncognito,
    openFind: options.openFind,
    openShare: options.openShare,
    openSettings: () => browserWindow.openSettings?.(),
    startSession: options.startSession,
    sendMessage: options.sendMessage,
    toggleComposerTools: options.toggleComposerTools,
    toggleEffort: options.toggleEffort,
    selectMode: options.selectMode,
    toggleMobileMode: options.toggleMobileMode,
    searchRecents: options.searchRecents,
    switchTab: options.switchTab,
    toggleSidebarView: options.toggleSidebarView,
  });
  /* usage.js listeners mount lazily inside windowExports' usage loader —
     the overlay only exists once the module loads. */

  // Optional vendors and feature executors load from their consumers.
  // An idle callback is not evidence that this visit needs those features.
}
