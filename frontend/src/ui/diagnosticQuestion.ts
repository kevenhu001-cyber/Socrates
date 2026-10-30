interface DiagnosticQuestionState {
  diagQuestions: { q: string; opts: { letter: string; text: string }[] }[];
  diagAnswers: unknown[];
  diagIndex: number;
}

import { scrollContainer } from './scroll.js';
import { renderDiagnostic } from '../react/tutor/diagnosticHost.tsx';

/* The question card is a React view; `tutor/diagnosticFlow.js` keeps the
   delegated click handler that reads `data-diag-command` off its buttons. */
export function renderDiagQuestion(state: DiagnosticQuestionState, t: (key: string) => string, formatMsg: (text: string) => string) {
  const q = state.diagQuestions[state.diagIndex];
  const sel = state.diagAnswers[state.diagIndex];
  const last = state.diagQuestions.length - 1;

  renderDiagnostic({
    kind: 'question',
    numberLabel: t('tutor.questionOf')
      .replace('{n}', String(state.diagIndex + 1))
      .replace('{total}', String(state.diagQuestions.length)),
    questionHtml: formatMsg(q.q),
    options: q.opts.map(function (o) {
      return { letter: o.letter, text: formatMsg(o.text) };
    }),
    selected: typeof sel === 'number' ? sel : null,
    isFirst: state.diagIndex === 0,
    isLast: state.diagIndex >= last,
    labels: {
      back: t('tutor.back'),
      skip: t('tutor.diagSkip'),
      next: t('tutor.next'),
      begin: t('tutor.begin'),
    },
  });

  const container = scrollContainer();
  if (container) container.scrollTop = 0;
}
