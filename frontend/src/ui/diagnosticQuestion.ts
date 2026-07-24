import { scrollContainer } from './scroll.js';

export interface DiagQuestionState {
  diagQuestions: Array<{ q: string; opts: Array<{ letter: string; text: string }> }>;
  diagIndex: number;
  diagAnswers: (number | undefined)[];
}

export function renderDiagQuestion(
  state: DiagQuestionState,
  t: (key: string) => string,
  formatMsg: (text: string) => string,
): void {
  const q = state.diagQuestions[state.diagIndex];
  const sel = state.diagAnswers[state.diagIndex];
  const isSkipped = sel === -1;
  const view = document.getElementById('diagnosticView') as HTMLElement | null;
  if (!view) return;

  let html = '<div class="diag-card">';
  html += '<div class="diag-num">' + t('tutor.questionOf').replace('{n}', String(state.diagIndex + 1)).replace('{total}', String(state.diagQuestions.length)) + '</div>';
  html += '<div class="diag-text">' + formatMsg(q.q) + '</div>';
  html += '<div class="diag-opts">';
  q.opts.forEach(function (o: { letter: string; text: string }, i: number) {
    html += '<button class="diag-opt' + (sel === i ? ' selected' : '') + '" onclick="selectDiag(' + i + ')">';
    html += '<div class="diag-opt-letter">' + o.letter + '</div>';
    html += '<div class="diag-opt-text">' + formatMsg(o.text) + '</div>';
    html += '</button>';
  });
  html += '</div>';
  html += '<div class="diag-actions">';
  html += '<button class="diag-btn diag-btn-back' + (state.diagIndex === 0 ? ' hidden' : '') + '" onclick="prevDiagQuestion()">' + t('tutor.back') + '</button>';
  html += '<div class="diag-actions-right">';
  html += '<button class="diag-btn diag-btn-skip" onclick="skipDiagQuestion()">' + t('tutor.diagSkip') + '</button>';
  if (state.diagIndex < state.diagQuestions.length - 1) {
    html += '<button class="diag-btn diag-btn-continue' + (sel !== undefined && !isSkipped ? ' enabled' : '') + '" onclick="nextDiagQuestion()"' + (sel === undefined || isSkipped ? ' disabled' : '') + '>' + t('tutor.next') + '</button>';
  } else {
    html += '<button class="diag-btn diag-btn-continue' + (sel !== undefined && !isSkipped ? ' enabled' : '') + '" onclick="finishDiagnostic()"' + (sel === undefined || isSkipped ? ' disabled' : '') + '>' + t('tutor.begin') + '</button>';
  }
  html += '</div>';
  html += '</div>';
  html += '</div>';

  view.innerHTML = html;
  const sc = scrollContainer();
  if (sc) sc.scrollTop = 0;
}
