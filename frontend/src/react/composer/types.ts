/**
 * Shared contracts for the composer-tools menu React migration boundary.
 *
 * The legacy module (`src/ui/composerTools.js`) owns the open/close
 * state machine and the lazy-created `#composerToolsMenu` element. This
 * module only describes what the React compatibility root needs to know
 * to render the menu items.
 */

export type ComposerMode = 'topic' | 'chat';

export type ComposerToolsAction =
  | 'camera'
  | 'photos'
  | 'upload'
  | 'webSearch'
  | 'write'
  | 'research'
  | 'explore'
  | 'deepResearch'
  | 'extensiveThinking'
  | 'analyze'
  | 'exam'
  | 'skills';

export interface ComposerToolsSnapshot {
  isOpen: boolean;
  mode: ComposerMode | null;
  triggerId: string | null;
  revision: number;
}

export interface ComposerToolsBridge {
  getSnapshot: () => ComposerToolsSnapshot;
  publish: (snapshot: Omit<ComposerToolsSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesComposerToolsBridge?: ComposerToolsBridge;
    toggleWebSearch?: () => void;
  }
}
