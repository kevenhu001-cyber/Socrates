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

/** Tolerant parse: drops generation-error placeholders and empty prompts. */
export function parseExamQuestions(data: ExamData | null | undefined): ExamQuestion[] {
  const questions = data && Array.isArray(data.questions) ? data.questions : [];
  const out: ExamQuestion[] = [];
  questions.forEach((raw, index) => {
    if (!isRecord(raw)) return;
    if (raw.type === 'error') return;
    const prompt = text(raw.q) || text(raw.question);
    if (!prompt) return;
    out.push({
      index,
      type: questionType(raw.type),
      prompt,
      options: optionsOf(raw.opts),
      answer: text(raw.answer),
      answers: Array.isArray(raw.answers) ? raw.answers.map((entry) => text(entry)).filter(Boolean) : [],
      explanation: text(raw.explanation),
    });
  });
  return out;
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

