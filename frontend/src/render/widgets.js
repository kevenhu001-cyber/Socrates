

import { esc } from './helpers.js';

let runtime = {
  formatMsg: (value) => String(value ?? ''),
  t: (key) => key,
  esc,
  submitChatMessage: () => {},
  stateStore: { read: () => undefined, dispatch: () => {} },
  recordMistake: () => {},
  removeMistakeForQuizSlot: () => {},
  handleQuizPick: () => {},
  shouldRequestTutorAfterQuiz: () => false,
  updateKB: () => {},
  updateChatStats: () => {},
  saveCurrentSession: () => {},
};

export function configureWidgetRuntime(nextRuntime) {
  runtime = { ...runtime, ...nextRuntime };
}

export function mountExampleWidget(slot, parsed) {
  const { formatMsg, t } = runtime;
  const el = document.createElement('div'); el.className = 'inline-example';
  if (parsed.title) { const node = document.createElement('div'); node.className = 'inline-example-title'; node.innerHTML = formatMsg(parsed.title); el.appendChild(node); }
  if (parsed.problem) { const node = document.createElement('div'); node.className = 'inline-example-problem'; node.innerHTML = formatMsg(parsed.problem); el.appendChild(node); }
  if (parsed.solution) {
    const reveal = document.createElement('button'); reveal.type = 'button'; reveal.className = 'inline-example-reveal';
    const solution = document.createElement('div'); solution.className = 'inline-example-solution'; solution.innerHTML = formatMsg(parsed.solution);
    if (!parsed._revealed) solution.hidden = true;
    const update = () => { solution.hidden = !solution.hidden; parsed._revealed = !solution.hidden; reveal.textContent = t(parsed._revealed ? 'tutor.hideSolution' : 'tutor.showSolution'); };
    reveal.textContent = t(parsed._revealed ? 'tutor.hideSolution' : 'tutor.showSolution'); reveal.onclick = update; el.append(reveal, solution);
  }
  slot.replaceWith(el);
}

export function mountDefinitionWidget(slot, parsed) {
  const el = document.createElement('div'); el.className = 'inline-definition';
  if (parsed.term) { const node = document.createElement('div'); node.className = 'inline-definition-term'; node.innerHTML = runtime.formatMsg(parsed.term); el.appendChild(node); }
  if (parsed.body) { const node = document.createElement('div'); node.className = 'inline-definition-body'; node.innerHTML = runtime.formatMsg(parsed.body); el.appendChild(node); }
  slot.replaceWith(el);
}

export function mountStepList(slot, steps) {
  const el = document.createElement('div'); el.className = 'inline-step-list';
  steps.forEach((step) => { const row = document.createElement('div'); row.className = 'inline-step'; const number = document.createElement('span'); number.className = 'inline-step-n'; number.textContent = `${step.n}.`; const body = document.createElement('div'); body.className = 'inline-step-body'; body.innerHTML = runtime.formatMsg(step.body); row.append(number, body); el.appendChild(row); });
  slot.replaceWith(el);
}

export function mountFlashcardWidget(slot, parsed) {
  const el = document.createElement('div'); el.className = 'inline-flashcard'; el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-label', runtime.t('tutor.flashcardAria'));
  const front = document.createElement('div'); front.className = 'inline-flashcard-front'; front.innerHTML = runtime.formatMsg(parsed.front || '');
  const back = document.createElement('div'); back.className = 'inline-flashcard-back'; back.innerHTML = runtime.formatMsg(parsed.back || ''); back.hidden = true; el.append(front, back);
  const flip = () => { front.hidden = !front.hidden; back.hidden = !back.hidden; }; el.onclick = flip; el.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); flip(); } }; slot.replaceWith(el);
}

export function mountTheoremWidget(slot, parsed) {
  const el = document.createElement('div'); el.className = 'inline-theorem';
  if (parsed.title) { const node = document.createElement('div'); node.className = 'inline-theorem-title'; node.innerHTML = runtime.formatMsg(parsed.title); el.appendChild(node); }
  if (parsed.statement) { const node = document.createElement('div'); node.className = 'inline-theorem-statement'; node.innerHTML = runtime.formatMsg(parsed.statement); el.appendChild(node); }
  if (parsed.proofBody) { const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'inline-theorem-proof-toggle'; const proof = document.createElement('div'); proof.className = 'inline-theorem-proof collapsed'; if (parsed.proofTitle) { const title = document.createElement('div'); title.className = 'inline-proof-title'; title.innerHTML = runtime.formatMsg(parsed.proofTitle); proof.appendChild(title); } const body = document.createElement('div'); body.className = 'inline-proof-body'; body.innerHTML = runtime.formatMsg(parsed.proofBody); proof.appendChild(body); toggle.textContent = runtime.t('tutor.showProof'); toggle.onclick = () => { const collapsed = proof.classList.toggle('collapsed'); toggle.textContent = runtime.t(collapsed ? 'tutor.showProof' : 'tutor.hideProof'); }; el.append(toggle, proof); }
  slot.replaceWith(el);
}

export function mountProofWidget(slot, parsed) { const el = document.createElement('div'); el.className = 'inline-proof'; if (parsed.title) { const node = document.createElement('div'); node.className = 'inline-proof-title'; node.innerHTML = runtime.formatMsg(parsed.title); el.appendChild(node); } if (parsed.body) { const node = document.createElement('div'); node.className = 'inline-proof-body'; node.innerHTML = runtime.formatMsg(parsed.body); el.appendChild(node); } slot.replaceWith(el); }
export function mountDerivationWidget(slot, parsed) { const el = document.createElement('div'); el.className = 'inline-derivation'; if (parsed.title) { const node = document.createElement('div'); node.className = 'inline-derivation-title'; node.innerHTML = runtime.formatMsg(parsed.title); el.appendChild(node); } if (parsed.body) { const node = document.createElement('div'); node.className = 'inline-derivation-body'; node.innerHTML = runtime.formatMsg(parsed.body); el.appendChild(node); } slot.replaceWith(el); }
export function mountKeyPointWidget(slot, parsed) { const el = document.createElement('div'); el.className = 'inline-key-point'; const label = document.createElement('div'); label.className = 'inline-key-point-label'; label.textContent = runtime.t('tutor.keyPointLabel') || 'Key Point'; const body = document.createElement('div'); body.className = 'inline-key-point-body'; body.innerHTML = runtime.formatMsg(parsed.body); el.append(label, body); slot.replaceWith(el); }

export function mountPracticeWidget(slot, parsed) {
  const { formatMsg, t, submitChatMessage, stateStore, recordMistake } = runtime;
  const el = document.createElement('div');
  el.className = 'inline-practice';
  const problem = document.createElement('div');
  problem.className = 'inline-practice-problem';
  problem.innerHTML = formatMsg(parsed.problem);
  el.appendChild(problem);
  let hint;
  if (parsed.hint) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'inline-practice-hint-toggle';
    toggle.textContent = t('tutor.showHint');
    hint = document.createElement('div');
    hint.className = 'inline-practice-hint';
    hint.setAttribute('hidden', '');
    hint.innerHTML = formatMsg(parsed.hint);
    toggle.onclick = () => {
      const hidden = hint.hasAttribute('hidden');
      hint.toggleAttribute('hidden', !hidden);
      toggle.textContent = t(hidden ? 'tutor.hideHint' : 'tutor.showHint');
    };
    el.append(toggle, hint);
  }
  const form = document.createElement('form');
  form.className = 'inline-practice-form';
  form.onsubmit = () => false;
  const textarea = document.createElement('textarea');
  textarea.className = 'inline-practice-textarea';
  textarea.rows = 3;
  textarea.placeholder = t('tutor.practicePlaceholder');
  form.appendChild(textarea);
  const actions = document.createElement('div');
  actions.className = 'inline-practice-actions';
  let reveal;
  if (parsed.correct) {
    reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'inline-practice-reveal';
    reveal.textContent = t('tutor.revealAnswer');
    actions.appendChild(reveal);
  }
  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'inline-practice-submit';
  submit.textContent = t('tutor.submitAnswer');
  actions.appendChild(submit);
  form.appendChild(actions);
  const feedback = document.createElement('div');
  feedback.className = 'inline-practice-feedback';
  form.appendChild(feedback);
  el.appendChild(form);
  if (slot?.getAttribute && !parsed.slotId) parsed.slotId = slot.getAttribute('data-practice-id');
  submit.onclick = () => {
    const answer = textarea.value.trim();
    if (!answer) {
      feedback.className = 'inline-practice-feedback bad';
      feedback.textContent = t('tutor.practiceEmpty');
      return;
    }
    submit.disabled = true;
    if (reveal) reveal.disabled = true;
    textarea.disabled = true;
    submitChatMessage(t('tutor.practicePrefix') + answer, { origin: 'practice' });
    if (!parsed.correct) {
      feedback.className = 'inline-practice-feedback recorded';
      feedback.textContent = t('tutor.practiceSent');
      return;
    }
    const normalize = (value) => String(value).toLowerCase().replace(/[\s.,;:!?()[\]'\"]+/g, '').trim();
    const isCorrect = normalize(answer) === normalize(parsed.correct);
    feedback.className = `inline-practice-feedback ${isCorrect ? 'ok' : 'bad'}`;
    feedback.textContent = isCorrect ? t('tutor.practiceSelfCorrect') : `${t('tutor.practiceSelfWrong')} ${parsed.correct}`;
    if (isCorrect) {
      stateStore.dispatch({ type: 'state/set', key: 'practiceAttempts', value: 0 });
    } else {
      recordMistake({ type: 'practice', q: parsed.problem, options: [], correct: parsed.correct, userAnswer: answer, judgedAnswer: parsed.correct, practiceSlotId: parsed.slotId || null });
    }
  };
  reveal?.addEventListener('click', () => {
    reveal.disabled = true;
    submit.disabled = true;
    textarea.disabled = true;
    feedback.className = 'inline-practice-feedback recorded';
    feedback.innerHTML = formatMsg(parsed.correct);
  });
  slot.replaceWith(el);
}

export function mountQuizWidget(slot, parsed) {
  const { formatMsg, handleQuizPick } = runtime;
  if (slot?.getAttribute && !parsed.slotId) parsed.slotId = slot.getAttribute('data-quiz-id');
  const card = document.createElement('div');
  card.className = 'inline-quiz';
  const question = document.createElement('div');
  question.className = 'inline-quiz-q';
  question.innerHTML = formatMsg(parsed.q);
  card.appendChild(question);
  const options = document.createElement('div');
  options.className = 'inline-quiz-opts';
  const buttons = [];
  parsed.options.forEach((option) => {
    const button = document.createElement('button');
    button.className = 'inline-quiz-opt';
    button.setAttribute('data-letter', option.letter);
    button.innerHTML = `<span class="inline-quiz-opt-letter">${option.letter}.</span><span class="inline-quiz-opt-text">${formatMsg(option.text)}</span>`;
    button.onclick = () => handleQuizPick(card, options, feedback, buttons, option, parsed);
    options.appendChild(button);
    buttons.push(button);
  });
  card.appendChild(options);
  const feedback = document.createElement('div');
  feedback.className = 'inline-quiz-feedback';
  card.appendChild(feedback);
  slot.replaceWith(card);
}

export function handleQuizPick(card, options, feedback, buttons, picked, parsed) {
  const { t, esc: escape, recordMistake, removeMistakeForQuizSlot, stateStore, shouldRequestTutorAfterQuiz, updateKB, updateChatStats, saveCurrentSession, submitChatMessage } = runtime;
  buttons.forEach((button) => { button.disabled = true; });
  const chosen = buttons.find((button) => button.getAttribute('data-letter') === picked.letter);
  chosen?.classList.add('selected');
  const correct = parsed.correct;
  const isRight = Boolean(correct) && picked.letter === correct;
  chosen?.classList.add(isRight ? 'correct' : 'wrong');
  if (correct && !isRight) buttons.find((button) => button.getAttribute('data-letter') === correct)?.classList.add('correct');
  if (correct) feedback.classList.add(isRight ? 'ok' : 'bad');
  feedback.textContent = correct
    ? (isRight ? t('tutor.quizCorrect') : t('tutor.quizWrong')).replace('{answer}', escape(correct))
    : t('tutor.quizRecorded').replace('{letter}', picked.letter);
  if (correct && !isRight) {
    recordMistake({ type: 'quiz', q: parsed.q, options: parsed.options.map((option) => ({ letter: option.letter, text: option.text })), correct, userAnswer: picked.letter, quizSlotId: parsed.slotId || null });
  } else if (isRight && parsed.slotId) {
    removeMistakeForQuizSlot(parsed.slotId);
  }
  const stage = stateStore.read('teachingStage');
  if (stage === 'exercise') {
    stateStore.dispatch(isRight
      ? { type: 'state/batch', patch: { teachingStage: 'check', practiceAttempts: 0 } }
      : { type: 'state/set', key: 'practiceAttempts', value: (stateStore.read('practiceAttempts') || 0) + 1 });
  } else if (stage === 'check') {
    stateStore.dispatch({ type: 'state/set', key: 'practiceAttempts', value: isRight ? 0 : (stateStore.read('practiceAttempts') || 0) + 1 });
  }
  if (!shouldRequestTutorAfterQuiz(correct, isRight)) {
    try { updateKB(); } catch {}
    try { updateChatStats(); } catch {}
    try { saveCurrentSession(); } catch {}
    return;
  }
  let text = `I chose ${picked.letter}. ${picked.text}`;
  if (correct) text += ` (Result: ${isRight ? 'correct' : `incorrect, correct is ${correct}`}.)`;
  submitChatMessage(text, { origin: 'quiz' });
}
