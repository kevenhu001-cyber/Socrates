import type { ExamQuestion, QuestionContext, QuestionSelection } from "./types.ts";
import { formatMsg } from '../render/markdown.ts';
import { callAPIStream } from '../chat/stream.ts';
import { stateStore } from '../state/store.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { getProviderConfigSnapshot, ProviderConfigSnapshot, setActiveProviderLocal } from '../config/providerConfig.service.ts';
import { detectExamLang, parseSingleExamQuestion } from './parsing.ts';
import { renderExamNav } from './navigation.ts';
import { saveExamSession, setExamAnswer } from './persistence.ts';
import { clearExamSetup, renderExamActions, renderExamStatus } from '../react/exam/examUiHost.tsx';
import { clearExamQuestionCards, renderExamQuestionCard } from '../react/exam/examQuestionHost.tsx';
import { clearExamNavigation } from '../react/exam/examNavigationHost.tsx';
import { examBody as _examBody, examUiIsZh as _examUiIsZh, examUiL as _examUiL, setExamTitle as _setExamTitle } from './ui.ts';
import { ExamAction } from '@/react/exam/ExamActionFooter.tsx';
import { ExamStatusSnapshot } from '@/react/exam/ExamStatus.tsx';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


let generationProgress = { index: 0, total: 1, step: '' };

function reactBodyHost() {
  return document.getElementById('examViewReactBody');
}

function reactFooterHost() {
  return document.getElementById('examViewReactFooter');
}

function renderExamStatusView(snapshot: ExamStatusSnapshot) {
  const host = reactBodyHost();
  if (host) renderExamStatus(host, snapshot);
}

function renderExamActionView(actions: ExamAction[]) {
  const host = reactFooterHost();
  if (host) renderExamActions(host, actions);
}

function examAction(command: string, label: string, variant: ExamAction['variant'] = 'default'): ExamAction {
  return { command, label, variant };
}

function loadingSubtitle(index: number, total: number) {
  if (index >= total) return _examUiL('Finishing your exam…', '正在完成考卷…');
  return _examUiIsZh()
    ? '正在生成第 ' + (index + 1) + ' / ' + total + ' 题…'
    : 'Generating question ' + (index + 1) + ' of ' + total + '…';
}

function renderGenerationProgress() {
  renderExamStatusView({
    kind: 'loading',
    progress: generationProgress.total > 0 ? Math.round(92 * generationProgress.index / generationProgress.total) : 0,
    message: _examUiL('Generating your exam…', '正在生成考卷…'),
    step: generationProgress.step || _examUiL('Preparing…', '准备出题…'),
    subtitle: loadingSubtitle(generationProgress.index, generationProgress.total),
  });
}

function showProviderRequiredState() {
  clearExamSetup();
  clearExamNavigation();
  const message = _examUiL("Add and select a model in Settings first", "请先在设置中添加并选择一个模型");
  _examBody()?.replaceChildren();
  renderExamStatusView({ kind: 'empty', message });
  renderExamActionView([examAction('form', _examUiL('Back', '返回'))]);
}

function selectedQuestionTypes(selection: QuestionSelection) {
  const types = [];
  if (selection.mc) types.push("multiple-choice");
  if (selection.fb) types.push("fill-blank");
  if (selection.sa) types.push("short-answer");
  return types.length ? types : ["multiple-choice", "fill-blank", "short-answer"];
}

function activateSelectedProvider(chosenModel: string, providerConfig: ProviderConfigSnapshot) {
  const provider = providerConfig.providers.find((item) => item.id === chosenModel);
  if (!provider) return;
  setActiveProviderLocal(chosenModel);
  try { browserWindow.syncModelPills?.(); } catch (error) { reportSwallow(error, 'exam.startExamGeneration.syncModelPills'); }
  try { browserWindow.syncChatModel?.(); } catch (error) { reportSwallow(error, 'exam.startExamGeneration.syncChatModel'); }

  /* The built-in provider is client-only and has no UUID-backed row. */
  if (provider.isBuiltIn || chosenModel === "beagle-built-in") return;
  try {
    browserWindow.apiFetch("/api/api-key/" + encodeURIComponent(chosenModel), { method: "PATCH", body: { isActive: true } })
      .catch((error: unknown) => reportSwallow(error, 'exam.startExamGeneration.persistActiveModel'));
  } catch (error) {
    reportSwallow(error, 'exam.startExamGeneration.persistActiveModel.guard');
  }
}

function renderGenerationStart(topic: string, count: number, difficulty: string, providerConfig: ProviderConfigSnapshot) {
  clearExamSetup();
  clearExamNavigation();
  _examBody()?.replaceChildren();
  _setExamTitle(topic);
  const meta = document.getElementById("examViewMeta");
  const provider = providerConfig.providers.find((item) => item.id === providerConfig.activeId);
  if (meta) meta.textContent = count + " " + _examUiL("questions · ", "题 · ") + (provider?.label || provider?.model || "") + " · " + difficulty;
  generationProgress = { index: 0, total: count, step: _examUiL('Preparing…', '准备出题…') };
  renderGenerationProgress();
  renderExamActionView([examAction('cancel', _examUiL('Cancel', '取消'), 'outline')]);
}

function readExamFormInputs(selection: { difficulty?: string; selectedTypes?: QuestionSelection }) {
  const countInput = document.getElementById("examCount") as HTMLInputElement | null;
  const count = Math.max(1, Math.min(50, parseInt(countInput?.value || "5", 10) || 5));
  const instructionsInput = document.getElementById("examInstructions") as HTMLInputElement | null;
  const instructions = instructionsInput?.value.trim() || "";
  const modelInput = document.getElementById("examModel") as HTMLInputElement | null;
  const chosenModel = modelInput?.value || "";
  const types = selectedQuestionTypes(selection.selectedTypes || {});
  const difficulty = selection.difficulty || "intermediate";
  return { count, instructions, chosenModel, types, difficulty };
}

export function runExamGeneration(selection: { difficulty?: string; selectedTypes?: QuestionSelection } = {}) {
  const topicInput = document.getElementById("examTopic") as HTMLInputElement | null;
  const topic = topicInput?.value.trim() || "";
  if (!topic) { topicInput?.focus(); return; }
  const activeProvider = typeof browserWindow.getActiveProvider === "function" ? browserWindow.getActiveProvider() : null;
  if (!activeProvider) { showProviderRequiredState(); return; }

  const { count, instructions, chosenModel, types, difficulty } = readExamFormInputs(selection);
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
  const prev = browserWindow.stateStore.read("_examPrevActiveId");
  if (!prev) return;
  const providerConfig = getProviderConfigSnapshot();
  if (providerConfig.activeId === prev) return;
  const prevProv = Array.isArray(providerConfig.providers) ? providerConfig.providers.find(function (p) { return p && p.id === prev }) : null;
  if (prevProv) {
    setActiveProviderLocal(prev);
    try { browserWindow.syncModelPills?.(); } catch (e) { reportSwallow(e, 'exam.restoreExamActiveProvider.syncModelPills'); }
    try { browserWindow.syncChatModel?.(); } catch (e) { reportSwallow(e, 'exam.restoreExamActiveProvider.syncChatModel'); }
    /* Skip the PATCH for the built-in provider — its id isn't a UUID and the
       server would 404. See startExamGeneration for the full rationale. */
    if (!prevProv.isBuiltIn && prev !== "beagle-built-in") {
      try { browserWindow.apiFetch("/api/api-key/" + encodeURIComponent(prev), { method: "PATCH", body: { isActive: true } }).catch(function (e: unknown) { reportSwallow(e, 'exam.restoreExamActiveProvider.deactivatePrevModel'); }) } catch (e) { reportSwallow(e, 'exam.restoreExamActiveProvider.deactivatePrevModel.guard'); }
    }
  }
  stateStore.dispatch({type:'state/set',key:'_examPrevActiveId',value:null});
}

export function cancelExamGeneration() {
  stateStore.dispatch({type:'state/set',key:'examCancel',value:true});
  restoreExamActiveProvider();
  clearExamNavigation();
  _examBody()?.replaceChildren();
  renderExamStatusView({ kind: 'empty', message: _examUiL('Generation cancelled', '已取消出题') + '.' });
  renderExamActionView([
    examAction('form', _examUiL('Try again', '重新出题')),
    examAction('close', _examUiL('Close', '关闭'), 'outline'),
  ]);
  _setExamTitle(_examUiL("Cancelled", "已取消"));
}

function updateExamProgress(index: number, total: number, message: string) {
  generationProgress = { index, total, step: message };
  renderGenerationProgress();
}

function failExamGeneration(message: string, detail?: string) {
  restoreExamActiveProvider();
  clearExamNavigation();
  _examBody()?.replaceChildren();
  renderExamStatusView({ kind: 'error', message, detail });
  renderExamActionView([
    examAction('form', _examUiL('Try again', '重新出题')),
    examAction('close', _examUiL('Close', '关闭'), 'outline'),
  ]);
}

function buildQuestionPrompt({ topic, difficulty, questionType, lang, index, total, instructions, previousTexts }: QuestionContext & { questionType: string; index: number; previousTexts: string[] }) {
  const previous = previousTexts.length
    ? "Already generated:\n" + previousTexts.map((text: string, previousIndex: number) => (previousIndex + 1) + ". " + text).join("\n")
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

async function requestExamQuestion(prompt: string, index: number) {
  const messages = [
    { role: "system", content: prompt },
    { role: "user", content: "Generate question " + (index + 1) + " now." },
  ];
  /* Use streaming so long reasoning responses keep the server connection
     warm; the model/system token default remains authoritative. */
  try {
    const result = await callAPIStream(messages, undefined, null);
    return {
      text: typeof result === "string" ? result : (result && (result.text || result.content)) || "",
      error: null,
    };
  } catch (error) {
    return { text: "", error };
  }
}

async function skipFailedQuestion(index: number, total: number, label: string, firstFailure: string, detail: string) {
  if (index === 0) {
    failExamGeneration(firstFailure, detail);
    return true;
  }
  updateExamProgress(index, total, label);
  await new Promise((resolve) => setTimeout(resolve, 300));
  return false;
}

type GeneratedExamQuestion =
  | { status: 'cancelled' | 'stopped' | 'skipped' }
  | { status: 'ready'; question: ExamQuestion };

async function generateExamQuestion(context: QuestionContext, index: number, previousTexts: string[]): Promise<GeneratedExamQuestion> {
  if (browserWindow.stateStore.read("examCancel")) {
    restoreExamActiveProvider();
    return { status: "cancelled" };
  }
  const questionType = context.allowedTypes[index % context.allowedTypes.length] || "multiple-choice";
  updateExamProgress(index, context.total, _examUiIsZh()
    ? "正在生成第 " + (index + 1) + " 题…"
    : "Generating question " + (index + 1) + "…");
  const prompt = buildQuestionPrompt({ ...context, questionType, index, previousTexts });
  const response = await requestExamQuestion(prompt, index);
  if (browserWindow.stateStore.read("examCancel")) return { status: "cancelled" };

  if (!response.text || !response.text.trim()) {
    const reason = (response.error && (response.error as Error).message) || browserWindow.stateStore.read("lastCallError") || _examUiL("no response", "模型无响应");
    const stopped = await skipFailedQuestion(index, context.total, _examUiL("Failed", "生成失败"), _examUiL("Generation failed — no response", "生成失败：模型无响应"), String(reason));
    return { status: stopped ? "stopped" : "skipped" };
  }

  const question = parseSingleExamQuestion(response.text);
  if (!question) {
    const stopped = await skipFailedQuestion(index, context.total, _examUiL("Parse failed", "解析失败"), _examUiL("Parse failed — unexpected format", "解析失败：模型返回格式异常"), _examUiL("Try again or switch model", "请重试或更换模型"));
    return { status: stopped ? "stopped" : "skipped" };
  }
  return { status: "ready", question };
}

async function generateAllQuestions(topic: string, count: number, difficulty: string, typeStr: string, instructions: string, lang: string) {
  const context: QuestionContext = { topic, total: count, difficulty, instructions, lang, allowedTypes: typeStr.split(", ") };
  const questions: ExamQuestion[] = [];
  const previousTexts: string[] = [];

  for (let index = 0; index < count; index++) {
    const generated = await generateExamQuestion(context, index, previousTexts);
    if (generated.status === "cancelled" || generated.status === "stopped") return;
    if (generated.status === "skipped") continue;
    if (generated.status !== 'ready') continue;
    generated.question._idx = questions.length;
    questions.push(generated.question);
    previousTexts.push(generated.question.q);
  }
  restoreExamActiveProvider();
  if (browserWindow.stateStore.read("examCancel")) return;
  questions.forEach(function (q) {
    stateStore.dispatch({
      type:'state/set',key:'examQuestions',
      value:browserWindow.stateStore.read("examQuestions").concat([q])
    });
  });
  if (browserWindow.stateStore.read("examQuestions").length === 0) {
    failExamGeneration(_examUiL("Generation failed — no questions", "生成失败：没有成功生成任何题目"));
    return;
  }
  renderAllQuestions();
  finishExamGeneration();
}

export function renderAllQuestions() {
  const body = _examBody();
  if (!body) return;
  clearExamQuestionCards();
  clearExamSetup();
  body.replaceChildren();
  const cont = document.createElement('div');
  cont.id = 'examQuestionsContainer';
  body.appendChild(cont);
  (browserWindow.stateStore.read("examQuestions") as ExamQuestion[]).forEach(function (q, idx) {
    const ph = document.createElement("div");
    ph.className = "exam-q-card";
    ph.id = "examQ" + idx;
    cont.appendChild(ph);
    paintQuestionCard(idx, q, ph);
  });
}

export { clearExamQuestionCards };

export function paintQuestionCard(idx: number, q: ExamQuestion, container: HTMLElement) {
  const savedAnswer = (browserWindow.stateStore.read("examAnswers") || {})[idx];
  const typeLabels: Record<string, string> = {
    "multiple-choice": _examUiL("Multiple choice", "选择题"),
    "fill-blank": _examUiL("Fill blank", "填空题"),
    "short-answer": _examUiL("Short answer", "简答题"),
    "error": _examUiL("Failed", "生成失败")
  };
  const commandHost = document.getElementById('examView');
  if (!commandHost) return;
  const options = Array.isArray(q.opts) ? q.opts.map((option) => ({
    letter: option.letter || '',
    html: formatMsg(option.text || ''),
  })) : [];
  renderExamQuestionCard(container, commandHost, {
    index: idx,
    total: browserWindow.stateStore.read("examQuestions").length,
    type: q.type,
    questionLabel: _examUiL("Question", "题目"),
    typeLabel: typeLabels[q.type] || q.type,
    questionHtml: formatMsg(q.q),
    options,
    savedAnswer: savedAnswer == null ? null : savedAnswer,
    answerLabel: _examUiL("Answer for question ", "第 ") + (idx + 1) + _examUiL("", " 题答案"),
    placeholder: _examUiL("Type your answer…", "输入你的答案…"),
  });
}

export function replaceStreamingCardWithQuestion(i: number, q: ExamQuestion) {
  const ph = document.getElementById("examQ" + i);
  if (!ph) return;
  paintQuestionCard(q._idx ?? i, q, ph);
  renderExamNav();
}

export function appendExamErrorCard(i: number, msg: string) {
  const ph = document.createElement("div");
  ph.className = "exam-q-card";
  ph.id = "examQ" + i;
  const errorQuestion: ExamQuestion = { q: msg, type: 'error', opts: [], _idx: i };
  stateStore.dispatch({
    type:'state/set',key:'examQuestions',
    value:browserWindow.stateStore.read("examQuestions").concat([{ q:"[failed]",type:"error",explanation:"",_idx:i }])
  });
  const cont = document.getElementById("examQuestionsContainer");
  if (cont) {
    cont.appendChild(ph);
    paintQuestionCard(i, errorQuestion, ph);
  }
  renderExamNav();
}

export function selectExamOpt(qidx: number, oidx: number) {
  if (browserWindow.stateStore.read("examSubmitted")) return;
  setExamAnswer(qidx,oidx);
  renderExamNav();
  saveExamSession();
}

export function finishExamGeneration() {
  const valid = browserWindow.stateStore.read("examQuestions").filter(function (q: { type: string; }) { return q.type !== "error"; });
  const _L = _examUiL;
  if (browserWindow.stateStore.read("examCancel")) {
    clearExamSetup();
    renderExamActionView([
      examAction('form', _L('Start New Exam', '新考试')),
      examAction('close', _L('Close', '关闭'), 'outline'),
    ]);
    renderExamNav();
    return;
  }
  if (valid.length > 0) {
    renderExamActionView([
      examAction('submit', _L('Submit for Grading', '提交批改')),
      examAction('close', _L('Close', '关闭'), 'outline'),
    ]);
  } else {
    renderExamActionView([
      examAction('form', _L('Try Again', '重新出题')),
      examAction('close', _L('Close', '关闭'), 'outline'),
    ]);
  }
  renderExamNav();
  saveExamSession();
}

export function refreshExamGenerationStatus() {
  renderGenerationProgress();
}
