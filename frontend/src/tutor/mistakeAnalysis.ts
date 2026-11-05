/**
 * RN-6 — AI content for the mistake book.
 *
 *  - analyzeMistake: when a mistake is recorded, the model writes where the
 *    answer went wrong and the right way to think it through. Stored on the
 *    entry as `analysis` (persists with the session's mistakes); entries
 *    without it keep showing the plain answers, nothing is made up.
 *  - turnMistakeIntoNextQuestion: the model writes one follow-up question
 *    that makes the learner confront the misconception behind a mistake;
 *    it joins the question chain and goes out as the next turn.
 */
import { extractNextQuestions, normalizeMistakeAnalysis } from '@socrates/core/learningBlocks';
import { callAPI, type ChatRequestMessage } from '../chat/api.ts';
import { stateStore } from '../state/store.ts';
import { getCurrentLanguage } from '../i18n/languageState.ts';
import { saveCurrentSession } from '../session/persistence.ts';
import { languageName } from './conceptMap.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import type { MistakeStateEntry } from '../state/kb.ts';

function readEntries(): MistakeStateEntry[] {
  const value = stateStore.read('mistakes');
  return Array.isArray(value) ? value as MistakeStateEntry[] : [];
}

function optionLine(option: MistakeStateEntry['options'][number], index: number): string {
  if (typeof option === 'string') return `${String.fromCharCode(65 + index)}. ${option}`;
  return `${option.letter || String.fromCharCode(65 + index)}. ${option.text || ''}`;
}

/** The mistake as plain lines for a prompt. Exported for tests. */
export function describeMistake(entry: MistakeStateEntry): string {
  const lines = [
    `Topic: ${entry.topic || '?'}${entry.node ? `; sub-topic: ${entry.node}` : ''}`,
    `Question: ${entry.q}`,
  ];
  if (Array.isArray(entry.options) && entry.options.length) lines.push('Options:\n' + entry.options.map(optionLine).join('\n'));
  lines.push(`Learner's answer: ${entry.userAnswer ?? '(none recorded)'}`);
  const keyed = entry.correct ?? entry.judgedAnswer ?? null;
  if (keyed) lines.push(`Correct answer: ${keyed}`);
  return lines.join('\n');
}

const STRING_RULE = 'Inside strings never use ASCII double quotes; use 「」 for CJK or no quotes.';

const inflight = new Set<string>();

export async function analyzeMistake(id: string): Promise<void> {
  const entry = readEntries().find((item) => item.id === id);
  if (!entry || !entry.q || entry.analysis || inflight.has(id)) return;
  inflight.add(id);
  const sessionId = stateStore.read('currentSessionId');
  try {
    const prompt =
      'You are a tutor writing a mistake-book entry for a learner who answered a question wrong.\n' +
      'whyWrong: in one or two sentences, name the specific misconception or slip the learner\'s answer reveals (not just that it is wrong). ' +
      'correctApproach: in two or three sentences, show the line of reasoning that reaches the correct answer, so the learner could redo it alone.\n' +
      'Write in ' + languageName(getCurrentLanguage()) + ', matching the language of the question. The mistake card shows plain text, so write math in plain notation (x², 2x, (xⁿ)′ = n·xⁿ⁻¹), never LaTeX or $ delimiters.\n' +
      'Output ONLY one JSON object, no code fences: {"whyWrong":"...","correctApproach":"..."}\n' + STRING_RULE;
    const msgs: ChatRequestMessage[] = [{ role: 'system', content: prompt }, { role: 'user', content: describeMistake(entry) }];
    const resp = await callAPI(msgs, 1500);
    const analysis = normalizeMistakeAnalysis(typeof resp === 'string' ? resp : '');
    if (analysis.status !== 'ok' || stateStore.read('currentSessionId') !== sessionId) return;
    const next = readEntries().map((item) => item.id === id
      ? { ...item, analysis: { whyWrong: analysis.whyWrong, correctApproach: analysis.correctApproach } }
      : item);
    stateStore.dispatch({ type: 'state/set', key: 'mistakes', value: next });
    try { saveCurrentSession(); } catch (error) { reportSwallow(error, 'tutor/mistakeAnalysis.save'); }
  } catch (error) {
    reportSwallow(error, 'tutor/mistakeAnalysis.analyze');
  } finally {
    inflight.delete(id);
  }
}

/* ------------------------------------------------- mistake → next question */

let pendingNext: string | null = null;
const pendingListeners = new Set<() => void>();

function setPending(id: string | null): void {
  pendingNext = id;
  pendingListeners.forEach((listener) => listener());
}

export function getPendingNextQuestion(): string | null {
  return pendingNext;
}

export function subscribePendingNextQuestion(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => pendingListeners.delete(listener);
}

/** Ask the model for one follow-up question built on a mistake. Exported for tests. */
export async function writeMistakeFollowUp(entry: MistakeStateEntry): Promise<string | null> {
  const analysis = entry.analysis?.whyWrong ? `\nKnown misconception: ${entry.analysis.whyWrong}` : '';
  const prompt =
    'You turn a learner\'s past mistake into the next question on their question chain.\n' +
    'Write ONE question, in the learner\'s voice (a question they would ask the tutor), that makes them confront exactly the misconception behind the mistake. ' +
    'Do not repeat the original question and do not give away its answer. Under 40 words, plain text, no Markdown.\n' +
    'Write in ' + languageName(getCurrentLanguage()) + ', matching the language of the question.\n' +
    'Output ONLY: <next-questions>["the question"]</next-questions>\n' + STRING_RULE;
  const msgs: ChatRequestMessage[] = [{ role: 'system', content: prompt }, { role: 'user', content: describeMistake(entry) + analysis }];
  const resp = await callAPI(msgs, 800);
  const text = typeof resp === 'string' ? resp : '';
  const parsed = extractNextQuestions(text.includes('<next-questions') ? text : `<next-questions>${text}</next-questions>`, 1);
  return parsed.status === 'ok' ? parsed.questions[0]! : null;
}

export async function turnMistakeIntoNextQuestion(id: string): Promise<boolean> {
  if (pendingNext) return false;
  const entry = readEntries().find((item) => item.id === id);
  if (!entry || stateStore.read('phase') !== 'chat') return false;
  const sessionId = stateStore.read('currentSessionId');
  setPending(id);
  try {
    const question = await writeMistakeFollowUp(entry);
    if (!question || stateStore.read('currentSessionId') !== sessionId) return false;
    const { followChainCandidate } = await import('./questionChainActions.ts');
    followChainCandidate({ id: `ask:mistake:${id}`, text: question, kind: 'ask' });
    return true;
  } catch (error) {
    reportSwallow(error, 'tutor/mistakeAnalysis.nextQuestion');
    return false;
  } finally {
    setPending(null);
  }
}
