import type { ExamQuestion } from "./types.ts";
import { stateStore } from '../state/store.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { pushExamIdToURL } from '../session/store.ts';
import { toggleShareBtn } from '../ui/share.ts';
import { prefersReducedMotion } from '../ui/motion.ts';
import { renderExamResults } from './results.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


let _examAnswerSaveTimer: number|null|undefined = null;
let _examSaveInFlight: Promise<void> | null = null;
let _examSaveDirty = false;

export function setExamAnswer(index: number, value: string | number | undefined) {
  const answers = Object.assign({}, stateStore.read('examAnswers') || {});
  answers[index] = value;
  stateStore.dispatch({ type: 'state/set', key: 'examAnswers', value: answers });
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
  const qs = browserWindow.stateStore.read("examQuestions") as ExamQuestion[];
  const ans = browserWindow.stateStore.read("examAnswers") as Record<number, string | number | undefined>;
  const validQs = qs.filter(function (q: { type: string; }) { return q.type !== "error"; });
  if (!validQs.length) return;
  const missing: number[] = [];
  validQs.forEach(function (q: { type: string; }, i: number) {
    if (q.type === "multiple-choice" && ans[i] === undefined) missing.push(i + 1);
    if ((q.type === "fill-blank" || q.type === "short-answer") && (!ans[i] || String(ans[i]).trim() === "")) missing.push(i + 1);
  });
  if (missing.length) {
    const el = document.querySelector('.exam-q-card#examQ' + (missing[0] - 1));
    if (el) el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    return;
  }
  stateStore.dispatch({type:'state/set',key:'examSubmitted',value:true});
  saveExamSession();
  renderExamResults();
}

export function saveExamSession() {
  if (!browserWindow.CURRENT_USER) return;
  if (!browserWindow.stateStore.read("examTopic")) return;
  if (!browserWindow.stateStore.read("_examInView")) return;
  if (browserWindow.stateStore.read("examReadOnly")) return;
  if (_examSaveInFlight) {
    _examSaveDirty = true;
    return;
  }
  _examSaveDirty = false;
  doSaveExamSession();
}

export function doSaveExamSession() {
  const body: { id?: string; [key: string]: unknown } = {
    kind: "exam",
    topic: browserWindow.stateStore.read("examTopic"),
    title: browserWindow.stateStore.read("examTopic"),
    domain: browserWindow.stateStore.read("examTopic"),
    /* P_exam-mode — previously hardcoded to "chat" regardless of
       the active user mode. A tutor-mode session that branched into
       an exam would save as "chat", and on reload loadSession would
       see mode="chat" and set chat-style UI. Use window.appMode
       (which setAppMode() keeps in sync) so the session preserves
       its originating mode. */
    mode: browserWindow.appMode || "chat",
    phase: "chat",
    examData: {
      topic: browserWindow.stateStore.read("examTopic"),
      difficulty: browserWindow.stateStore.read("examDifficulty") || "intermediate",
      count: browserWindow.stateStore.read("examCount"),
      lang: browserWindow.stateStore.read("examLang") || "English",
      types: Array.isArray(browserWindow.stateStore.read("examTypes")) ? browserWindow.stateStore.read("examTypes") : [],
      questions: (browserWindow.stateStore.read("examQuestions") as ExamQuestion[]).map(function (q) {
        const c: ExamQuestion = { q: q.q, type: q.type, explanation: q.explanation || "" };
        if (q.opts) c.opts = q.opts;
        if (q.answer !== undefined) c.answer = q.answer;
        if (q.answers) c.answers = q.answers;
        return c;
      }),
      answers: browserWindow.stateStore.read("examAnswers") || {},
      submitted: !!browserWindow.stateStore.read("examSubmitted"),
      generatedAt: Date.now(),
    },
  };
  const currentSessionId = browserWindow.stateStore.read("currentSessionId");
  if (currentSessionId) body.id = currentSessionId;
  _examSaveInFlight = browserWindow.apiFetch("/api/sessions", { method: "POST", body: body })
    .then(function (response: unknown) {
      const id = response !== null && typeof response === 'object' && 'id' in response
        && typeof response.id === 'string' ? response.id : null;
      if (id) {
        stateStore.dispatch({type:'state/set',key:'currentSessionId',value:id});
        try { pushExamIdToURL(id) } catch (e) { reportSwallow(e, 'exam.doSaveExamSession.pushExamId'); }
      }
      /* P_recents-amplify — flush(), not schedule(): a brand-new exam row has
         to be in the sidebar the moment the save returns. */
      return Promise.resolve(browserWindow.flushRecentsReconcile?.()).then(function () {
        try { browserWindow.renderRecents() } catch (e) { reportSwallow(e, 'exam.doSaveExamSession.renderRecents'); }
        try { toggleShareBtn() } catch (e) { reportSwallow(e, 'exam.doSaveExamSession.toggleShareBtn'); }
      });
    })
    .catch(function (error: unknown) {
      console.warn("[exam] save failed:", error instanceof Error ? error.message : String(error));
    })
    .then(function () {
      _examSaveInFlight = null;
      if (_examSaveDirty) {
        _examSaveDirty = false;
        doSaveExamSession();
      }
    });
}
