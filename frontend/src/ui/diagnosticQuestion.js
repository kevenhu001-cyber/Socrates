import { scrollContainer } from './scroll.js';

export function renderDiagQuestion(state, t, formatMsg) {
  var q = state.diagQuestions[state.diagIndex];
  var sel = state.diagAnswers[state.diagIndex];
  var isSkipped = sel === -1;
  var view = document.getElementById('diagnosticView');

  var html = '<div class="diag-card">';
  html += '<div class="diag-num">' + t('tutor.questionOf').replace('{n}', state.diagIndex + 1).replace('{total}', state.diagQuestions.length) + '</div>';
  html += '<div class="diag-text">' + formatMsg(q.q) + '</div>';
  html += '<div class="diag-opts">';
  q.opts.forEach(function (o, i) {
    html += '<button class="diag-opt' + (sel === i ? ' selected' : '') + '" data-diag-command="select" data-diag-index="' + i + '">';
    html += '<div class="diag-opt-letter">' + o.letter + '</div>';
    html += '<div class="diag-opt-text">' + formatMsg(o.text) + '</div>';
    html += '</button>';
  });
  html += '</div>';
  html += '<div class="diag-actions">';
  html += '<button class="diag-btn diag-btn-back' + (state.diagIndex === 0 ? ' hidden' : '') + '" data-diag-command="previous">' + t('tutor.back') + '</button>';
  html += '<div class="diag-actions-right">';
  html += '<button class="diag-btn diag-btn-skip" data-diag-command="skip">' + t('tutor.diagSkip') + '</button>';
  if (state.diagIndex < state.diagQuestions.length - 1) {
    html += '<button class="diag-btn diag-btn-continue' + (sel !== undefined && !isSkipped ? ' enabled' : '') + '" data-diag-command="next"' + (sel === undefined || isSkipped ? ' disabled' : '') + '>' + t('tutor.next') + '</button>';
  } else {
    html += '<button class="diag-btn diag-btn-continue' + (sel !== undefined && !isSkipped ? ' enabled' : '') + '" data-diag-command="finish"' + (sel === undefined || isSkipped ? ' disabled' : '') + '>' + t('tutor.begin') + '</button>';
  }
  html += '</div>';
  html += '</div>';
  html += '</div>';

  view.innerHTML = html;
  scrollContainer().scrollTop = 0;
}
