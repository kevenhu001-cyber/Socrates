import { esc } from '../render/helpers.ts';
import { formatRelativeTime } from './recentsHelpers.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { renderActionButton } from './actionButton.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";
import type { QuizMountData } from '../render/widgets.ts';

interface MistakeOption { letter: string; text: string }
interface MistakeEntry {
  id: string;
  type: string;
  topic: string;
  node?: string;
  nodeIdx?: number;
  q: string;
  options: MistakeOption[];
  correct: string | null;
  userAnswer: string | null;
  judgedAnswer: string | null;
  timestamp: number;
  redoCount: number;
  quizSlotId: string | null;
  resolved?: boolean;
  isResolved?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseMistakeEntry(value: unknown): MistakeEntry | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const options = Array.isArray(value.options) ? value.options.flatMap((option, index): MistakeOption[] => {
    if (typeof option === 'string') return [{ letter: String.fromCharCode(65 + index), text: option }];
    if (!isRecord(option) || typeof option.text !== 'string') return [];
    return [{ letter: typeof option.letter === 'string' ? option.letter : String.fromCharCode(65 + index), text: option.text }];
  }) : [];
  return {
    id: value.id,
    type: typeof value.type === 'string' ? value.type : 'practice',
    topic: typeof value.topic === 'string' ? value.topic : '',
    node: typeof value.node === 'string' ? value.node : undefined,
    nodeIdx: typeof value.nodeIdx === 'number' ? value.nodeIdx : undefined,
    q: typeof value.q === 'string' ? value.q : '',
    options,
    correct: typeof value.correct === 'string' ? value.correct : null,
    userAnswer: typeof value.userAnswer === 'string' ? value.userAnswer : null,
    judgedAnswer: typeof value.judgedAnswer === 'string' ? value.judgedAnswer : null,
    timestamp: typeof value.timestamp === 'number' ? value.timestamp : 0,
    redoCount: typeof value.redoCount === 'number' ? value.redoCount : 0,
    quizSlotId: typeof value.quizSlotId === 'string' ? value.quizSlotId : null,
    resolved: value.resolved === true,
    isResolved: value.isResolved === true,
  };
}

function readMistakes(stateStore: MistakeStore): MistakeEntry[] {
  const value = stateStore.read('mistakes');
  return Array.isArray(value) ? value.flatMap((entry) => {
    const parsed = parseMistakeEntry(entry);
    return parsed ? [parsed] : [];
  }) : [];
}

type MistakeStore = typeof import('../state/store.ts')['stateStore'];
type QuizMount = typeof import('../render/widgetScheduler.ts')['mountQuizWidget'];
type PracticeMount = typeof import('../render/widgetScheduler.ts')['mountPracticeWidget'];
interface MistakeBookOptions {
  stateStore: MistakeStore;
  apiFetch: typeof import('../util/api.ts')['apiFetch'];
  saveCurrentSession: typeof import('../session/persistence.ts')['saveCurrentSession'];
  mountQuizWidget: QuizMount;
  mountPracticeWidget: PracticeMount;
  scrollContainer: typeof import('./scroll.ts')['scrollContainer'];
  getTutorSocratic?: () => RuntimeWindow['tutorSocratic'] | undefined;
}
type RuntimeWindow = import('../types/runtimeWindow.ts').RuntimeWindow;


/* P_mistakes-i18n — this panel shipped raw English literals while zh is
   the default locale, and echoed the internal mistake.type enum straight
   into the card meta. i18n.ts's t() does no interpolation, so {n} is
   substituted here, matching the convention in ui/diagnosticQuestion.ts. */
function t(key: string, vars?: Record<string, string | number> | undefined) {
  const v = (typeof window !== 'undefined' && typeof browserWindow.t === 'function') ? browserWindow.t(key) : key;
  if (!vars) return v;
  return String(v).replace(/\{(\w+)\}/g, function (whole, name) {
    return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
  });
}

function renderMistakeList(stateStore: MistakeStore, getTutorSocratic: () => RuntimeWindow['tutorSocratic'] | undefined, onRedo: (mistakeId: string | null) => void) {
  const cont = document.getElementById('mistakesList');
  if (!cont) return;
  const panel = document.getElementById('mistakesPanel');
  if (panel && panel.classList.contains('hidden')) {
    panel.dataset.mistakesDirty = '1';
    return;
  }
  if (panel) delete panel.dataset.mistakesDirty;
  const tutorSocratic = getTutorSocratic();
  if (tutorSocratic && typeof tutorSocratic.renderMistakeFilterBar === 'function') {
    try { tutorSocratic.renderMistakeFilterBar(); } catch (error) { reportSwallow(error, 'ui/mistakeBook.renderMistakeFilterBar'); }
  }
  const mistakes = readMistakes(stateStore);
  if (mistakes.length === 0) {
    cont.innerHTML = '<div class="recents-empty">' + esc(t('mistakes.empty'))
      + '<br>' + esc(t('mistakes.emptyHint')) + '</div>';
    return;
  }
  const filter = stateStore.read('mistakeFilter') || 'all';
  let filtered: MistakeEntry[] = mistakes.slice();
  if (filter === 'unresolved') {
    filtered = filtered.filter(function (mistake: MistakeEntry) { return !mistake.resolved && !mistake.isResolved; });
  } else if (filter === 'resolved') {
    filtered = filtered.filter(function (mistake: MistakeEntry) { return !!(mistake.resolved || mistake.isResolved); });
  }
  if (!filtered.length) {
    cont.innerHTML = '<div class="recents-empty">'
      + esc(filter === 'resolved' ? t('mistakes.filterEmptyResolved') : t('mistakes.filterEmptyOther'))
      + '</div>';
    return;
  }
  let html = '';
  filtered.forEach(function (mistake: MistakeEntry) {
    let optionsHtml = '';
    (mistake.options || []).forEach(function (option: MistakeOption) {
      const tag = option.letter === mistake.correct ? 'correct-tag' : (option.letter === mistake.userAnswer ? 'wrong-tag' : '');
      optionsHtml += '<div class="mistake-opt ' + tag + '"><span class="mistake-opt-letter">' + esc(option.letter) + '</span><span>' + esc(option.text) + '</span></div>';
    });
    const resolved = !!(mistake.resolved || mistake.isResolved);
    const typeKey = 'mistakes.type.' + (mistake.type || '');
    const typeLabel = t(typeKey);
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
    const mistakeId = host.getAttribute('data-redo-host');
    renderActionButton((host as HTMLElement), {
      type: 'button',
      variant: 'default',
      size: 'sm',
      className: 'mistake-redo-btn w-full',
      ...{ 'data-redo': mistakeId },
      children: t('mistakes.redo'),
      onClick: function () { onRedo(mistakeId); },
    });
  });
}

function updateMistakeRedoState(stateStore: MistakeStore, mistakeId: string): MistakeEntry | null {
  const mistakes = readMistakes(stateStore);
  const mistake = mistakes.find(function (item) { return item.id === mistakeId; });
  if (!mistake) return null;
  const updated = Object.assign({}, mistake, { redoCount: (mistake.redoCount || 0) + 1 });
  stateStore.dispatch({
    type: 'state/set', key: 'mistakes',
    value: mistakes.map(function (item) { return item.id === mistakeId ? updated : item; }),
  });
  return updated;
}

function createRedoMessage(slotClass: string, quizId?: string|undefined) {
  const message = document.createElement('div');
  message.className = 'msg assistant';
  const body = document.createElement('div');
  body.className = 'msg-body';
  const slot = quizId
    ? '<div class="' + slotClass + '" data-quiz-id="' + quizId + '"></div>'
    : '<div class="' + slotClass + '"></div>';
  body.innerHTML = '<div style="font-size:calc(12px * var(--app-font-scale, 1));color:hsl(var(--text-500));margin-bottom:6px">— Redoing a question you got wrong —</div>' + slot;
  message.appendChild(body);
  return message;
}

function scrollToLatestMessage(scrollContainer: () => HTMLElement | null) {
  const scroll = scrollContainer();
  if (!scroll) return;
  requestAnimationFrame(function () { scroll.scrollTop = scroll.scrollHeight; });
}

function mountPracticeRedo(mistake: MistakeEntry, mountPracticeWidget: PracticeMount, scrollContainer: MistakeBookOptions['scrollContainer']) {
  const message = createRedoMessage('practice-slot');
  const list = document.getElementById('msgList');
  if (list) list.appendChild(message);
  scrollToLatestMessage(scrollContainer);
  const slot = message.querySelector('.practice-slot');
  if (slot) mountPracticeWidget(slot, { problem: mistake.q || '', correct: mistake.correct || '' });
}

function quizPayload(mistake: MistakeEntry, slotId: string | null): QuizMountData {
  return {
    q: mistake.q,
    options: mistake.options.map(function (option) { return { letter: option.letter, text: option.text }; }),
    correct: mistake.correct,
    slotId,
  };
}

function mountExistingQuizRedo(mistake: MistakeEntry, mountQuizWidget: QuizMount) {
  if (!mistake.quizSlotId) return false;
  const slot = document.querySelector('[data-quiz-id="' + mistake.quizSlotId + '"]');
  if (!slot) return false;
  const parent = slot.closest('.inline-quiz');
  if (!parent) return false;
  const fresh = document.createElement('div');
  parent.parentNode!.replaceChild(fresh, parent);
  mountQuizWidget(fresh, quizPayload(mistake, mistake.quizSlotId));
  return true;
}

function mountFallbackQuizRedo(mistake: MistakeEntry, mountQuizWidget: QuizMount, saveCurrentSession: MistakeBookOptions['saveCurrentSession'], scrollContainer: MistakeBookOptions['scrollContainer']) {
  const quizId = 'redo-' + Date.now().toString(36);
  const message = createRedoMessage('quiz-slot', quizId);
  const list = document.getElementById('msgList');
  if (list) list.appendChild(message);
  scrollToLatestMessage(scrollContainer);
  const slot = message.querySelector('.quiz-slot');
  if (!slot) return;
  const parsed = quizPayload(mistake, slot.getAttribute('data-quiz-id'));
  mistake.quizSlotId = parsed.slotId ?? null;
  saveCurrentSession();
  mountQuizWidget(slot, parsed);
}

function performMistakeRedo(dependencies: Pick<MistakeBookOptions, 'stateStore' | 'saveCurrentSession' | 'mountQuizWidget' | 'mountPracticeWidget' | 'scrollContainer'>, mistakeId: string) {
  const mistake = updateMistakeRedoState(dependencies.stateStore, mistakeId);
  if (!mistake) return;
  dependencies.saveCurrentSession();
  const isPractice = mistake.type === 'practice' || !(mistake.options || []).length;
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
  getTutorSocratic = () => (typeof window !== 'undefined' ? browserWindow.tutorSocratic : undefined),
}: MistakeBookOptions) {
  const redoDependencies = {
    stateStore,
    saveCurrentSession,
    mountQuizWidget,
    mountPracticeWidget,
    scrollContainer,
  };

  function persistMistake(mistakeData: { nodeName: string | null; questionContent: string; userAnswer: string | null; correctAnswer: string | null; source: string }) {
    let sid = stateStore.read('currentSessionId');
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

  function recordMistake(rec: Record<string, unknown>) {
    const type = typeof rec.type === 'string' ? rec.type : 'quiz';
    const question = typeof rec.q === 'string' ? rec.q : '';
    const options = Array.isArray(rec.options) ? rec.options as MistakeOption[] : [];
    const correct = typeof rec.correct === 'string' ? rec.correct : null;
    const userAnswer = typeof rec.userAnswer === 'string' ? rec.userAnswer : null;
    const judgedAnswer = typeof rec.judgedAnswer === 'string' ? rec.judgedAnswer : null;
    const quizSlotId = typeof rec.quizSlotId === 'string' ? rec.quizSlotId : null;
    const kbNodes = (stateStore.read('kbNodes') || []) as Array<{ name?: string }>;
    const currentNode = stateStore.read('currentNode');
    const node = kbNodes[currentNode] || {};
    const mistake: MistakeEntry = {
      id: 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      type,
      topic: stateStore.read('topic') || '',
      node: node.name || '',
      nodeIdx: currentNode,
      q: question,
      options,
      correct,
      userAnswer,
      judgedAnswer,
      timestamp: Date.now(),
      redoCount: 0,
      quizSlotId,
    };
    stateStore.dispatch({
      type: 'state/set', key: 'mistakes',
      value: [mistake, ...readMistakes(stateStore)],
    });
    persistMistake({
      nodeName: mistake.node || null,
      questionContent: mistake.q,
      userAnswer: mistake.userAnswer,
      correctAnswer: mistake.correct,
      source: mistake.type === 'practice' ? 'practice' : 'quiz',
    });
    saveCurrentSession();
    renderMistakes();
    updateMistakesBadge();
  }

  function removeMistakeForQuizSlot(slotId: string) {
    const mistakes = readMistakes(stateStore);
    if (!slotId || !mistakes.length) return;
    const before = mistakes.length;
    const remaining = mistakes.filter(function (mistake) { return mistake.quizSlotId !== slotId; });
    if (remaining.length !== before) {
      stateStore.dispatch({ type: 'state/set', key: 'mistakes', value: remaining });
      saveCurrentSession();
      renderMistakes();
      updateMistakesBadge();
    }
  }

  function updateMistakesBadge() {
    const badge = document.getElementById('mistakesTabBadge');
    if (!badge) return;
    const count = readMistakes(stateStore).length;
    badge.textContent = count > 0 ? String(count) : '';
  }

  function renderMistakes() {
    renderMistakeList(stateStore, getTutorSocratic, handleMistakeRedo);
  }

  function handleMistakeRedo(mistakeId: string | null) {
    if (!mistakeId) return;
    performMistakeRedo(redoDependencies, mistakeId);
  }

  return { recordMistake, removeMistakeForQuizSlot, updateMistakesBadge, renderMistakes };
}
