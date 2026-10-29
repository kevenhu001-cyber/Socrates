import { formatMsg } from '../render/markdown.ts';
import { clearExamSetup, renderExamActions, renderExamResultsView } from '../react/exam/examUiHost.tsx';
import { clearExamQuestionCards } from '../react/exam/examQuestionHost.tsx';
import { clearExamNavigation } from '../react/exam/examNavigationHost.tsx';
import { examBody as _examBody, examUiL as _examUiL, setExamTitle as _setExamTitle } from './ui.js';

function resultTypeLabel(type, translate) {
  const labels = {
    'multiple-choice': translate('Multiple choice', '选择题'),
    'fill-blank': translate('Fill blank', '填空题'),
    'short-answer': translate('Short answer', '简答题'),
  };
  return labels[type] || type;
}

function gradeExamQuestion(question, answer) {
  if (question.type === 'multiple-choice') {
    const selected = answer;
    return selected !== undefined && question.opts?.[selected]?.letter === question.answer;
  }
  if (question.type === 'fill-blank') {
    const submitted = String(answer || '').trim().toLowerCase();
    return (question.answers || []).some((candidate) => submitted === String(candidate).trim().toLowerCase());
  }
  if (question.type === 'short-answer') {
    const submitted = String(answer || '').trim().toLowerCase();
    const expected = String(question.answer || '').trim().toLowerCase();
    const keywords = expected.split(/[,\s]+/).filter((keyword) => keyword.length > 3);
    return keywords.length === 0 || keywords.some((keyword) => submitted.includes(keyword));
  }
  return false;
}

function resultQuestion(question, answer, isCorrect) {
  const translate = _examUiL;
  const options = question.type === 'multiple-choice'
    ? (question.opts || []).map((option, index) => ({
      letter: option.letter,
      html: formatMsg(option.text),
      isCorrect: option.letter === question.answer,
      isSelected: answer === index,
    }))
    : [];
  const isFillBlank = question.type === 'fill-blank';
  return {
    type: question.type,
    typeLabel: resultTypeLabel(question.type, translate),
    questionLabel: translate('Question', '题目'),
    questionHtml: formatMsg(question.q),
    answer: typeof answer === 'string' ? answer : '',
    options,
    isCorrect,
    statusLabel: isCorrect ? translate('Correct', '正确') : translate('Incorrect', '错误'),
    expectedLabel: isFillBlank ? translate('Correct answer', '正确答案') : translate('Expected', '期望答案'),
    expectedAnswer: isFillBlank ? (question.answers || []).join(', ') : String(question.answer || ''),
    explanationLabel: translate('Explanation', '解释'),
    explanationHtml: question.explanation ? formatMsg(question.explanation) : '',
  };
}

export function renderExamResults() {
  clearExamSetup();
  clearExamQuestionCards();
  clearExamNavigation();
  const questions = window.stateStore.read('examQuestions');
  const answers = window.stateStore.read('examAnswers') || {};
  const legacyBody = _examBody();
  const bodyHost = document.getElementById('examViewReactBody');
  const footerHost = document.getElementById('examViewReactFooter');
  if (legacyBody) legacyBody.replaceChildren();
  if (!bodyHost || !footerHost) return;

  _setExamTitle(_examUiL('Exam Results', '考试结果') + ': ' + window.stateStore.read('examTopic'));
  let correct = 0;
  const details = [];
  questions.forEach((question, index) => {
    if (question.type === 'error') return;
    const answer = answers[index];
    const isCorrect = gradeExamQuestion(question, answer);
    if (isCorrect) correct++;
    details.push(resultQuestion(question, answer, isCorrect));
  });
  const total = details.length;
  renderExamResultsView(bodyHost, {
    correct,
    total,
    percent: total > 0 ? Math.round(correct / total * 100) : 0,
    correctLabel: _examUiL('correct', '正确'),
    questions: details,
  });
  renderExamActions(footerHost, [
    { command: 'form', label: _examUiL('New Exam', '新考试') },
    { command: 'close', label: _examUiL('Close', '关闭'), variant: 'outline' },
  ]);
}
