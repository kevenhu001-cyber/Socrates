export type { PromptTemplateData, PromptTemplatesSnapshot } from '../../ui/promptTemplatesState.ts';

declare global {
  interface Window {
    closePromptTemplatesModal?: () => void;
  }
}
