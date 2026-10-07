import { api } from './runtime';
import { buildDiagPrompt, diagError, parseDiagResponse, type DiagQuestion } from '@socrates/ui';

/* Tutor diagnostic generation: one streaming call per question (the web
 * baseline's client-side loop), tolerant JSON parsing with a balanced
 * fallback, and a cancel signal. The model sees only the generation
 * prompt and a one-line user turn, so nothing lands in the transcript. */

export interface TutorGenerationInput {
  topic: string;
  count: number;
  language: string;
}

export interface TutorGenerationProgress {
  done: number;
  total: number;
  phase: 'generating' | 'parsed' | 'retrying' | 'completed';
}

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

export async function generateDiagQuestions(
  input: TutorGenerationInput,
  options: { signal: AbortSignal; onProgress?(progress: TutorGenerationProgress): void },
): Promise<{ questions: DiagQuestion[] }> {
  const questions: DiagQuestion[] = [];
  const previous: string[] = [];
  let lastError = '';
  for (let index = 0; index < input.count; index += 1) {
    if (options.signal.aborted) throw abortError();
    options.onProgress?.({ done: questions.length, total: input.count, phase: 'generating' });
    const prompt = buildDiagPrompt({
      topic: input.topic, language: input.language, index, count: input.count, previous,
    });
    let text = '';
    try {
      await api.chat.stream({
        request: {
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
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
    const question = text.trim() ? parseDiagResponse(text, questions.length) : null;
    if (!question) {
      // The first question failing means the setup is unusable; later
      // failures skip that slot rather than aborting the whole run.
      if (index === 0) throw new Error(lastError || diagError() || 'tutor_generation_failed');
      options.onProgress?.({ done: questions.length, total: input.count, phase: 'retrying' });
      continue;
    }
    questions.push(question);
    previous.push(question.q);
    options.onProgress?.({ done: questions.length, total: input.count, phase: 'parsed' });
  }
  if (!questions.length) throw new Error(lastError || 'tutor_generation_failed');
  options.onProgress?.({ done: questions.length, total: input.count, phase: 'completed' });
  return { questions };
}
