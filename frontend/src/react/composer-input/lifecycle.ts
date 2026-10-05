import {
  clearComposerDrafts,
  focusComposer,
  readComposerSurface,
} from '../../composer/controller.ts';
import { clearComposerPlugins } from '../composer/pluginSelection';
import { updateComposerBtn } from '../../ui/topicSetup.js';
import { reportSwallow } from '../../util/reportSwallow.ts';
import type { LegacyComposer } from '../legacy/types';

export interface ResetAppOptions {
  confirmActiveSession?: boolean;
}

export type ResetAppAction = (options?: ResetAppOptions) => Promise<boolean>;

/** Route the editor's submit command to the currently active product flow. */
export function submitComposer(actions: LegacyComposer, surface = readComposerSurface()): void {
  if (surface === 'chat') actions.submitChatMessage();
  else actions.startSession();
}

/** Escape is a Stop shortcut only while the chat composer is active. */
export function handleComposerEscape(actions: LegacyComposer, surface = readComposerSurface()): void {
  if (surface === 'chat') actions.stopChatResponse();
}

/** Preserve the existing new-session confirmation policy at the typed entry. */
export function startNewComposerSession(resetApp: ResetAppAction): Promise<boolean> {
  return resetApp({ confirmActiveSession: false });
}

/** Reset the composer-owned state after app/session state has been cleared. */
export function resetComposerForNewSession(): void {
  clearComposerDrafts();
  clearComposerPlugins('topic');
  clearComposerPlugins('chat');
  updateComposerBtn();
}

export function focusComposerForNewSession(): void {
  try { focusComposer('topic'); } catch (error) { reportSwallow(error, 'composer.lifecycle.focusImmediate'); }
  requestAnimationFrame(() => {
    try { focusComposer('topic'); } catch (error) { reportSwallow(error, 'composer.lifecycle.focusFrame'); }
  });
}
