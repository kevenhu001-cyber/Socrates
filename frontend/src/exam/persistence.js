import { stateStore } from '../state/store.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { pushExamIdToURL } from '../session/store.js';
import { toggleShareBtn } from '../ui/share.js';
import { prefersReducedMotion } from '../ui/motion.js';
import { renderExamResults } from './results.js';

var _examAnswerSaveTimer = null;
var _examSaveInFlight = null;
var _examSaveDirty = false;

export function setExamAnswer(index, value) {
  var answers = Object.assign({}, stateStore.read('examAnswers') || {});
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
  var qs = window.stateStore.read("examQuestions");
  var ans = window.stateStore.read("examAnswers");
  var validQs = qs.filter(function (q) { return q.type !== "error"; });
  if (!validQs.length) return;
  var missing = [];
  validQs.forEach(function (q, i) {
    if (q.type === "multiple-choice" && ans[i] === undefined) missing.push(i + 1);
    if ((q.type === "fill-blank" || q.type === "short-answer") && (!ans[i] || String(ans[i]).trim() === "")) missing.push(i + 1);
  });
  if (missing.length) {
    var el = document.querySelector('.exam-q-card#examQ' + (missing[0] - 1));
    if (el) el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    return;
  }
  stateStore.dispatch({type:'state/set',key:'examSubmitted',value:true});
  saveExamSession();
  renderExamResults();
}

export function saveExamSession() {
  if (!window.CURRENT_USER) return;
  if (!window.stateStore.read("examTopic")) return;
  if (!window.stateStore.read("_examInView")) return;
  if (window.stateStore.read("examReadOnly")) return;
  if (_examSaveInFlight) {
    _examSaveDirty = true;
    return;
  }
  _examSaveDirty = false;
  doSaveExamSession();
}

export function doSaveExamSession() {
  var body = {
    kind: "exam",
    topic: window.stateStore.read("examTopic"),
    title: window.stateStore.read("examTopic"),
    domain: window.stateStore.read("examTopic"),
    /* P_exam-mode — previously hardcoded to "chat" regardless of
       the active user mode. A tutor-mode session that branched into
       an exam would save as "chat", and on reload loadSession would
       see mode="chat" and set chat-style UI. Use window.appMode
       (which setAppMode() keeps in sync) so the session preserves
       its originating mode. */
    mode: window.appMode || "chat",
    phase: "chat",
    examData: {
      topic: window.stateStore.read("examTopic"),
      difficulty: window.stateStore.read("examDifficulty") || "intermediate",
      count: window.stateStore.read("examCount"),
      lang: window.stateStore.read("examLang") || "English",
      types: Array.isArray(window.stateStore.read("examTypes")) ? window.stateStore.read("examTypes") : [],
      questions: window.stateStore.read("examQuestions").map(function (q) {
        var c = { q: q.q, type: q.type, explanation: q.explanation || "" };
        if (q.opts) c.opts = q.opts;
        if (q.answer !== undefined) c.answer = q.answer;
        if (q.answers) c.answers = q.answers;
        return c;
      }),
      answers: window.stateStore.read("examAnswers") || {},
      submitted: !!window.stateStore.read("examSubmitted"),
      generatedAt: Date.now(),
    },
  };
  if (window.stateStore.read("currentSessionId")) {
    body.id = window.stateStore.read("currentSessionId");
  }
  _examSaveInFlight = window.apiFetch("/api/sessions", { method: "POST", body: body })
    .then(function (r) {
      if (r && r.id) {
        stateStore.dispatch({type:'state/set',key:'currentSessionId',value:r.id});
        try { pushExamIdToURL(r.id) } catch (e) { reportSwallow(e, 'exam.doSaveExamSession.pushExamId'); }
      }
      /* P_recents-amplify — flush(), not schedule(): a brand-new exam row has
         to be in the sidebar the moment the save returns. */
      return window.flushRecentsReconcile().then(function () {
        try { window.renderRecents() } catch (e) { reportSwallow(e, 'exam.doSaveExamSession.renderRecents'); }
        try { toggleShareBtn() } catch (e) { reportSwallow(e, 'exam.doSaveExamSession.toggleShareBtn'); }
      });
    })
    .catch(function (e) {
      console.warn("[exam] save failed:", e && e.message);
    })
    .then(function () {
      _examSaveInFlight = null;
      if (_examSaveDirty) {
        _examSaveDirty = false;
        doSaveExamSession();
      }
    });
}
