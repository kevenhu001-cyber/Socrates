import { bootstrapReactCompatibilityRuntime } from '../react/bootstrap.tsx';
import { mountAuthGate } from '../react/auth/authGateHost.tsx';
import { bootstrapOutbox } from '../session/mutationOutbox.ts';
import { installExtensions } from '../extensions/index.ts';


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

  /* Overlays (CmdK, profile, share, usage, settings) are React-owned, so their components
     install their own Esc/focus wiring once the elements exist. */

  try {
    bootstrapReactCompatibilityRuntime();
  } catch (error) {
    console.error('[react-migration] compatibility runtime failed to initialize', error);
  }

  // Optional vendors and feature executors load from their consumers.
  // An idle callback is not evidence that this visit needs those features.
}
