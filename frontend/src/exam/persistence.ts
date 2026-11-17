import type { ExamQuestion } from './types.ts';
import {
  dispatchExam,
  dispatchSession,
  examBridge,
  sessionBridge,
  uiBridge,
} from '../store/index.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { pushExamIdToURL } from '../session/store.ts';
import { toggleShareBtn } from '../ui/share.ts';
import { prefersReducedMotion } from '../ui/motion/index.ts';
import { apiFetch } from '../util/api/index.ts';
import { getCurrentUser } from '../app/lifecycle/index.ts';
import { getAppMode } from '../config/providers.ts';
import { flushRecentsReconcile } from '../session/recents.ts';
import { renderRecents } from '../ui/recentsView.ts';

let _examAnswerSaveTimer: number | null | undefined = null;
let _examSaveInFlight: Promise<void> | null = null;
let _examSaveDirty = false;

export function setExamAnswer(index: number, value: string | number | undefined) {
  const answers = Object.assign({}, examBridge.getSnapshot().examAnswers || {});
  answers[index] = value;
  dispatchExam({ type: 'exam/set', key: 'examAnswers', value: answers });
}

export function resetExamSaveState() {
  if (_examAnswerSaveTimer) clearTimeout(_examAnswerSaveTimer);
  _examAnswerSaveTimer = null;
  _examSaveInFlight = null;
  _examSaveDirty = false;
}

export function scheduleExamAnswerSave() {
  if (_examAnswerSaveTimer) clearTimeout(_examAnswerSaveTimer);
  _examAnswerSaveTimer = setTimeout(function () {
    _examAnswerSaveTimer = null;
    saveExamSession();
  }, 800);
}

export function submitExam() {
  const exam = examBridge.getSnapshot();
  const qs = exam.examQuestions as ExamQuestion[];
  const ans = exam.examAnswers as Record<number, string | number | undefined>;
  const validQs = qs.filter(function (q: { type: string }) {
    return q.type !== 'error';
  });
  if (!validQs.length) return;
  const missing: number[] = [];
  validQs.forEach(function (q: { type: string }, i: number) {
    if (q.type === 'multiple-choice' && ans[i] === undefined) missing.push(i + 1);
    if (
      (q.type === 'fill-blank' || q.type === 'short-answer') &&
      (!ans[i] || String(ans[i]).trim() === '')
    )
      missing.push(i + 1);
  });
  if (missing.length) {
    const el = document.querySelector(
      '#examQ' + (missing[0] - 1) + ', [data-exam-q="' + (missing[0] - 1) + '"]',
    );
    if (el)
      el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    return;
  }
  dispatchExam({ type: 'exam/patch', patch: { examSubmitted: true } });
  saveExamSession();
}

export function saveExamSession() {
  if (!getCurrentUser()) return;
  const exam = examBridge.getSnapshot();
  if (!exam.examTopic) return;
  if (!uiBridge.getSnapshot()._examInView) return;
  if (exam.examReadOnly) return;
  if (_examSaveInFlight) {
    _examSaveDirty = true;
    return;
  }
  _examSaveDirty = false;
  doSaveExamSession();
}

export function doSaveExamSession() {
  const exam = examBridge.getSnapshot();
  const body: { id?: string; [key: string]: unknown } = {
    kind: 'exam',
    topic: exam.examTopic,
    title: exam.examTopic,
    domain: exam.examTopic,
    /* Preserve the mode that originated the exam session. */
    mode: getAppMode(),
    phase: 'chat',
    examData: {
      topic: exam.examTopic,
      difficulty: exam.examDifficulty || 'intermediate',
      count: exam.examCount,
      lang: exam.examLang || 'English',
      types: Array.isArray(exam.examTypes) ? exam.examTypes : [],
      questions: (exam.examQuestions as ExamQuestion[]).map(function (q) {
        const c: ExamQuestion = { q: q.q, type: q.type, explanation: q.explanation || '' };
        if (q.opts) c.opts = q.opts;
        if (q.answer !== undefined) c.answer = q.answer;
        if (q.answers) c.answers = q.answers;
        return c;
      }),
      answers: exam.examAnswers || {},
      submitted: !!exam.examSubmitted,
      generatedAt: Date.now(),
    },
  };
  const currentSessionId = sessionBridge.getSnapshot().currentSessionId;
  if (currentSessionId) body.id = currentSessionId;
  _examSaveInFlight = apiFetch('/api/sessions', { method: 'POST', body: body })
    .then(function (response: unknown) {
      const id =
        response !== null &&
        typeof response === 'object' &&
        'id' in response &&
        typeof response.id === 'string'
          ? response.id
          : null;
      if (id) {
        dispatchSession({ type: 'session/set', key: 'currentSessionId', value: id });
        try {
          pushExamIdToURL(id);
        } catch (e) {
          reportSwallow(e, 'exam.doSaveExamSession.pushExamId');
        }
      }
      /* flush(), not schedule(): a brand-new exam row has
         to be in the sidebar the moment the save returns. */
      return flushRecentsReconcile().then(function () {
        try {
          renderRecents();
        } catch (e) {
          reportSwallow(e, 'exam.doSaveExamSession.renderRecents');
        }
        try {
          toggleShareBtn();
        } catch (e) {
          reportSwallow(e, 'exam.doSaveExamSession.toggleShareBtn');
        }
      });
    })
    .catch(function (error: unknown) {
      console.warn('[exam] save failed:', error instanceof Error ? error.message : String(error));
    })
    .then(function () {
      _examSaveInFlight = null;
      if (_examSaveDirty) {
        _examSaveDirty = false;
        doSaveExamSession();
      }
    });
}
