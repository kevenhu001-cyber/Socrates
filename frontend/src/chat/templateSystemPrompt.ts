/**
 * chat/templateSystemPrompt.ts — active prompt-template injection.
 *
 * Extracted from main.js. Injects the active template's system prompt as
 * a fresh system message right after the base system message. Used by
 * both the chat turn assembly and the tutor prompt builders, so it lives
 * in chat/ rather than either consumer.
 *
 * The active template state itself stays in main.js; this module reads
 * it through the configured getter (same pattern as promptSuffixes).
 */

import type { PromptMessage } from './promptSuffixes.ts';

/** Active prompt template as shaped by main.js setActiveTemplate. */
export interface ActiveTemplate {
  id?: string;
  systemPrompt?: string;
  [key: string]: unknown;
}

export interface TemplateSystemPromptDeps {
  /** Live reader for the active template owned by main.js. */
  getActiveTemplate: () => ActiveTemplate | null | undefined;
}

let activeTemplateReader: () => ActiveTemplate | null | undefined = () => null;

/** Provide the active-template reader owned by main.js. */
export function configureTemplateSystemPrompt(deps: TemplateSystemPromptDeps): void {
  activeTemplateReader = deps.getActiveTemplate;
}

/**
 * Inject the active template's system prompt as a fresh system message
 * right after the base system message. Returns the original array
 * unchanged if no template is active. Idempotent — calling this twice
 * doesn't stack the prompt (we tag it with a marker so the second call
 * is a no-op).
 */
export function injectTemplateSystemPrompt(messages: PromptMessage[]): PromptMessage[] {
  const activeTemplate = activeTemplateReader();
  if (!activeTemplate || !activeTemplate.systemPrompt) return messages;
  const marker = '[template:' + activeTemplate.id + ']';
  /* If we already injected this template's prompt on a
     prior call in the same array, skip — keeps the
     conversation history from getting polluted with
     duplicate system messages. */
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m && m.role === 'system' && typeof m.content === 'string' && m.content.indexOf(marker) >= 0) {
      return messages;
    }
  }
  const stamped = activeTemplate.systemPrompt + '\n\n' + marker;
  const cloned = messages.slice();
  /* Find first system message and inject after it; if no
     system message, prepend. */
  for (let j = 0; j < cloned.length; j++) {
    if (cloned[j] && cloned[j].role === 'system') {
      cloned.splice(j + 1, 0, { role: 'system', content: stamped });
      return cloned;
    }
  }
  cloned.unshift({ role: 'system', content: stamped });
  return cloned;
}
