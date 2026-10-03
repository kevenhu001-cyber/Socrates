import { installModalA11y } from '../ui/modalA11y.js';
import { ensureFuse, ensureHighlight, ensureKatex } from '../vendor/lazy.js';
import { bootstrapReactCompatibilityRuntime } from '../react/bootstrap.tsx';
import { mountAuthListeners } from '../auth/index.js';
import { mountLegacyShellListeners } from '../ui/legacyShellListeners.js';
import { bootstrapOutbox } from '../session/mutationOutbox.js';

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

  /* streamingTurn stays out of the entry chunk (saves parse+eval on the
     critical path) but every session needs it on first send — kick the
     fetch now so the module is warm before any interaction; the send
     path then serves the controller synchronously. */
  try { if (typeof window.__loadStreamingTurn === 'function') window.__loadStreamingTurn(); } catch (_) { /* prefetch is best effort */ }

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

  window.__socratesEnsureFuse = ensureFuse;
  /* P_perf-defer-idle-vendors — the KaTeX/highlight/Fuse/exam prefetches
     below are pure best-effort (every consumer lazy-loads on demand), but
     requestIdleCallback fires while authBoot is still awaiting the
     network — i.e. right in the middle of the boot waterfall. On a slow
     link those ~500 KB then fight fonts, API responses and the entry
     tail for the six-per-origin connections, delaying first paint. Gate
     them on window `load` (all render-blocking work done) plus idle, so
     the boot waterfall carries only what first paint needs. */
  const loadIdleVendors = () => {
    try { ensureHighlight().catch(() => { /* idle preload is best effort */ }); } catch (_) {}
    try { ensureFuse().catch(() => { /* idle preload is best effort */ }); } catch (_) {}
    try { ensureKatex().catch(() => { /* idle preload is best effort */ }); } catch (_) {}
    /* Warm the exam chunk (11KB gz) at idle so the sidebar entry opens
       instantly; the module stays lazy for users who never visit it —
       this only moves the fetch off the click path. */
    try { if (typeof window.__loadExamModule === 'function') window.__loadExamModule(); } catch (_) {}
    /* Same for streamingTurn (12KB gz): once warm, addStreamingMessage
       serves synchronously again (placeholder lands in the same task). */
    try { if (typeof window.__loadStreamingTurn === 'function') window.__loadStreamingTurn(); } catch (_) { /* prefetch is best effort */ }
  };
  const scheduleIdleVendors = () => {
    if (typeof requestIdleCallback === 'function') {
      try { requestIdleCallback(loadIdleVendors, { timeout: 15000 }); }
      catch (_) { setTimeout(loadIdleVendors, 15000); }
    } else {
      setTimeout(loadIdleVendors, 15000);
    }
  };
  try {
    /* `load` may already have fired when a cached entry evaluates fast
       (document.readyState === 'complete'); polling readyState avoids a
       prefetch that never runs on repeat visits. */
    if (typeof document !== 'undefined' && document.readyState === 'complete') scheduleIdleVendors();
    else if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('load', scheduleIdleVendors, { once: true });
    else scheduleIdleVendors();
  } catch (_) { scheduleIdleVendors(); }
}
