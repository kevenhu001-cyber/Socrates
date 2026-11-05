/* examModel — DOM-free parsing/grading for the exam surface. The web
 * baseline generates questions client-side and stores them on the session
 * (`examData`); grading is also client-side. This module ports that exact
 * contract so the Universal App can render, answer, save and grade an exam
 * without any additional server round-trip. */

import type { ExamData, JsonValue } from '@socrates/contracts';

export type ExamQuestionType = 'multiple-choice' | 'fill-blank' | 'short-answer';

export interface ExamOption {
  letter: string;
  text: string;
}

export interface ExamQuestion {
  /** Original position in `examData.questions` (answers key off this). */
  index: number;
  type: ExamQuestionType;
  prompt: string;
  options: ExamOption[];
  /** MCQ correct letter, or the short-answer key facts. */
  answer: string;
  /** Accepted fill-blank strings. */
  answers: string[];
  explanation: string;
}

export type ExamAnswerValue = string | number;
export type ExamAnswers = Record<number, ExamAnswerValue>;

export interface ExamGrade {
  correct: number;
  total: number;
  percent: number;
  results: Record<number, boolean>;
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: JsonValue | undefined): string {
  return value === undefined || value === null ? '' : String(value);
}

function questionType(value: JsonValue | undefined): ExamQuestionType {
  return value === 'multiple-choice' || value === 'short-answer' || value === 'fill-blank'
    ? value
    : 'fill-blank';
}

function optionsOf(value: JsonValue | undefined): ExamOption[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((option, index) => ({
    letter: text(option.letter) || String.fromCharCode(65 + index),
    text: text(option.text) || text(option.label),
  }));
}

/** Tolerant parse of one stored question. Returns null for generation-error
 * placeholders and empty prompts; `index` is the caller's answer key. */
export function examQuestionFromRaw(raw: unknown, index: number): ExamQuestion | null {
  if (!isRecord(raw)) return null;
  if (raw.type === 'error') return null;
  const prompt = text(raw.q) || text(raw.question);
  if (!prompt) return null;
  return {
    index,
    type: questionType(raw.type),
    prompt,
    options: optionsOf(raw.opts),
    answer: text(raw.answer),
    answers: Array.isArray(raw.answers) ? raw.answers.map((entry) => text(entry)).filter(Boolean) : [],
    explanation: text(raw.explanation),
  };
}

export function examQuestionsFromRaw(raws: readonly unknown[]): ExamQuestion[] {
  const out: ExamQuestion[] = [];
  raws.forEach((raw, index) => {
    const question = examQuestionFromRaw(raw, index);
    if (question) out.push(question);
  });
  return out;
}

/** Tolerant parse: drops generation-error placeholders and empty prompts. */
export function parseExamQuestions(data: ExamData | null | undefined): ExamQuestion[] {
  const questions = data && Array.isArray(data.questions) ? data.questions : [];
  return examQuestionsFromRaw(questions);
}

export function examAnswersOf(data: ExamData | null | undefined): ExamAnswers {
  const raw = data && isRecord(data.answers) ? data.answers : {};
  const answers: ExamAnswers = {};
  for (const [key, value] of Object.entries(raw)) {
    const index = Number(key);
    if (!Number.isInteger(index)) continue;
    if (typeof value === 'string' || typeof value === 'number') answers[index] = value;
  }
  return answers;
}

function isAnswered(question: ExamQuestion, value: ExamAnswerValue | undefined): boolean {
  if (question.type === 'multiple-choice') return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');
  return typeof value === 'string' ? value.trim() !== '' : value !== undefined;
}

export function examProgress(questions: ExamQuestion[], answers: ExamAnswers): { answered: number; total: number } {
  return { answered: questions.filter((question) => isAnswered(question, answers[question.index])).length, total: questions.length };
}

/** Original indices of unanswered questions (submit gate). */
export function missingExamAnswers(questions: ExamQuestion[], answers: ExamAnswers): number[] {
  return questions.filter((question) => !isAnswered(question, answers[question.index])).map((question) => question.index);
}

function selectedOptionIndex(question: ExamQuestion, value: ExamAnswerValue | undefined): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  if (typeof value === 'string' && question.options.length) {
    const index = question.options.findIndex((option) => option.letter.toLowerCase() === value.trim().toLowerCase());
    return index >= 0 ? index : null;
  }
  return null;
}

/** Mirrors the web baseline's client-side grading rules exactly. */
export function gradeExam(questions: ExamQuestion[], answers: ExamAnswers): ExamGrade {
  const results: Record<number, boolean> = {};
  let correct = 0;
  for (const question of questions) {
    const value = answers[question.index];
    let right = false;
    if (question.type === 'multiple-choice') {
      const selected = selectedOptionIndex(question, value);
      right = selected !== null && question.options[selected] !== undefined && question.options[selected].letter === question.answer;
    } else if (question.type === 'fill-blank') {
      const user = String(value ?? '').trim().toLowerCase();
      right = question.answers.some((accepted) => user === accepted.trim().toLowerCase());
    } else {
      const user = String(value ?? '').trim().toLowerCase();
      const keywords = question.answer.trim().toLowerCase().split(/[,\s]+/).filter((keyword) => keyword.length > 3);
      right = keywords.length === 0 || keywords.some((keyword) => user.includes(keyword));
    }
    results[question.index] = right;
    if (right) correct += 1;
  }
  const total = questions.length;
  return { correct, total, percent: total > 0 ? Math.round((correct / total) * 100) : 0, results };
}

/** Fill/short answer as a trimmed string; MCQ as the selected option index. */
export function examAnswerValue(question: ExamQuestion, value: ExamAnswerValue | undefined): ExamAnswerValue | undefined {
  if (value === undefined) return undefined;
  if (question.type === 'multiple-choice') return selectedOptionIndex(question, value) ?? undefined;
  return typeof value === 'string' ? value : String(value);
}

/** Indices of answered questions, in question order (nav pills). */
export function examAnsweredIndices(questions: ExamQuestion[], answers: ExamAnswers): number[] {
  return questions.filter((question) => isAnswered(question, answers[question.index])).map((question) => question.index);
}

/* ── results ────────────────────────────────────────────────────────────── */

export interface ExamResultOption {
  letter: string;
  text: string;
  isCorrect: boolean;
  isSelected: boolean;
}

export interface ExamResultQuestion {
  type: ExamQuestionType;
  typeLabel: string;
  questionLabel: string;
  questionText: string;
  answer: string;
  options: ExamResultOption[];
  isCorrect: boolean;
  statusLabel: string;
  expectedLabel: string;
  expectedAnswer: string;
  explanationLabel: string;
  explanationText: string;
}

export interface ExamResults {
  correct: number;
  total: number;
  percent: number;
  correctLabel: string;
  questions: ExamResultQuestion[];
}

export type ExamCopy = (en: string, zh: string) => string;

function resultTypeLabel(type: ExamQuestionType, copy: ExamCopy): string {
  if (type === 'multiple-choice') return copy('Multiple choice', '选择题');
  if (type === 'fill-blank') return copy('Fill blank', '填空题');
  return copy('Short answer', '简答题');
}

/** Results page data: graded rows plus the labels the host already translated.
 * Mirrors the web baseline's `buildExamResultsSnapshot`. */
export function examResults(questions: ExamQuestion[], answers: ExamAnswers, copy: ExamCopy): ExamResults {
  const grade = gradeExam(questions, answers);
  const rows: ExamResultQuestion[] = questions.map((question) => {
    const value = answers[question.index];
    const isCorrect = grade.results[question.index] === true;
    const selected = question.type === 'multiple-choice' ? selectedOptionIndex(question, value) : null;
    return {
      type: question.type,
      typeLabel: resultTypeLabel(question.type, copy),
      questionLabel: copy('Question', '题目'),
      questionText: question.prompt.trim(),
      answer: typeof value === 'string' ? value : '',
      options: question.options.map((option, index) => ({
        letter: option.letter,
        text: option.text.trim(),
        isCorrect: option.letter === question.answer,
        isSelected: selected === index,
      })),
      isCorrect,
      statusLabel: isCorrect ? copy('Correct', '正确') : copy('Incorrect', '错误'),
      expectedLabel: question.type === 'fill-blank' ? copy('Correct answer', '正确答案') : copy('Expected', '期望答案'),
      expectedAnswer: question.type === 'fill-blank' ? question.answers.join(', ') : question.answer,
      explanationLabel: copy('Explanation', '解释'),
      explanationText: question.explanation.trim(),
    };
  });
  return {
    correct: grade.correct,
    total: rows.length,
    percent: rows.length > 0 ? Math.round((grade.correct / rows.length) * 100) : 0,
    correctLabel: copy('correct', '正确'),
    questions: rows,
  };
}

/* ── setup draft ────────────────────────────────────────────────────────── */

export const EXAM_DIFFICULTIES = ['beginner', 'intermediate', 'hard', 'expert'] as const;
export type ExamDifficulty = typeof EXAM_DIFFICULTIES[number];

export interface ExamQuestionTypeSelection {
  mc: boolean;
  fb: boolean;
  sa: boolean;
}

export interface ExamDraft {
  topic: string;
  instructions: string;
  count: number;
  model: string;
  difficulty: string;
  selectedTypes: ExamQuestionTypeSelection;
}

export type ExamDraftPatch = Partial<Omit<ExamDraft, 'selectedTypes'>> & {
  selectedTypes?: Partial<ExamQuestionTypeSelection>;
};

export function createExamDraft(overrides: ExamDraftPatch = {}): ExamDraft {
  const defaults: ExamDraft = {
    topic: '',
    instructions: '',
    count: 5,
    model: '',
    difficulty: 'intermediate',
    selectedTypes: { mc: true, fb: true, sa: false },
  };
  return {
    ...defaults,
    ...overrides,
    selectedTypes: { ...defaults.selectedTypes, ...overrides.selectedTypes },
  };
}

/** Enabled question types in canonical order; an empty selection means all. */
export function examTypesOf(selection: ExamQuestionTypeSelection | undefined): ExamQuestionType[] {
  if (!selection) return [...EXAM_QUESTION_TYPES];
  const enabled: ExamQuestionType[] = [];
  if (selection.mc) enabled.push('multiple-choice');
  if (selection.fb) enabled.push('fill-blank');
  if (selection.sa) enabled.push('short-answer');
  return enabled.length ? enabled : [...EXAM_QUESTION_TYPES];
}

/* ── generation ─────────────────────────────────────────────────────────── */

export const EXAM_QUESTION_TYPES: ExamQuestionType[] = ['multiple-choice', 'fill-blank', 'short-answer'];

/** Canonical prompt language for a topic, matching the web baseline. */
export function detectExamLanguage(topic: string): string {
  const text = String(topic || '');
  if (!text) return 'English';
  if (/[\u4e00-\u9fff]/.test(text)) return 'Chinese';
  if (/[\u3040-\u30ff]/.test(text)) return 'Japanese';
  if (/[\uac00-\ud7af]/.test(text)) return 'Korean';
  if (/[\u0400-\u04ff]/.test(text)) return 'Russian';
  if (/[\u0600-\u06ff]/.test(text)) return 'Arabic';
  if (/[\u0900-\u097f]/.test(text)) return 'Hindi';
  if (/[\u0370-\u03ff]/.test(text)) return 'Greek';
  if (/[\u0590-\u05ff]/.test(text)) return 'Hebrew';
  if (/[\u0e00-\u0e7f]/.test(text)) return 'Thai';
  return 'English';
}

/** Enabled question types in canonical cycle order; empty input = all. */
export function examPromptTypes(types: ExamQuestionType[] | undefined): ExamQuestionType[] {
  const enabled = EXAM_QUESTION_TYPES.filter((type) => (types && types.length ? types.includes(type) : true));
  return enabled.length ? enabled : [...EXAM_QUESTION_TYPES];
}

export interface ExamGenerationInput {
  topic: string;
  index: number;
  count: number;
  difficulty: string;
  type: ExamQuestionType;
  lang: string;
  instructions?: string;
  previousPrompts?: string[];
}

/** The per-question system prompt, ported verbatim from the web baseline. */
export function examGenerationPrompt(input: ExamGenerationInput): string {
  const previous = input.previousPrompts && input.previousPrompts.length
    ? `Already generated:\n${input.previousPrompts.map((prompt, index) => `${index + 1}. ${prompt}`).join('\n')}`
    : 'This is the first question.';
  return `Generate ONE exam question as a JSON object.\n`
    + `Topic: ${input.topic}.\n`
    + `Difficulty: ${input.difficulty}.\n`
    + `Question type: ${input.type}.\n`
    + `Language: ${input.lang}.\n`
    + `This is question ${input.index + 1} of ${input.count}.\n`
    + `CRITICAL: EVERY field (q, opts[*].text, answer, answers[*], explanation) MUST be written in ${input.lang}.\n`
    + `Return ONLY the JSON — no markdown, no preamble, no commentary.\n`
    + `The question object must have: q (string), type ("${input.type}").\n`
    + `For multiple-choice add opts:[{letter,text}] (4 options A-D) and answer (correct letter).\n`
    + `For fill-blank add answers:[string] (acceptable fills).\n`
    + `For short-answer add answer (key facts).\n`
    + `Always add explanation (string). Use Markdown + $LaTeX$ in q text.\n\n`
    + (input.instructions ? `Specifics: ${input.instructions}\n` : '')
    + `Previously generated questions (DO NOT repeat the same topic angle):\n${previous}`;
}

function cleanResponse(text: string): string {
  return String(text || '')
    .replace(/```(?:json|JSON)?\s*/g, '')
    .replace(/\s*```/g, '')
    .replace(/<(?:thinking|think)>[\s\S]*?(<\/(?:thinking|think)>|$)/gi, '')
    .replace(/\[(?:thinking|think)\][\s\S]*?(\[\/(?:thinking|think)\]|$)/gi, '')
    .trim();
}

/** Parse one model answer into a question; tolerant of fences, thinking and
 * surrounding prose (same loop as the web baseline). */
export function parseExamQuestionResponse(response: string, index: number): ExamQuestion | null {
  const raw = cleanResponse(response);
  const end = raw.lastIndexOf('}');
  if (end < 0) return null;
  for (let cursor = 0; cursor <= end;) {
    const start = raw.indexOf('{', cursor);
    if (start < 0 || start >= end) return null;
    try {
      const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
      if (isRecord(parsed) && typeof parsed.q === 'string' && parsed.type) {
        const prompt = String(parsed.q).trim();
        if (!prompt) return null;
        return {
          index,
          type: questionType(parsed.type as JsonValue),
          prompt,
          options: optionsOf(parsed.opts as JsonValue),
          answer: text(parsed.answer),
          answers: Array.isArray(parsed.answers) ? (parsed.answers as JsonValue[]).map((entry) => text(entry)).filter(Boolean) : [],
          explanation: text(parsed.explanation),
        };
      }
    } catch { /* try the next brace start */ }
    cursor = start + 1;
  }
  return null;
}

