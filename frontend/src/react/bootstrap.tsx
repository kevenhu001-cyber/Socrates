/**
 * Bootstrap React compatibility runtime.
 *
 * Pre-M2 this was a 367-line if-else staircase; M2 collapses the
 * declaration into a flat mount-spec list (`lib/boot/specs.tsx`)
 * walked by `runMountRegistry`. The bootstrap module now owns only
 * the entry point and the legacy tool-row hookup the read-only share
 * view needs.
 */

import type { Root } from 'react-dom/client';

import { mountRegistry, runMountRegistry } from './lib/boot/registry';
import { mountRegistryList } from './lib/boot/specs';
import { mountAssistantTurn, releaseAssistantTurns } from './tool-run';
import type { LegacyChatMessage } from './types/domain';

export function bootstrapReactCompatibilityRuntime(): Root {
  /* Set up the read-only share view's tool-row mounting before any
     React subscriber could ask for it — ui/share.js degrades to
     plain prose if the bridge is missing. */
  window.__socratesMountAssistantTurn = (container, message, options) =>
    mountAssistantTurn(container, message as LegacyChatMessage, options);
  window.__socratesReleaseAssistantTurns = releaseAssistantTurns;

  /* Hard-required React-owned hosts: bootstrap throws when they are
     absent because the legacy code paths that depend on them would
     silently misbehave otherwise. */
  for (const id of ['newReplyPill', 'sendBtnContent']) {
    if (!document.getElementById(id)) {
      throw new Error(`React migration target "#${id}" was not found.`);
    }
  }

  mountRegistry.push(...mountRegistryList());
  runMountRegistry(document);

  /* Re-sync the workspace route now that __socratesMountWorkspace
     (and the per-page createRoot) are registered. nav.js's own
     syncWorkspaceRoute runs on DOMContentLoaded, but main.js
     dynamically imports this module AFTER that — so the first run
     saw __socratesMountWorkspace as undefined, openLibrary() skipped
     mountWorkspacePage(), and React never rendered into #libraryPanel.
     Calling it again here ensures deep-link URLs (/library, /projects,
     /plugins) actually mount React. */
  try { (window as any).syncWorkspaceRoute?.(); } catch (_) { /* swallow */ }

  return (window as any).__socratesPillRoot ?? null;
}
