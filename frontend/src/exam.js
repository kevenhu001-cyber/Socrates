/* ─── Exam View Composition ───
   Owns delegated view events and the form view; generation, persistence,
   navigation and result rendering live under ./exam/.
   ============================================================ */

import { esc } from './render/helpers.js';
import { stateStore } from './state/store.js';
import { pushChatIdToURL, setExamIdInURL } from './session/store.js';
import { reportSwallow } from './util/reportSwallow.ts';

import { activateMainView } from './ui/mainViewController.js';
import { getProviderConfigSnapshot } from './config/providerConfig.service.ts';
import { parseExamArrayJSON, parseSingleExamQuestion } from './exam/parsing.js';
import {
  examNavCurrentIdx, examNavJump, examNavStep, refreshExamNavTally, renderExamNav, syncExamNav,
} from './exam/navigation.js';
import { renderExamResults } from './exam/results.js';
import {
  appendExamErrorCard, cancelExamGeneration, finishExamGeneration, paintQuestionCard,
  renderAllQuestions, replaceStreamingCardWithQuestion, restoreExamActiveProvider,
  runExamGeneration, selectExamOpt,
} from './exam/generation.js';
import {
  doSaveExamSession, resetExamSaveState, saveExamSession, setExamAnswer,
  scheduleExamAnswerSave, submitExam,
} from './exam/persistence.js';
import {
  examBody as _examBody, examFooter as _examFooter, examUiL as _examUiL, setExamTitle as _setExamTitle,
} from './exam/ui.js';

export { parseExamArrayJSON, parseSingleExamQuestion };
export { examNavCurrentIdx, examNavJump, examNavStep, refreshExamNavTally, renderExamNav, syncExamNav };
export { renderExamResults };
export {
  appendExamErrorCard, cancelExamGeneration, doSaveExamSession, finishExamGeneration,
  paintQuestionCard, renderAllQuestions, replaceStreamingCardWithQuestion,
  resetExamSaveState, saveExamSession, scheduleExamAnswerSave, selectExamOpt, setExamAnswer, submitExam,
};

/* ── module-level state ── */
var _examSelectedTypes = { mc: true, fb: true, sa: false };
var _examDifficulty = "intermediate";
var _examListenersMounted = false;

const EXAM_COMMANDS = {
  close: () => closeExamView(),
  form: () => renderExamForm(),
  generate: () => startExamGeneration(),
  cancel: () => cancelExamGeneration(),
  submit: () => submitExam(),
  'toggle-model': () => toggleExamModelMenu(),
  'select-model': (target) => selectExamModel(target.dataset.mid || ""),
  'toggle-type': (target) => toggleExamType(target.dataset.type || ""),
  difficulty: (target) => selectExamDifficulty(target.dataset.diff || "intermediate"),
  count: (target) => adjustExamCount(Number(target.dataset.delta || 0)),
  'answer-option': (target) => selectExamOpt(Number(target.dataset.eidx), Number(target.dataset.oidx)),
  'nav-step': (target) => examNavStep(Number(target.dataset.delta || 0)),
  'nav-jump': (target) => examNavJump(Number(target.dataset.navIdx || 0)),
};

function handleExamClick(event) {
  const view = event.currentTarget;
  const target = event.target.closest && event.target.closest("[data-exam-command]");
  if (!target || !view.contains(target)) return;
  const handler = EXAM_COMMANDS[target.getAttribute("data-exam-command")];
  if (handler) handler(target);
}

function handleExamInput(event) {
  const view = event.currentTarget;
  const input = event.target.closest && event.target.closest(".exam-q-fill-input[data-eidx]");
  if (!input || !view.contains(input)) return;
  setExamAnswer(Number(input.dataset.eidx), input.value);
  refreshExamNavTally();
  scheduleExamAnswerSave();
}

export function mountExamListeners() {
  var view = document.getElementById("examView");
  if (!view || _examListenersMounted) return;
  _examListenersMounted = true;
  view.addEventListener("click", handleExamClick);
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
  var ev = document.getElementById("examView");
  if (!ev) return;
  /* P_exam-nav — Exam is now a first-class sidebar panel (was an overlay).
     The shared view controller hides core/workspace siblings, collapses
     .main-inner, and applies body.exam-active as one transition. */
  activateMainView("examView", document);
  /* Show the exam-only top-bar elements (#examTitleBar);
     the shared view controller already applied the conversation chrome. */
  toggleExamOnlyTopBar(true);
  /* The top bar is the single visible exam title. */
  _setExamTitle(window.stateStore.read("examTopic") || (window._currentLang === "zh" ? "生成考卷" : "Generate Exam"));
  /* Hide chat-specific top-bar elements that are meaningless in exam mode. */
  ["chatModelWrap"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
  stateStore.dispatch({type:'state/set',key:'_examInView',value:true});
  if (!window.stateStore.read("_examScrollBound")) {
    var cont = document.getElementById("examViewBody");
    if (cont) {
      cont.addEventListener("scroll", function () {
        if (window.stateStore.read("_examInView")) syncExamNav();
      });
    }
    var sc = document.getElementById("scrollContainer") || document.getElementById("msgScroll");
    if (sc) {
      sc.addEventListener("scroll", function () {
        if (window.stateStore.read("_examInView")) syncExamNav();
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
  if (window.stateStore.read("currentSessionId")) {
    activateMainView("chatView", document);
    try { pushChatIdToURL(window.stateStore.read("currentSessionId")) } catch (e) { reportSwallow(e, 'exam.closeExamView.pushChatId'); }
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
function toggleExamOnlyTopBar(show) {
  document.body.classList.toggle("exam-active", show);
  var els = document.querySelectorAll("[data-exam-only='true']");
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
export function renderExamForm() {
  var body = _examBody();
  var footer = _examFooter();
  _setExamTitle(window._currentLang === "zh" ? "生成考卷" : "Generate Exam");
  var meta = document.getElementById("examViewMeta");
  if (meta) meta.textContent = "";
  stateStore.dispatch({type:'state/batch',patch:{
    examCancel:false,examQuestions:[],examAnswers:{},examSubmitted:false
  }});
  _examSelectedTypes = { mc: true, fb: true, sa: false };
  _examDifficulty = "intermediate";
  var L = function (en, zh) { return window._currentLang === "zh" ? zh : en };

  /* Build provider options for the custom dropdown */
  var provItems = [];
  var activeId = "";
  var providerConfig = getProviderConfigSnapshot();
  if (Array.isArray(providerConfig.providers)) {
    providerConfig.providers.forEach(function (p) {
      if (!p || !p.id) return;
      provItems.push({ id: p.id, label: p.label || p.model || p.id });
      if (p.id === providerConfig.activeId) activeId = p.id;
    });
  }
  var activeLabel = activeId
    ? (provItems.find(function (p) { return p.id === activeId }) || {}).label || activeId
    : L("Select a model", "选择模型");

  function togglePill(type, label, isActive) {
    var activeClass = isActive ? ' active' : '';
    var descriptions = {
      mc: L("Choose one answer", "从选项中选择答案"),
      fb: L("Recall key terms", "回忆关键概念或结果"),
      sa: L("Explain your reasoning", "用自己的语言说明推理")
    };
    return '<button type="button" class="exam-form-toggle-card' + activeClass + '" data-type="' + type + '" data-exam-command="toggle-type" aria-pressed="' + isActive + '"><span class="tog-dot"></span><span class="exam-type-copy"><strong>' + esc(label) + '</strong><small>' + esc(descriptions[type]) + '</small></span></button>';
  }

  function sectionHeader(index, title, description) {
    return '<div class="exam-form-section-header"><span class="exam-section-index">' + index + '</span><span><span class="exam-form-section-title">' + esc(title) + '</span><small>' + esc(description) + '</small></span></div>';
  }

  /* Difficulty segmented control. Canonical values stay English (models
     understand them); labels localize. */
  var DIFFS = [
    { v: "beginner", label: L("Beginner", "入门") },
    { v: "intermediate", label: L("Intermediate", "中级") },
    { v: "hard", label: L("Hard", "困难") },
    { v: "expert", label: L("Expert", "专家") }
  ];
  var diffHtml = DIFFS.map(function (d) {
    return '<button type="button" class="exam-seg-btn' + (d.v === _examDifficulty ? ' active' : '') +
      '" data-diff="' + d.v + '" data-exam-command="difficulty">' + esc(d.label) + '</button>';
  }).join("");

  /* Build custom model dropdown HTML */
  var modelOptsHtml = "";
  provItems.forEach(function (p) {
    modelOptsHtml += '<button class="exam-model-opt' + (p.id === activeId ? ' active' : '') + '" data-mid="' + esc(p.id) + '" data-exam-command="select-model">' + esc(p.label) + '</button>';
  });
  if (!modelOptsHtml) {
    modelOptsHtml = '<button class="exam-model-opt" disabled style="color:hsl(var(--text-500));cursor:default">' + L("No models available", "无可用模型") + '</button>';
  }

  var html = '<div class="exam-form-container">';

  /* Editorial hero */
  html += '<header class="exam-form-hero"><span class="exam-form-eyebrow">' + L("Assessment studio", "测评工作室") + '</span>'
    + '<h3>' + L("Build a focused practice exam", "创建一份专注的练习考卷") + '</h3>'
    + '<p>' + L("Choose the scope and challenge. Socrates will compose a balanced paper you can complete at your own pace.", "确定范围与难度，Socrates 会生成一份结构均衡、可按自己节奏完成的考卷。") + '</p></header>';

  /* Topic */
  html += '<div class="exam-form-section">'
    + sectionHeader("01", window.t("exam.topic"), L("Name the subject or learning objective", "填写学科、章节或学习目标"))
    + '<input class="exam-form-input" id="examTopic" name="examTopic" autocomplete="off" placeholder="' + L("e.g. Linear Algebra, World War II...", "如：线性代数、量子力学、二战…") + '">'
    + '</div>';

  /* Settings: model + difficulty + count */
  html += '<div class="exam-form-section">'
    + sectionHeader("02", L("Paper settings", "考卷设置"), L("Select the model, difficulty, and length", "选择生成模型、难度与题量"))
    /* Model */
    + '<div class="exam-form-field"><label class="exam-form-label" for="examModelTrigger">' + L("Model", "生成模型") + '</label>'
    + '<div class="exam-model-wrap">'
    + '<button class="exam-model-trigger" id="examModelTrigger" type="button" data-exam-command="toggle-model">'
    + '<span class="exam-model-label" id="examModelLabel">' + esc(activeLabel) + '</span>'
    + '<svg class="exam-model-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
    + '</button>'
    + '<div class="exam-model-menu" id="examModelMenu">' + modelOptsHtml + '</div>'
    + '<input type="hidden" id="examModel" value="' + esc(activeId) + '">'
    + '</div></div>'
    /* Difficulty + Count share a row on desktop, stack on narrow screens */
    + '<div class="exam-form-row">'
    /* Difficulty */
    + '<div class="exam-form-field"><label class="exam-form-label">' + window.t("exam.difficulty") + '</label>'
    + '<div class="exam-seg" id="examDifficultySeg">' + diffHtml + '</div></div>'
    /* Count */
    + '<div class="exam-form-field"><label class="exam-form-label">' + window.t("exam.count") + '</label>'
    + '<div class="exam-stepper">'
    + '<button type="button" class="exam-stepper-btn" data-exam-command="count" data-delta="-1" aria-label="' + L("Fewer", "减少") + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg></button>'
    + '<span class="exam-stepper-val" id="examCountDisplay">5</span>'
    + '<button type="button" class="exam-stepper-btn" data-exam-command="count" data-delta="1" aria-label="' + L("More", "增加") + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>'
    + '<input type="hidden" id="examCount" value="5">'
    + '</div></div>'
    + '</div>'
    + '</div>';

  /* Question types */
  html += '<div class="exam-form-section">'
    + sectionHeader("03", window.t("exam.types"), L("Keep at least one response format", "至少保留一种作答形式"))
    + '<div class="exam-form-card-toggles" id="examTypePicker">'
    + togglePill("mc", L("Multiple choice", "选择题"), true)
    + togglePill("fb", L("Fill blank", "填空题"), true)
    + togglePill("sa", L("Short answer", "简答题"), false)
    + '</div></div>';

  /* Instructions */
  html += '<div class="exam-form-section">'
    + sectionHeader("04", window.t("exam.instructions"), L("Optional constraints for the examiner", "可选，补充覆盖范围或出题偏好"))
    + '<textarea class="exam-form-textarea" id="examInstructions" name="examInstructions" placeholder="' + L("Specific topics to cover, or leave blank...", "具体说明要覆盖的知识点，留空则由 AI 决定…") + '" rows="3"></textarea>'
    + '</div>';

  html += '</div>';
  body.innerHTML = html;
  footer.innerHTML = '<button class="exam-btn secondary" data-exam-command="close">' + window.t("common.cancel") + '</button><button class="exam-btn primary" data-exam-command="generate">' + window.t("exam.generate") + '</button>';
}

/* ── Custom model dropdown ── */
export function toggleExamModelMenu() {
  var menu = document.getElementById("examModelMenu");
  var trigger = document.getElementById("examModelTrigger");
  if (!menu) return;
  var isOpen = menu.classList.contains("open");
  /* Close all exam-model-menus first */
  document.querySelectorAll(".exam-model-menu").forEach(function (m) { m.classList.remove("open"); });
  document.querySelectorAll(".exam-model-trigger").forEach(function (t) { t.classList.remove("open"); });
  if (!isOpen) {
    menu.classList.add("open");
    if (trigger) trigger.classList.add("open");
    /* Click outside to close */
    setTimeout(function () {
      function onDoc(e) {
        if (!e.target.closest(".exam-model-wrap")) {
          menu.classList.remove("open");
          if (trigger) trigger.classList.remove("open");
          document.removeEventListener("click", onDoc, true);
        }
      }
      document.addEventListener("click", onDoc, true);
    }, 0);
  }
}

export function selectExamModel(id) {
  var input = document.getElementById("examModel");
  var label = document.getElementById("examModelLabel");
  var opts = document.querySelectorAll(".exam-model-opt");
  if (input) input.value = id;
  opts.forEach(function (o) {
    o.classList.toggle("active", o.dataset.mid === id);
    if (o.dataset.mid === id && label) label.textContent = o.textContent;
  });
  /* Close menu */
  var menu = document.getElementById("examModelMenu");
  var trigger = document.getElementById("examModelTrigger");
  if (menu) menu.classList.remove("open");
  if (trigger) trigger.classList.remove("open");
}

export function toggleExamType(type) {
  var btn = document.querySelector('.exam-form-toggle-card[data-type="' + type + '"]');
  if (!btn) return;
  var countActive = document.querySelectorAll('.exam-form-toggle-card.active').length;
  if (btn.classList.contains("active") && countActive <= 1) return;
  btn.classList.toggle("active");
  btn.setAttribute("aria-pressed", String(btn.classList.contains("active")));
  _examSelectedTypes[type] = btn.classList.contains("active");
}

/* Difficulty segmented control — pick one value and highlight it. */
export function selectExamDifficulty(val) {
  _examDifficulty = val;
  document.querySelectorAll("#examDifficultySeg .exam-seg-btn").forEach(function (b) {
    b.classList.toggle("active", b.getAttribute("data-diff") === val);
  });
}

/* Question-count stepper — clamp to 1..50 and mirror to the hidden input
   that startExamGeneration reads. */
export function adjustExamCount(delta) {
  var input = document.getElementById("examCount");
  var display = document.getElementById("examCountDisplay");
  var cur = parseInt(input && input.value, 10);
  if (!(cur >= 1)) cur = 5;
  var next = Math.max(1, Math.min(50, cur + delta));
  if (input) input.value = String(next);
  if (display) display.textContent = String(next);
}

export function startExamGeneration() {
  return runExamGeneration({
    difficulty: _examDifficulty,
    selectedTypes: Object.assign({}, _examSelectedTypes),
  });
}

function refreshExamFormI18n() {
  var form = document.querySelector(".exam-form-container");
  if (!form) return false;
  var snapshot = {
    topic: (document.getElementById("examTopic") || {}).value || "",
    instructions: (document.getElementById("examInstructions") || {}).value || "",
    count: (document.getElementById("examCount") || {}).value || "5",
    model: (document.getElementById("examModel") || {}).value || "",
    difficulty: _examDifficulty,
    types: Object.assign({}, _examSelectedTypes)
  };
  renderExamForm();
  var topic = document.getElementById("examTopic");
  var instructions = document.getElementById("examInstructions");
  var count = document.getElementById("examCount");
  var countDisplay = document.getElementById("examCountDisplay");
  if (topic) topic.value = snapshot.topic;
  if (instructions) instructions.value = snapshot.instructions;
  if (count) count.value = snapshot.count;
  if (countDisplay) countDisplay.textContent = snapshot.count;
  _examDifficulty = snapshot.difficulty;
  document.querySelectorAll("#examDifficultySeg .exam-seg-btn").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-diff") === snapshot.difficulty);
  });
  _examSelectedTypes = snapshot.types;
  document.querySelectorAll("#examTypePicker .exam-form-toggle-card").forEach(function (btn) {
    var active = !!snapshot.types[btn.getAttribute("data-type")];
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
  if (snapshot.model) selectExamModel(snapshot.model);
  return true;
}

function refreshExamQuestionsI18n() {
  var questions = window.stateStore.read("examQuestions");
  if (!Array.isArray(questions) || !questions.length) return false;
  renderAllQuestions();
  renderExamNav();
  var footer = _examFooter();
  if (!footer) return true;
  var valid = questions.some(function (q) { return q.type !== "error"; });
  footer.innerHTML = valid
    ? '<button class="exam-btn primary" data-exam-command="submit">' + _examUiL("Submit for Grading", "提交批改") + '</button><button class="exam-btn secondary" data-exam-command="close">' + _examUiL("Close", "关闭") + '</button>'
    : '<button class="exam-btn primary" data-exam-command="form">' + _examUiL("Try Again", "重新出题") + '</button><button class="exam-btn secondary" data-exam-command="close">' + _examUiL("Close", "关闭") + '</button>';
  return true;
}

function refreshExamGenerationI18n() {
  var genMsg = document.getElementById("examGenMsg");
  var genStep = document.getElementById("examGenProgressStep");
  var genSub = document.getElementById("examGenSubMsg");
  if (genMsg) genMsg.textContent = _examUiL("Generating your exam…", "正在生成考卷…");
  if (genStep) genStep.innerHTML = '<span class="exam-progress-spin"></span>' + _examUiL("Preparing…", "准备出题…");
  if (genSub) genSub.textContent = _examUiL("The AI is preparing your questions. This usually takes a few seconds.", "AI 正在为您出题，请稍候片刻");
  var footer2 = _examFooter();
  if (footer2 && document.getElementById("examGenStatus")) {
    footer2.innerHTML = '<button class="exam-btn secondary" data-exam-command="cancel">' + _examUiL("Cancel", "取消") + '</button>';
  }
}

/* Repaint dynamic exam chrome when the application language changes.
   Generated question text remains in the language requested from the model,
   while labels, controls, placeholders and results follow the UI language. */
export function refreshExamI18n() {
  if (!window.stateStore.read("_examInView")) return;
  if (refreshExamFormI18n()) return;
  if (window.stateStore.read("examSubmitted")) {
    renderExamResults();
    return;
  }
  if (refreshExamQuestionsI18n()) return;
  refreshExamGenerationI18n();
}
