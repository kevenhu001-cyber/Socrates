import { stateStore } from '../../state/store.ts';
import { turnState } from '../turnState.ts';
import { generateId } from '../../util/ids.ts';
import { setCurrentSessionId } from '../../session/loader.ts';
import { pushChatIdToURL } from '../../session/store.ts';
import { copyComposerPlugins, clearComposerPlugins } from '../../composer/pluginSelection.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { getAppMode } from './runtime.ts';
import type { SessionStartContext } from './input.ts';

/** Session-scoped bridges reset when a new session replaces the current one. */
interface InitializeWindow extends Window {
  _activeChatAbort?: ((reason: string) => void) | null;
  _nextProjectId?: string | null;
  __socratesSyncCtl?: unknown;
}

export function initializeNewSession({ topic, deepResearchOn }: Pick<SessionStartContext, 'topic' | 'deepResearchOn'>): void {
  const win = window as InitializeWindow;
  if (win._activeChatAbort) {
    try { win._activeChatAbort('new-session'); }
    catch (error) { reportSwallow(error, 'chat/sessionBootstrap.abortPreviousStream'); }
  }
  if (turnState.activeChatCtl) {
    try { turnState.activeChatCtl.abort(); }
    catch (error) { reportSwallow(error, 'chat/sessionBootstrap.abortPreviousController'); }
  }
  turnState.activeChatCtl = null;
  win._activeChatAbort = null;
  turnState.chatStreaming = false;
  turnState.chatStopMode = false;
  try { delete win.__socratesSyncCtl; }
  catch (error) { reportSwallow(error, 'chat/sessionBootstrap.clearSyncController'); }

  const sessionId = generateId();
  stateStore.dispatch({
    type: 'state/batch',
    patch: {
      topic,
      diagIndex: 0,
      diagAnswers: [],
      diagCancel: false,
      kbNodes: [],
      domain: topic,
      phase: getAppMode() === 'chat' || deepResearchOn ? 'chat' : 'diagnostic',
      currentProjectId: win._nextProjectId || null,
      diagQuestions: [],
      currentNode: 0,
      totalQ: 0,
      explaining: false,
      sessionTitle: null,
      teachingPlan: null,
      teachingStage: 'motivate',
      currentExampleIdx: 0,
      practiceAttempts: 0,
      practicePhase: 'foundation',
      tutorAttachments: [],
      tutorPartsTemplate: null,
      searchContext: '',
      substantiveCount: 0,
      stuckCount: 0,
      'session.stuckCheckOffered': false,
      'session.stuckCheckRejected': 0,
      'session.fourOptionDialog': null,
    },
  });
  stateStore.dispatch({ type: 'session/replace-messages', payload: [] });
  if (win._nextProjectId) win._nextProjectId = null;

  setCurrentSessionId(sessionId);
  pushChatIdToURL(stateStore.read('currentSessionId') as string | null);
  copyComposerPlugins('topic', 'chat');
  clearComposerPlugins('topic');
}
