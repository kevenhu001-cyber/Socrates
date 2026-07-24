import { esc } from '../render/helpers.js';
import { formatRelativeTime } from './recentsHelpers.js';

/**
 * Owns the mistake-book UI and persistence workflow. The chat controller
 * supplies the few cross-feature actions (session save, scrolling, and quiz
 * mounting) so this module stays independent from the main application file.
 */

export interface MistakeRecord {
  id: string;
  type: string;
  topic: string;
  node: string;
  nodeIdx: number;
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

interface MistakeOption {
  letter: string;
  text: string;
}

interface MistakeState {
  currentSessionId?: string;
  currentNode: number;
  kbNodes: Array<Record<string, unknown>>;
  topic?: string;
  mistakes?: MistakeRecord[];
  mistakeFilter?: string;
  [key: string]: unknown;
}

interface MistakeDeps {
  state: MistakeState;
  apiFetch: (url: string, opts?: Record<string, unknown>) => Promise<unknown>;
  saveCurrentSession: () => void;
  mountQuizWidget: (el: HTMLElement, parsed: Record<string, unknown>) => void;
  scrollContainer: () => HTMLElement | null;
  getTutorSocratic?: () => Record<string, unknown> | undefined;
}

export function createMistakeBook({
  state,
  apiFetch,
  saveCurrentSession,
  mountQuizWidget,
  scrollContainer,
  getTutorSocratic = () => (window as any).tutorSocratic,
}: MistakeDeps) {
  function persistMistake(mistakeData: Record<string, unknown>): void {
    let sid: string | null = state.currentSessionId || null;
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

  function recordMistake(rec: Record<string, unknown>): void {
    if (!state.mistakes) state.mistakes = [];
    const node = (state.kbNodes[state.currentNode] || {}) as Record<string, unknown>;
    const mistake: MistakeRecord = {
      id: 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      type: (rec.type as string) || 'quiz',
      topic: state.topic || '',
      node: (node.name as string) || '',
      nodeIdx: state.currentNode,
      q: rec.q as string,
      options: (rec.options as MistakeOption[]) || [],
      correct: (rec.correct as string | null) || null,
      userAnswer: (rec.userAnswer as string | null) || null,
      judgedAnswer: (rec.judgedAnswer as string | null) || null,
      timestamp: Date.now(),
      redoCount: 0,
      quizSlotId: (rec.quizSlotId as string | null) || null,
    };
    state.mistakes.unshift(mistake);
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

  function removeMistakeForQuizSlot(slotId: string | null): void {
    if (!slotId || !state.mistakes) return;
    const before = state.mistakes.length;
    state.mistakes = state.mistakes.filter(function (mistake) { return mistake.quizSlotId !== slotId; });
    if (state.mistakes.length !== before) {
      saveCurrentSession();
      renderMistakes();
      updateMistakesBadge();
    }
  }

  function updateMistakesBadge(): void {
    const badge = document.getElementById('mistakesTabBadge');
    if (!badge) return;
    const count = (state.mistakes || []).length;
    badge.textContent = count > 0 ? String(count) : '';
  }

  function renderMistakes(): void {
    const cont = document.getElementById('mistakesList');
    if (!cont) return;
    const tutorSocratic = getTutorSocratic();
    if (tutorSocratic && typeof (tutorSocratic as Record<string, unknown>).renderMistakeFilterBar === 'function') {
      try { (tutorSocratic as Record<string, unknown>).renderMistakeFilterBar as () => void; } catch (_) { /* noop */ }
    }
    if (!state.mistakes || state.mistakes.length === 0) {
      cont.innerHTML = '<div class="recents-empty">No mistakes yet.<br>Wrong quiz picks and incorrect practice attempts will land here for review.</div>';
      return;
    }
    const filter = state.mistakeFilter || 'all';
    let filtered = state.mistakes.slice();
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
    let html = '';
    filtered.forEach(function (mistake: MistakeRecord) {
      let optionsHtml = '';
      (mistake.options || []).forEach(function (option: MistakeOption) {
        const tag = option.letter === mistake.correct ? 'correct-tag' : (option.letter === mistake.userAnswer ? 'wrong-tag' : '');
        optionsHtml += '<div class="mistake-opt ' + tag + '"><span class="mistake-opt-letter">' + esc(option.letter) + '</span><span>' + esc(option.text) + '</span></div>';
      });
      const resolved = !!(mistake.resolved || mistake.isResolved);
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
      (btn as HTMLElement).onclick = function () { handleMistakeRedo((btn as HTMLElement).getAttribute('data-redo')); };
    });
  }

  function handleMistakeRedo(mistakeId: string | null): void {
    const mistake = (state.mistakes || []).find(function (item) { return item.id === mistakeId; });
    if (!mistake) return;
    mistake.redoCount = (mistake.redoCount || 0) + 1;
    saveCurrentSession();
    if (mistake.quizSlotId) {
      const slot = document.querySelector('[data-quiz-id="' + mistake.quizSlotId + '"]') as HTMLElement | null;
      if (slot) {
        const parent = slot.closest('.inline-quiz') as HTMLElement | null;
        if (parent) {
          const parsed = {
            q: mistake.q,
            options: mistake.options.map(function (option: MistakeOption) { return { letter: option.letter, text: option.text }; }),
            correct: mistake.correct,
            slotId: mistake.quizSlotId,
          };
          const fresh = document.createElement('div');
          if (parent.parentNode) parent.parentNode.replaceChild(fresh, parent);
          mountQuizWidget(fresh, parsed as unknown as Record<string, unknown>);
          return;
        }
      }
    }
    const div = document.createElement('div');
    div.className = 'msg assistant';
    const body = document.createElement('div');
    body.className = 'msg-body';
    body.innerHTML = '<div style="font-size:calc(12px * var(--app-font-scale, 1));color:hsl(var(--text-500));margin-bottom:6px">— Redoing a question you got wrong —</div><div class="quiz-slot" data-quiz-id="redo-' + Date.now().toString(36) + '"></div>';
    div.appendChild(body);
    const list = document.getElementById('msgList');
    if (list) list.appendChild(div);
    const sc = scrollContainer();
    requestAnimationFrame(function () { if (sc) sc.scrollTop = sc.scrollHeight; });
    const quizSlot = div.querySelector('.quiz-slot') as HTMLElement | null;
    if (quizSlot) {
      const parsed = {
        q: mistake.q,
        options: mistake.options.map(function (option: MistakeOption) { return { letter: option.letter, text: option.text }; }),
        correct: mistake.correct,
        slotId: quizSlot.getAttribute('data-quiz-id'),
      };
      mistake.quizSlotId = parsed.slotId;
      saveCurrentSession();
      mountQuizWidget(quizSlot, parsed as unknown as Record<string, unknown>);
    }
  }

  return { recordMistake, removeMistakeForQuizSlot, updateMistakesBadge, renderMistakes };
}
