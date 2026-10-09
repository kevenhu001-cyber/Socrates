import { stateStore } from '../../state/store.js';
import { saveState, rememberDeletedSession } from '../../session/saveState.js';
import { setCurrentSessionId } from '../../session/loader.js';
import { setChatIdInURL } from '../../session/store.js';
import { flushRecentsReconcile } from '../../session/recents.js';
import { apiFetch } from '../../util/api.js';
import { activateMainView } from '../../ui/mainViewController.js';
import { focusComposer } from '../../composer/controller.ts';
import { clearComposerPlugins } from '../../react/composer/pluginSelection.ts';
import { buildMessageContent, resetAttachments } from '../../attachments.js';
import { renderAttachmentChips } from '../../attachments/render.js';
import { updateComposerBtn } from '../../ui/topicSetup.js';
import { syncChatModel, getActiveProvider } from '../../pickers.js';
import { fetchWebContext } from '../webSearch.js';
import { generateTopicKBNodes } from '../topicKbNodes.js';
import { generateDiagnosticQuestions } from '../diagnosticGenerator.js';
import { updateChatStats } from '../stats.js';
import { updateKB } from '../../ui/knowledgePanel.js';
import { renderDiagQuestion, proceedToTeaching } from '../../tutor/diagnosticFlow.js';
import { buildFallbackDiagnosticQuestions, shouldAutoSearchTutor } from '../../tutor/policy.js';
import { esc } from '../../render/helpers.js';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { isWebSearchOn, renderRecents, translate } from './runtime.js';

function diagnosticLoadingHTML() {
  return '<div class="diag-loading"><div class="loading"><span></span><span></span><span></span></div>'
    + '<p class="diag-loading-text">' + translate('tutor.loading') + '</p>'
    + '<div class="diag-progress"><div class="diag-progress-bar">'
    + '<div class="diag-progress-fill" id="diagProgressFill"></div></div>'
    + '<div class="diag-progress-step" id="diagProgressStep"><span class="diag-progress-spin"></span>'
    + translate('diag.analyzingTopic') + '</div></div>'
    + '<button type="button" class="diag-cancel-btn" data-diag-command="cancel">'
    + translate('diag.cancel') + '</button></div>';
}

function updateDiagnosticProgress(percent, label) {
  const fill = document.getElementById('diagProgressFill');
  const step = document.getElementById('diagProgressStep');
  if (fill) fill.style.width = percent + '%';
  if (step) step.innerHTML = '<span class="diag-progress-spin"></span>' + label;
}

function prepareTutorAttachments(context) {
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
      stateStore.dispatch({
        type: 'state/batch',
        patch: {
          tutorAttachments: (built && built.attachmentList) || [],
          tutorPartsTemplate: (built && built.parts) || context.topic,
        },
      });
    })
    .catch(() => {
      stateStore.dispatch({
        type: 'state/batch',
        patch: { tutorAttachments: [], tutorPartsTemplate: context.topic },
      });
    });
}

function cancelDiagnostic() {
  stateStore.dispatch({ type: 'state/set', key: 'diagCancel', value: true });
  const cancelledSessionId = stateStore.read('currentSessionId');
  stateStore.dispatch({ type: 'state/batch', patch: { topic: '', phase: 'topic' } });
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
  if (diagnosticView) diagnosticView.innerHTML = '';
  activateMainView('topicSetup', document);
  clearComposerPlugins('topic');
  clearComposerPlugins('chat');
  focusComposer('topic');
}

function renderDiagnosticFailure(fallbackError) {
  const diagnosticView = document.getElementById('diagnosticView');
  if (!diagnosticView) return;
  const reason = stateStore.read('lastCallError') || fallbackError || '';
  diagnosticView.classList.remove('hidden');
  diagnosticView.innerHTML = '<div class="diag-error">'
    + '<p class="diag-error-title">' + esc(translate('diag.timeoutTitle')) + '</p>'
    + (reason ? '<p class="diag-error-reason">' + esc(reason) + '</p>' : '')
    + '<div class="diag-error-actions">'
    + '<button type="button" class="diag-error-retry" data-diag-command="retry">'
    + esc(translate('diag.retry')) + '</button>'
    + '<button type="button" class="diag-error-builtin" data-diag-command="builtin">'
    + esc(translate('diag.useBuiltin')) + '</button>'
    + '</div></div>';
}

function completeDiagnosticQuestions(questions) {
  if (!questions || !questions.length) return false;
  stateStore.dispatch({ type: 'state/set', key: 'diagQuestions', value: questions });
  stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'real' });
  updateChatStats();
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

async function runDiagnosticGeneration(context, reinjectLoading) {
  stateStore.dispatch({ type: 'state/set', key: 'diagCancel', value: false });
  if (reinjectLoading) {
    const diagnosticView = document.getElementById('diagnosticView');
    if (diagnosticView) {
      diagnosticView.classList.remove('hidden');
      diagnosticView.innerHTML = diagnosticLoadingHTML();
    }
  }
  updateDiagnosticProgress(20, translate('chat.generatingQuestions'));

  let questions = null;
  let generationError = null;
  try {
    questions = await generateDiagnosticQuestions(
      context.topic,
      context.language,
      (step, total, question) => {
        const percent = 20 + Math.round(75 * step / total);
        const label = question ? 'chat.generatedQ' : 'chat.generatingQ';
        updateDiagnosticProgress(
          percent,
          translate(label).replace('{n}', step).replace('{total}', total),
        );
      },
      () => Boolean(stateStore.read('diagCancel')),
      context.tutorExploration.count,
    );
  } catch (error) {
    generationError = (error && error.message) || String(error);
  }

  if (stateStore.read('diagCancel')) return;
  if (completeDiagnosticQuestions(questions)) return;
  recordDiagnosticFailureReason();
  updateChatStats();
  renderDiagnosticFailure(generationError);
}

function installDiagnosticActions(context) {
  window.retryDiagnostic = () => runDiagnosticGeneration(context, true);
  window.useBuiltinDiagnostic = () => {
    stateStore.dispatch({
      type: 'state/set',
      key: 'diagQuestions',
      value: buildFallbackDiagnosticQuestions(
        context.topic,
        context.tutorExploration.count,
        window._currentLang === 'zh' || context.language === 'zh',
      ),
    });
    stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'mock' });
    if (!stateStore.read('lastCallError')) {
      stateStore.dispatch({ type: 'state/set', key: 'lastCallError', value: 'Using built-in questions' });
    }
    updateChatStats();
    const diagnosticView = document.getElementById('diagnosticView');
    if (diagnosticView) diagnosticView.classList.remove('hidden');
    renderDiagQuestion();
    updateKB();
  };
}

async function prepareKnowledgeNodes(context) {
  try {
    updateDiagnosticProgress(10, translate('diag.analyzingTopic'));
    const topicNodes = await generateTopicKBNodes(context.topic, context.language);
    if (topicNodes && topicNodes.length >= 3) {
      while (topicNodes.length < stateStore.read('kbNodes').length) {
        topicNodes.push(stateStore.read('kbNodes')[topicNodes.length].name);
      }
      const namedNodes = stateStore.read('kbNodes').map((node, index) => (
        topicNodes[index] ? Object.assign({}, node, { name: topicNodes[index] }) : node
      ));
      stateStore.dispatch({ type: 'state/set', key: 'kbNodes', value: namedNodes });
      const count = stateStore.read('kbNodes').length;
      updateDiagnosticProgress(15, window._currentLang === 'zh'
        ? '已识别 ' + count + ' 个知识点'
        : 'Identified ' + count + ' knowledge points');
      return;
    }
    updateDiagnosticProgress(15, translate('chat.knowledgeReady'));
  } catch {
    updateDiagnosticProgress(15, translate('chat.knowledgeReady'));
  }
}

function startTutorWebSearch(topic) {
  if (!isWebSearchOn() || !shouldAutoSearchTutor(topic)) return;
  try {
    fetchWebContext(topic, {})
      .then((result) => {
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

export async function startTutorSession(context) {
  activateMainView('diagnosticView', document);
  syncChatModel();
  prepareTutorAttachments(context);
  window.cancelDiagnostic = cancelDiagnostic;
  document.getElementById('diagnosticView').innerHTML = diagnosticLoadingHTML();
  startTutorWebSearch(context.topic);

  await prepareKnowledgeNodes(context);
  if (stateStore.read('diagCancel')) return;
  if (!context.tutorExploration.enabled) {
    updateDiagnosticProgress(100, translate('diag.ready'));
    stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    proceedToTeaching();
    return;
  }

  installDiagnosticActions(context);
  await runDiagnosticGeneration(context, false);
}
