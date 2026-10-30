/* New-session entry point. Chat and tutor session setup live in separate
   modules so their startup and recovery paths stay independently reviewable. */
import { captureSessionStart } from './sessionBootstrap/input.ts';
import { initializeNewSession } from './sessionBootstrap/initialize.ts';
import { startChatSession } from './sessionBootstrap/chatStart.ts';
import { startTutorSession } from './sessionBootstrap/tutorStart.ts';
import { getAppMode } from './sessionBootstrap/runtime.ts';

export type { SessionStartContext } from './sessionBootstrap/input.ts';

export async function startSession(): Promise<void> {
  const context = await captureSessionStart();
  if (!context) return;

  initializeNewSession(context);

  if (getAppMode() === 'chat' || context.deepResearchOn) {
    await startChatSession(context);
    return;
  }

  await startTutorSession(context);
}
