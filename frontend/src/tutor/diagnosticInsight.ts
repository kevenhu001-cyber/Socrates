/**
 * RN-6 — the AI-written part of the diagnostic results: why each weak
 * dimension is weak (from the learner's actual answers) and a suggested
 * next step. The counts, coverage and ranking stay computed; only the prose
 * comes from the model, through the shared normalizer. While it loads, or
 * when it fails, the results screen shows its computed copy as before.
 */
import { normalizeDiagnosticInsight, type DiagnosticInsightResult } from '@socrates/core/learningBlocks';
import { callAPI, type ChatRequestMessage } from '../chat/api.ts';
import { stateStore } from '../state/store.ts';
import { getCurrentLanguage } from '../i18n/languageState.ts';
import { languageName } from './conceptMap.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

interface StoredDiagOption { letter?: string; text?: string; level?: string }
interface StoredDiagQuestion { q?: string; knowledgePoint?: string; nodeIdx?: number; opts?: StoredDiagOption[] }

/** One line per answered question, for the prompt. Exported for tests. */
export function describeDiagnosticAnswers(
  questions: readonly StoredDiagQuestion[],
  answers: ReadonlyArray<number | undefined>,
  nodeNames: readonly string[],
): string {
  return questions.map((question, index) => {
    const nodeIndex = typeof question.nodeIdx === 'number' ? question.nodeIdx : index;
    const answer = answers[index];
    const picked = typeof answer === 'number' && answer >= 0 ? question.opts?.[answer] : undefined;
    const result = picked
      ? `answered ${picked.letter || ''} 「${picked.text || ''}」 (level: ${picked.level || 'unknown'})`
      : 'skipped';
    return `${index + 1}. Dimension: ${nodeNames[nodeIndex] ?? '?'}; knowledge point: ${question.knowledgePoint || '?'}; question: ${question.q || ''}; ${result}`;
  }).join('\n');
}

export async function generateDiagnosticInsight(): Promise<DiagnosticInsightResult | null> {
  const nodes = (stateStore.read('kbNodes') || []) as Array<{ name: string; status?: string }>;
  const questions = (stateStore.read('diagQuestions') || []) as StoredDiagQuestion[];
  const answers = (stateStore.read('diagAnswers') || []) as Array<number | undefined>;
  if (!nodes.length || !questions.length) return null;
  const names = nodes.map((node) => node.name);
  const topic = String(stateStore.read('domain') || stateStore.read('topic') || '');
  const prompt =
    'You are a diagnostic tutor reading a learner\'s answers to a short diagnostic on: ' + topic + '.\n' +
    'Dimensions and their baseline result: ' + JSON.stringify(nodes.map((node) => ({ name: node.name, status: node.status === 'fuzzy' ? 'some familiarity' : 'blank' }))) + '.\n' +
    'For every dimension whose baseline is blank or that the answers show a misconception in, explain the likely reason in one sentence, ' +
    'grounded in what the learner actually chose (name the misconception the chosen option reveals; for a skipped question say what is untested). ' +
    'Then write one concrete next step: where to start and what to focus on first, in one or two sentences. Do not praise, do not pad.\n' +
    'Write in ' + languageName(getCurrentLanguage()) + ', matching the language of the questions.\n' +
    'Output ONLY one JSON object, no code fences: {"summary":"one sentence","nextStep":"one or two sentences","gaps":[{"name":"exact dimension name","reason":"one sentence"}]}\n' +
    'Inside strings never use ASCII double quotes; use 「」 for CJK or no quotes.';
  const msgs: ChatRequestMessage[] = [
    { role: 'system', content: prompt },
    { role: 'user', content: 'Answers:\n' + describeDiagnosticAnswers(questions, answers, names) },
  ];
  try {
    const resp = await callAPI(msgs, 2000);
    const insight = normalizeDiagnosticInsight(typeof resp === 'string' ? resp : '', names);
    return insight.status === 'ok' ? insight : null;
  } catch (error) {
    reportSwallow(error, 'tutor/diagnosticInsight');
    return null;
  }
}
