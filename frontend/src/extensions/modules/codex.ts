// frontend/src/extensions/modules/codex.ts
// Codex — embedded OpenAI Codex agent runtime (server bridge /api/codex/*).
// Opens a dedicated workspace panel with its own input, streamed replies,
// tool activity and approval cards.

import type { ExtensionDefinition } from '../types';

export const CODEX_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 9l-3 3 3 3"/><path d="M13 15l3-3-3-3"/><rect x="3" y="3" width="18" height="18" rx="4"/></svg>';

export const codexExtension: ExtensionDefinition = {
  key: 'codex',
  kind: 'action',
  nameKey: 'composer.codex',
  nameFallback: 'Codex',
  descriptionKey: 'composer.codexHint',
  descriptionFallback: 'Open the Codex agent workspace',
  hintKey: 'composer.codexHint',
  hintFallback: 'Open the Codex agent workspace',
  icon: CODEX_ICON,
  shortcut: '/codex',
  placement: { tools: 6, picker: 3 },
  onActivate(_ctx) {
    // Lazy-load the panel module so the heavy markdown/stream imports only
    // enter the bundle once the feature is actually opened.
    import('../../codexAgent/codexClient.js').then(({ openCodexPanel }) => {
      openCodexPanel();
    }).catch((err) => {
      console.error('[codex] failed to open panel:', err);
    });
  },
};
