export { mountPromptTemplatesModal, unmountPromptTemplatesModal } from './PromptTemplatesModal';
export { installPromptTemplatesBridge, getPromptTemplatesSnapshot, subscribeToPromptTemplates } from './promptTemplatesStore';
export { usePromptTemplatesDispatch, usePromptTemplatesSnapshot } from './legacyAdapter';
export type { PromptTemplatesSnapshot, PromptTemplatesBridge } from './types';
