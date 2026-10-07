import type { ExamData } from '@socrates/contracts';
import {
  detectExamLanguage, examGenerationPrompt, examPromptTypes, parseExamQuestionResponse,
  type ExamQuestion, type ExamQuestionType,
} from '@socrates/ui';
import { api } from './runtime';

/* Exam generation: one streaming call per question (the web baseline's
 * client-side loop), tolerant JSON parsing, and a cancel signal. The model
 * sees only the generation prompt and a one-line user turn, so nothing is
 * appended to the chat transcript. */

export interface ExamGenerationInput {
  topic: string;
  count: number;
  difficulty: string;
  types: ExamQuestionType[];
  instructions: string;
}

export interface ExamGenerationProgress {
  done: number;
  total: number;
  phase: 'generating' | 'parsed' | 'retrying' | 'completed';
}

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

export function buildExamData(input: ExamGenerationInput, questions: ExamQuestion[], lang: string): ExamData {
  return {
    topic: input.topic,
    difficulty: input.difficulty,
    count: input.count,
    lang,
    types: input.types,
    questions: questions.map((question) => ({
      q: question.prompt,
      type: question.type,
      ...(question.options.length ? { opts: question.options } : {}),
      ...(question.answer ? { answer: question.answer } : {}),
      ...(question.answers.length ? { answers: question.answers } : {}),
      explanation: question.explanation,
    })) as unknown as ExamData['questions'],
    answers: {},
    submitted: false,
    generatedAt: Date.now(),
  };
}

export async function generateExamQuestions(
  input: ExamGenerationInput,
  options: { signal: AbortSignal; onProgress?(progress: ExamGenerationProgress): void },
): Promise<{ questions: ExamQuestion[]; lang: string }> {
  const lang = detectExamLanguage(input.topic);
  const types = examPromptTypes(input.types);
  const questions: ExamQuestion[] = [];
  const previousPrompts: string[] = [];
  let lastError = '';
  for (let index = 0; index < input.count; index += 1) {
    if (options.signal.aborted) throw abortError();
    const type = types[index % types.length] as ExamQuestionType;
    options.onProgress?.({ done: questions.length, total: input.count, phase: 'generating' });
    let text = '';
    try {
      await api.chat.stream({
        request: {
          messages: [
            {
              role: 'system',
              content: examGenerationPrompt({
                topic: input.topic, index, count: input.count, difficulty: input.difficulty,
                type, lang, instructions: input.instructions, previousPrompts,
              }),
            },
            { role: 'user', content: `Generate question ${index + 1} now.` },
          ],
        },
        handlers: {
          onDelta: (chunk) => { text += chunk; },
          onError: (message) => { lastError = message; },
        },
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal.aborted || (error instanceof Error && error.name === 'AbortError')) throw abortError();
      if (index === 0) throw error;
      options.onProgress?.({ done: questions.length, total: input.count, phase: 'retrying' });
      continue;
    }
    const question = text.trim() ? parseExamQuestionResponse(text, questions.length) : null;
    if (!question) {
      // The first question failing means the setup is unusable; later
      // failures skip that slot rather than aborting the whole exam.
      if (index === 0) throw new Error(lastError || 'exam_generation_failed');
      options.onProgress?.({ done: questions.length, total: input.count, phase: 'retrying' });
      continue;
    }
    questions.push(question);
    previousPrompts.push(question.prompt);
    options.onProgress?.({ done: questions.length, total: input.count, phase: 'parsed' });
  }
  if (!questions.length) throw new Error(lastError || 'exam_generation_failed');
  options.onProgress?.({ done: questions.length, total: input.count, phase: 'completed' });
  return { questions, lang };
}
