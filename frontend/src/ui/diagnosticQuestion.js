import { scrollContainer } from './scroll.js';
import { renderDiagnostic } from '../react/tutor/diagnosticHost.tsx';

/* The question card is a React view; `tutor/diagnosticFlow.js` keeps the
   delegated click handler that reads `data-diag-command` off its buttons. */
export function renderDiagQuestion(state, t, formatMsg) {
  var q = state.diagQuestions[state.diagIndex];
  var sel = state.diagAnswers[state.diagIndex];
  var last = state.diagQuestions.length - 1;

  renderDiagnostic({
    kind: 'question',
    numberLabel: t('tutor.questionOf')
      .replace('{n}', state.diagIndex + 1)
      .replace('{total}', state.diagQuestions.length),
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

  scrollContainer().scrollTop = 0;
}
