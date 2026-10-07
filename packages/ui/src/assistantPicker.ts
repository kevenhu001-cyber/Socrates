/* assistantPicker — DOM-free list model for the chat-header assistant
 * switcher. Mirrors the row semantics of the web baseline's Assistants
 * creation surface (`frontend/src/ui/creationSurfaces.js`): a row shows the
 * title plus the config's description, and the bound assistant carries the
 * check. Binding itself stays in the host app (session-level PATCH with the
 * epoch-guarded mirror update); this module only shapes the list. */

import type { Assistant, AssistantConfig } from '@socrates/contracts';

const EMPTY: AssistantConfig = { description: '', instructions: '', starter: '' };

/** Parse `Assistant.source`. Malformed/legacy rows degrade to an empty
 * config instead of throwing — the picker still lists the row by title. */
export function assistantConfigOf(assistant: Pick<Assistant, 'source'>): AssistantConfig {
  try {
    const parsed = JSON.parse(String(assistant.source || '{}')) as Record<string, unknown>;
    return {
      description: typeof parsed.description === 'string' ? parsed.description : '',
      instructions: typeof parsed.instructions === 'string' ? parsed.instructions : '',
      starter: typeof parsed.starter === 'string' ? parsed.starter : '',
    };
  } catch {
    return { ...EMPTY };
  }
}

export interface AssistantRowLabel {
  name: string;
  sub: string;
}

/** Title + description sub-line, mirroring the baseline list row. */
export function assistantRowLabel(assistant: Assistant): AssistantRowLabel {
  return {
    name: assistant.title || 'Assistant',
    sub: assistantConfigOf(assistant).description || '',
  };
}

export function activeAssistantOf(assistants: Assistant[], id: string | null | undefined): Assistant | null {
  return id ? assistants.find((a) => a.id === id) || null : null;
}

/** Case-insensitive title/description filter (the picker's search box). */
export function filterAssistants(assistants: Assistant[], query: string): Assistant[] {
  const q = query.trim().toLowerCase();
  if (!q) return assistants;
  return assistants.filter((a) => {
    const { name, sub } = assistantRowLabel(a);
    return `${name} ${sub}`.toLowerCase().includes(q);
  });
}
