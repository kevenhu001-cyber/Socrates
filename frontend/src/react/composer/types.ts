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
  | 'createImage'
  | 'webSearch'
  | 'write'
  | 'research'
  | 'explore'
  | 'deepResearch'
  | 'extensiveThinking'
  | 'analyze'
  | 'exam'
  | 'skills'
  | 'managePlugins';
