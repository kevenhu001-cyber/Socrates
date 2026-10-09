import { esc } from '../render/helpers.js';
import { formatMsg } from '../render/markdown.js';
import { callAPIStream } from '../chat/stream.js';
import { stateStore } from '../state/store.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { getProviderConfigSnapshot, setActiveProviderLocal } from '../config/providerConfig.service.ts';
import { detectExamLang, parseSingleExamQuestion } from './parsing.js';
import { renderExamNav } from './navigation.js';
import { saveExamSession, setExamAnswer } from './persistence.js';
import { examBody as _examBody, examFooter as _examFooter, examUiIsZh as _examUiIsZh, examUiL as _examUiL, setExamTitle as _setExamTitle } from './ui.js';

function showProviderRequiredState() {
  const message = _examUiL("Add and select a model in Settings first", "请先在设置中添加并选择一个模型");
  const body = _examBody();
  const footer = _examFooter();
  if (body) body.innerHTML = '<div class="exam-empty" style="padding:40px;text-align:center;color:hsl(var(--text-500))">' + esc(message) + '</div>';
  if (footer) footer.innerHTML = '<button class="exam-btn primary" data-exam-command="form">' + _examUiL("Back", "返回") + '</button>';
}

function selectedQuestionTypes(selection) {
  const types = [];
  if (selection.mc) types.push("multiple-choice");
  if (selection.fb) types.push("fill-blank");
  if (selection.sa) types.push("short-answer");
  return types.length ? types : ["multiple-choice", "fill-blank", "short-answer"];
}

function activateSelectedProvider(chosenModel, providerConfig) {
  const provider = providerConfig.providers.find((item) => item && item.id === chosenModel);
  if (!provider) return;
  setActiveProviderLocal(chosenModel);
  try { window.syncModelPills?.(); } catch (error) { reportSwallow(error, 'exam.startExamGeneration.syncModelPills'); }
  try { window.syncChatModel?.(); } catch (error) { reportSwallow(error, 'exam.startExamGeneration.syncChatModel'); }

  /* The built-in provider is client-only and has no UUID-backed row. */
  if (provider.isBuiltIn || chosenModel === "beagle-built-in") return;
  try {
    window.apiFetch("/api/api-key/" + encodeURIComponent(chosenModel), { method: "PATCH", body: { isActive: true } })
      .catch((error) => reportSwallow(error, 'exam.startExamGeneration.persistActiveModel'));
  } catch (error) {
    reportSwallow(error, 'exam.startExamGeneration.persistActiveModel.guard');
  }
}

function renderGenerationStart(topic, count, difficulty, providerConfig) {
  _setExamTitle(topic);
  const meta = document.getElementById("examViewMeta");
  const provider = providerConfig.providers.find((item) => item && item.id === providerConfig.activeId) || {};
  if (meta) meta.textContent = count + " " + _examUiL("questions · ", "题 · ") + (provider.label || provider.model || "") + " · " + difficulty;
  const body = _examBody();
  if (body) {
    body.innerHTML = '<div class="exam-loading" id="examGenStatus">' +
      '<span class="loading"><span></span><span></span><span></span></span>' +
      '<div class="exam-loading-msg" id="examGenMsg">' + _examUiL("Generating your exam…", "正在生成考卷…") + '</div>' +
      '<div class="exam-progress"><div class="exam-progress-bar"><div class="exam-progress-fill" id="examGenProgressFill"></div></div>' +
      '<div class="exam-progress-step" id="examGenProgressStep"><span class="exam-progress-spin"></span>' + _examUiL("Preparing…", "准备出题…") + '</div></div>' +
      '<div class="exam-loading-sub" id="examGenSubMsg">' + _examUiL("The AI is preparing your questions — this usually takes a few seconds.", "AI 正在为您出题，请稍候片刻") + '</div>' +
      '</div>';
  }
  const footer = _examFooter();
  if (footer) footer.innerHTML = '<button class="exam-btn secondary" data-exam-command="cancel">' + _examUiL("Cancel", "取消") + '</button>';
}

export function runExamGeneration(selection = {}) {
  const topicInput = document.getElementById("examTopic");
  const topic = topicInput.value.trim();
  if (!topic) { topicInput.focus(); return; }
  const activeProvider = typeof window.getActiveProvider === "function" ? window.getActiveProvider() : null;
  if (!activeProvider) { showProviderRequiredState(); return; }

  const count = Math.max(1, Math.min(50, parseInt(document.getElementById("examCount").value, 10) || 5));
  const difficulty = selection.difficulty || "intermediate";
  const instructions = document.getElementById("examInstructions").value.trim();
  const modelInput = document.getElementById("examModel");
  const chosenModel = modelInput ? modelInput.value : "";
  const types = selectedQuestionTypes(selection.selectedTypes || {});
  const lang = detectExamLang(topic);
  const providerConfig = getProviderConfigSnapshot();

  stateStore.dispatch({ type: 'state/batch', patch: {
    examCancel: false,
    examQuestions: [],
    examAnswers: {},
    examSubmitted: false,
    examTopic: topic,
    examCount: count,
    examLang: lang,
    examDifficulty: difficulty,
    examInstructions: instructions,
    examTypes: types.slice(),
    _examPrevActiveId: providerConfig.activeId,
  } });
  if (chosenModel && Array.isArray(providerConfig.providers)) activateSelectedProvider(chosenModel, providerConfig);

  const activeConfig = getProviderConfigSnapshot();
  renderGenerationStart(topic, count, difficulty, activeConfig);
  /* Progress, failure and completion are painted by generateAllQuestions. */
  void generateAllQuestions(topic, count, difficulty, types.join(", "), instructions, lang);
}

export function restoreExamActiveProvider() {
  var prev = window.stateStore.read("_examPrevActiveId");
  if (!prev) return;
  var providerConfig = getProviderConfigSnapshot();
  if (providerConfig.activeId === prev) return;
  var prevProv = Array.isArray(providerConfig.providers) ? providerConfig.providers.find(function (p) { return p && p.id === prev }) : null;
  if (prevProv) {
    setActiveProviderLocal(prev);
    try { window.syncModelPills?.(); } catch (e) { reportSwallow(e, 'exam.restoreExamActiveProvider.syncModelPills'); }
    try { window.syncChatModel?.(); } catch (e) { reportSwallow(e, 'exam.restoreExamActiveProvider.syncChatModel'); }
    /* Skip the PATCH for the built-in provider — its id isn't a UUID and the
       server would 404. See startExamGeneration for the full rationale. */
    if (!prevProv.isBuiltIn && prev !== "beagle-built-in") {
      try { window.apiFetch("/api/api-key/" + encodeURIComponent(prev), { method: "PATCH", body: { isActive: true } }).catch(function (e) { reportSwallow(e, 'exam.restoreExamActiveProvider.deactivatePrevModel'); }) } catch (e) { reportSwallow(e, 'exam.restoreExamActiveProvider.deactivatePrevModel.guard'); }
    }
  }
  stateStore.dispatch({type:'state/set',key:'_examPrevActiveId',value:null});
}

export function cancelExamGeneration() {
  stateStore.dispatch({type:'state/set',key:'examCancel',value:true});
  restoreExamActiveProvider();
  var body = _examBody();
  body.innerHTML = '<div class="exam-empty">' + (_examUiL("Generation cancelled", "已取消出题") + '.</div>');
  _examFooter().innerHTML = '<button class="exam-btn primary" data-exam-command="form">' + _examUiL("Try again", "重新出题") + '</button><button class="exam-btn secondary" data-exam-command="close">' + _examUiL("Close", "关闭") + '</button>';
  _setExamTitle(_examUiL("Cancelled", "已取消"));
}

function updateExamProgress(index, total, message) {
  const fill = document.getElementById("examGenProgressFill");
  const step = document.getElementById("examGenProgressStep");
  const subtitle = document.getElementById("examGenSubMsg");
  if (fill) fill.style.width = (total > 0 ? Math.round(92 * index / total) : 0) + "%";
  if (step) step.innerHTML = '<span class="exam-progress-spin"></span>' + message;
  if (subtitle && index < total) {
    subtitle.textContent = _examUiIsZh()
      ? "正在生成第 " + (index + 1) + " / " + total + " 题…"
      : "Generating question " + (index + 1) + " of " + total + "…";
  }
}

function failExamGeneration(message, detail) {
  restoreExamActiveProvider();
  const body = _examBody();
  if (body) {
    body.innerHTML = '<div class="exam-empty"><strong>' + esc(message) + '</strong>' +
      (detail ? '<div style="margin-top:10px;font-size:13px;color:hsl(var(--text-500));line-height:1.5">' + esc(detail) + '</div>' : '') +
      '</div>';
  }
  const footer = _examFooter();
  if (footer) footer.innerHTML = '<button class="exam-btn primary" data-exam-command="form">' + _examUiL("Try again", "重新出题") + '</button><button class="exam-btn secondary" data-exam-command="close">' + _examUiL("Close", "关闭") + '</button>';
}

function buildQuestionPrompt({ topic, difficulty, questionType, lang, index, total, instructions, previousTexts }) {
  const previous = previousTexts.length
    ? "Already generated:\n" + previousTexts.map((text, previousIndex) => (previousIndex + 1) + ". " + text).join("\n")
    : "This is the first question.";
  return "Generate ONE exam question as a JSON object.\n" +
    "Topic: " + topic + ".\n" +
    "Difficulty: " + difficulty + ".\n" +
    "Question type: " + questionType + ".\n" +
    "Language: " + lang + ".\n" +
    "This is question " + (index + 1) + " of " + total + ".\n" +
    "CRITICAL: EVERY field (q, opts[*].text, answer, answers[*], explanation) MUST be written in " + lang + ".\n" +
    "Return ONLY the JSON — no markdown, no preamble, no commentary.\n" +
    "The question object must have: q (string), type (\"" + questionType + "\").\n" +
    "For multiple-choice add opts:[{letter,text}] (4 options A-D) and answer (correct letter).\n" +
    "For fill-blank add answers:[string] (acceptable fills).\n" +
    "For short-answer add answer (key facts).\n" +
    "Always add explanation (string). Use Markdown + $LaTeX$ in q text.\n\n" +
    (instructions ? "Specifics: " + instructions + "\n" : "") +
    "Previously generated questions (DO NOT repeat the same topic angle):\n" + previous;
}

async function requestExamQuestion(prompt, index) {
  const messages = [
    { role: "system", content: prompt },
    { role: "user", content: "Generate question " + (index + 1) + " now." },
  ];
  /* Use streaming so long reasoning responses keep the server connection
     warm; the model/system token default remains authoritative. */
  try {
    const result = await callAPIStream(messages, window.MAX_TOKENS_CHAT, null);
    return {
      text: typeof result === "string" ? result : (result && (result.text || result.content)) || "",
      error: null,
    };
  } catch (error) {
    return { text: "", error };
  }
}

async function skipFailedQuestion(index, total, label, firstFailure, detail) {
  if (index === 0) {
    failExamGeneration(firstFailure, detail);
    return true;
  }
  updateExamProgress(index, total, label);
  await new Promise((resolve) => setTimeout(resolve, 300));
  return false;
}

async function generateExamQuestion(context, index, previousTexts) {
  if (window.stateStore.read("examCancel")) {
    restoreExamActiveProvider();
    return { status: "cancelled" };
  }
  const questionType = context.allowedTypes[index % context.allowedTypes.length] || "multiple-choice";
  updateExamProgress(index, context.total, _examUiIsZh()
    ? "正在生成第 " + (index + 1) + " 题…"
    : "Generating question " + (index + 1) + "…");
  const prompt = buildQuestionPrompt({ ...context, questionType, index, previousTexts });
  const response = await requestExamQuestion(prompt, index);
  if (window.stateStore.read("examCancel")) return { status: "cancelled" };

  if (!response.text || !response.text.trim()) {
    const reason = (response.error && response.error.message) || window.stateStore.read("lastCallError") || _examUiL("no response", "模型无响应");
    const stopped = await skipFailedQuestion(index, context.total, _examUiL("Failed", "生成失败"), _examUiL("Generation failed — no response", "生成失败：模型无响应"), reason);
    return { status: stopped ? "stopped" : "skipped" };
  }

  const question = parseSingleExamQuestion(response.text);
  if (!question) {
    const stopped = await skipFailedQuestion(index, context.total, _examUiL("Parse failed", "解析失败"), _examUiL("Parse failed — unexpected format", "解析失败：模型返回格式异常"), _examUiL("Try again or switch model", "请重试或更换模型"));
    return { status: stopped ? "stopped" : "skipped" };
  }
  return { status: "ready", question };
}

async function generateAllQuestions(topic, count, difficulty, typeStr, instructions, lang) {
  const context = { topic, total: count, difficulty, instructions, lang, allowedTypes: typeStr.split(", ") };
  const questions = [];
  const previousTexts = [];

  for (let index = 0; index < count; index++) {
    const generated = await generateExamQuestion(context, index, previousTexts);
    if (generated.status === "cancelled" || generated.status === "stopped") return;
    if (generated.status === "skipped") continue;
    generated.question._idx = questions.length;
    questions.push(generated.question);
    previousTexts.push(generated.question.q);
  }
  restoreExamActiveProvider();
  if (window.stateStore.read("examCancel")) return;
  questions.forEach(function (q) {
    stateStore.dispatch({
      type:'state/set',key:'examQuestions',
      value:window.stateStore.read("examQuestions").concat([q])
    });
  });
  if (window.stateStore.read("examQuestions").length === 0) {
    failExamGeneration(_examUiL("Generation failed — no questions", "生成失败：没有成功生成任何题目"));
    return;
  }
  renderAllQuestions();
  finishExamGeneration();
}

export function renderAllQuestions() {
  var body = _examBody();
  if (!body) return;
  body.innerHTML = '<div id="examQuestionsContainer"></div>';
  var cont = document.getElementById("examQuestionsContainer");
  if (!cont) return;
  window.stateStore.read("examQuestions").forEach(function (q, idx) {
    var ph = document.createElement("div");
    ph.className = "exam-q-card";
    ph.id = "examQ" + idx;
    cont.appendChild(ph);
    paintQuestionCard(idx, q, ph);
  });
}

export function paintQuestionCard(idx, q, container) {
  var savedAnswer = (window.stateStore.read("examAnswers") || {})[idx];
  var typeLabels = {
    "multiple-choice": _examUiL("Multiple choice", "选择题"),
    "fill-blank": _examUiL("Fill blank", "填空题"),
    "short-answer": _examUiL("Short answer", "简答题"),
    "error": _examUiL("Failed", "生成失败")
  };
  var html = '<div class="exam-q-num">' + _examUiL("Question", "题目") + ' ' + (idx + 1) + ' / ' + window.stateStore.read("examQuestions").length + ' <span class="exam-q-type">' + esc(typeLabels[q.type] || q.type) + '</span></div>';
  html += '<div class="exam-q-text">' + formatMsg(q.q) + '</div>';
  if (q.type === "multiple-choice" && q.opts) {
    html += '<div class="exam-q-opts">';
    q.opts.forEach(function (o, oi) {
      html += '<button class="exam-q-opt' + (savedAnswer === oi ? ' selected' : '') + '" data-eidx="' + idx + '" data-oidx="' + oi + '" data-exam-command="answer-option">';
      html += '<span class="exam-q-opt-letter">' + esc(o.letter) + '</span>';
      html += '<span class="exam-q-opt-text">' + formatMsg(o.text) + '</span>';
      html += '</button>';
    });
    html += '</div>';
  } else if (q.type === "fill-blank") {
    html += '<input class="exam-q-fill-input" data-eidx="' + idx + '" name="examAnswer' + idx + '" aria-label="' + _examUiL("Answer for question ", "第 ") + (idx + 1) + _examUiL("", " 题答案") + '" value="' + esc(savedAnswer == null ? "" : savedAnswer) + '" placeholder="' + _examUiL("Type your answer…", "输入你的答案…") + '">';
  } else if (q.type === "short-answer") {
    html += '<textarea class="exam-q-fill-input" data-eidx="' + idx + '" name="examAnswer' + idx + '" aria-label="' + _examUiL("Answer for question ", "第 ") + (idx + 1) + _examUiL("", " 题答案") + '" placeholder="' + _examUiL("Type your answer…", "输入你的答案…") + '" rows="3" style="min-height:80px;resize:vertical">' + esc(savedAnswer == null ? "" : savedAnswer) + '</textarea>';
  }
  container.innerHTML = html;
}

export function replaceStreamingCardWithQuestion(i, q) {
  var ph = document.getElementById("examQ" + i);
  if (!ph) return;
  paintQuestionCard(q._idx, q, ph);
  renderExamNav();
}

export function appendExamErrorCard(i, msg) {
  var ph = document.createElement("div");
  ph.className = "exam-q-card";
  ph.id = "examQ" + i;
  ph.innerHTML = '<div class="exam-q-num">' + _examUiL("Question", "题目") + ' ' + (i + 1) + ' — <span class="exam-result-wrong">' + _examUiL("Failed", "生成失败") + '</span></div><div class="exam-q-text" style="color:hsl(0 60% 55%)">' + esc(msg) + '</div>';
  stateStore.dispatch({
    type:'state/set',key:'examQuestions',
    value:window.stateStore.read("examQuestions").concat([{ q:"[failed]",type:"error",explanation:"",_idx:i }])
  });
  var cont = document.getElementById("examQuestionsContainer");
  if (cont) cont.appendChild(ph);
  renderExamNav();
}

export function selectExamOpt(qidx, oidx) {
  if (window.stateStore.read("examSubmitted")) return;
  setExamAnswer(qidx,oidx);
  var btns = document.querySelectorAll('.exam-q-opt[data-eidx="' + qidx + '"]');
  btns.forEach(function (b, i) { b.classList.toggle("selected", i === oidx); });
  renderExamNav();
  saveExamSession();
}

export function finishExamGeneration() {
  var st = document.getElementById("examGenStatus");
  if (st) st.style.display = "none";
  var valid = window.stateStore.read("examQuestions").filter(function (q) { return q.type !== "error"; });
  var footer = _examFooter();
  var _L = _examUiL;
  if (window.stateStore.read("examCancel")) {
    footer.innerHTML = '<button class="exam-btn primary" data-exam-command="form">' + _L("Start New Exam", "新考试") + '</button><button class="exam-btn secondary" data-exam-command="close">' + _L("Close", "关闭") + '</button>';
    renderExamNav();
    return;
  }
  if (valid.length > 0) {
    footer.innerHTML = '<button class="exam-btn primary" data-exam-command="submit">' + _L("Submit for Grading", "提交批改") + '</button><button class="exam-btn secondary" data-exam-command="close">' + _L("Close", "关闭") + '</button>';
  } else {
    footer.innerHTML = '<button class="exam-btn primary" data-exam-command="form">' + _L("Try Again", "重新出题") + '</button><button class="exam-btn secondary" data-exam-command="close">' + _L("Close", "关闭") + '</button>';
  }
  renderExamNav();
  saveExamSession();
}
