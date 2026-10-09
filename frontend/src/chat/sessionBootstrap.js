/* New-session entry point. Chat and tutor session setup live in separate
   modules so their startup and recovery paths stay independently reviewable. */
import { publishThinkingTurnStart } from '../ui/messageSnapshot.js';
import { captureSessionStart } from './sessionBootstrap/input.js';
import { initializeNewSession } from './sessionBootstrap/initialize.js';
import { startChatSession } from './sessionBootstrap/chatStart.js';
import { startTutorSession } from './sessionBootstrap/tutorStart.js';
import { getAppMode } from './sessionBootstrap/runtime.js';

export async function startSession() {
  publishThinkingTurnStart();
  const context = await captureSessionStart();
  if (!context) return;

  initializeNewSession(context);

  if (getAppMode() === 'chat' || context.deepResearchOn) {
    await startChatSession(context);
    return;
  }

  await startTutorSession(context);
}
