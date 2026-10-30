/**
 * Shared contracts for the composer-tools menu React migration boundary.
 *
 * The legacy module (`src/ui/composerTools.ts`) owns the open/close
 * state machine and the lazy-created `#composerToolsMenu` element. This
 * module only describes what the React compatibility root needs to know
 * to render the menu items.
 */

export type { ComposerMode, ComposerToolsSnapshot } from '../../ui/composerToolsState.ts';

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
