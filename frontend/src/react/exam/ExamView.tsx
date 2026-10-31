import { useCallback, useEffect, useRef, useState } from 'react';
import { ExamActionFooter, type ExamAction } from './ExamActionFooter';
import { ExamNavigation, type ExamNavigationSnapshot } from './ExamNavigation';
import { ExamQuestionCard } from './ExamQuestionCard';
import { ExamResults } from './ExamResults';
import { ExamSetupBody, ExamSetupFooter, type ExamSetupSnapshot } from './ExamSetup';
import { ExamStatus } from './ExamStatus';
import { dispatchExam, useExamStore, useUiStore } from '../../store/index.ts';
import { getCurrentLanguage } from '../../i18n/languageState.ts';
import { i18n } from '../legacy/gateway.ts';
import { getProviderConfigSnapshot } from '../../config/providerConfig.service.ts';
import { formatMsg } from '../../render/markdown.ts';
import { buildExamResultsSnapshot } from '../../exam/results.ts';
import { examNavCurrentIdx, examNavJump, examNavStep } from '../../exam/navigation.ts';
import { cancelExamGeneration, runExamGeneration, selectExamOpt } from '../../exam/generation.ts';
import { closeExamView, renderExamForm } from '../../exam.ts';
import { scheduleExamAnswerSave, setExamAnswer, submitExam } from '../../exam/persistence.ts';
import type { ExamQuestion } from '../../exam/types.ts';
import type { ExamFormDraft } from '../../state/exam.ts';

function L(en: string, zh: string) {
  return getCurrentLanguage() === 'zh' ? zh : en;
}

function buildSetupText(): ExamSetupSnapshot['text'] {
  return {
    eyebrow: L('Assessment studio', '测评工作室'),
    heroTitle: L('Build a focused practice exam', '创建一份专注的练习考卷'),
    heroDescription: L('Choose the scope and challenge. Socrates will compose a balanced paper you can complete at your own pace.', '确定范围与难度，Socrates 会生成一份结构均衡、可按自己节奏完成的考卷。'),
    topic: i18n('exam.topic', 'Topic'),
    topicHelp: L('Name the subject or learning objective', '填写学科、章节或学习目标'),
    topicPlaceholder: L('e.g. Linear Algebra, World War II...', '如：线性代数、量子力学、二战…'),
    settings: L('Paper settings', '考卷设置'),
    settingsHelp: L('Select the model, difficulty, and length', '选择生成模型、难度与题量'),
    model: L('Model', '生成模型'),
    modelPlaceholder: L('Select a model', '选择模型'),
    noModels: L('No models available', '无可用模型'),
    difficulty: i18n('exam.difficulty', 'Difficulty'),
    count: i18n('exam.count', 'Questions'),
    fewer: L('Fewer', '减少'),
    more: L('More', '增加'),
    types: i18n('exam.types', 'Question types'),
    typesHelp: L('Keep at least one response format', '至少保留一种作答形式'),
    multipleChoice: L('Multiple choice', '选择题'),
    multipleChoiceHelp: L('Choose one answer', '从选项中选择答案'),
    fillBlank: L('Fill blank', '填空题'),
    fillBlankHelp: L('Recall key terms', '回忆关键概念或结果'),
    shortAnswer: L('Short answer', '简答题'),
    shortAnswerHelp: L('Explain your reasoning', '用自己的语言说明推理'),
    instructions: i18n('exam.instructions', 'Instructions'),
    instructionsHelp: L('Optional constraints for the examiner', '可选，补充覆盖范围或出题偏好'),
    instructionsPlaceholder: L('Specific topics to cover, or leave blank...', '具体说明要覆盖的知识点，留空则由 AI 决定…'),
    cancel: i18n('common.cancel', 'Cancel'),
    generate: i18n('exam.generate', 'Generate exam'),
    beginner: L('Beginner', '入门'),
    intermediate: L('Intermediate', '中级'),
    hard: L('Hard', '困难'),
    expert: L('Expert', '专家'),
  };
}

function buildQuestionCardData(question: ExamQuestion, index: number, total: number, savedAnswer: string | number | undefined) {
  const typeLabels: Record<string, string> = {
    'multiple-choice': L('Multiple choice', '选择题'),
    'fill-blank': L('Fill blank', '填空题'),
    'short-answer': L('Short answer', '简答题'),
    error: L('Failed', '生成失败'),
  };
  return {
    index,
    total,
    type: question.type,
    questionLabel: L('Question', '题目'),
    typeLabel: typeLabels[question.type] || question.type,
    questionHtml: formatMsg(question.q),
    options: Array.isArray(question.opts) ? question.opts.map((option) => ({
      letter: option.letter || '',
      html: formatMsg(option.text || ''),
    })) : [],
    savedAnswer: savedAnswer == null ? null : savedAnswer,
    answerLabel: L('Answer for question ', '第 ') + (index + 1) + L('', ' 题答案'),
    placeholder: L('Type your answer…', '输入你的答案…'),
  };
}

function ExamQuestionList({
  questions,
  answers,
  readOnly,
}: {
  questions: ExamQuestion[];
  answers: Record<string, string | number | undefined>;
  readOnly: boolean;
}) {
  function updateOption(index: number, value: number) {
    if (readOnly) return;
    selectExamOpt(index, value);
  }

  function updateText(index: number, value: string) {
    if (readOnly) return;
    setExamAnswer(index, value);
    scheduleExamAnswerSave();
  }

  return (
    <div id="examQuestionsContainer">
      {questions.map((question, index) => (
        <div className="exam-q-card" id={`examQ${index}`} data-idx={index} key={`${index}-${question.type}-${question.q}`}>
          <ExamQuestionCard
            {...buildQuestionCardData(question, index, questions.length, answers[index])}
            readOnly={readOnly}
            onOptionChange={updateOption}
            onTextChange={updateText}
          />
        </div>
      ))}
    </div>
  );
}

function progressSnapshot(progress: { index: number; total: number; step: string }) {
  const step = progress.step === 'generating'
    ? L(`Generating question ${progress.index + 1}…`, `正在生成第 ${progress.index + 1} 题…`)
    : progress.step === 'failed'
      ? L('Failed', '生成失败')
      : progress.step === 'parse-failed'
        ? L('Parse failed', '解析失败')
        : progress.step === 'finishing'
          ? L('Finishing your exam…', '正在完成考卷…')
          : L('Preparing…', '准备出题…');
  return {
    kind: 'loading' as const,
    progress: progress.total > 0 ? Math.round(92 * progress.index / progress.total) : 0,
    message: L('Generating your exam…', '正在生成考卷…'),
    step,
    subtitle: progress.index >= progress.total
      ? L('Finishing your exam…', '正在完成考卷…')
      : L(`Generating question ${progress.index + 1} of ${progress.total}…`, `正在生成第 ${progress.index + 1} / ${progress.total} 题…`),
  };
}

function actionList(mode: string, submitted: boolean, readOnly: boolean, questionCount: number): ExamAction[] {
  if (readOnly) return [{ command: 'close', label: i18n('common.close', L('Close', '关闭')), variant: 'outline' }];
  if (submitted) {
    return [
      { command: 'form', label: L('New Exam', '新考试') },
      { command: 'close', label: i18n('common.close', L('Close', '关闭')), variant: 'outline' },
    ];
  }
  if (mode === 'form') {
    return [
      { command: 'close', label: i18n('common.cancel', L('Cancel', '取消')), variant: 'outline' },
      { command: 'generate', label: i18n('exam.generate', L('Generate exam', '生成考卷')) },
    ];
  }
  if (mode === 'loading') {
    return [{ command: 'cancel', label: i18n('common.cancel', L('Cancel', '取消')), variant: 'outline' }];
  }
  if (mode === 'provider-required') {
    return [{ command: 'form', label: L('Back', '返回') }];
  }
  if (mode === 'cancelled' || mode === 'error' || questionCount === 0) {
    return [
      { command: 'form', label: L('Try again', '重新出题') },
      { command: 'close', label: i18n('common.close', L('Close', '关闭')), variant: 'outline' },
    ];
  }
  return [
    { command: 'submit', label: i18n('exam.submit', L('Submit for Grading', '提交批改')) },
    { command: 'close', label: i18n('common.close', L('Close', '关闭')), variant: 'outline' },
  ];
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
  const topicInputRef = useRef<HTMLInputElement>(null);
  const [navigationPosition, setNavigationPosition] = useState<{ questions: ExamQuestion[]; index: number }>({ questions: [], index: 0 });
  const currentIndex = navigationPosition.questions === exam.questions ? navigationPosition.index : 0;
  const setCurrentIndex = useCallback((index: number) => setNavigationPosition({ questions: exam.questions, index }), [exam.questions]);

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
  }, [isInView, exam.questions, setCurrentIndex]);

  if (!isInView) return null;

  const isResults = exam.submitted && !exam.readOnly;
  const hasQuestions = exam.questions.length > 0 || exam.mode === 'questions';
  const mode = isResults ? 'results' : hasQuestions ? 'questions' : exam.mode;
  const title = exam.submitted
    ? `${L('Exam Results: ', '考试结果：')}${exam.topic}`
    : mode === 'cancelled'
      ? L('Cancelled', '已取消')
      : mode === 'form' || mode === 'provider-required'
        ? L('Generate Exam', '生成考卷')
        : exam.topic || L('Generate Exam', '生成考卷');

  const providerSnapshot = getProviderConfigSnapshot();
  const providers = Array.isArray(providerSnapshot.providers)
    ? providerSnapshot.providers.filter((provider) => provider?.id).map((provider) => ({
      id: provider.id,
      label: provider.label || provider.model || provider.id,
    }))
    : [];

  const setupSnapshot: ExamSetupSnapshot = {
    ...exam.draft,
    count: String(exam.draft.count),
    providers,
    text: buildSetupText(),
  };

  function changeDraft(key: 'topic' | 'instructions' | 'count' | 'model' | 'difficulty' | 'selectedTypes', value: string | number | ExamFormDraft['selectedTypes']) {
    const draft = exam.draft;
    if (key === 'topic' && typeof value === 'string') dispatchExam({ type: 'exam/patch', patch: { examFormDraft: { ...draft, topic: value } } });
    else if (key === 'instructions' && typeof value === 'string') dispatchExam({ type: 'exam/patch', patch: { examFormDraft: { ...draft, instructions: value } } });
    else if (key === 'model' && typeof value === 'string') dispatchExam({ type: 'exam/patch', patch: { examFormDraft: { ...draft, model: value } } });
    else if (key === 'difficulty' && typeof value === 'string') dispatchExam({ type: 'exam/patch', patch: { examFormDraft: { ...draft, difficulty: value } } });
    else if (key === 'count' && typeof value === 'number') dispatchExam({ type: 'exam/patch', patch: { examFormDraft: { ...draft, count: value } } });
    else if (key === 'selectedTypes' && typeof value === 'object') dispatchExam({ type: 'exam/patch', patch: { examFormDraft: { ...draft, selectedTypes: value } } });
  }

  function runAction(command: string) {
    switch (command) {
      case 'close': closeExamView(); break;
      case 'form': renderExamForm(); break;
      case 'generate': generateFromDraft(); break;
      case 'cancel': cancelExamGeneration(); break;
      case 'submit': submitExam(); break;
    }
  }

  function generateFromDraft() {
    if (!exam.draft.topic.trim()) {
      topicInputRef.current?.focus();
      return;
    }
    void runExamGeneration(exam.draft);
  }

  const navigationSnapshot: ExamNavigationSnapshot = {
    current: currentIndex,
    total: exam.questions.length,
    answered: Object.keys(exam.answers).filter((key) => {
      const value = exam.answers[key];
      return value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > 0);
    }).map(Number),
    isSubmitted: exam.submitted,
    labels: {
      previous: L('Previous question', '上一题'),
      next: L('Next question', '下一题'),
      answered: L('answered', '已答'),
    },
  };
  const actions = actionList(mode, exam.submitted, exam.readOnly, exam.questions.length);

  function jumpTo(index: number) {
    examNavJump(index);
    setCurrentIndex(index);
  }

  function stepTo(direction: number) {
    const next = examNavStep(direction, currentIndex);
    if (next !== null) setCurrentIndex(next);
  }

  function renderContent() {
    if (mode === 'form') {
      return <ExamSetupBody snapshot={setupSnapshot} onDraftChange={changeDraft} topicInputRef={topicInputRef} />;
    }
    if (mode === 'loading') {
      return <ExamStatus snapshot={progressSnapshot(exam.progress)} />;
    }
    if (mode === 'provider-required') {
      return <ExamStatus snapshot={{ kind: 'empty', message: exam.message || L('Add and select a model in Settings first', '请先在设置中添加并选择一个模型') }} />;
    }
    if (mode === 'error') {
      return <ExamStatus snapshot={{ kind: 'error', message: exam.message || L('Generation failed — no questions', '生成失败：没有成功生成任何题目'), detail: exam.detail || undefined }} />;
    }
    if (mode === 'cancelled') {
      return <ExamStatus snapshot={{ kind: 'empty', message: exam.message || `${L('Generation cancelled', '已取消出题')}.` }} />;
    }
    if (isResults) {
      return <ExamResults snapshot={buildExamResultsSnapshot(exam.questions, exam.answers, L)} />;
    }
    return <ExamQuestionList questions={exam.questions} answers={exam.answers} readOnly={exam.readOnly} />;
  }

  return (
    <>
      <h2 className="sr-only" id="examViewTitle">{title}</h2>
      <div className="exam-view-body" id="examViewBody">
        {mode === 'questions' && exam.questions.length > 0 && !exam.submitted && (
          <div className="exam-root-slot" id="examViewReactNav">
            <ExamNavigation
              snapshot={navigationSnapshot}
              onStep={stepTo}
              onJump={jumpTo}
            />
          </div>
        )}
        <div className="exam-root-slot" id="examViewReactBody">{renderContent()}</div>
      </div>
      <div className="exam-view-footer" id="examViewFooter">
        <div className="exam-root-slot" id="examViewReactFooter">
          {mode === 'form'
            ? <ExamSetupFooter snapshot={setupSnapshot} onCancel={() => closeExamView()} onGenerate={generateFromDraft} />
            : <ExamActionFooter actions={actions} onCommand={runAction} />}
        </div>
      </div>
    </>
  );
}
