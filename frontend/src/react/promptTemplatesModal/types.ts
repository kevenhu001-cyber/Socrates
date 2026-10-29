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

export interface PromptTemplatesBridge {
  getSnapshot: () => PromptTemplatesSnapshot;
  publish: (snapshot: Omit<PromptTemplatesSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesPromptTemplatesBridge?: PromptTemplatesBridge;
    closePromptTemplatesModal?: () => void;
  }
}
