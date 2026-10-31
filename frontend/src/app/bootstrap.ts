import { installModalA11y } from '../ui/modalA11y.ts';
import { bootstrapReactCompatibilityRuntime } from '../react/bootstrap.tsx';
import { mountAuthGate } from '../react/auth/authGateHost.tsx';
import { bootstrapOutbox } from '../session/mutationOutbox.ts';
import { installExtensions } from '../extensions/index.ts';
import { closeCmdK } from '../ui/cmdK.ts';
import { closeShareModal } from '../ui/share.ts';
import { closeProfile } from '../ui/profile.ts';
import { reportSwallow } from '../util/reportSwallow.ts';


/**
 * Functions required by the legacy shell and the React compatibility gateway.
 * Keeping this contract at the composition root makes boot ordering explicit
 * while the individual domains are migrated out of main.js.
 */

interface BootstrapOptions {
  syncWebSearchUI: () => unknown;
  syncAppModeUI: () => unknown;
  syncSidebarForMode: () => unknown;
  loadTonePreset: () => unknown;
  loadMemories: () => unknown;
}

/** Boot the app after the legacy bridge has been assembled. */
export function bootstrapApp(options: BootstrapOptions) {
  installExtensions();
  options.syncWebSearchUI();
  options.syncAppModeUI();
  options.syncSidebarForMode();
  options.loadTonePreset();
  options.loadMemories();
  /* Mount the auth surface before URL routes can switch to a deep auth view. */
  mountAuthGate();
  /* P0.1 A4 — replay message edits/deletes that never reached the server
     (the user edited while offline, closed the tab, and came back). Runs
     once here for a cold start and then on every `online` event. */
  bootstrapOutbox();

  installModalA11y({ overlayId: 'cmdKOverlay', closeFn: closeCmdK });
  installModalA11y({ overlayId: 'shareOverlay', closeFn: closeShareModal });
  installModalA11y({ overlayId: 'usageOverlay', closeFn: () => {
    void import('../ui/usage.ts')
      .then((module) => module.closeUsageModal())
      .catch((error) => reportSwallow(error, 'app/bootstrap.closeUsageModal'));
  } });
  installModalA11y({ overlayId: 'profileOverlay', closeFn: closeProfile });

  try {
    bootstrapReactCompatibilityRuntime();
  } catch (error) {
    console.error('[react-migration] compatibility runtime failed to initialize', error);
  }

  // Optional vendors and feature executors load from their consumers.
  // An idle callback is not evidence that this visit needs those features.
}
