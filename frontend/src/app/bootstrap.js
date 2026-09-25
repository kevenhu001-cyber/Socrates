import { installModalA11y } from '../ui/modalA11y.js';
import { ensureFuse, ensureHighlight, ensureKatex } from '../vendor/lazy.js';
import { bootstrapReactCompatibilityRuntime } from '../react/bootstrap.tsx';
import { mountExamListeners } from '../exam.js';
import { mountUsageListeners } from '../ui/usage.js';
import { mountAuthListeners } from '../auth/index.js';
import { mountLegacyShellListeners } from '../ui/legacyShellListeners.js';

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
  mountExamListeners();
  mountUsageListeners();

  window.__socratesEnsureFuse = ensureFuse;
  const loadIdleVendors = () => {
    try { ensureHighlight().catch(() => { /* idle preload is best effort */ }); } catch (_) {}
    try { ensureFuse().catch(() => { /* idle preload is best effort */ }); } catch (_) {}
    try { ensureKatex().catch(() => { /* idle preload is best effort */ }); } catch (_) {}
  };
  if (typeof requestIdleCallback === 'function') {
    try { requestIdleCallback(loadIdleVendors, { timeout: 15000 }); }
    catch (_) { setTimeout(loadIdleVendors, 15000); }
  } else {
    setTimeout(loadIdleVendors, 15000);
  }
}
