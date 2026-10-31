/* Exam route and lifecycle commands. The screen itself is rendered by the
   single React root in react/exam/ExamView.tsx. */

import { stateStore } from './state/store.ts';
import { dispatchExam, dispatchUi } from './store/index.ts';
import { pushChatIdToURL, setExamIdInURL } from './session/store.ts';
import { reportSwallow } from './util/reportSwallow.ts';
import { activateMainView } from './ui/mainViewController.ts';
import { getProviderConfigSnapshot } from './config/providerConfig.service.ts';
import { parseExamArrayJSON, parseSingleExamQuestion } from './exam/parsing.ts';
import { restoreExamActiveProvider } from './exam/generation.ts';
import { resetExamSaveState } from './exam/persistence.ts';
import { createExamFormDraft, type ExamFormDraft } from './state/exam.ts';
import { registerExamSaveReset } from './app/lifecycle/examSaveReset.ts';

export { parseExamArrayJSON, parseSingleExamQuestion };

registerExamSaveReset(resetExamSaveState);

export function prepareExamView() {
  activateMainView('examView', document);
  dispatchUi({ type: 'ui/set', key: '_examInView', value: true });
}
export async function openExamPanel() {
  const { mountExamView } = await import('./react/exam/mount.tsx');
  mountExamView();
  prepareExamView();
  renderExamForm();
}

export function closeExamView() {
  const readOnly = stateStore.read('examReadOnly');
  dispatchExam({ type: 'exam/patch', patch: {
    examCancel: true,
    examReadOnly: false,
  } });
  dispatchUi({ type: 'ui/set', key: '_examInView', value: false });
  try { restoreExamActiveProvider(); } catch (error) { reportSwallow(error, 'exam.closeExamView.restoreProvider'); }

  if (readOnly || stateStore.read('currentSessionId')) {
    activateMainView('chatView', document);
    try { pushChatIdToURL(stateStore.read('currentSessionId')); } catch (error) { reportSwallow(error, 'exam.closeExamView.pushChatId'); }
  } else {
    activateMainView('topicSetup', document);
    try { setExamIdInURL(null); } catch (error) { reportSwallow(error, 'exam.closeExamView.clearExamId'); }
  }
}

export function renderExamForm(draft: Partial<ExamFormDraft> = {}) {
  const providerConfig = getProviderConfigSnapshot();
  const formDraft = createExamFormDraft({
    model: providerConfig.activeId || '',
    ...draft,
  });
  dispatchExam({ type: 'exam/patch', patch: {
    examViewMode: 'form',
    examFormDraft: formDraft,
    examCancel: false,
    examQuestions: [],
    examAnswers: {},
    examSubmitted: false,
    examReadOnly: false,
    examStatusMessage: '',
    examStatusDetail: '',
  } });
}
