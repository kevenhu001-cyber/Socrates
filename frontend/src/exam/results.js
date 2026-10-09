import { esc } from '../render/helpers.js';
import { formatMsg } from '../render/markdown.js';

function _examBody() { return document.getElementById('examViewBody'); }
function _examFooter() { return document.getElementById('examViewFooter'); }
function _examUiL(en, zh) { return window._currentLang === 'zh' ? zh : en; }
function _setExamTitle(title) {
  const viewTitle = document.getElementById('examViewTitle');
  const barTitle = document.getElementById('examTitleBar');
  if (viewTitle) viewTitle.textContent = title;
  if (barTitle) barTitle.textContent = title;
}

function resultTypeLabel(type, translate) {
  const labels = {
    'multiple-choice': translate('Multiple choice', '选择题'),
    'fill-blank': translate('Fill blank', '填空题'),
    'short-answer': translate('Short answer', '简答题'),
  };
  return esc(labels[type] || type);
}

function renderMultipleChoiceOptions(question, selectedAnswer) {
  if (!question.opts) return '';
  const options = question.opts.map(function (option, index) {
    const selected = selectedAnswer === index;
    const isAnswer = option.letter === question.answer;
    let className = 'exam-q-opt';
    if (isAnswer) className += ' correct';
    if (selected && !isAnswer) className += ' wrong';
    if (selected) className += ' selected';
    return '<div class="' + className + '"><span class="exam-q-opt-letter">'
      + esc(option.letter) + '</span><span class="exam-q-opt-text">'
      + formatMsg(option.text) + '</span></div>';
  }).join('');
  return '<div class="exam-q-opts">' + options + '</div>';
}

function renderFillBlankAnswer(question, answer, correct, translate) {
  const className = 'exam-q-fill-input' + (correct ? ' correct' : ' wrong');
  let html = '<input class="' + className + '" value="' + esc(answer || '') + '" readonly>';
  if (!correct) {
    html += '<div style="font-size:calc(12px * var(--app-font-scale, 1));color:hsl(145 40% 45%);margin-top:4px">'
      + translate('Correct answer', '正确答案') + ': <strong>'
      + esc((question.answers || []).join(', ')) + '</strong></div>';
  }
  return html;
}

function renderShortAnswer(question, answer, correct, translate) {
  const className = 'exam-q-fill-input' + (correct ? ' correct' : ' wrong');
  let html = '<textarea class="' + className + '" readonly rows="2">' + esc(answer || '') + '</textarea>';
  if (!correct) {
    html += '<div style="font-size:calc(12px * var(--app-font-scale, 1));color:hsl(145 40% 45%);margin-top:4px">'
      + translate('Expected', '期望答案') + ': <strong>' + esc(question.answer || '') + '</strong></div>';
  }
  return html;
}

function renderQuestionAnswer(result, translate) {
  const question = result.q;
  if (question.type === 'multiple-choice') return renderMultipleChoiceOptions(question, result.ans);
  if (question.type === 'fill-blank') return renderFillBlankAnswer(question, result.ans, result.isCorrect, translate);
  if (question.type === 'short-answer') return renderShortAnswer(question, result.ans, result.isCorrect, translate);
  return '';
}

function renderExamQuestionResult(result, index, translate) {
  const question = result.q;
  const statusClass = result.isCorrect ? 'correct' : 'wrong';
  const statusLabel = result.isCorrect ? translate('Correct', '正确') : translate('Incorrect', '错误');
  let html = '<div class="exam-q-card">';
  html += '<div class="exam-q-num">' + translate('Question', '题目') + ' ' + (index + 1)
    + ' — <span class="exam-result-' + statusClass + '">' + statusLabel
    + '</span><span class="exam-q-type">' + resultTypeLabel(question.type, translate) + '</span></div>';
  html += '<div class="exam-q-text">' + formatMsg(question.q) + '</div>';
  html += renderQuestionAnswer(result, translate);
  if (question.explanation) {
    html += '<div class="exam-q-result ' + statusClass + '"><span class="label">'
      + translate('Explanation', '解释') + ':</span><div class="explain">'
      + formatMsg(question.explanation) + '</div></div>';
  }
  return html + '</div>';
}

export function renderExamResults() {
  var qs = window.stateStore.read("examQuestions");
  var ans = window.stateStore.read("examAnswers");
  var body = _examBody();
  var footer = _examFooter();
  var _L = _examUiL;
  _setExamTitle(_L("Exam Results", "考试结果") + ": " + window.stateStore.read("examTopic"));
  var correct = 0, total = 0;
  var resultDetails = [];
  qs.forEach(function (q, i) {
    if (q.type === "error") return;
    total++;
    var isCorrect = false;
    if (q.type === "multiple-choice") {
      var sel = ans[i];
      if (sel !== undefined && q.opts && q.opts[sel]) isCorrect = q.opts[sel].letter === q.answer;
    } else if (q.type === "fill-blank") {
      const ua = String(ans[i] || "").trim().toLowerCase();
      isCorrect = (q.answers || []).some(function (a) { return ua === String(a).trim().toLowerCase(); });
    } else if (q.type === "short-answer") {
      const ua = String(ans[i] || "").trim().toLowerCase();
      var expected = String(q.answer || "").trim().toLowerCase();
      var keywords = expected.split(/[,\s]+/).filter(function (k) { return k.length > 3 });
      isCorrect = keywords.length === 0 || keywords.some(function (k) { return ua.indexOf(k) >= 0; });
    }
    if (isCorrect) correct++;
    resultDetails.push({ q: q, ans: ans[i], isCorrect: isCorrect });
  });
  var pct = total > 0 ? Math.round(correct / total * 100) : 0;
  var html = '<div class="exam-score"><div class="exam-score-val"><span class="score-correct">' + correct + '</span><span class="score-total">/ ' + total + '</span></div><div class="exam-score-lbl">' + pct + ' ' + _L("correct", "正确") + '</div></div>';
  html += resultDetails.map(function (result, index) {
    return renderExamQuestionResult(result, index, _L);
  }).join('');
  body.innerHTML = html;
  footer.innerHTML = '<button class="exam-btn success" data-exam-command="form">' + _L("New Exam", "新考试") + '</button><button class="exam-btn secondary" data-exam-command="close">' + _L("Close", "关闭") + '</button>';
}
