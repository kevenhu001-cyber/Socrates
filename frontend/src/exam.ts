import type { ExamSetupSnapshot } from './react/exam/ExamSetup.tsx';
interface ExamCommandTarget { dataset: DOMStringMap }
interface ExamCommandDetail { command: string; eidx?: number; oidx?: number; selectedTypes?: Record<'mc' | 'fb' | 'sa', boolean>; difficulty?: string }
interface ExamDraft { topic?: string; instructions?: string; count?: string | number; model?: string; difficulty?: string; types?: Record<string, boolean> }
/* ─── Exam View Composition ───
   Owns delegated view events and the form view; generation, persistence,
   navigation and result rendering live under ./exam/.
   ============================================================ */

import { stateStore } from './state/store.ts';
import { pushChatIdToURL, setExamIdInURL } from './session/store.ts';
import { reportSwallow } from './util/reportSwallow.ts';

import { activateMainView } from './ui/mainViewController.ts';
import { getProviderConfigSnapshot } from './config/providerConfig.service.ts';
import { clearExamSetup, renderExamActions, renderExamSetup } from './react/exam/examUiHost.tsx';
import { clearExamNavigation } from './react/exam/examNavigationHost.tsx';
import { parseExamArrayJSON, parseSingleExamQuestion } from './exam/parsing.ts';
import { examNavCurrentIdx, examNavJump, examNavStep, refreshExamNavTally, renderExamNav, syncExamNav } from './exam/navigation.ts';
import { renderExamResults } from './exam/results.ts';
import { appendExamErrorCard, cancelExamGeneration, finishExamGeneration, paintQuestionCard, clearExamQuestionCards, renderAllQuestions, replaceStreamingCardWithQuestion, restoreExamActiveProvider, refreshExamGenerationStatus, runExamGeneration, selectExamOpt } from './exam/generation.ts';
import { doSaveExamSession, resetExamSaveState, saveExamSession, setExamAnswer, scheduleExamAnswerSave, submitExam } from './exam/persistence.ts';
import { examBody as _examBody, examFooter as _examFooter, examUiL as _examUiL, setExamTitle as _setExamTitle } from './exam/ui.ts';
import { ExamAction } from './react/exam/ExamActionFooter.tsx';
import { runtimeWindow as browserWindow } from "./types/runtimeWindow.ts";


export { parseExamArrayJSON, parseSingleExamQuestion };
export { clearExamSetup };
export { examNavCurrentIdx, examNavJump, examNavStep, refreshExamNavTally, renderExamNav, syncExamNav };
export { renderExamResults };
export {
  appendExamErrorCard, cancelExamGeneration, doSaveExamSession, finishExamGeneration,
  clearExamQuestionCards, paintQuestionCard, renderAllQuestions, replaceStreamingCardWithQuestion,
  refreshExamGenerationStatus, resetExamSaveState, saveExamSession, scheduleExamAnswerSave, selectExamOpt, setExamAnswer, submitExam,
};

/* ── module-level state ── */
let _examSelectedTypes: Record<'mc' | 'fb' | 'sa', boolean> = { mc: true, fb: true, sa: false };
let _examDifficulty = "intermediate";
let _examListenersMounted = false;
let _examFormRevision = 0;

const EXAM_COMMANDS: Record<string, (target: ExamCommandTarget) => unknown> = {
  close: () => closeExamView(),
  form: () => renderExamForm(),
  generate: () => startExamGeneration(),
  cancel: () => cancelExamGeneration(),
  submit: () => submitExam(),
  'toggle-model': () => toggleExamModelMenu(),
  'select-model': (target: ExamCommandTarget) => selectExamModel(target.dataset.mid || ""),
  'toggle-type': (target: ExamCommandTarget) => toggleExamType(target.dataset.type || ""),
  difficulty: (target: ExamCommandTarget) => selectExamDifficulty(target.dataset.diff || "intermediate"),
  count: (target: ExamCommandTarget) => adjustExamCount(Number(target.dataset.delta || 0)),
  'answer-option': (target: ExamCommandTarget) => selectExamOpt(Number(target.dataset.eidx), Number(target.dataset.oidx)),
  'nav-step': (target: ExamCommandTarget) => examNavStep(Number(target.dataset.delta || 0)),
  'nav-jump': (target: ExamCommandTarget) => examNavJump(Number(target.dataset.navIdx || 0)),
};

function handleExamClick(event: MouseEvent) {
  const view = event.currentTarget as HTMLElement;
  const target = (event.target as Element)?.closest && (event.target as Element).closest<HTMLElement>("[data-exam-command]");
  if (!target || !view.contains(target)) return;
  const handler = EXAM_COMMANDS[target.getAttribute("data-exam-command") || ""];
  if (handler) handler(target);
}

function handleExamCustomCommand(event: Event) {
  const detail = (event as CustomEvent<ExamCommandDetail>).detail || {} as ExamCommandDetail;
  if (detail.command === 'answer-option') {
    selectExamOpt(Number(detail.eidx), Number(detail.oidx));
    return;
  }
  if (detail.command === 'set-types') {
    if (detail.selectedTypes) _examSelectedTypes = detail.selectedTypes;
    return;
  }
  if (detail.command === 'set-difficulty') {
    _examDifficulty = detail.difficulty || 'intermediate';
    return;
  }
  if ('dataset' in detail && detail.dataset && typeof detail.dataset === 'object') {
    EXAM_COMMANDS[detail.command]?.(detail as unknown as ExamCommandTarget);
  }
}

function handleExamInput(event: Event) {
  const view = event.currentTarget;
  const input = (event.target as Element)!.closest<HTMLInputElement>(".exam-q-fill-input[data-eidx]");
  if (!input || !(view as Node)!.contains(input)) return;
  setExamAnswer(Number(input.dataset.eidx), input.value);
  refreshExamNavTally();
  scheduleExamAnswerSave();
}

export function mountExamListeners() {
  const view = document.getElementById("examView");
  if (!view || _examListenersMounted) return;
  _examListenersMounted = true;
  view.addEventListener("click", handleExamClick);
  view.addEventListener("socrates:exam-command", handleExamCustomCommand);
  view.addEventListener("input", handleExamInput);
}

/* ── open / close ── */
/* prepareExamView — DOM + state scaffolding for any "exam is now
   visible" path (fresh open via sidebar, restore from /api/sessions,
   or deep-link from ?exam=<uuid>). Does NOT render the form — callers
   are responsible for painting content into #examViewBody so this
   helper can be reused by loadExamSession (which has its own
   paintRestoredQuestionCard loop instead of renderExamForm). */
export function prepareExamView() {
  const ev = document.getElementById("examView");
  if (!ev) return;
  /* P_exam-nav — Exam is now a first-class sidebar panel (was an overlay).
     The shared view controller hides core/workspace siblings, collapses
     .main-inner, and applies body.exam-active as one transition. */
  activateMainView("examView", document);
  /* Show the exam-only top-bar elements (#examTitleBar);
     the shared view controller already applied the conversation chrome. */
  toggleExamOnlyTopBar(true);
  /* The top bar is the single visible exam title. */
  _setExamTitle(browserWindow.stateStore.read("examTopic") || (browserWindow._currentLang === "zh" ? "生成考卷" : "Generate Exam"));
  /* Hide chat-specific top-bar elements that are meaningless in exam mode. */
  ["chatModelWrap"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
  stateStore.dispatch({type:'state/set',key:'_examInView',value:true});
  if (!browserWindow.stateStore.read("_examScrollBound")) {
    const cont = document.getElementById("examViewBody");
    if (cont) {
      cont.addEventListener("scroll", function () {
        if (browserWindow.stateStore.read("_examInView")) syncExamNav();
      });
    }
    const sc = document.getElementById("scrollContainer") || document.getElementById("msgScroll");
    if (sc) {
      sc.addEventListener("scroll", function () {
        if (browserWindow.stateStore.read("_examInView")) syncExamNav();
      });
    }
    stateStore.dispatch({type:'state/set',key:'_examScrollBound',value:true});
  }
}

export function openExamPanel() {
  prepareExamView();
  renderExamForm();
}

/* Legacy alias — the Extensions picker and any other callers that still
   reach for window.openExamModal() keep working. */
export function openExamModal() { openExamPanel(); }

export function closeExamView() {
  toggleExamOnlyTopBar(false);
  /* Mark the cancel flag so any in-flight generation loop bails. The
     state itself (questions / answers / topic) is preserved — closing
     the view is not the same as discarding the exam; resetState()
     handles the latter and is called from resetApp(). */
  stateStore.dispatch({type:'state/batch',patch:{
    examCancel:true,_examInView:false,examReadOnly:false
  }});
  try { restoreExamActiveProvider() } catch (e) { reportSwallow(e, 'exam.closeExamView.restoreProvider'); }
  /* Decide what to reveal behind the exam panel. Mirrors the
     chat/tutor pattern: if a session is open, go back to chatView;
     otherwise surface the topic-setup landing page. */
  if (browserWindow.stateStore.read("currentSessionId")) {
    activateMainView("chatView", document);
    try { pushChatIdToURL(browserWindow.stateStore.read("currentSessionId")) } catch (e) { reportSwallow(e, 'exam.closeExamView.pushChatId'); }
  } else {
    activateMainView("topicSetup", document);
    try { setExamIdInURL(null) } catch (e) { reportSwallow(e, 'exam.closeExamView.clearExamId'); }
  }
}

export function closeExamModal() {
  closeExamView();
}

/* Show / hide the top-bar elements that are only meaningful while an
   exam is in view (#examTitleBar). Everything else in
   the top-bar follows the active view through mainViewController. */
function toggleExamOnlyTopBar(show: boolean|undefined) {
  document.body.classList.toggle("exam-active", show);
  const els = document.querySelectorAll("[data-exam-only='true']");
  els.forEach(function (el) {
    if (show) el.classList.remove("hidden");
    else el.classList.add("hidden");
  });
}

/* ── render form ── */
/* P_exam-ui — redesigned as a clean, ChatGPT-style setup card:
   an intro line, a required Topic field, a Settings card with the model
   dropdown + segmented Difficulty control + a stepper for the question
   count, question-type pills, and an optional instructions box. */
function examFormCopy(L: { (en: any,zh: any): any; (arg0: string,arg1: string): any; }) {
  return {
    eyebrow: L("Assessment studio", "测评工作室"),
    heroTitle: L("Build a focused practice exam", "创建一份专注的练习考卷"),
    heroDescription: L("Choose the scope and challenge. Socrates will compose a balanced paper you can complete at your own pace.", "确定范围与难度，Socrates 会生成一份结构均衡、可按自己节奏完成的考卷。"),
    topic: browserWindow.t("exam.topic"),
    topicHelp: L("Name the subject or learning objective", "填写学科、章节或学习目标"),
    topicPlaceholder: L("e.g. Linear Algebra, World War II...", "如：线性代数、量子力学、二战…"),
    settings: L("Paper settings", "考卷设置"),
    settingsHelp: L("Select the model, difficulty, and length", "选择生成模型、难度与题量"),
    model: L("Model", "生成模型"),
    modelPlaceholder: L("Select a model", "选择模型"),
    noModels: L("No models available", "无可用模型"),
    difficulty: browserWindow.t("exam.difficulty"),
    count: browserWindow.t("exam.count"),
    fewer: L("Fewer", "减少"),
    more: L("More", "增加"),
    types: browserWindow.t("exam.types"),
    typesHelp: L("Keep at least one response format", "至少保留一种作答形式"),
    multipleChoice: L("Multiple choice", "选择题"),
    multipleChoiceHelp: L("Choose one answer", "从选项中选择答案"),
    fillBlank: L("Fill blank", "填空题"),
    fillBlankHelp: L("Recall key terms", "回忆关键概念或结果"),
    shortAnswer: L("Short answer", "简答题"),
    shortAnswerHelp: L("Explain your reasoning", "用自己的语言说明推理"),
    instructions: browserWindow.t("exam.instructions"),
    instructionsHelp: L("Optional constraints for the examiner", "可选，补充覆盖范围或出题偏好"),
    instructionsPlaceholder: L("Specific topics to cover, or leave blank...", "具体说明要覆盖的知识点，留空则由 AI 决定…"),
    cancel: browserWindow.t("common.cancel"),
    generate: browserWindow.t("exam.generate"),
    beginner: L("Beginner", "入门"),
    intermediate: L("Intermediate", "中级"),
    hard: L("Hard", "困难"),
    expert: L("Expert", "专家"),
  };
}

function examProviderOptions() {
  const providerConfig = getProviderConfigSnapshot();
  const providerList = Array.isArray(providerConfig.providers) ? providerConfig.providers : [];
  const providers = providerList.filter((provider) => provider?.id).map((provider) => ({
    id: provider.id,
    label: provider.label || provider.model || provider.id,
  }));
  return {
    providers,
    activeId: providers.find((provider) => provider.id === providerConfig.activeId)?.id || "",
  };
}

function buildExamSetupSnapshot(draft: ExamDraft | null, key: number): ExamSetupSnapshot {
  const L = (en: any, zh: any) => browserWindow._currentLang === "zh" ? zh : en;
  const defaults = { mc: true, fb: true, sa: false };
  _examSelectedTypes = Object.assign({}, defaults, draft?.types ?? {});
  _examDifficulty = draft?.difficulty ?? "intermediate";
  const { providers, activeId } = examProviderOptions();
  return {
    key,
    locale: browserWindow._currentLang === "en" ? "en" : "zh",
    topic: String(draft?.topic ?? ""),
    instructions: String(draft?.instructions ?? ""),
    count: String(draft?.count ?? "5"),
    model: String(draft?.model || activeId),
    difficulty: _examDifficulty,
    selectedTypes: Object.assign({}, _examSelectedTypes),
    providers,
    text: examFormCopy(L),
  };
}

export function renderExamFooterActions(actions: ExamAction[]) {
  const host = document.getElementById('examViewReactFooter');
  if (host) renderExamActions(host, actions);
}

export function renderExamForm(draft: ExamDraft | null = null) {
  clearExamQuestionCards();
  clearExamNavigation();
  const legacyBody = _examBody();
  const legacyFooter = _examFooter();
  if (legacyBody) legacyBody.replaceChildren();
  if (legacyFooter) legacyFooter.replaceChildren();
  _setExamTitle(browserWindow._currentLang === "zh" ? "生成考卷" : "Generate Exam");
  const meta = document.getElementById("examViewMeta");
  if (meta) meta.textContent = "";
  stateStore.dispatch({type:'state/batch',patch:{
    examCancel:false,examQuestions:[],examAnswers:{},examSubmitted:false
  }});

  const snapshot = buildExamSetupSnapshot(draft, ++_examFormRevision);

  const bodyHost = document.getElementById("examViewReactBody");
  const footerHost = document.getElementById("examViewReactFooter");
  const commandHost = document.getElementById("examView");
  if (!bodyHost || !footerHost || !commandHost) return;
  renderExamSetup(bodyHost, footerHost, commandHost, snapshot);
}

/* ── Custom model dropdown ── */
export function toggleExamModelMenu() {
  const menu = document.getElementById("examModelMenu");
  const trigger = document.getElementById("examModelTrigger");
  if (!menu) return;
  const isOpen = menu.classList.contains("open");
  /* Close all exam-model-menus first */
  document.querySelectorAll(".exam-model-menu").forEach(function (m) { m.classList.remove("open"); });
  document.querySelectorAll(".exam-model-trigger").forEach(function (t) { t.classList.remove("open"); });
  if (!isOpen) {
    menu.classList.add("open");
    if (trigger) trigger.classList.add("open");
    /* Click outside to close */
    setTimeout(function () {
      function onDoc(e: Event) {
        if (!(e.target as Element)!.closest(".exam-model-wrap")) {
          menu!.classList.remove("open");
          if (trigger) trigger.classList.remove("open");
          document.removeEventListener("click", onDoc, true);
        }
      }
      document.addEventListener("click", onDoc, true);
    }, 0);
  }
}

export function selectExamModel(id: any) {
  const input = document.getElementById("examModel");
  const label = document.getElementById("examModelLabel");
  const opts = document.querySelectorAll(".exam-model-opt");
  if (input) (input as HTMLInputElement).value = id;
  opts.forEach(function (o) {
    o.classList.toggle("active", (o as HTMLElement).dataset.mid === id);
    if ((o as HTMLElement).dataset.mid === id && label) label.textContent = o.textContent;
  });
  /* Close menu */
  const menu = document.getElementById("examModelMenu");
  const trigger = document.getElementById("examModelTrigger");
  if (menu) menu.classList.remove("open");
  if (trigger) trigger.classList.remove("open");
}

export function toggleExamType(type: string) {
  if (type !== 'mc' && type !== 'fb' && type !== 'sa') return;
  const btn = document.querySelector('.exam-form-toggle-card[data-type="' + type + '"]');
  if (!btn) return;
  const countActive = document.querySelectorAll('.exam-form-toggle-card.active').length;
  if (btn.classList.contains("active") && countActive <= 1) return;
  btn.classList.toggle("active");
  btn.setAttribute("aria-pressed", String(btn.classList.contains("active")));
  _examSelectedTypes[type] = btn.classList.contains("active");
}

/* Difficulty segmented control — pick one value and highlight it. */
export function selectExamDifficulty(val: string | null) {
  _examDifficulty = val || 'intermediate';
  document.querySelectorAll("#examDifficultySeg .exam-seg-btn").forEach(function (b) {
    b.classList.toggle("active", b.getAttribute("data-diff") === val);
  });
}

/* Question-count stepper — clamp to 1..50 and mirror to the hidden input
   that startExamGeneration reads. */
export function adjustExamCount(delta: number) {
  const input = document.getElementById("examCount");
  const display = document.getElementById("examCountDisplay");
  let cur = parseInt(input ? (input as HTMLInputElement).value : '', 10);
  if (!(cur >= 1)) cur = 5;
  const next = Math.max(1, Math.min(50, cur + delta));
  if (input) (input as HTMLInputElement).value = String(next);
  if (display) display.textContent = String(next);
}

export function startExamGeneration() {
  return runExamGeneration({
    difficulty: _examDifficulty,
    selectedTypes: Object.assign({}, _examSelectedTypes),
  });
}

function refreshExamFormI18n() {
  const form = document.querySelector(".exam-form-container");
  if (!form) return false;
  const snapshot = {
    topic: ((document.getElementById("examTopic") || {}) as HTMLInputElement).value || "",
    instructions: ((document.getElementById("examInstructions") || {}) as HTMLInputElement).value || "",
    count: ((document.getElementById("examCount") || {}) as HTMLInputElement).value || "5",
    model: ((document.getElementById("examModel") || {}) as HTMLInputElement).value || "",
    difficulty: _examDifficulty,
    types: Object.assign({}, _examSelectedTypes)
  };
  renderExamForm(snapshot);
  return true;
}

function refreshExamQuestionsI18n() {
  const questions = browserWindow.stateStore.read("examQuestions");
  if (!Array.isArray(questions) || !questions.length) return false;
  renderAllQuestions();
  renderExamNav();
  if (!document.getElementById('examViewReactFooter')) return true;
  const valid = questions.some(function (q) { return q.type !== "error"; });
  renderExamFooterActions(valid
    ? [
      { command: 'submit', label: _examUiL('Submit for Grading', '提交批改') },
      { command: 'close', label: _examUiL('Close', '关闭'), variant: 'outline' },
    ]
    : [
      { command: 'form', label: _examUiL('Try Again', '重新出题') },
      { command: 'close', label: _examUiL('Close', '关闭'), variant: 'outline' },
    ]);
  return true;
}

function refreshExamGenerationI18n() {
  refreshExamGenerationStatus();
  if (document.querySelector('#examViewReactBody [data-slot="progress"]')) {
    renderExamFooterActions([
      { command: 'cancel', label: _examUiL('Cancel', '取消'), variant: 'outline' },
    ]);
  }
}

/* Repaint dynamic exam chrome when the application language changes.
   Generated question text remains in the language requested from the model,
   while labels, controls, placeholders and results follow the UI language. */
export function refreshExamI18n() {
  if (!browserWindow.stateStore.read("_examInView")) return;
  if (refreshExamFormI18n()) return;
  if (browserWindow.stateStore.read("examSubmitted")) {
    renderExamResults();
    return;
  }
  if (refreshExamQuestionsI18n()) return;
  refreshExamGenerationI18n();
}
