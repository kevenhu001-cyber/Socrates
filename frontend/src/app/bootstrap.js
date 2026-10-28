import { installModalA11y } from '../ui/modalA11y.js';
import { bootstrapReactCompatibilityRuntime } from '../react/bootstrap.tsx';
import { mountAuthListeners } from '../auth/index.ts';
import { mountLegacyShellListeners } from '../ui/legacyShellListeners.ts';
import { bootstrapOutbox } from '../session/mutationOutbox.ts';

/**
 * Functions required by the legacy shell and the React compatibility gateway.
 * Keeping this contract at the composition root makes boot ordering explicit
 * while the individual domains are migrated out of main.js.
 */

/** Boot the app after the legacy bridge has been assembled. */
export function bootstrapApp(options) {
  options.syncModelPills();
  options.syncWebSearchUI();
  options.syncExtensionsUI();
  options.syncAppModeUI();
  options.syncSidebarForMode();
  options.loadTonePreset();
  options.loadMemories();
  mountAuthListeners();
  /* P0.1 A4 — replay message edits/deletes that never reached the server
     (the user edited while offline, closed the tab, and came back). Runs
     once here for a cold start and then on every `online` event. */
  bootstrapOutbox();

  installModalA11y({ overlayId: 'cmdKOverlay', closeFn: () => window.closeCmdK?.() });
  installModalA11y({ overlayId: 'shareOverlay', closeFn: () => window.closeShareModal?.() });
  installModalA11y({ overlayId: 'usageOverlay', closeFn: () => window.closeUsageModal?.() });
  installModalA11y({ overlayId: 'profileOverlay', closeFn: () => window.closeProfile?.() });

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
    openSettings: window.openSettings,
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
