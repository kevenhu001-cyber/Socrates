import type { SessionStartContext } from './input.ts';
type TutorStartContext = SessionStartContext & { sessionId: string | null };
import { stateStore } from '../../state/store.ts';
import { saveState, rememberDeletedSession } from '../../session/saveState.ts';
import { setCurrentSessionId } from '../../session/loader.ts';
import { setChatIdInURL } from '../../session/store.ts';
import { flushRecentsReconcile } from '../../session/recents.ts';
import { apiFetch } from '../../util/api.ts';
import { activateMainView } from '../../ui/mainViewController.ts';
import { syncConversationActive } from '../../ui/mobileModeSwitch.ts';
import { focusComposer } from '../../composer/controller.ts';
import { clearComposerPlugins } from '../../composer/pluginSelection.ts';
import { buildMessageContent, resetAttachments } from '../../attachments.ts';
import { renderAttachmentChips } from '../../attachments/render.ts';
import { updateComposerBtn } from '../../ui/topicSetup.ts';
import { syncChatModel, getActiveProvider } from '../../pickers.ts';
import { loadWebSearch } from '../webSearchLoader.ts';
import { generateTopicKBNodes } from '../topicKbNodes.ts';
import { generateDiagnosticQuestions, type DiagQuestion } from '../diagnosticGenerator.ts';
import { aiGenerate } from '../mockDiagnostic.ts';
import { updateKB } from '../../ui/knowledgePanel.ts';
import { renderDiagQuestion, proceedToTeaching } from '../../tutor/diagnosticFlow.ts';
import { buildFallbackDiagnosticQuestions, shouldAutoSearchTutor } from '../../tutor/policy.ts';
import { clearDiagnosticScreen, showDiagnosticError, showDiagnosticLoading, updateDiagnosticProgress } from '../../ui/diagnosticScreen.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { isWebSearchOn, renderRecents, translate } from './runtime.ts';
import { runtimeWindow as browserWindow } from "../../types/runtimeWindow.ts";


function isCurrentTutorSession(context: TutorStartContext) {
  return stateStore.read('currentSessionId') === context.sessionId && !stateStore.read('diagCancel');
}

function prepareTutorAttachments(context: TutorStartContext) {
  resetAttachments();
  renderAttachmentChips();
  updateComposerBtn();

  if (typeof buildMessageContent !== 'function') {
    stateStore.dispatch({
      type: 'state/batch',
      patch: { tutorAttachments: [], tutorPartsTemplate: context.topic },
    });
    return;
  }

  buildMessageContent(context.topic, context.startAttachments)
    .then((built) => {
      if (!isCurrentTutorSession(context)) return;
      stateStore.dispatch({
        type: 'state/batch',
        patch: {
          tutorAttachments: (built && built.attachmentList) || [],
          tutorPartsTemplate: (built && built.parts) || context.topic,
        },
      });
    })
    .catch(() => {
      if (!isCurrentTutorSession(context)) return;
      stateStore.dispatch({
        type: 'state/batch',
        patch: { tutorAttachments: [], tutorPartsTemplate: context.topic },
      });
    });
}

function cancelDiagnostic() {
  stateStore.dispatch({ type: 'state/set', key: 'diagCancel', value: true });
  const cancelledSessionId = stateStore.read('currentSessionId');
  stateStore.dispatch({ type: 'state/batch', patch: {
    topic: '', domain: null, phase: 'topic', kbNodes: [], currentNode: 0,
    teachingPlan: null, diagQuestions: [], diagAnswers: [], diagIndex: 0,
    tutorAttachments: [], tutorPartsTemplate: null,
  } });
  setCurrentSessionId(null);
  setChatIdInURL(null);

  if (cancelledSessionId) {
    rememberDeletedSession(cancelledSessionId);
    Promise.resolve(saveState.saveInFlight)
      .catch((error) => reportSwallow(error, 'chat/sessionBootstrap.deleteSession.saveInFlight'))
      .then(() => apiFetch('/api/sessions/' + encodeURIComponent(cancelledSessionId), { method: 'DELETE' }))
      .then(() => flushRecentsReconcile())
      .then(() => renderRecents())
      .catch((error) => reportSwallow(error, 'chat/sessionBootstrap.deleteSession.recentsChain'));
  }

  const diagnosticView = document.getElementById('diagnosticView');
  if (diagnosticView) clearDiagnosticScreen();
  activateMainView('topicSetup', document);
  updateKB();
  syncConversationActive();
  clearComposerPlugins('topic');
  clearComposerPlugins('chat');
  focusComposer('topic');
}

function renderDiagnosticFailure(fallbackError: unknown) {
  if (!document.getElementById('diagnosticView')) return;
  const reason = stateStore.read('lastCallError') || fallbackError || '';
  showDiagnosticError(String(reason));
}

function completeDiagnosticQuestions(questions: DiagQuestion[] | null) {
  if (!questions || !questions.length) return false;
  stateStore.dispatch({ type: 'state/set', key: 'diagQuestions', value: questions });
  stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'real' });
  updateDiagnosticProgress(100, translate('diag.ready'));
  renderDiagQuestion();
  updateKB();
  return true;
}

function recordDiagnosticFailureReason() {
  if (stateStore.read('lastCallError')) return;
  const provider = getActiveProvider();
  let message = 'no provider configured';
  if (provider && !provider.model) message = 'active provider missing model';
  else if (provider && provider.isBuiltIn) message = 'built-in provider call failed (network or server error)';
  else if (provider) message = "active provider '" + (provider.label || provider.id) + "' call failed";
  stateStore.dispatch({ type: 'state/set', key: 'lastCallError', value: message });
}

async function runDiagnosticGeneration(context: TutorStartContext, reinjectLoading: boolean) {
  if (!isCurrentTutorSession(context) || stateStore.read('phase') !== 'diagnostic') return;
  stateStore.dispatch({ type: 'state/batch', patch: { diagIndex: 0, diagAnswers: [], lastCallError: null } });
  if (reinjectLoading) showDiagnosticLoading();
  updateDiagnosticProgress(20, translate('chat.generatingQuestions'));

  let questions = null;
  let generationError = null;
  try {
    questions = await generateDiagnosticQuestions(
      context.topic,
      context.language,
      (step, total, question) => {
        if (!isCurrentTutorSession(context)) return;
        const percent = 20 + Math.round(75 * step / total);
        const label = question ? 'chat.generatedQ' : 'chat.generatingQ';
        updateDiagnosticProgress(
          percent,
          translate(label).replace('{n}', String(step)).replace('{total}', String(total)),
        );
      },
      () => !isCurrentTutorSession(context),
      context.tutorExploration.count,
    );
  } catch (error) {
    generationError = (error && (error as Error).message) || String(error);
  }

  if (!isCurrentTutorSession(context)) return;
  if (completeDiagnosticQuestions(questions)) return;
  recordDiagnosticFailureReason();
  renderDiagnosticFailure(generationError);
}

function installDiagnosticActions(context: TutorStartContext) {
  browserWindow.retryDiagnostic = () => runDiagnosticGeneration(context, true);
  browserWindow.useBuiltinDiagnostic = () => {
    if (!isCurrentTutorSession(context) || stateStore.read('phase') !== 'diagnostic') return;
    stateStore.dispatch({ type: 'state/batch', patch: { diagIndex: 0, diagAnswers: [] } });
    stateStore.dispatch({
      type: 'state/set',
      key: 'diagQuestions',
      value: buildFallbackDiagnosticQuestions(
        context.topic,
        context.tutorExploration.count,
        browserWindow._currentLang === 'zh' || context.language === 'zh',
      ),
    });
    stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'mock' });
    if (!stateStore.read('lastCallError')) {
      stateStore.dispatch({ type: 'state/set', key: 'lastCallError', value: 'Using built-in questions' });
    }
    renderDiagQuestion();
    updateKB();
  };
}

async function prepareKnowledgeNodes(context: TutorStartContext) {
  try {
    updateDiagnosticProgress(10, translate('diag.analyzingTopic'));
    const topicNodes = await generateTopicKBNodes(context.topic, context.language);
    if (!isCurrentTutorSession(context)) return;
    if (topicNodes && topicNodes.length >= 3) {
      while (topicNodes.length < stateStore.read('kbNodes').length) {
        topicNodes.push(stateStore.read('kbNodes')[topicNodes.length].name);
      }
      const namedNodes = stateStore.read('kbNodes').map((node, index) => (
        topicNodes[index] ? Object.assign({}, node, { name: topicNodes[index] }) : node
      ));
      stateStore.dispatch({ type: 'state/set', key: 'kbNodes', value: namedNodes });
      const count = stateStore.read('kbNodes').length;
      updateDiagnosticProgress(15, browserWindow._currentLang === 'zh'
        ? '已识别 ' + count + ' 个知识点'
        : 'Identified ' + count + ' knowledge points');
      return;
    }
    updateDiagnosticProgress(15, translate('chat.knowledgeReady'));
  } catch {
    if (isCurrentTutorSession(context)) updateDiagnosticProgress(15, translate('chat.knowledgeReady'));
  }
}

function startTutorWebSearch(context: TutorStartContext) {
  if (!isWebSearchOn() || !shouldAutoSearchTutor(context.topic)) return;
  try {
    void loadWebSearch()
      .then(({ fetchWebContext }) => fetchWebContext(context.topic, {}))
      .then((result) => {
        if (!isCurrentTutorSession(context)) return;
        stateStore.dispatch({
          type: 'state/set',
          key: 'searchContext',
          value: result.context || '',
        });
      })
      .catch((error) => reportSwallow(error, 'chat/sessionBootstrap.autoSearch.fetchWebContext'));
  } catch (error) {
    reportSwallow(error, 'chat/sessionBootstrap.autoSearch.guard');
  }
}

export async function startTutorSession(input: SessionStartContext) {
  const context: TutorStartContext = { ...input, sessionId: stateStore.read('currentSessionId') };
  // Topic generation renames this skeleton; it must also exist on API failure.
  stateStore.dispatch({ type: 'state/set', key: 'kbNodes', value: aiGenerate(context.topic).nodes });
  activateMainView('diagnosticView', document);
  syncChatModel();
  prepareTutorAttachments(context);
  browserWindow.cancelDiagnostic = () => {
    if (isCurrentTutorSession(context)) cancelDiagnostic();
  };
  showDiagnosticLoading();
  startTutorWebSearch(context);

  await prepareKnowledgeNodes(context);
  if (!isCurrentTutorSession(context)) return;
  if (!context.tutorExploration.enabled) {
    updateDiagnosticProgress(100, translate('diag.ready'));
    proceedToTeaching();
    return;
  }

  installDiagnosticActions(context);
  await runDiagnosticGeneration(context, false);
}
