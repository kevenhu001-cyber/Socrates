/**
 * RN-14 — acting on a mistake from another session. The mistake book now
 * lists every session's mistakes (tutor/mistakeArchive.ts), but "Redo" and
 * "Into a next question" work on the open session's book: they append to
 * its transcript and its chain. So a mistake from elsewhere first opens the
 * session it came from, then runs the same action there.
 */
import { stateStore } from '../state/store.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { requestMistakeRedo } from '../ui/mistakeBookCommands.ts';
import { findArchivedMistake } from './mistakeArchive.ts';
import type { MistakeStateEntry } from '../state/kb.ts';

function openBook(): MistakeStateEntry[] {
  const value = stateStore.read('mistakes');
  return Array.isArray(value) ? value as MistakeStateEntry[] : [];
}

/**
 * The id of `id`'s entry in the open session, opening its own session
 * first when it lives elsewhere. Server-mirror rows (`srv:` ids) are found
 * by their question text once their session is open. Null when it cannot
 * be found (the session or the entry is gone).
 */
export async function resolveMistakeInOpenSession(id: string): Promise<string | null> {
  if (openBook().some((entry) => entry.id === id)) return id;
  const archived = findArchivedMistake(id);
  if (!archived) return null;
  if (stateStore.read('currentSessionId') !== archived.sessionId) {
    const { loadSession } = await import('../session/loader.ts');
    await loadSession(archived.sessionId);
    if (stateStore.read('currentSessionId') !== archived.sessionId) return null;
  }
  const book = openBook();
  const byId = book.find((entry) => entry.id === id);
  if (byId) return byId.id;
  const question = archived.q.trim();
  const byText = question ? book.find((entry) => entry.q.trim() === question && !entry.resolved) : null;
  return byText ? byText.id : null;
}

export function redoAnyMistake(id: string): void {
  void resolveMistakeInOpenSession(id)
    .then((localId) => { if (localId) requestMistakeRedo(localId); })
    .catch((error) => reportSwallow(error, 'tutor/mistakeCrossSession.redo'));
}

export function nextQuestionFromAnyMistake(id: string): void {
  void resolveMistakeInOpenSession(id)
    .then(async (localId) => {
      if (!localId) return;
      const { turnMistakeIntoNextQuestion } = await import('./mistakeAnalysis.ts');
      await turnMistakeIntoNextQuestion(localId);
    })
    .catch((error) => reportSwallow(error, 'tutor/mistakeCrossSession.nextQuestion'));
}
