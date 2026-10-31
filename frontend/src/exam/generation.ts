import type { ExamQuestion, QuestionContext, QuestionSelection } from "./types.ts";
import { callAPIStream } from '../chat/stream.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { getActiveProvider, getProviderConfigSnapshot, ProviderConfigSnapshot, setActiveProviderLocal } from '../config/providerConfig.service.ts';
import { detectExamLang, parseSingleExamQuestion } from './parsing.ts';
import { saveExamSession, setExamAnswer } from './persistence.ts';
import { dispatchExam } from '../store/index.ts';
import { examUiL as _examUiL } from './ui.ts';
import type { ExamProgress, ExamFormDraft } from '../state/exam.ts';
import { apiFetch } from '../util/api.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";

function updateExamProgress(index: number, total: number, step: ExamProgress['step']) {
  dispatchExam({ type: 'exam/patch', patch: {
    examViewMode: 'loading',
    examProgress: { index, total, step },
  } });
}

function showProviderRequiredState() {
  const message = _examUiL("Add and select a model in Settings first", "请先在设置中添加并选择一个模型");
  dispatchExam({ type: 'exam/patch', patch: {
    examViewMode: 'provider-required',
    examStatusMessage: message,
    examStatusDetail: '',
  } });
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

  /* The built-in provider is client-only and has no UUID-backed row. */
  if (provider.isBuiltIn || chosenModel === "beagle-built-in") return;
  try {
    apiFetch("/api/api-key/" + encodeURIComponent(chosenModel), { method: "PATCH", body: { isActive: true } })
      .catch((error: unknown) => reportSwallow(error, 'exam.startExamGeneration.persistActiveModel'));
  } catch (error) {
    reportSwallow(error, 'exam.startExamGeneration.persistActiveModel.guard');
  }
}

export function runExamGeneration(draft: ExamFormDraft) {
  const topic = draft.topic.trim();
  if (!topic) return;
  const activeProvider = getActiveProvider();
  if (!activeProvider) { showProviderRequiredState(); return; }

  const count = Math.max(1, Math.min(50, Math.trunc(Number(draft.count) || 5)));
  const instructions = draft.instructions.trim();
  const chosenModel = draft.model;
  const types = selectedQuestionTypes(draft.selectedTypes as QuestionSelection);
  const difficulty = draft.difficulty || "intermediate";
  const lang = detectExamLang(topic);
  const providerConfig = getProviderConfigSnapshot();

  dispatchExam({ type: 'exam/patch', patch: {
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
    examViewMode: 'loading',
    examProgress: { index: 0, total: count, step: 'preparing' },
    examStatusMessage: '',
    examStatusDetail: '',
  } });
  if (chosenModel && Array.isArray(providerConfig.providers)) activateSelectedProvider(chosenModel, providerConfig);

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
    /* Skip the PATCH for the built-in provider — its id isn't a UUID and the
       server would 404. See startExamGeneration for the full rationale. */
    if (!prevProv.isBuiltIn && prev !== "beagle-built-in") {
      try { apiFetch("/api/api-key/" + encodeURIComponent(prev), { method: "PATCH", body: { isActive: true } }).catch(function (e: unknown) { reportSwallow(e, 'exam.restoreExamActiveProvider.deactivatePrevModel'); }) } catch (e) { reportSwallow(e, 'exam.restoreExamActiveProvider.deactivatePrevModel.guard'); }
    }
  }
  dispatchExam({ type: 'exam/set', key: '_examPrevActiveId', value: null });
}

export function cancelExamGeneration() {
  dispatchExam({ type: 'exam/patch', patch: {
    examCancel: true,
    examViewMode: 'cancelled',
    examStatusMessage: _examUiL('Generation cancelled', '已取消出题') + '.',
    examStatusDetail: '',
  } });
  restoreExamActiveProvider();
}

function failExamGeneration(message: string, detail?: string) {
  restoreExamActiveProvider();
  dispatchExam({ type: 'exam/patch', patch: {
    examViewMode: 'error',
    examStatusMessage: message,
    examStatusDetail: detail || '',
  } });
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
  updateExamProgress(index, total, label === _examUiL('Parse failed', '解析失败') ? 'parse-failed' : 'failed');
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
  updateExamProgress(index, context.total, 'generating');
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
  if (questions.length === 0) {
    failExamGeneration(_examUiL("Generation failed — no questions", "生成失败：没有成功生成任何题目"));
    return;
  }
  dispatchExam({ type: 'exam/patch', patch: {
    examQuestions: questions,
    examViewMode: 'questions',
  } });
  finishExamGeneration();
}

export function selectExamOpt(qidx: number, oidx: number) {
  if (browserWindow.stateStore.read("examSubmitted")) return;
  setExamAnswer(qidx, oidx);
  saveExamSession();
}

export function finishExamGeneration() {
  const valid = browserWindow.stateStore.read("examQuestions").filter(function (q: { type: string; }) { return q.type !== "error"; });
  if (browserWindow.stateStore.read("examCancel")) {
    return;
  }
  dispatchExam({ type: 'exam/set', key: 'examViewMode', value: 'questions' });
  if (valid.length === 0) return;
  saveExamSession();
}
