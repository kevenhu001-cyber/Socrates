export interface PromptTemplatesSnapshot {
  open: boolean;
  bodyHTML: string;
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
