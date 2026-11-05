/* Must run before any react-native-web module evaluates (see rnwGlobal.ts). */
import '../rn/rnwGlobal';
import { useCallback, useEffect, useState } from 'react';
import { ExamFooter, ExamNavigation, ExamPanel, type ExamCommand } from '@socrates/ui/exam';
import type { ExamDraftPatch } from '@socrates/ui/exam-model';
import { dispatchExam, useExamStore, useUiStore } from '../../store/index.ts';
import { getProviderConfigSnapshot } from '../../config/providerConfig.service.ts';
import { examNavCurrentIdx, examNavJump, examNavStep } from '../../exam/navigation.ts';
import { cancelExamGeneration, runExamGeneration, selectExamOpt } from '../../exam/generation.ts';
import { closeExamView, renderExamForm } from '../../exam.ts';
import { scheduleExamAnswerSave, setExamAnswer, submitExam } from '../../exam/persistence.ts';
import { buildExamChrome, buildExamStrings } from '../../exam/copy.ts';
import { examActionsOf, examModeOf, examScreenOf, examTitleOf, type ExamSnapshot } from '../../exam/screen.ts';
import { useInlineMath } from '../rn/useInlineMath';
import { WebUiTheme } from '../rn/WebUiTheme';

/* Host ids kept from the DOM baseline: navigation.ts / persistence.ts query
 * them, and the Playwright specs address the same nodes. */
const EXAM_IDS = {
  topic: 'examTopic',
  instructions: 'examInstructions',
  count: 'examCountDisplay',
  modelTrigger: 'examModelTrigger',
  questionsContainer: 'examQuestionsContainer',
  questionCardPrefix: 'examQ',
};

function getExamProviders(): { id: string; label: string }[] {
  const snapshot = getProviderConfigSnapshot();
  return Array.isArray(snapshot.providers)
    ? snapshot.providers.filter((provider) => provider?.id).map((provider) => ({
      id: provider.id,
      label: provider.label || provider.model || provider.id,
    }))
    : [];
}

function useExamScrollSync(isInView: boolean, questions: unknown[], setCurrentIndex: (index: number) => void) {
  useEffect(() => {
    if (!isInView) return;
    let frame = 0;
    const syncCurrent = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        setCurrentIndex(examNavCurrentIdx());
      });
    };
    const body = document.getElementById('examViewBody');
    const scroller = document.getElementById('scrollContainer') || document.getElementById('msgScroll');
    body?.addEventListener('scroll', syncCurrent, { passive: true });
    scroller?.addEventListener('scroll', syncCurrent, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      body?.removeEventListener('scroll', syncCurrent);
      scroller?.removeEventListener('scroll', syncCurrent);
    };
  }, [isInView, questions, setCurrentIndex]);
}

export function ExamView() {
  const exam = useExamStore((snapshot) => ({
    questions: snapshot.examQuestions,
    answers: snapshot.examAnswers,
    submitted: snapshot.examSubmitted,
    topic: snapshot.examTopic,
    readOnly: snapshot.examReadOnly,
    mode: snapshot.examViewMode,
    draft: snapshot.examFormDraft,
    progress: snapshot.examProgress,
    message: snapshot.examStatusMessage,
    detail: snapshot.examStatusDetail,
    localeRevision: snapshot.examLocaleRevision,
  }));
  const isInView = useUiStore((snapshot) => snapshot._examInView);
  const [navigationPosition, setNavigationPosition] = useState<{ questions: typeof exam.questions; index: number }>({ questions: [], index: 0 });
  const currentIndex = navigationPosition.questions === exam.questions ? navigationPosition.index : 0;
  const setCurrentIndex = useCallback((index: number) => setNavigationPosition({ questions: exam.questions, index }), [exam.questions]);
  const renderText = useInlineMath();

  useExamScrollSync(isInView, exam.questions, setCurrentIndex);

  if (!isInView) return null;

  const snapshot: ExamSnapshot = {
    mode: exam.mode,
    questions: exam.questions,
    answers: exam.answers,
    submitted: exam.submitted,
    readOnly: exam.readOnly,
    topic: exam.topic,
    draft: exam.draft,
    progress: exam.progress,
    message: exam.message,
    detail: exam.detail,
    providers: getExamProviders(),
    current: currentIndex,
  };
  const strings = buildExamStrings();
  const chrome = buildExamChrome();
  const screen = examScreenOf(snapshot, chrome);
  const actions = examActionsOf(snapshot, chrome);
  const title = examTitleOf(snapshot, chrome);
  const showNav = examModeOf(snapshot) === 'questions' && !exam.submitted && !exam.readOnly && exam.questions.length > 0;

  function generateFromDraft() {
    if (!exam.draft.topic.trim()) {
      (document.getElementById('examTopic') as HTMLElement | null)?.focus();
      return;
    }
    void runExamGeneration(exam.draft);
  }

  function onCommand(command: ExamCommand, index?: number) {
    switch (command) {
      case 'close':
        closeExamView();
        break;
      case 'form':
        renderExamForm();
        break;
      case 'generate':
        generateFromDraft();
        break;
      case 'cancel':
        cancelExamGeneration();
        break;
      case 'submit':
        /* `submitExam` owns the gate: it scrolls the first unanswered card
         * into view instead of submitting. */
        submitExam();
        break;
      case 'previous': {
        const next = examNavStep(-1, currentIndex);
        if (next !== null) setCurrentIndex(next);
        break;
      }
      case 'next': {
        const next = examNavStep(1, currentIndex);
        if (next !== null) setCurrentIndex(next);
        break;
      }
      case 'jump':
        if (typeof index === 'number') {
          examNavJump(index);
          setCurrentIndex(index);
        }
        break;
    }
  }

  function onAnswer(index: number, value: string | number) {
    if (exam.readOnly) return;
    if (typeof value === 'number') {
      selectExamOpt(index, value);
    } else {
      setExamAnswer(index, value);
      scheduleExamAnswerSave();
    }
  }

  function onDraftChange(patch: ExamDraftPatch) {
    dispatchExam({
      type: 'exam/patch',
      patch: {
        examFormDraft: {
          ...exam.draft,
          ...patch,
          selectedTypes: { ...exam.draft.selectedTypes, ...patch.selectedTypes },
        },
      },
    });
  }

  return (
    <WebUiTheme>
      <h2 className="sr-only" id="examViewTitle">{title}</h2>
      <div className="exam-view-body" id="examViewBody">
        {showNav && screen.kind === 'questions' ? (
          <div className="exam-root-slot" id="examViewReactNav">
            <ExamNavigation
              current={screen.current}
              total={screen.questions.length}
              answered={screen.answered}
              isSubmitted={exam.submitted}
              strings={strings}
              onCommand={onCommand}
            />
          </div>
        ) : null}
        <div className="exam-root-slot" id="examViewReactBody">
          <ExamPanel
            screen={screen}
            strings={strings}
            onCommand={onCommand}
            onAnswer={onAnswer}
            onDraftChange={onDraftChange}
            renderText={renderText}
            ids={EXAM_IDS}
          />
        </div>
      </div>
      <div className="exam-view-footer" id="examViewFooter">
        <div className="exam-root-slot" id="examViewReactFooter">
          <ExamFooter actions={actions} onCommand={onCommand} />
        </div>
      </div>
    </WebUiTheme>
  );
}
