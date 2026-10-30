import { stateStore } from '../../state/store.ts';
import { turnState } from '../turnState.ts';
import { generateId } from '../../util/ids.ts';
import { setCurrentSessionId } from '../../session/loader.ts';
import { pushChatIdToURL } from '../../session/store.ts';
import { copyComposerPlugins, clearComposerPlugins } from '../../composer/pluginSelection.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { getAppMode } from './runtime.ts';
import type { SessionStartContext } from './input.ts';

export function initializeNewSession({ topic, deepResearchOn }: Pick<SessionStartContext, 'topic' | 'deepResearchOn'>): void {
  if (turnState.activeChatAbort) {
    try { turnState.activeChatAbort('new-session'); }
    catch (error) { reportSwallow(error, 'chat/sessionBootstrap.abortPreviousStream'); }
  }
  if (turnState.activeChatCtl) {
    try { turnState.activeChatCtl.abort(); }
    catch (error) { reportSwallow(error, 'chat/sessionBootstrap.abortPreviousController'); }
  }
  turnState.activeChatCtl = null;
  turnState.activeChatAbort = null;
  turnState.pendingFirstTurnController = null;
  turnState.chatStreaming = false;
  turnState.chatStopMode = false;

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
      currentProjectId: stateStore.read('currentProjectId') as string | null,
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
  setCurrentSessionId(sessionId);
  pushChatIdToURL(stateStore.read('currentSessionId') as string | null);
  copyComposerPlugins('topic', 'chat');
  clearComposerPlugins('topic');
}
