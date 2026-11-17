/* New-session entry point. Chat and tutor session setup live in separate
   modules so their startup and recovery paths stay independently reviewable. */
import { captureSessionStart } from './input.ts';
import { initializeNewSession } from './initialize.ts';
import { startChatSession } from './chatStart.ts';
import { startTutorSession } from './tutorStart.ts';
import { getAppMode } from './runtime.ts';

export type { SessionStartContext } from './input.ts';

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
