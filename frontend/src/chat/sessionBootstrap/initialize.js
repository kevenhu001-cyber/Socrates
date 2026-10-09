import { stateStore } from '../../state/store.js';
import { turnState } from '../turnState.js';
import { generateId } from '../../util/ids.js';
import { setCurrentSessionId } from '../../session/loader.js';
import { pushChatIdToURL } from '../../session/store.js';
import { copyComposerPlugins, clearComposerPlugins } from '../../react/composer/pluginSelection.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { getAppMode } from './runtime.js';

export function initializeNewSession({ topic, deepResearchOn }) {
  if (window._activeChatAbort) {
    try { window._activeChatAbort('new-session'); }
    catch (error) { reportSwallow(error, 'chat/sessionBootstrap.abortPreviousStream'); }
  }
  if (turnState.activeChatCtl) {
    try { turnState.activeChatCtl.abort(); }
    catch (error) { reportSwallow(error, 'chat/sessionBootstrap.abortPreviousController'); }
  }
  turnState.activeChatCtl = null;
  window._activeChatAbort = null;
  turnState.chatStreaming = false;
  turnState.chatStopMode = false;
  try { delete window.__socratesSyncCtl; }
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
      currentProjectId: window._nextProjectId || null,
      diagQuestions: [],
      substantiveCount: 0,
      stuckCount: 0,
      'session.stuckCheckOffered': false,
      'session.stuckCheckRejected': 0,
      'session.fourOptionDialog': null,
    },
  });
  stateStore.dispatch({ type: 'session/replace-messages', payload: [] });
  if (window._nextProjectId) window._nextProjectId = null;

  setCurrentSessionId(sessionId);
  pushChatIdToURL(stateStore.read('currentSessionId'));
  copyComposerPlugins('topic', 'chat');
  clearComposerPlugins('topic');
}
