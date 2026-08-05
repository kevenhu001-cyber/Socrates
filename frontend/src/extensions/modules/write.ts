// frontend/src/extensions/modules/write.ts

import type { ExtensionDefinition } from '../types';

export const WRITE_EDIT_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

export const WRITE_EDIT_SYSTEM_PROMPT =
  'You are an expert writing and editing assistant. Help the user compose, rewrite, or polish any text \u2014 essays, emails, posts, reports, documentation, scripts, or creative writing.\n\n' +
  'Workflow:\n' +
  '- If the request is clear, produce the writing directly.\n' +
  '- If a key detail is missing (audience, tone, length, format, or language), ask at most 2 focused questions first; otherwise proceed with sensible defaults.\n' +
  '- When editing text the user supplied, preserve their voice and intent. Return the revised version, and add a short bullet summary of substantive changes only when the edits are non-obvious or the user asked.\n\n' +
  'Tools:\n' +
  '- You may call the web_search tool to verify facts, gather current information, or find references when the writing depends on real-world accuracy. Cite sources briefly when you searched.\n\n' +
  'Output rules:\n' +
  '- Always match the user\'s language.\n' +
  '- Use Markdown for structure (headings, lists, short paragraphs) when the piece is long.\n' +
  '- Return the requested writing with minimal framing \u2014 no \'Here is your text:\' preambles.';

export const writeExtension: ExtensionDefinition = {
  key: 'write',
  kind: 'template',
  nameKey: 'composer.write',
  nameFallback: 'Write & edit',
  descriptionKey: 'composer.writeHint',
  descriptionFallback: 'Draft, rewrite and polish',
  hintKey: 'composer.writeHint',
  hintFallback: 'Draft, rewrite and polish',
  icon: WRITE_EDIT_ICON,
  shortcut: '/write',
  systemPrompt: WRITE_EDIT_SYSTEM_PROMPT,
  body: '',
  autoFocus: true,
  /* P_canvas-mode — the write extension renders its assistant reply inside
     a ChatGPT-style editable .canvas-block. WRITE_EDIT_SYSTEM_PROMPT is
     unchanged; only the output rendering path differs. autoLaunch:false
     keeps the input bar visible between turns so the user can iterate. */
  outputMode: 'canvas',
  autoLaunch: false,
  placement: { tools: 2 },
  onActivate(ctx) {
    ctx.setTemplate({
      key: 'write',
      title: ctx.t('composer.write', 'Write & edit'),
      shortcut: '/write',
      icon: WRITE_EDIT_ICON,
      hint: ctx.t('composer.writeHint', 'Draft, rewrite and polish'),
      systemPrompt: WRITE_EDIT_SYSTEM_PROMPT,
      body: '',
    });
    const w = window as unknown as {
      updateStartBtn?: () => void;
      updateSendBtn?: () => void;
    };
    try {
      w.updateStartBtn?.();
      w.updateSendBtn?.();
    } catch (_) {}
    ctx.focusComposer();
  },
};
