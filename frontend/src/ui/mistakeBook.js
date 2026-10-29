import { esc } from '../render/helpers.ts';
import { formatRelativeTime } from './recentsHelpers.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { renderActionButton } from './actionButton.ts';

/* P_mistakes-i18n — this panel shipped raw English literals while zh is
   the default locale, and echoed the internal mistake.type enum straight
   into the card meta. i18n.js's t() does no interpolation, so {n} is
   substituted here, matching the convention in ui/diagnosticQuestion.js. */
function t(key, vars) {
  var v = (typeof window !== 'undefined' && typeof window.t === 'function') ? window.t(key) : key;
  if (!vars) return v;
  return String(v).replace(/\{(\w+)\}/g, function (whole, name) {
    return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
  });
}

function renderMistakeList(stateStore, getTutorSocratic, onRedo) {
  var cont = document.getElementById('mistakesList');
  if (!cont) return;
  var panel = document.getElementById('mistakesPanel');
  if (panel && panel.classList.contains('hidden')) {
    panel.dataset.mistakesDirty = '1';
    return;
  }
  if (panel) delete panel.dataset.mistakesDirty;
  var tutorSocratic = getTutorSocratic();
  if (tutorSocratic && typeof tutorSocratic.renderMistakeFilterBar === 'function') {
    try { tutorSocratic.renderMistakeFilterBar(); } catch (error) { reportSwallow(error, 'ui/mistakeBook.renderMistakeFilterBar'); }
  }
  var mistakes = stateStore.read('mistakes') || [];
  if (mistakes.length === 0) {
    cont.innerHTML = '<div class="recents-empty">' + esc(t('mistakes.empty'))
      + '<br>' + esc(t('mistakes.emptyHint')) + '</div>';
    return;
  }
  var filter = stateStore.read('mistakeFilter') || 'all';
  var filtered = mistakes.slice();
  if (filter === 'unresolved') {
    filtered = filtered.filter(function (mistake) { return !mistake.resolved && !mistake.isResolved; });
  } else if (filter === 'resolved') {
    filtered = filtered.filter(function (mistake) { return !!(mistake.resolved || mistake.isResolved); });
  }
  if (!filtered.length) {
    cont.innerHTML = '<div class="recents-empty">'
      + esc(filter === 'resolved' ? t('mistakes.filterEmptyResolved') : t('mistakes.filterEmptyOther'))
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
    var typeKey = 'mistakes.type.' + (mistake.type || '');
    var typeLabel = t(typeKey);
    html += '<div class="mistake-card' + (resolved ? ' mistake-card-resolved' : '') + '" data-mistake-id="' + esc(mistake.id) + '">';
    html += '<div class="mistake-meta"><span class="mistake-type">' + esc(typeLabel === typeKey ? (mistake.type || '') : typeLabel) + '</span><span class="mistake-topic">' + esc(mistake.topic || '') + '</span><span class="mistake-time">' + formatRelativeTime(mistake.timestamp) + '</span>'
      + (resolved ? '<span class="mistake-resolved-tag">' + esc(t('mistakes.conquered')) + '</span>' : '')
      + '</div>';
    html += '<div class="mistake-q">' + esc(mistake.q || '') + '</div>';
    html += '<div class="mistake-opts">' + optionsHtml + '</div>';
    if (mistake.redoCount) {
      html += '<div class="mistake-redo-count">'
        + esc(mistake.redoCount === 1 ? t('mistakes.redoneOne') : t('mistakes.redoneMany', { n: mistake.redoCount }))
        + '</div>';
    }
    html += '<span class="mistake-redo-action-host" data-redo-host="' + esc(mistake.id) + '"></span>';
    html += '</div>';
  });
  cont.innerHTML = html;
  cont.querySelectorAll('.mistake-redo-action-host[data-redo-host]').forEach(function (host) {
    var mistakeId = host.getAttribute('data-redo-host');
    renderActionButton(host, {
      type: 'button',
      variant: 'default',
      size: 'sm',
      className: 'mistake-redo-btn w-full',
      'data-redo': mistakeId,
      children: t('mistakes.redo'),
      onClick: function () { onRedo(mistakeId); },
    });
  });
}

function updateMistakeRedoState(stateStore, mistakeId) {
  var mistakes = stateStore.read('mistakes') || [];
  var mistake = mistakes.find(function (item) { return item.id === mistakeId; });
  if (!mistake) return null;
  var updated = Object.assign({}, mistake, { redoCount: (mistake.redoCount || 0) + 1 });
  stateStore.dispatch({
    type: 'state/set', key: 'mistakes',
    value: mistakes.map(function (item) { return item.id === mistakeId ? updated : item; }),
  });
  return updated;
}

function createRedoMessage(slotClass, quizId) {
  var message = document.createElement('div');
  message.className = 'msg assistant';
  var body = document.createElement('div');
  body.className = 'msg-body';
  var slot = quizId
    ? '<div class="' + slotClass + '" data-quiz-id="' + quizId + '"></div>'
    : '<div class="' + slotClass + '"></div>';
  body.innerHTML = '<div style="font-size:calc(12px * var(--app-font-scale, 1));color:hsl(var(--text-500));margin-bottom:6px">— Redoing a question you got wrong —</div>' + slot;
  message.appendChild(body);
  return message;
}

function scrollToLatestMessage(scrollContainer) {
  var scroll = scrollContainer();
  requestAnimationFrame(function () { scroll.scrollTop = scroll.scrollHeight; });
}

function mountPracticeRedo(mistake, mountPracticeWidget, scrollContainer) {
  var message = createRedoMessage('practice-slot');
  var list = document.getElementById('msgList');
  if (list) list.appendChild(message);
  scrollToLatestMessage(scrollContainer);
  var slot = message.querySelector('.practice-slot');
  if (slot) mountPracticeWidget(slot, { problem: mistake.q || '', correct: mistake.correct || null });
}

function quizPayload(mistake, slotId) {
  return {
    q: mistake.q,
    options: mistake.options.map(function (option) { return { letter: option.letter, text: option.text }; }),
    correct: mistake.correct,
    slotId,
  };
}

function mountExistingQuizRedo(mistake, mountQuizWidget) {
  if (!mistake.quizSlotId) return false;
  var slot = document.querySelector('[data-quiz-id="' + mistake.quizSlotId + '"]');
  if (!slot) return false;
  var parent = slot.closest('.inline-quiz');
  if (!parent) return false;
  var fresh = document.createElement('div');
  parent.parentNode.replaceChild(fresh, parent);
  mountQuizWidget(fresh, quizPayload(mistake, mistake.quizSlotId));
  return true;
}

function mountFallbackQuizRedo(mistake, mountQuizWidget, saveCurrentSession, scrollContainer) {
  var quizId = 'redo-' + Date.now().toString(36);
  var message = createRedoMessage('quiz-slot', quizId);
  var list = document.getElementById('msgList');
  if (list) list.appendChild(message);
  scrollToLatestMessage(scrollContainer);
  var slot = message.querySelector('.quiz-slot');
  if (!slot) return;
  var parsed = quizPayload(mistake, slot.getAttribute('data-quiz-id'));
  mistake.quizSlotId = parsed.slotId;
  saveCurrentSession();
  mountQuizWidget(slot, parsed);
}

function performMistakeRedo(dependencies, mistakeId) {
  var mistake = updateMistakeRedoState(dependencies.stateStore, mistakeId);
  if (!mistake) return;
  dependencies.saveCurrentSession();
  var isPractice = mistake.type === 'practice' || !(mistake.options || []).length;
  if (isPractice && typeof dependencies.mountPracticeWidget === 'function') {
    mountPracticeRedo(mistake, dependencies.mountPracticeWidget, dependencies.scrollContainer);
    return;
  }
  if (mountExistingQuizRedo(mistake, dependencies.mountQuizWidget)) return;
  mountFallbackQuizRedo(
    mistake,
    dependencies.mountQuizWidget,
    dependencies.saveCurrentSession,
    dependencies.scrollContainer,
  );
}

/**
 * Owns the mistake-book UI and persistence workflow. The chat controller
 * supplies the few cross-feature actions (session save, scrolling, and quiz
 * mounting) so this module stays independent from the main application file.
 */
export function createMistakeBook({
  stateStore,
  apiFetch,
  saveCurrentSession,
  mountQuizWidget,
  mountPracticeWidget,
  scrollContainer,
  getTutorSocratic = () => (typeof window !== 'undefined' ? window.tutorSocratic : undefined),
}) {
  const redoDependencies = {
    stateStore,
    saveCurrentSession,
    mountQuizWidget,
    mountPracticeWidget,
    scrollContainer,
  };

  function persistMistake(mistakeData) {
    var sid = stateStore.read('currentSessionId');
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
    var kbNodes = stateStore.read('kbNodes') || [];
    var currentNode = stateStore.read('currentNode');
    var node = kbNodes[currentNode] || {};
    var mistake = {
      id: 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      type: rec.type || 'quiz',
      topic: stateStore.read('topic') || '',
      node: node.name || '',
      nodeIdx: currentNode,
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
      value: [mistake].concat(stateStore.read('mistakes') || []),
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
    var mistakes = stateStore.read('mistakes');
    if (!slotId || !mistakes) return;
    var before = mistakes.length;
    var remaining = mistakes.filter(function (mistake) { return mistake.quizSlotId !== slotId; });
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
    var count = (stateStore.read('mistakes') || []).length;
    badge.textContent = count > 0 ? String(count) : '';
  }

  function renderMistakes() {
    renderMistakeList(stateStore, getTutorSocratic, handleMistakeRedo);
  }

  function handleMistakeRedo(mistakeId) {
    performMistakeRedo(redoDependencies, mistakeId);
  }

  return { recordMistake, removeMistakeForQuizSlot, updateMistakesBadge, renderMistakes };
}
