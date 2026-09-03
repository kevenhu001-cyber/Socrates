import type { JsonValue, Message, Session } from '@socrates/contracts';
import { sessionsApi } from '../api/client';
import { startChatStream } from '../sse/sseClient';

export type ExamQuestion = {
  q: string;
  type: 'multiple-choice' | 'fill-blank' | 'short-answer';
  opts?: Array<{ letter: string; text: string }>;
  answer?: string;
  answers?: string[];
  explanation?: string;
};

function uuid() {
  const hex = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  return `${hex()}-${hex().slice(0, 4)}-4${hex().slice(1, 4)}-8${hex().slice(1, 4)}-${hex()}${hex().slice(0, 4)}`;
}

export function parseExamQuestion(rawText: string): ExamQuestion | null {
  const cleaned = String(rawText || '')
    .replace(/```(?:json|JSON)?\s*/g, '')
    .replace(/\s*```/g, '')
    .replace(/<(?:thinking|think)>[\s\S]*?(<\/(?:thinking|think)>|$)/gi, '')
    .trim();
  for (let start = cleaned.indexOf('{'); start >= 0; start = cleaned.indexOf('{', start + 1)) {
    const end = cleaned.lastIndexOf('}');
    if (end <= start) break;
    try {
      const value = JSON.parse(cleaned.slice(start, end + 1)) as Partial<ExamQuestion>;
      if (typeof value.q !== 'string') continue;
      const type = value.type === 'multiple-choice' || value.type === 'short-answer' ? value.type : 'fill-blank';
      return { ...value, type, explanation: typeof value.explanation === 'string' ? value.explanation : '' } as ExamQuestion;
    } catch { /* try the next balanced candidate */ }
  }
  return null;
}

function questionPrompt(topic: string, type: ExamQuestion['type'], difficulty: string, language: string, index: number, count: number, instructions: string) {
  return `Generate ONE exam question as JSON only. Topic: ${topic}. Difficulty: ${difficulty}. Question type: ${type}. Language: ${language}. This is question ${index} of ${count}. Return q, type, explanation. For multiple-choice include opts with four letter/text options and answer as the correct letter. For fill-blank include answers as acceptable strings. For short-answer include answer as key facts. Use Markdown and LaTeX when useful. ${instructions ? `Additional instructions: ${instructions}` : ''}`;
}

export async function generateExam(options: {
  topic: string;
  count: number;
  difficulty: string;
  types: ExamQuestion['type'][];
  instructions?: string;
  language?: string;
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
}) {
  const sessionId = uuid();
  const baseSession: Session = { id: sessionId, title: options.topic, topic: options.topic, mode: 'chat', kind: 'exam', phase: 'chat', messages: [], updatedAt: new Date().toISOString() };
  await sessionsApi.upsert(baseSession);
  const questions: ExamQuestion[] = [];
  const language = options.language || 'English';

  for (let index = 0; index < options.count; index += 1) {
    if (options.signal?.aborted) throw new Error('Exam generation cancelled');
    const type = options.types[index % options.types.length] || 'multiple-choice';
    const textParts: string[] = [];
    await new Promise<void>((resolve, reject) => {
      let stop: (() => void) | null = null;
      const abort = () => { stop?.(); reject(new Error('Exam generation cancelled')); };
      options.signal?.addEventListener('abort', abort, { once: true });
      void startChatStream(sessionId, {
        mode: 'chat',
        messages: [
          { role: 'system', content: questionPrompt(options.topic, type, options.difficulty, language, index + 1, options.count, options.instructions || '') },
          { role: 'user', content: `Generate question ${index + 1} now.` },
        ],
      }, {
        onDelta: (delta) => textParts.push(delta),
        onDone: () => { options.signal?.removeEventListener('abort', abort); resolve(); },
        onError: (message) => { options.signal?.removeEventListener('abort', abort); reject(new Error(message)); },
      }).then((cancel) => { stop = cancel; if (options.signal?.aborted) abort(); }).catch((caught) => { options.signal?.removeEventListener('abort', abort); reject(caught); });
    });
    const question = parseExamQuestion(textParts.join(''));
    if (!question) throw new Error(`Question ${index + 1} returned an invalid format`);
    questions.push(question);
    options.onProgress?.(questions.length, options.count);
  }

  const userMessage: Message = { clientId: `exam-${Date.now()}`, role: 'user', rawText: `Generate an exam about ${options.topic}`, content: `Generate an exam about ${options.topic}`, type: 'user' };
  const assistantMessage: Message = { clientId: `exam-result-${Date.now()}`, role: 'assistant', rawText: JSON.stringify(questions), content: JSON.stringify(questions), type: 'assistant' };
  await sessionsApi.upsert({ ...baseSession, messages: [userMessage, assistantMessage], examData: { topic: options.topic, difficulty: options.difficulty, count: options.count, lang: language, types: options.types, questions: questions as unknown as JsonValue[], answers: {} } });
  return { sessionId, questions };
}

export function gradeExam(questions: ExamQuestion[], answers: Record<number, string>) {
  let correct = 0;
  const results = questions.map((question, index) => {
    const actual = String(answers[index] || '').trim().toLowerCase();
    /* P3 1:1 — mirrors `frontend/src/exam.js:986-996`:
     * MC = letter match, FB = case-insensitive exact, SA = keyword
     * overlap (expected split on [,\\s]+, keep len>3, correct when
     * empty or any keyword appears in the answer). */
    if (question.type === 'multiple-choice') {
      const expected = [question.answer || ''];
      const isCorrect = expected.some((value) => actual === value.trim().toLowerCase());
      if (isCorrect) correct += 1;
      return { index, correct: isCorrect, answer: answers[index] || '', expected };
    }
    if (question.type === 'fill-blank') {
      const expected = question.answers || [question.answer || ''];
      const isCorrect = expected.some((value) => actual === value.trim().toLowerCase());
      if (isCorrect) correct += 1;
      return { index, correct: isCorrect, answer: answers[index] || '', expected };
    }
    const expectedText = String(question.answer || question.answers?.join(' ') || '').trim().toLowerCase();
    const keywords = expectedText.split(/[,\s]+/).filter((k) => k.length > 3);
    const expected = question.answers || [question.answer || ''];
    const isCorrect = keywords.length === 0 || keywords.some((k) => actual.includes(k));
    if (isCorrect) correct += 1;
    return { index, correct: isCorrect, answer: answers[index] || '', expected };
  });
  return { correct, total: questions.length, results };
}
