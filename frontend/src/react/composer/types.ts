/**
 * Shared contracts for the React-owned composer-tools menu.
 */

export type ComposerMode = 'topic' | 'chat';

export interface ComposerToolsSnapshot {
  isOpen: boolean;
  mode: ComposerMode | null;
  triggerId: string | null;
  revision: number;
}

export type ComposerToolsAction =
  | 'camera'
  | 'photos'
  | 'upload'
  | 'wechatFiles'
  | 'createImage'
  | 'webSearch'
  | 'write'
  | 'research'
  | 'explore'
  | 'deepResearch'
  | 'extensiveThinking'
  | 'analyze'
  | 'createSite'
  | 'exam'
  | 'skills'
  | 'managePlugins'
  | 'model'
  | 'reasoningEffort';
