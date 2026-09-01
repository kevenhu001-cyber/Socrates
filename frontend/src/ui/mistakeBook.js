import { esc } from '../render/helpers.js';
import { formatRelativeTime } from './recentsHelpers.js';

/**
 * Owns the mistake-book UI and persistence workflow. The chat controller
 * supplies the few cross-feature actions (session save, scrolling, and quiz
 * mounting) so this module stays independent from the main application file.
 */
export function createMistakeBook({
  state,
  stateStore,
  apiFetch,
  saveCurrentSession,
  mountQuizWidget,
  mountPracticeWidget,
  scrollContainer,
  getTutorSocratic = () => window.tutorSocratic,
}) {
  function persistMistake(mistakeData) {
    var sid = state.currentSessionId;
    if (typeof sid !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid)) sid = null;
    try {
      apiFetch('/api/mistakes', {
        method: 'POST',
        body: {
          sessionId: sid,
          nodeName: mistakeData.nodeName || null,
          questionContent: mistakeData.questionContent || '',
          userAnswer: mistakeData.userAnswer != null ? String(mistakeData.userAnswer) : null,
          correctAnswer: mistakeData.correctAnswer != null ? String(mistakeData.correctAnswer) : null,
          source: mistakeData.source || 'quiz',
        },
      }).catch(function () {
        console.log('[mistakes] failed to persist mistake');
      });
    } catch (_) {
      console.log('[mistakes] persistMistake threw');
    }
  }

  function recordMistake(rec) {
    var node = state.kbNodes[state.currentNode] || {};
    var mistake = {
      id: 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      type: rec.type || 'quiz',
      topic: state.topic || '',
      node: node.name || '',
      nodeIdx: state.currentNode,
      q: rec.q,
      options: rec.options || [],
      correct: rec.correct || null,
      userAnswer: rec.userAnswer || null,
      judgedAnswer: rec.judgedAnswer || null,
      timestamp: Date.now(),
      redoCount: 0,
      quizSlotId: rec.quizSlotId || null,
    };
    stateStore.dispatch({
      type: 'state/set', key: 'mistakes',
      value: [mistake].concat(state.mistakes || []),
    });
    persistMistake({
      nodeName: mistake.node || null,
      questionContent: mistake.q || '',
      userAnswer: mistake.userAnswer,
      correctAnswer: mistake.correct,
      source: mistake.type === 'practice' ? 'practice' : 'quiz',
    });
    saveCurrentSession();
    renderMistakes();
    updateMistakesBadge();
  }

  function removeMistakeForQuizSlot(slotId) {
    if (!slotId || !state.mistakes) return;
    var before = state.mistakes.length;
    var remaining = state.mistakes.filter(function (mistake) { return mistake.quizSlotId !== slotId; });
    if (remaining.length !== before) {
      stateStore.dispatch({ type: 'state/set', key: 'mistakes', value: remaining });
      saveCurrentSession();
      renderMistakes();
      updateMistakesBadge();
    }
  }

  function updateMistakesBadge() {
    var badge = document.getElementById('mistakesTabBadge');
    if (!badge) return;
    var count = (state.mistakes || []).length;
    badge.textContent = count > 0 ? String(count) : '';
  }

  function renderMistakes() {
    var cont = document.getElementById('mistakesList');
    if (!cont) return;
    var tutorSocratic = getTutorSocratic();
    if (tutorSocratic && typeof tutorSocratic.renderMistakeFilterBar === 'function') {
      try { tutorSocratic.renderMistakeFilterBar(); } catch (_) {}
    }
    if (!state.mistakes || state.mistakes.length === 0) {
      cont.innerHTML = '<div class="recents-empty">No mistakes yet.<br>Wrong quiz picks and incorrect practice attempts will land here for review.</div>';
      return;
    }
    var filter = state.mistakeFilter || 'all';
    var filtered = state.mistakes.slice();
    if (filter === 'unresolved') {
      filtered = filtered.filter(function (mistake) { return !mistake.resolved && !mistake.isResolved; });
    } else if (filter === 'resolved') {
      filtered = filtered.filter(function (mistake) { return !!(mistake.resolved || mistake.isResolved); });
    }
    if (!filtered.length) {
      cont.innerHTML = '<div class="recents-empty">'
        + (filter === 'resolved'
          ? 'No resolved mistakes yet. Mark a mistake as conquered after redoing it successfully.'
          : 'Nothing in this filter. Switch to "all" to see every mistake.')
        + '</div>';
      return;
    }
    var html = '';
    filtered.forEach(function (mistake) {
      var optionsHtml = '';
      (mistake.options || []).forEach(function (option) {
        var tag = option.letter === mistake.correct ? 'correct-tag' : (option.letter === mistake.userAnswer ? 'wrong-tag' : '');
        optionsHtml += '<div class="mistake-opt ' + tag + '"><span class="mistake-opt-letter">' + esc(option.letter) + '</span><span>' + esc(option.text) + '</span></div>';
      });
      var resolved = !!(mistake.resolved || mistake.isResolved);
      html += '<div class="mistake-card' + (resolved ? ' mistake-card-resolved' : '') + '" data-mistake-id="' + esc(mistake.id) + '">';
      html += '<div class="mistake-meta"><span class="mistake-type">' + esc(mistake.type) + '</span><span class="mistake-topic">' + esc(mistake.topic || '') + '</span><span class="mistake-time">' + formatRelativeTime(mistake.timestamp) + '</span>'
        + (resolved ? '<span class="mistake-resolved-tag">conquered</span>' : '')
        + '</div>';
      html += '<div class="mistake-q">' + esc(mistake.q || '') + '</div>';
      html += '<div class="mistake-opts">' + optionsHtml + '</div>';
      if (mistake.redoCount) html += '<div class="mistake-redo-count">Redone ' + mistake.redoCount + ' time' + (mistake.redoCount > 1 ? 's' : '') + '</div>';
      html += '<button class="mistake-redo-btn" data-redo="' + esc(mistake.id) + '">Redo</button>';
      html += '</div>';
    });
    cont.innerHTML = html;
    cont.querySelectorAll('[data-redo]').forEach(function (btn) {
      btn.onclick = function () { handleMistakeRedo(btn.getAttribute('data-redo')); };
    });
  }

  function handleMistakeRedo(mistakeId) {
    var mistake = (state.mistakes || []).find(function (item) { return item.id === mistakeId; });
    if (!mistake) return;
    var updatedMistake = Object.assign({}, mistake, { redoCount: (mistake.redoCount || 0) + 1 });
    stateStore.dispatch({
      type: 'state/set', key: 'mistakes',
      value: (state.mistakes || []).map(function (item) {
        return item.id === mistakeId ? updatedMistake : item;
      }),
    });
    mistake = updatedMistake;
    saveCurrentSession();
    /* U-L4 — practice mistakes have no options, so mounting a quiz
       widget produced an empty shell. Mount the free-form practice
       widget instead (problem + textarea + self-grading against the
       stored correct answer). */
    var isPractice = mistake.type === 'practice' || !(mistake.options || []).length;
    if (isPractice && typeof mountPracticeWidget === 'function') {
      var pDiv = document.createElement('div');
      pDiv.className = 'msg assistant';
      var pBody = document.createElement('div');
      pBody.className = 'msg-body';
      pBody.innerHTML = '<div style="font-size:calc(12px * var(--app-font-scale, 1));color:hsl(var(--text-500));margin-bottom:6px">— Redoing a question you got wrong —</div><div class="practice-slot"></div>';
      pDiv.appendChild(pBody);
      var pList = document.getElementById('msgList');
      if (pList) pList.appendChild(pDiv);
      var pSc = scrollContainer();
      requestAnimationFrame(function () { pSc.scrollTop = pSc.scrollHeight; });
      var pSlot = pDiv.querySelector('.practice-slot');
      if (pSlot) mountPracticeWidget(pSlot, { problem: mistake.q || '', correct: mistake.correct || null });
      return;
    }
    if (mistake.quizSlotId) {
      var slot = document.querySelector('[data-quiz-id="' + mistake.quizSlotId + '"]');
      if (slot) {
        var parent = slot.closest('.inline-quiz');
        if (parent) {
          var parsed = {
            q: mistake.q,
            options: mistake.options.map(function (option) { return { letter: option.letter, text: option.text }; }),
            correct: mistake.correct,
            slotId: mistake.quizSlotId,
          };
          var fresh = document.createElement('div');
          parent.parentNode.replaceChild(fresh, parent);
          mountQuizWidget(fresh, parsed);
          return;
        }
      }
    }
    var div = document.createElement('div');
    div.className = 'msg assistant';
    var body = document.createElement('div');
    body.className = 'msg-body';
    body.innerHTML = '<div style="font-size:calc(12px * var(--app-font-scale, 1));color:hsl(var(--text-500));margin-bottom:6px">— Redoing a question you got wrong —</div><div class="quiz-slot" data-quiz-id="redo-' + Date.now().toString(36) + '"></div>';
    div.appendChild(body);
    var list = document.getElementById('msgList');
    if (list) list.appendChild(div);
    var sc = scrollContainer();
    requestAnimationFrame(function () { sc.scrollTop = sc.scrollHeight; });
    var quizSlot = div.querySelector('.quiz-slot');
    if (quizSlot) {
      var parsed = {
        q: mistake.q,
        options: mistake.options.map(function (option) { return { letter: option.letter, text: option.text }; }),
        correct: mistake.correct,
        slotId: quizSlot.getAttribute('data-quiz-id'),
      };
      mistake.quizSlotId = parsed.slotId;
      saveCurrentSession();
      mountQuizWidget(quizSlot, parsed);
    }
  }

  return { recordMistake, removeMistakeForQuizSlot, updateMistakesBadge, renderMistakes };
}
