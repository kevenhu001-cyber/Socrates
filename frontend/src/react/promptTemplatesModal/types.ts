export type {
  PromptTemplateData,
  PromptTemplatesSnapshot,
} from '../../legacy/promptTemplatesState.ts';

declare global {
  interface Window {
    closePromptTemplatesModal?: () => void;
  }
}
