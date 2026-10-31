import { stateStore } from './state/store.ts';
import { scheduleTurnToTopForMessage } from './chat/turnAnchor.ts';
import { reportSwallow } from './util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "./types/runtimeWindow.ts";
import { getCurrentLanguage } from './i18n/languageState.ts';

/* =====================================================================
 * tutorSocratic.js
 * ---------------------------------------------------------------------
 * Implements the v3.0 Socrates Engine design doc's tutor-mode flow:
 *
 *   1. Stuck detection — distinguish "stuck" (reasoning break) from
 *      "short answer" (the latter doesn't trigger explanation per
 *      §8.1 of the design).
 *   2. The "讲解一下 / 再想想" two-choice prompt (§8.2) before any
 *      explanation is generated — and the "two '再想想' in a row
 *      then default to explain" rule.
 *   3. The four-option dialog (提示 / 完整讲解 / 加入错题本 / 跳过,
 *      §8.6) for practice problems.
 *   4. The 1+2 practice pattern (one foundation exercise, one
 *      transfer exercise, §8.5).
 *   5. Tutor knowledge views are rendered by React from the KB/session
 *      stores; this module owns the tutor conversation behavior.
 *   6. Long-term plan with deadline + daily minutes + warning
 *      system (§10).
 *
 * A narrow tutor runtime object is published through the typed window
 * boundary for conversation flows that still call these commands. Visual
 * knowledge and plan surfaces subscribe to their domain stores in React.
 * ===================================================================== */

const tutorSocraticRuntime = (function () {
  'use strict';

  /* Friendly human labels for the design's internal stage names.
     Per §11.4 system messages: no exclamation marks, no judgement,
     no emoji. The labels read like status badges. */
  const STAGE_LABELS = {
    motivate: '建立直觉',
    define:   '精确定义',
    develop:  '深入推导',
    illustrate: '应用示例',
    exercise: '动手练习',
    check:    '阶段检查'
  };
  const STAGE_LABELS_EN = {
    motivate: 'Intuition',
    define:   'Definition',
    develop:  'Development',
    illustrate: 'Worked example',
    exercise: 'Practice',
    check:    'Check'
  };

  function currentLang() {
    return getCurrentLanguage();
  }
  /* i18n lookup that prefers t() (i18n.ts) but falls back to
     inline bilingual copy if the key is missing — keeps the
     module self-contained during incremental rollout. */
  function ti(key: string, fallback: string) {
    if (typeof browserWindow.t === 'function') {
      try {
        const v = browserWindow.t(key);
        if (v && v !== key) return v;
      } catch (error) { reportSwallow(error, 'tutorSocratic.js:80'); }
    }
    return fallback;
  }
  function stageLabel(stage: string|number) {
    /* Prefer the i18n key (so users can rename stages without
       code changes); fall back to the hardcoded bilingual
       table. The i18n key uses a stable identifier so it is
       safe to look up across locale switches. */
    const keyMap: Record<string, string> = {
      motivate:    'tutor.stageMotivate',
      define:      'tutor.stageDefine',
      develop:     'tutor.stageDevelop',
      illustrate:  'tutor.stageIllustrate',
      exercise:    'tutor.stageExercise',
      check:       'tutor.stageCheck'
    };
    const k = keyMap[stage];
    if (k) {
      const fromI18n = ti(k, '');
      if (fromI18n) return fromI18n;
    }
    const map = currentLang() === 'zh' ? STAGE_LABELS : STAGE_LABELS_EN;
    return map[String(stage) as keyof typeof map] || map.motivate;
  }
  /* ----------------------------------------------------------------
   * Stuck detection
   *
   * Per §8.1 of the design, "stuck" means a reasoning break, not a
   * short answer. A short answer still gets a follow-up question
   * (the design's preferred response per §11.3). We use three
   * lightweight signals:
   *   - the user message ends with "..." or a question mark
   *     (a literal "I don't know" hedge),
   *   - the user message is < 12 words AND we already asked 2+
   *     substantive follow-ups on this node,
   *   - the previous assistant turn was a question and the user
   *     repeated the same token as last time (low signal).
   * Returns a small object {stuck, reason, hedge}.
   * ---------------------------------------------------------------- */
  function detectStuck(userText: unknown, history: string | Array<{ role?: unknown }>) {
    if (!userText) return { stuck: false, reason: 'empty' };
    const text = String(userText).trim();
    if (text.length < 4) return { stuck: true, reason: 'too-short' };

    /* Explicit hedge phrases. Bilingual so the detector works in
       either language without configuration. */
    const hedges = [
      'idk', "i don't know", 'not sure', "don't know", 'no idea',
      '不知道', '不懂', '不清楚', '不会', '没学过', '?', '？'
    ];
    const lower = text.toLowerCase();
    for (let i = 0; i < hedges.length; i++) {
      if (lower === hedges[i] || lower.indexOf(hedges[i]) === 0) {
        return { stuck: true, reason: 'hedge', hedge: hedges[i] };
      }
    }

    /* Token count short-answer + we already advanced twice: that's
       the design's threshold for "stuck" per §8.1 (a single short
       answer is fine; two in a row on the same node means the
       student probably can't reach the answer). */
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    let sameNodeTurns = 0;
    if (Array.isArray(history)) {
      for (let j = history.length - 1; j >= 0; j--) {
        if (history[j].role === 'assistant') sameNodeTurns++;
        if (sameNodeTurns >= 3) break;
      }
    }
    if (wordCount <= 12 && sameNodeTurns >= 2) {
      return { stuck: true, reason: 'short-after-2', wordCount: wordCount };
    }
    return { stuck: false, reason: 'continue' };
  }

  /* ----------------------------------------------------------------
   * Show the §8.2 "讲解一下 / 再想想" prompt
   *
   * The first time a student gets stuck on a node we offer them a
   * chance to push through ("再想想") before the system generates
   * any explanation. If they pick 再想想 twice in a row, the
   * system auto-falls through to an explanation.
   * ---------------------------------------------------------------- */
  function showExplainPrompt() {
    if (typeof browserWindow.addMessage !== 'function') return;
    const msg = ti('tutor.explainPrompt', currentLang() === 'zh'
      ? '这里需要梳理一下吗？'
      : 'Want to walk through this concept?');
    const actions = [
      { text: ti('tutor.explain', currentLang() === 'zh' ? '讲解一下' : 'Explain'), action: 'explain', primary: true },
      { text: ti('tutor.explainKeepTrying', currentLang() === 'zh' ? '再想想' : 'Keep trying'), action: 'retry' }
    ];
    const clientId = browserWindow.addMessage('assistant', msg, 'suggest', actions);
    const list = document.getElementById('msgList');
    scheduleTurnToTopForMessage(list, clientId);
  }

  /* ----------------------------------------------------------------
   * The four-option dialog from §8.6
   *
   * Practice-problem stuck state. The four options are:
   *   提示      → ask a guiding question (not the answer)
   *   完整讲解  → generate a focused explanation
   *   加入错题本 → record the problem to the mistake book
   *   跳过      → mark this practice problem as skipped
   * ---------------------------------------------------------------- */
  function showFourOptionDialog(questionText: string) {
    if (typeof browserWindow.addMessage !== 'function') return;
    const preview = questionText && questionText.length > 80
      ? questionText.slice(0, 80) + '…'
      : (questionText || '');
    const msg = ti('tutor.fourOptionTitle', currentLang() === 'zh'
      ? '练习题卡住了，下一步？'
      : 'Stuck on the practice? Pick a next step.');
    const actions = [
      { text: ti('tutor.fourOptionHint',     currentLang() === 'zh' ? '提示' : 'Hint'),          action: 'hint',     primary: true },
      { text: ti('tutor.fourOptionFull',     currentLang() === 'zh' ? '完整讲解' : 'Full explanation'), action: 'explain' },
      { text: ti('tutor.fourOptionMistake',  currentLang() === 'zh' ? '加入错题本' : 'Add to mistakes'), action: 'mistake' },
      { text: ti('tutor.fourOptionSkip',     currentLang() === 'zh' ? '跳过' : 'Skip'),          action: 'skip' }
    ];
    const clientId = browserWindow.addMessage('assistant', msg, 'suggest', actions);
    const list = document.getElementById('msgList');
    scheduleTurnToTopForMessage(list, clientId);
    try {
      stateStore.dispatch({
        type: 'state/set',
        key: 'session.fourOptionDialog',
        value: { questionPreview: preview, at: Date.now() }
      });
    } catch (error) { reportSwallow(error, 'tutorSocratic.js:221'); }
  }

  /* ----------------------------------------------------------------
   * §9 — mistake book helper.
   *
   * Wraps the existing `state.mistakes` push so the rest of the
   * app can call a single function. The data shape matches the
   * existing renderer (state.mistakes[] entry) and the sidebar
   * picks it up automatically.
   * ---------------------------------------------------------------- */
  function recordMistakeNotice(opts: {
    type?: string;
    topic?: string;
    q?: string;
    options?: string[];
    correct?: string | null;
    userAnswer?: string | null;
    source?: string;
  }) {
    opts = opts || {};
    const entry: import('./state/kb.ts').MistakeStateEntry = {
      id: 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: opts.type || 'practice',
      topic: opts.topic || (browserWindow.stateStore.read("topic") || ''),
      q: opts.q || '',
      options: opts.options || [],
      correct: opts.correct || null,
      userAnswer: opts.userAnswer || null,
      timestamp: Date.now(),
      source: opts.source || 'four-option',
      resolved: false
    };
    const mistakes = stateStore.read('mistakes');
    stateStore.dispatch({
      type: 'state/set',
      key: 'mistakes',
      value: [entry].concat(Array.isArray(mistakes) ? mistakes : [])
    });
    return entry;
  }

  /* ----------------------------------------------------------------
   * Public hooks. Expose everything the rest of the app needs.
   * ---------------------------------------------------------------- */

  return {
    stageLabel: stageLabel,
    detectStuck: detectStuck,
    showExplainPrompt: showExplainPrompt,
    showFourOptionDialog: showFourOptionDialog,
    recordMistakeNotice: recordMistakeNotice
  };
})();

browserWindow.tutorSocratic = tutorSocraticRuntime;
export type TutorSocraticRuntime = typeof tutorSocraticRuntime;
