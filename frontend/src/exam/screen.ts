/** Turns the SPA exam store snapshot into the shared `ExamScreen` union.
 *  Pure: no store writes, no DOM. `ExamView.tsx` only wires callbacks. */
import type { ExamAction, ExamScreen } from '@socrates/ui/exam';
import { examAnsweredIndices } from '@socrates/ui/exam-model';
import type { ExamFormDraft, ExamProgress } from '../state/exam.ts';
import { toExamAnswers, toExamQuestions } from './adapt.ts';
import type { ExamChromeCopy } from './copy.ts';
import { buildExamResultsSnapshot } from './results.ts';
import { examUiL } from './ui.ts';
import type { ExamQuestion as RawExamQuestion } from './types.ts';

export interface ExamSnapshot {
  mode: string;
  questions: RawExamQuestion[];
  answers: Record<string, string | number | undefined>;
  submitted: boolean;
  readOnly: boolean;
  topic: string;
  draft: ExamFormDraft;
  progress: ExamProgress;
  message: string;
  detail: string;
  providers: readonly { id: string; label: string }[];
  current: number;
}

export type ExamMode = 'form' | 'loading' | 'provider-required' | 'error' | 'cancelled' | 'questions' | 'results';

export function examModeOf(snapshot: ExamSnapshot): ExamMode {
  if (snapshot.submitted && !snapshot.readOnly) return 'results';
  if (snapshot.questions.length > 0 || snapshot.mode === 'questions') return 'questions';
  if (snapshot.mode === 'loading' || snapshot.mode === 'provider-required' || snapshot.mode === 'error' || snapshot.mode === 'cancelled') {
    return snapshot.mode;
  }
  return 'form';
}

export function examTitleOf(snapshot: ExamSnapshot, chrome: ExamChromeCopy): string {
  const L = examUiL;
  if (snapshot.submitted) return `${L('Exam Results: ', '考试结果：')}${snapshot.topic}`;
  if (snapshot.mode === 'cancelled') return L('Cancelled', '已取消');
  if (snapshot.mode === 'form' || snapshot.mode === 'provider-required') return chrome.generate;
  return snapshot.topic || chrome.generate;
}

function loadingStep(progress: ExamProgress): string {
  const L = examUiL;
  if (progress.step === 'generating') return L(`Generating question ${progress.index + 1}…`, `正在生成第 ${progress.index + 1} 题…`);
  if (progress.step === 'failed') return L('Failed', '生成失败');
  if (progress.step === 'parse-failed') return L('Parse failed', '解析失败');
  if (progress.step === 'finishing') return L('Finishing your exam…', '正在完成考卷…');
  return L('Preparing…', '准备出题…');
}

export function examScreenOf(snapshot: ExamSnapshot, chrome: ExamChromeCopy): ExamScreen {
  const L = examUiL;
  const mode = examModeOf(snapshot);

  if (mode === 'form') return { kind: 'form', draft: snapshot.draft, providers: [...snapshot.providers] };

  if (mode === 'loading') {
    const { index, total } = snapshot.progress;
    return {
      kind: 'loading',
      percent: total > 0 ? Math.round((92 * index) / total) : 0,
      message: L('Generating your exam…', '正在生成考卷…'),
      step: loadingStep(snapshot.progress),
      subtitle: index >= total
        ? L('Finishing your exam…', '正在完成考卷…')
        : L(`Generating question ${index + 1} of ${total}…`, `正在生成第 ${index + 1} / ${total} 题…`),
    };
  }

  if (mode === 'provider-required') return { kind: 'empty', message: snapshot.message || chrome.addModel };
  if (mode === 'error') return { kind: 'error', message: snapshot.message || chrome.noQuestions, detail: snapshot.detail || undefined };
  if (mode === 'cancelled') return { kind: 'empty', message: snapshot.message || `${chrome.cancelled}.` };

  if (mode === 'results') {
    return { kind: 'results', results: buildExamResultsSnapshot(snapshot.questions, snapshot.answers) };
  }

  const questions = toExamQuestions(snapshot.questions);
  const answers = toExamAnswers(snapshot.answers);
  return {
    kind: 'questions',
    questions,
    answers,
    current: snapshot.current,
    answered: examAnsweredIndices(questions, answers),
    readOnly: snapshot.readOnly,
  };
}

export function examActionsOf(snapshot: ExamSnapshot, chrome: ExamChromeCopy): ExamAction[] {
  const mode = examModeOf(snapshot);
  if (snapshot.readOnly) return [{ command: 'close', label: chrome.close, tone: 'quiet' }];
  if (snapshot.submitted) {
    return [
      { command: 'form', label: chrome.newExam, tone: 'solid' },
      { command: 'close', label: chrome.close, tone: 'quiet' },
    ];
  }
  if (mode === 'form') {
    return [
      { command: 'close', label: chrome.cancel, tone: 'quiet' },
      { command: 'generate', label: chrome.generate, tone: 'solid' },
    ];
  }
  if (mode === 'loading') return [{ command: 'cancel', label: chrome.cancel, tone: 'quiet' }];
  if (mode === 'provider-required') return [{ command: 'form', label: chrome.back, tone: 'quiet' }];
  if (mode === 'cancelled' || mode === 'error' || snapshot.questions.length === 0) {
    return [
      { command: 'form', label: chrome.tryAgain, tone: 'solid' },
      { command: 'close', label: chrome.close, tone: 'quiet' },
    ];
  }
  return [
    { command: 'submit', label: chrome.submit, tone: 'solid' },
    { command: 'close', label: chrome.close, tone: 'quiet' },
  ];
}
