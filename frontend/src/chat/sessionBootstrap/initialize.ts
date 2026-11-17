import { dispatchPatches, dispatchSession, sessionStore } from '../../store/index.ts';
import { detachActiveTurn } from '../turn/cancelActiveTurn.ts';
import { generateId } from '../../util/ids.ts';
import { setCurrentSessionId } from '../../session/loader.ts';
import { pushChatIdToURL } from '../../session/store.ts';
import { copyComposerPlugins, clearComposerPlugins } from '../../composer/pluginSelection.ts';
import { getAppMode } from './runtime.ts';
import type { SessionStartContext } from './input.ts';

export function initializeNewSession({
  topic,
  deepResearchOn,
}: Pick<SessionStartContext, 'topic' | 'deepResearchOn'>): void {
  detachActiveTurn('new-session');

  const sessionId = generateId();
  dispatchPatches({
    session: {
      topic,
      diagIndex: 0,
      diagAnswers: [],
      diagCancel: false,
      domain: topic,
      phase: getAppMode() === 'chat' || deepResearchOn ? 'chat' : 'diagnostic',
      currentProjectId: sessionStore.getState().currentProjectId as string | null,
      diagQuestions: [],
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
      substantiveCount: 0,
      stuckCount: 0,
      stuckCheckOffered: false,
      stuckCheckRejected: 0,
      fourOptionDialog: null,
    },
    kb: { kbNodes: [], currentNode: 0 },
    search: { searchContext: '' },
  });
  dispatchSession({ type: 'session/replace-messages', payload: [] });
  setCurrentSessionId(sessionId);
  pushChatIdToURL(sessionStore.getState().currentSessionId as string | null);
  copyComposerPlugins('topic', 'chat');
  clearComposerPlugins('topic');
}
