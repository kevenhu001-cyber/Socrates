import { createImmutableBridge } from '../lib/bridge/createImmutableBridge.ts';

export interface PromptTemplateData {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  category: string;
  shortcut: string;
  body: string;
  systemPrompt: string;
  isBuiltin: boolean;
}

export interface PromptTemplatesSnapshot {
  open: boolean;
  view: 'list' | 'editor';
  builtins: PromptTemplateData[];
  customs: PromptTemplateData[];
  editor: PromptTemplateData | null;
  revision: number;
}

export type PromptTemplatesUpdate = Omit<PromptTemplatesSnapshot, 'revision'>;

export const promptTemplatesState = createImmutableBridge<PromptTemplatesSnapshot, PromptTemplatesUpdate>({
  initial: { open: false, view: 'list', builtins: [], customs: [], editor: null, revision: 0 },
  reducer: (_state, update) => update,
});

export function publishPromptTemplatesState(snapshot: PromptTemplatesUpdate): void {
  promptTemplatesState.dispatch(snapshot);
}
