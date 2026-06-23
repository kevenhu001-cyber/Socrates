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
 *   5. Knowledge-boundary file rendering as a Markdown-style
 *      three-section view (已内化 / 模糊 / 未探测) with [系统] /
 *      [我] annotations and version history (§6).
 *   6. Long-term plan with deadline + daily minutes + warning
 *      system (§10).
 *
 * All functions are attached to `window` so they can be called from
 * the existing main.js onclick handlers without rewriting those
 * handlers. The module is loaded as `<script type="module">` via
 * index.html so the existing `state` Proxy and `esc`/`t`/`addMessage`
 * globals are visible.
 * ===================================================================== */

(function () {
  'use strict';

  /* A-R1 perf — coalesce KB re-renders inside one rAF. */
  var _kbRenderPending = false;

  /* A-R2 perf — throttle plan-warning evaluation. */
  var _planWarningCache = { at: 0, result: null };

  /* Friendly human labels for the design's internal stage names.
     Per §11.4 system messages: no exclamation marks, no judgement,
     no emoji. The labels read like status badges. */
  var STAGE_LABELS = {
    motivate: '建立直觉',
    define:   '精确定义',
    develop:  '深入推导',
    illustrate: '应用示例',
    exercise: '动手练习',
    check:    '阶段检查'
  };
  var STAGE_LABELS_EN = {
    motivate: 'Intuition',
    define:   'Definition',
    develop:  'Development',
    illustrate: 'Worked example',
    exercise: 'Practice',
    check:    'Check'
  };

  function currentLang() {
    try {
      return (typeof window.getAppLang === 'function') ? window.getAppLang()
           : (window.APP_LANG || (document.documentElement.lang === 'zh' ? 'zh' : 'en'));
    } catch (_) { return 'en'; }
  }
  /* i18n lookup that prefers t() (i18n.js) but falls back to
     inline bilingual copy if the key is missing — keeps the
     module self-contained during incremental rollout. */
  function ti(key, fallback) {
    if (typeof window.t === 'function') {
      try {
        var v = window.t(key);
        if (v && v !== key) return v;
      } catch (_) {}
    }
    return fallback;
  }
  function stageLabel(stage) {
    /* Prefer the i18n key (so users can rename stages without
       code changes); fall back to the hardcoded bilingual
       table. The i18n key uses a stable identifier so it is
       safe to look up across locale switches. */
    var keyMap = {
      motivate:    'tutor.stageMotivate',
      define:      'tutor.stageDefine',
      develop:     'tutor.stageDevelop',
      illustrate:  'tutor.stageIllustrate',
      exercise:    'tutor.stageExercise',
      check:       'tutor.stageCheck'
    };
    var k = keyMap[stage];
    if (k) {
      var fromI18n = ti(k, '');
      if (fromI18n) return fromI18n;
    }
    var map = currentLang() === 'zh' ? STAGE_LABELS : STAGE_LABELS_EN;
    return map[stage] || map.motivate;
  }
  function esc(s) {
    if (typeof window.esc === 'function') return window.esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
  function detectStuck(userText, history) {
    if (!userText) return { stuck: false, reason: 'empty' };
    var text = String(userText).trim();
    if (text.length < 4) return { stuck: true, reason: 'too-short' };

    /* Explicit hedge phrases. Bilingual so the detector works in
       either language without configuration. */
    var hedges = [
      'idk', "i don't know", 'not sure', "don't know", 'no idea',
      '不知道', '不懂', '不清楚', '不会', '没学过', '?', '？'
    ];
    var lower = text.toLowerCase();
    for (var i = 0; i < hedges.length; i++) {
      if (lower === hedges[i] || lower.indexOf(hedges[i]) === 0) {
        return { stuck: true, reason: 'hedge', hedge: hedges[i] };
      }
    }

    /* Token count short-answer + we already advanced twice: that's
       the design's threshold for "stuck" per §8.1 (a single short
       answer is fine; two in a row on the same node means the
       student probably can't reach the answer). */
    var wordCount = text.split(/\s+/).filter(Boolean).length;
    var sameNodeTurns = 0;
    if (Array.isArray(history)) {
      for (var j = history.length - 1; j >= 0; j--) {
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
  function showExplainPrompt(nodeName) {
    if (typeof window.addMessage !== 'function') return;
    var msg = ti('tutor.explainPrompt', currentLang() === 'zh'
      ? '这里需要梳理一下吗？'
      : 'Want to walk through this concept?');
    var actions = [
      { text: ti('tutor.explain', currentLang() === 'zh' ? '讲解一下' : 'Explain'), action: 'explain', primary: true },
      { text: ti('tutor.explainKeepTrying', currentLang() === 'zh' ? '再想想' : 'Keep trying'), action: 'retry' }
    ];
    window.addMessage('assistant', msg, 'suggest', actions);
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
  function showFourOptionDialog(questionText) {
    if (typeof window.addMessage !== 'function') return;
    var preview = questionText && questionText.length > 80
      ? questionText.slice(0, 80) + '…'
      : (questionText || '');
    var msg = ti('tutor.fourOptionTitle', currentLang() === 'zh'
      ? '练习题卡住了，下一步？'
      : 'Stuck on the practice? Pick a next step.');
    var actions = [
      { text: ti('tutor.fourOptionHint',     currentLang() === 'zh' ? '提示' : 'Hint'),          action: 'hint',     primary: true },
      { text: ti('tutor.fourOptionFull',     currentLang() === 'zh' ? '完整讲解' : 'Full explanation'), action: 'explain' },
      { text: ti('tutor.fourOptionMistake',  currentLang() === 'zh' ? '加入错题本' : 'Add to mistakes'), action: 'mistake' },
      { text: ti('tutor.fourOptionSkip',     currentLang() === 'zh' ? '跳过' : 'Skip'),          action: 'skip' }
    ];
    window.addMessage('assistant', msg, 'suggest', actions);
    try { window.state.session.fourOptionDialog = { questionPreview: preview, at: Date.now() }; } catch (_) {}
  }

  /* ----------------------------------------------------------------
   * Knowledge Boundary File renderer (§6)
   *
   * Renders the KB as a three-section Markdown-style view:
   *   - 已内化 (internalized) — verified nodes
   *   - 模糊   (fuzzy)        — partial understanding
   *   - 未探测 (blank)        — unexplored
   *
   * Each fuzzy node shows the [系统] / [我] annotation lines from
   * §6.3. The header carries the "最后更新" date and a button that
   * snapshots the current state into the version history.
   * ---------------------------------------------------------------- */
  function renderKnowledgeBoundaryFile(opts) {
    opts = opts || {};
    var cont = document.getElementById('kbContent');
    if (!cont) return;

    var nodes = (window.state && window.state.kbNodes) || [];
    if (!nodes.length) {
      cont.innerHTML = '<div class="kb-empty">'
        + (currentLang() === 'zh' ? '设置学习主题后，这里会显示知识地图。' : 'Set a topic to build your knowledge map.')
        + '</div>';
      return;
    }

    /* A-R1 perf — collapse many consecutive updateKB calls into a
       single render via rAF. The chat flow can fire updateKB 5-10
       times per turn (one per state mutation), each of which used
       to fully re-render #kbContent. With 50+ nodes that is
       noticeable. The throttle coalesces all calls in the same
       animation frame to one render. */
    if (opts.immediate !== true) {
      if (_kbRenderPending) return;
      _kbRenderPending = true;
      (window.requestAnimationFrame || function (cb) { setTimeout(cb, 16); })(function () {
        _kbRenderPending = false;
        renderKnowledgeBoundaryFile({ immediate: true });
      });
      return;
    }

    var sections = { internalized: [], fuzzy: [], blank: [] };
    nodes.forEach(function (n, i) {
      var s = n.status === 'internalized' ? 'internalized'
            : n.status === 'fuzzy'        ? 'fuzzy' : 'blank';
      sections[s].push({ node: n, idx: i });
    });

    var today = new Date().toISOString().slice(0, 10);
    var html = '';
    html += '<div class="kb-file-header">';
    html += '<div class="kb-file-title">'
         + ti('tutor.kbFileTitle', currentLang() === 'zh' ? '知识边界' : 'Knowledge Boundary')
         + '</div>';
    html += '<div class="kb-file-meta">'
         + ti('tutor.kbLastUpdated', currentLang() === 'zh' ? '最后更新' : 'Last updated')
         + ': ' + today + '</div>';
    html += '<button class="kb-file-snapshot" type="button">'
         + ti('tutor.kbSnapshot', currentLang() === 'zh' ? '存档当前版本' : 'Save snapshot')
         + '</button>';
    html += '</div>';

    if (sections.internalized.length) {
      html += '<div class="kb-section-title">'
           + ti('tutor.kbSectionInternalized', currentLang() === 'zh' ? '已内化' : 'Internalized')
           + ' <span class="kb-section-count">' + sections.internalized.length + '</span></div>';
      sections.internalized.forEach(function (e) {
        var v = e.node.verifiedCount || e.node.questions || 0;
        html += '<div class="kb-node kb-node-internalized">'
             + '<div class="kb-node-name">'
             + esc(e.node.name || ('Node ' + (e.idx + 1)))
             + ' <span class="kb-verify-tag">'
             + ti('tutor.kbVerifiedTag', currentLang() === 'zh' ? '验证 x' : 'verified x') + v
             + '</span></div>'
             + '</div>';
      });
    }
    if (sections.fuzzy.length) {
      html += '<div class="kb-section-title">'
           + ti('tutor.kbSectionFuzzy', currentLang() === 'zh' ? '模糊' : 'Fuzzy')
           + ' <span class="kb-section-count">' + sections.fuzzy.length + '</span></div>';
      sections.fuzzy.forEach(function (e) {
        html += '<div class="kb-node kb-node-fuzzy">';
        html += '<div class="kb-node-name">'
             + esc(e.node.name || ('Node ' + (e.idx + 1))) + '</div>';
        if (e.node.system_note) {
          html += '<div class="kb-node-system-note"><span class="kb-tag-system">[系统]</span> '
               + esc(e.node.system_note) + '</div>';
        }
        if (e.node.user_note) {
          html += '<div class="kb-node-user-note"><span class="kb-tag-user">[我]</span> '
               + esc(e.node.user_note) + '</div>';
        }
        html += '</div>';
      });
    }
    if (sections.blank.length) {
      html += '<div class="kb-section-title">'
           + ti('tutor.kbSectionBlank', currentLang() === 'zh' ? '未探测' : 'Not yet explored')
           + ' <span class="kb-section-count">' + sections.blank.length + '</span></div>';
      sections.blank.forEach(function (e) {
        html += '<div class="kb-node kb-node-blank">'
             + '<div class="kb-node-name">'
             + esc(e.node.name || ('Node ' + (e.idx + 1))) + '</div>'
             + '</div>';
      });
    }
    /* §6.5 — change log. Keep the most recent 8 entries; older ones
       stay in the session save and are not lost. */
    var history = (window.state && window.state.boundariesHistory) || [];
    if (history.length) {
      html += '<div class="kb-section-title kb-section-title-secondary">'
           + ti('tutor.kbHistory', currentLang() === 'zh' ? '存档历史' : 'Snapshot history')
           + '</div>';
      html += '<ul class="kb-history-list">';
      history.slice(-8).reverse().forEach(function (h) {
        html += '<li class="kb-history-item">'
             + '<span class="kb-history-date">' + esc(h.date) + '</span>'
             + '<span class="kb-history-summary">'
             + esc(h.summary || '')
             + '</span></li>';
      });
      html += '</ul>';
    }
    cont.innerHTML = html;
    /* Wire the snapshot button. We capture a one-line summary of
       the section sizes so the user can compare past snapshots
       at a glance (§6.6). */
    var btn = cont.querySelector('.kb-file-snapshot');
    if (btn) btn.onclick = function () { saveBoundarySnapshot(); };
  }

  function saveBoundarySnapshot() {
    if (!window.state) return;
    var nodes = window.state.kbNodes || [];
    var counts = { internalized: 0, fuzzy: 0, blank: 0 };
    nodes.forEach(function (n) {
      var s = n.status === 'internalized' ? 'internalized'
            : n.status === 'fuzzy'        ? 'fuzzy' : 'blank';
      counts[s]++;
    });
    var summary = 'I ' + counts.internalized + ' · F ' + counts.fuzzy + ' · B ' + counts.blank;
    var snap = {
      date: new Date().toISOString().slice(0, 10),
      at:   Date.now(),
      summary: summary,
      counts: counts
    };
    try {
      window.state.boundariesHistory = (window.state.boundariesHistory || []).concat([snap]).slice(-30);
      window.state.boundariesSavedAt = Date.now();
    } catch (_) {}
    renderKnowledgeBoundaryFile();
    if (typeof window.saveCurrentSession === 'function') {
      try { window.saveCurrentSession(); } catch (_) {}
    }
  }

  /* ----------------------------------------------------------------
   * Long-term plan warnings (§10.4)
   *
   * If a target date is set, evaluate progress each call and emit
   * a warning card into the chat when:
   *   - more than 20% of nodes are still blank within 7 days of the
   *     deadline, or
   *   - the projected finish date falls past the deadline.
   * The warning text follows §11.4 — no exclamation marks, no
   * judgement, just numbers and a list of options.
   * ---------------------------------------------------------------- */
  function evaluatePlanWarning() {
    if (!window.state) return null;
    /* A-R2 perf — cache the last evaluation for 30s. The chat
       loop calls evaluatePlanWarning after every user turn;
       without this we recompute the projection math (which
       walks every KB node) on each call. The plan changes
       rarely, the warning changes even more rarely. */
    var now = Date.now();
    if (_planWarningCache.result !== null
        && (now - _planWarningCache.at) < 30000
        && _planWarningCache.targetDate === (window.state.planTargetDate || null)
        && _planWarningCache.dailyMin === (window.state.planDailyMinutes || 30)) {
      return _planWarningCache.result;
    }
    var result = _evaluatePlanWarningInner();
    _planWarningCache = {
      at: now,
      result: result,
      targetDate: window.state.planTargetDate || null,
      dailyMin: window.state.planDailyMinutes || 30
    };
    return result;
  }

  function _evaluatePlanWarningInner() {
    var plan = window.state.teachingPlan;
    if (!plan || !plan.subtopics || !plan.subtopics.length) return null;
    var target = window.state.planTargetDate;
    if (!target) return null;
    var nodes = window.state.kbNodes || [];
    if (!nodes.length) return null;

    var now = Date.now();
    var targetMs = (target instanceof Date) ? target.getTime() : new Date(target).getTime();
    if (!targetMs || isNaN(targetMs)) return null;
    var daysLeft = Math.ceil((targetMs - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) {
      return {
        kind: 'overdue',
        daysLeft: daysLeft,
        ratio: 1
      };
    }
    var done = 0, fuzzy = 0, blank = 0;
    nodes.forEach(function (n) {
      if (n.status === 'internalized') done++;
      else if (n.status === 'fuzzy') fuzzy++;
      else blank++;
    });
    var total = Math.max(1, nodes.length);
    var blankRatio = blank / total;
    /* Project the finish date assuming a constant rate. */
    var dailyMin = Math.max(5, window.state.planDailyMinutes || 30);
    /* Heuristic: each non-internalized node takes ~3 turns × ~3 min. */
    var pending = fuzzy + blank;
    var minutesNeeded = pending * 9;
    var daysNeeded = Math.ceil(minutesNeeded / dailyMin);
    var projectedDaysLeft = daysLeft - daysNeeded;
    var warn = null;
    if (daysLeft <= 7 && blankRatio > 0.2) {
      warn = { kind: 'deadline-blank', daysLeft: daysLeft, blankRatio: blankRatio };
    } else if (projectedDaysLeft < 0) {
      warn = { kind: 'projected-overrun', daysLeft: daysLeft, projectedDaysLeft: projectedDaysLeft };
    }
    /* Throttle: don't repeat the same warning inside 24h. */
    var last = window.state.planLastWarnedAt || 0;
    if (warn && (now - last) < 24 * 60 * 60 * 1000) return null;
    if (warn) {
      try { window.state.planLastWarnedAt = now; } catch (_) {}
    }
    return warn;
  }

  function renderPlanWarning(warn) {
    if (!warn) return;
    var text;
    var actions;
    if (warn.kind === 'overdue') {
      text = ti('tutor.planWarningOverdue', currentLang() === 'zh'
        ? '计划已过截止日期 ' + Math.abs(warn.daysLeft) + ' 天。可以调整截止时间或学习范围。'
        : 'Plan is ' + Math.abs(warn.daysLeft) + ' day(s) past the target date. Adjust the deadline or scope.')
        .replace('{n}', String(Math.abs(warn.daysLeft)));
    } else if (warn.kind === 'deadline-blank') {
      text = ti('tutor.planWarningBlank', currentLang() === 'zh'
        ? '当前进度提示：距截止时间还有 ' + warn.daysLeft + ' 天，仍有 ' + Math.round(warn.blankRatio * 100) + '% 的节点未探测。'
        : 'Progress note: ' + warn.daysLeft + ' day(s) left and ' + Math.round(warn.blankRatio * 100) + '% of nodes are unexplored.')
        .replace('{days}', String(warn.daysLeft))
        .replace('{pct}', String(Math.round(warn.blankRatio * 100)));
    } else {
      text = ti('tutor.planWarningOverrun', currentLang() === 'zh'
        ? '当前进度提示：按当前节奏，预计需要比截止时间多 ' + Math.abs(warn.projectedDaysLeft) + ' 天。'
        : 'Progress note: at the current pace, you will finish ' + Math.abs(warn.projectedDaysLeft) + ' day(s) after the target date.')
        .replace('{n}', String(Math.abs(warn.projectedDaysLeft)));
    }
    actions = [
      { text: ti('tutor.planActionScope',     currentLang() === 'zh' ? '调整学习范围' : 'Trim scope'),     action: 'plan-scope' },
      { text: ti('tutor.planActionTime',      currentLang() === 'zh' ? '增加每日时间' : 'Add daily time'), action: 'plan-time' },
      { text: ti('tutor.planActionDeadline',  currentLang() === 'zh' ? '延长截止日期' : 'Extend deadline'), action: 'plan-deadline' }
    ];
    if (typeof window.addMessage === 'function') {
      window.addMessage('assistant', text, 'suggest', actions);
    }
  }

  /* ----------------------------------------------------------------
   * Teaching plan label rendering
   *
   * The existing renderKnowledgeView shows the internal stage names
   * ("motivate", "define") directly. Per §16.3 system messages must
   * be free of internal identifiers — surface the human label
   * instead. We also highlight the current sub-topic and add a
   * progress fraction so the user can see at a glance how far
   * through the plan they are.
   * ---------------------------------------------------------------- */
  function renderTeachingPlan() {
    var cont = document.getElementById('teachingPlanContent');
    if (!cont) return;
    var plan = window.state && window.state.teachingPlan;
    var html = '';
    if (plan && plan.subtopics && plan.subtopics.length) {
      var curIdx = plan.currentSubtopicIdx || 0;
      var stage = (window.state.teachingStage || 'motivate');
      var doneCount = 0;
      plan.subtopics.forEach(function (s) { if (s.status === 'internalized') doneCount++; });
      var totalCount = plan.subtopics.length;
      var pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

      html += '<div class="teaching-plan">';
      html += '<div class="teaching-plan-title">'
           + ti('tutor.planTitle', currentLang() === 'zh' ? '教学计划' : 'Teaching plan')
           + '</div>';
      html += '<div class="teaching-plan-progress">'
           + '<div class="teaching-plan-progress-bar"><div class="teaching-plan-progress-fill" style="width:' + pct + '%"></div></div>'
           + '<div class="teaching-plan-progress-text">' + doneCount + ' / ' + totalCount + ' (' + pct + '%)</div>'
           + '</div>';
      plan.subtopics.forEach(function (s, i) {
        var isCurrent = (i === curIdx && s.status !== 'internalized');
        var isDone = s.status === 'internalized';
        var cls = 'teaching-plan-subtopic';
        if (isCurrent) cls += ' current';
        if (isDone)    cls += ' done';
        html += '<div class="' + cls + '">';
        html += '<span class="teaching-plan-marker">'
             + (isDone ? ti('tutor.done', '[done]') : isCurrent ? '›' : '·') + '</span>';
        html += '<span class="teaching-plan-name">' + esc(s.name) + '</span>';
        if (isCurrent) {
          html += '<span class="teaching-plan-stage">'
               + esc(stageLabel(stage)) + '</span>';
        }
        html += '</div>';
      });
      html += '</div>';
    }
    cont.innerHTML = html;
  }

  /* ----------------------------------------------------------------
   * §8 — practice progress chip
   *
   * Shows the user how many times they have attempted the current
   * practice problem and what phase (foundation / transfer) they
   * are on. The chip is intentionally tiny so it doesn't add
   * weight to the chat — it's a glance, not a status panel.
   * ---------------------------------------------------------------- */
  function renderPracticeProgress() {
    var cont = document.getElementById('practiceProgressChip');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'practiceProgressChip';
      cont.className = 'practice-progress-chip tutor-only';
      var banner = document.getElementById('modeBanner');
      if (banner && banner.parentNode) {
        banner.parentNode.insertBefore(cont, banner.nextSibling);
      }
    }
    if (!window.state) { cont.innerHTML = ''; return; }
    var phase = window.state.practicePhase;
    if (!phase) { cont.innerHTML = ''; return; }
    var attempts = window.state.practiceAttempts || 0;
    var phaseText = phase === 'foundation'
      ? ti('tutor.practiceFoundation', currentLang() === 'zh' ? '基础' : 'Foundation')
      : ti('tutor.practiceTransfer',   currentLang() === 'zh' ? '变式' : 'Transfer');
    /* Slim inline: phase pill · attempt count. Node name is the
       already-shown in the current sub-topic header so we don't
       repeat it here. */
    var attemptsShort = '·' + attempts;
    cont.innerHTML =
      '<span class="practice-progress-chip-phase">' + esc(phaseText) + '</span>' +
      '<span class="practice-progress-chip-attempts">' + esc(attemptsShort) + '</span>';
  }

  /* ----------------------------------------------------------------
   * Mode banner
   *
   * The audit noted that tutor mode is invisible from the main
   * chat. Show a subtle banner above the chat list that names the
   * current mode and lets the user switch with a single click.
   * ---------------------------------------------------------------- */
  function renderModeBanner() {
    var cont = document.getElementById('modeBanner');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'modeBanner';
      cont.className = 'mode-banner tutor-only';
      var msgList = document.getElementById('msgList');
      if (msgList && msgList.parentNode) {
        msgList.parentNode.insertBefore(cont, msgList);
      }
    }
    var mode = (window.appMode === 'chat') ? 'chat' : 'tutor';
    var label = (mode === 'chat')
      ? ti('tutor.modeChat', currentLang() === 'zh' ? '对话' : 'Chat')
      : ti('tutor.modeTutor', currentLang() === 'zh' ? '引导' : 'Tutor');
    var other = (mode === 'chat') ? 'tutor' : 'chat';
    var otherLabel = (other === 'tutor') ? 'Tutor' : 'Chat';
    /* Slim one-line chip: dot · label · switch. The dot color
       alone signals which mode is active; the switch button is
       labelled with the *target* mode (e.g. "Tutor" when currently
       in Chat) so it doubles as a mode indicator at a glance. */
    cont.innerHTML =
      '<span class="mode-banner-dot mode-banner-dot-' + mode + '"></span>' +
      '<span class="mode-banner-label">' + esc(label) + '</span>' +
      '<button class="mode-banner-switch" type="button" title="' + esc(otherLabel) + '">' + esc(otherLabel) + '</button>';
    var btn = cont.querySelector('.mode-banner-switch');
    if (btn) {
      btn.onclick = function () {
        if (typeof window.toggleAppMode === 'function') {
          window.toggleAppMode();
        } else if (typeof window.setAppMode === 'function') {
          window.setAppMode(other);
        } else {
          try { window.appMode = other; } catch (_) {}
        }
        renderModeBanner();
      };
    }
  }

  /* ----------------------------------------------------------------
   * Diagnostic timeout feedback
   *
   * Audit U-H3: the 60s timeout silently falls back to mock
   * questions. We expose a banner so the user is told the AI
   * timed out and the questions are best-effort placeholders.
   * ---------------------------------------------------------------- */
  function renderDiagnosticBanner() {
    var view = document.getElementById('diagnosticView');
    if (!view) return;
    var existing = document.getElementById('diagnosticBanner');
    if (existing) existing.remove();
    var src = window.state && window.state.lastCallSource;
    var err = window.state && window.state.lastCallError;
    if (src !== 'mock') return;
    var note = (currentLang() === 'zh')
      ? ti('tutor.diagTimeout', '题目生成超时，使用占位题。')
      : ti('tutor.diagTimeout', 'Question generation timed out — using placeholders.');
    var banner = document.createElement('div');
    banner.id = 'diagnosticBanner';
    banner.className = 'diag-banner-warn tutor-only';
    banner.textContent = note;
    view.insertBefore(banner, view.firstChild);
  }

  /* ----------------------------------------------------------------
   * Mistake book filter (§9.4)
   *
   * The audit noted the mistake book shows "未消化的练习题" cards
   * with placeholder content. The filter lets the user pick
   * "all" / "unresolved" / "by node" so the view stops being noise.
   * ---------------------------------------------------------------- */
  function setMistakeFilter(value) {
    if (!window.state) return;
    try { window.state.mistakeFilter = value; } catch (_) {}
    if (typeof window.renderMistakes === 'function') {
      try { window.renderMistakes(); } catch (_) {}
    }
  }
  function renderMistakeFilterBar() {
    var cont = document.getElementById('mistakeFilterBar');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'mistakeFilterBar';
      cont.className = 'mistake-filter-bar tutor-only';
      var panel = document.getElementById('mistakesPanel');
      if (panel) panel.insertBefore(cont, panel.firstChild);
    }
    var cur = (window.state && window.state.mistakeFilter) || 'all';
    var opts = [
      { v: 'all',        key: 'tutor.mistakeFilterAll' },
      { v: 'unresolved', key: 'tutor.mistakeFilterUnresolved' },
      { v: 'resolved',   key: 'tutor.mistakeFilterResolved' }
    ];
    cont.innerHTML = opts.map(function (o) {
      var label = ti(o.key, o.v);
      return '<button class="mistake-filter-btn' + (cur === o.v ? ' active' : '') + '" data-v="' + o.v + '" type="button">' + esc(label) + '</button>';
    }).join('');
    Array.prototype.forEach.call(cont.querySelectorAll('.mistake-filter-btn'), function (b) {
      b.onclick = function () { setMistakeFilter(b.getAttribute('data-v')); };
    });
  }

  /* ----------------------------------------------------------------
   * §10 — long-term plan generation.
   *
   * Given the freshly-built KB and a user-supplied target date /
   * daily budget, build a structured plan with:
   *   - subtopics sorted by prerequisite chain then by status
   *     (fuzzy → blank → internalized, per existing buildTeachingPlanFromKB),
   *   - per-subtopic `objective`, `exampleCount`, `practiceCount`,
   *     `inspectionType`,
   *   - per-day `estimated_minutes` that respects the user's
   *     daily budget,
   *   - the last 7 days reserved as the "review buffer" before
   *     the deadline,
   *   - a warning schedule — the caller is expected to poll
   *     `evaluatePlanWarning` after each user turn.
   * ---------------------------------------------------------------- */
  function buildLongTermPlan(opts) {
    opts = opts || {};
    if (!window.state) return null;
    var nodes = window.state.kbNodes || [];
    if (!nodes.length) return null;

    var target = opts.targetDate || window.state.planTargetDate || null;
    var dailyMin = Math.max(5, opts.dailyMinutes || window.state.planDailyMinutes || 30);
    var restDays = Array.isArray(opts.weeklyRestDays) ? opts.weeklyRestDays
                : (window.state.planWeeklyRestDays || []);

    /* Per §10.2 step 3: estimate the time cost of each node. The
       design says "use historical turn data, fall back to a
       structural default." We have no historical data on first
       build, so the structural default is: 2 worked examples +
       1 practice problem ≈ 9 minutes of focused work per node. */
    var rank = { fuzzy: 0, blank: 1, internalized: 2 };
    var subtopics = nodes.map(function (n, i) {
      return {
        nodeIdx: i,
        name: n.name || ('Node ' + (i + 1)),
        status: n.status || 'blank',
        objective: '掌握 ' + (n.name || ('Node ' + (i + 1))),
        exampleCount: 2,
        practiceCount: 1,
        inspectionType: 'concept',
        prerequisites: [],
        estimatedMinutes: 9
      };
    });
    subtopics.sort(function (a, b) {
      var ra = rank[a.status] != null ? rank[a.status] : 1;
      var rb = rank[b.status] != null ? rank[b.status] : 1;
      if (ra !== rb) return ra - rb;
      return a.nodeIdx - b.nodeIdx;
    });

    /* §10.2 step 4: allocate to the time axis. The deadline
       drives the day count; we reserve 7 days for review. */
    var days = [];
    var totalMinutes = subtopics.reduce(function (s, x) {
      return s + (x.status === 'internalized' ? 0 : x.estimatedMinutes);
    }, 0);
    if (target) {
      var targetMs = (target instanceof Date) ? target.getTime() : new Date(target).getTime();
      if (!isNaN(targetMs)) {
        var totalDays = Math.max(1, Math.ceil((targetMs - Date.now()) / 86400000));
        /* Reserve the last 7 days as review buffer per §10.2. */
        var studyDays = Math.max(1, totalDays - 7);
        days = distributeAcrossDays(subtopics, studyDays, dailyMin, restDays);
        /* Append 7 review-buffer days with empty placeholder tasks
           (the long-term plan will be re-evaluated at runtime to
           fill these from the mistake book, §10.5). */
        for (var k = 0; k < 7; k++) {
          days.push({ dayOffset: totalDays - 7 + k, isReviewBuffer: true, tasks: [] });
        }
      }
    }
    if (!days.length) {
      /* No target date — flat single-day plan. */
      days = [{ dayOffset: 0, isReviewBuffer: false, tasks: subtopics.filter(function (s) { return s.status !== 'internalized'; }) }];
    }
    var firstActive = 0;
    for (var ii = 0; ii < subtopics.length; ii++) {
      if (subtopics[ii].status !== 'internalized') { firstActive = ii; break; }
    }
    return {
      subtopics: subtopics,
      currentSubtopicIdx: firstActive,
      createdAt: Date.now(),
      targetDate: target,
      dailyMinutes: dailyMin,
      weeklyRestDays: restDays,
      days: days,
      totalMinutes: totalMinutes,
      startedAt: Date.now()
    };
  }

  function distributeAcrossDays(subtopics, studyDays, dailyMin, restDays) {
    var days = [];
    var bucket = [];
    var minutes = 0;
    /* Skip rest days (0=Sun..6=Sat). */
    function isRest(offset) {
      var d = new Date(Date.now() + offset * 86400000);
      return restDays.indexOf(d.getDay()) !== -1;
    }
    for (var i = 0; i < subtopics.length; i++) {
      var s = subtopics[i];
      if (s.status === 'internalized') continue;
      if (minutes + s.estimatedMinutes > dailyMin && bucket.length) {
        days.push({ dayOffset: days.length, isReviewBuffer: false, tasks: bucket });
        bucket = [];
        minutes = 0;
      }
      bucket.push(s);
      minutes += s.estimatedMinutes;
    }
    if (bucket.length) {
      days.push({ dayOffset: days.length, isReviewBuffer: false, tasks: bucket });
    }
    return days;
  }

  /* Render the long-term plan as a vertical timeline that fits
     under the teaching-plan list in the Knowledge sidebar. */
  function renderLongTermPlan() {
    var cont = document.getElementById('teachingPlanContent');
    if (!cont) return;
    var plan = window.state && window.state.teachingPlan;
    if (!plan) return;
    if (!plan.days || !plan.days.length) return;
    var html = '<div class="ltp">';
    html += '<div class="ltp-title">'
         + ti('tutor.scheduleTitle', currentLang() === 'zh' ? '学习日程' : 'Daily schedule')
         + '</div>';
    if (plan.targetDate) {
      var d = (plan.targetDate instanceof Date) ? plan.targetDate : new Date(plan.targetDate);
      var ds = isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
      html += '<div class="ltp-meta">'
           + ti('tutor.scheduleTarget', currentLang() === 'zh' ? '截止时间' : 'Target')
           + ': ' + esc(ds)
           + ' · ' + (plan.dailyMinutes || 30) + ' min/'
           + ti('tutor.scheduleDay', currentLang() === 'zh' ? '天' : 'day')
           + '</div>';
      html += '<ol class="ltp-days">';
      plan.days.slice(0, 14).forEach(function (day) {
        var dt = new Date(Date.now() + day.dayOffset * 86400000);
        var dateStr = dt.toISOString().slice(5, 10);
        var taskNames = (day.tasks || []).map(function (t) { return t.name; });
        var label = day.isReviewBuffer
          ? ti('tutor.scheduleReview', currentLang() === 'zh' ? '复习缓冲' : 'Review buffer')
          : (taskNames.length
              ? taskNames.join(' · ')
              : ti('tutor.scheduleRest', currentLang() === 'zh' ? '休息' : 'Rest day'));
        html += '<li class="ltp-day' + (day.isReviewBuffer ? ' ltp-day-review' : '') + '">'
             + '<span class="ltp-day-date">' + esc(dateStr) + '</span>'
             + '<span class="ltp-day-tasks">' + esc(label) + '</span>'
             + '</li>';
      });
      if (plan.days.length > 14) {
        html += '<li class="ltp-day ltp-day-more">+ '
             + (plan.days.length - 14) + ' '
             + ti('tutor.scheduleMore', currentLang() === 'zh' ? '天' : 'more days')
             + '</li>';
      }
      html += '</ol>';
    } else {
      /* Empty state — no target date set. Show a guided
         explanation instead of a bare "no days to show" — the
         audit caught this as U-M1 (sub-topic progress is
         invisible). §10.1 of the design makes the target date
         optional, so we have to make the absence useful. */
      html += '<div class="ltp-empty">'
           + ti('tutor.scheduleEmpty', currentLang() === 'zh'
               ? '设置截止时间和每日学习时间后，会按节奏把今天要做的主题和剩余天数排在这里。'
               : 'Set a target date and a daily time budget to see a day-by-day plan with review buffer and deadline warnings.')
           + '</div>';
      html += '<button class="ltp-empty-cta" id="ltpEmptyCta" type="button">'
           + ti('tutor.scheduleEmptyCta', currentLang() === 'zh' ? '现在设置' : 'Set up now')
           + '</button>';
    }
    html += '</div>';
    /* Append rather than replace — the teaching-plan section
       above remains. */
    var existing = document.getElementById('ltpContainer');
    if (existing) existing.remove();
    var wrap = document.createElement('div');
    wrap.id = 'ltpContainer';
    wrap.innerHTML = html;
    cont.appendChild(wrap);
    /* Wire the empty-state CTA — when clicked, jump back to the
       topic-setup screen and auto-expand the plan fields. */
    var cta = document.getElementById('ltpEmptyCta');
    if (cta) {
      cta.onclick = function () {
        if (typeof window.resetApp === 'function') {
          try { window.resetApp(); } catch (_) {}
        }
        var toggle = document.getElementById('planSetupToggle');
        var fields = document.getElementById('planSetupFields');
        if (toggle) toggle.setAttribute('aria-expanded', 'true');
        if (fields) fields.hidden = false;
        var dateInput = document.getElementById('planTargetDateInput');
        if (dateInput) try { dateInput.focus(); } catch (_) {}
      };
    }
  }

  /* ----------------------------------------------------------------
   * §9 — mistake book helper.
   *
   * Wraps the existing `state.mistakes` push so the rest of the
   * app can call a single function. The data shape matches the
   * existing renderer (state.mistakes[] entry) and the sidebar
   * picks it up automatically.
   * ---------------------------------------------------------------- */
  function recordMistakeNotice(opts) {
    opts = opts || {};
    if (!window.state) return null;
    if (!Array.isArray(window.state.mistakes)) window.state.mistakes = [];
    var entry = {
      id: 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: opts.type || 'practice',
      topic: opts.topic || (window.state.topic || ''),
      q: opts.q || '',
      options: opts.options || [],
      correct: opts.correct || null,
      userAnswer: opts.userAnswer || null,
      timestamp: Date.now(),
      source: opts.source || 'four-option',
      resolved: false
    };
    window.state.mistakes.unshift(entry);
    if (typeof window.renderMistakes === 'function') {
      try { window.renderMistakes(); } catch (_) {}
    }
    return entry;
  }

  /* ----------------------------------------------------------------
   * Public hooks. Expose everything the rest of the app needs.
   * ---------------------------------------------------------------- */

  /* A-R2 perf — explicit invalidator so the caller (e.g. when a
     node flips to internalized) can force the next evaluation
     to recompute instead of returning the cached result. */
  function invalidatePlanWarningCache() {
    _planWarningCache = { at: 0, result: null };
  }

  window.tutorSocratic = {
    stageLabel: stageLabel,
    detectStuck: detectStuck,
    showExplainPrompt: showExplainPrompt,
    showFourOptionDialog: showFourOptionDialog,
    renderKnowledgeBoundaryFile: renderKnowledgeBoundaryFile,
    saveBoundarySnapshot: saveBoundarySnapshot,
    renderTeachingPlan: renderTeachingPlan,
    renderModeBanner: renderModeBanner,
    renderPracticeProgress: renderPracticeProgress,
    renderDiagnosticBanner: renderDiagnosticBanner,
    evaluatePlanWarning: evaluatePlanWarning,
    invalidatePlanWarningCache: invalidatePlanWarningCache,
    renderPlanWarning: renderPlanWarning,
    renderMistakeFilterBar: renderMistakeFilterBar,
    buildLongTermPlan: buildLongTermPlan,
    renderLongTermPlan: renderLongTermPlan,
    recordMistakeNotice: recordMistakeNotice
  };
})();
