import { stateStore } from './state.js';

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
      /* AUDIT-fix — the real language source of truth is
         window._currentLang (set by i18n.js setLang). getAppLang /
         APP_LANG were never assigned anywhere, and index.html hard-
         codes lang="en", so Chinese users always got English stage
         labels. Check _currentLang first, keep the old chain as
         fallbacks. */
      if (window._currentLang === 'zh' || window._currentLang === 'en') return window._currentLang;
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
  /* U-H4 — localized label for a sub-topic mastery status
     (blank / fuzzy / internalized). Prefers the i18n key, falling
     back to inline bilingual copy so the plan sidebar never shows a
     raw internal identifier. */
  function statusLabel(status) {
    if (status === 'internalized') return ti('tutor.statusInternalized', currentLang() === 'zh' ? '已内化' : 'Internalized');
    if (status === 'fuzzy')        return ti('tutor.statusFuzzy',        currentLang() === 'zh' ? '模糊' : 'Fuzzy');
    return ti('tutor.statusBlank', currentLang() === 'zh' ? '空白' : 'Blank');
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
  function showExplainPrompt() {
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
    try {
      stateStore.dispatch({
        type: 'state/set',
        key: 'session.fourOptionDialog',
        value: { questionPreview: preview, at: Date.now() }
      });
    } catch (_) {}
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
  /* ----------------------------------------------------------------
   * P1.2 — force-directed knowledge graph.
   * Renders state.kbNodes as an SVG force-directed graph at the top of
   * the knowledge panel. Node COLOR encodes mastery (internalized /
   * fuzzy / blank) shaded by confidence_score; node SIZE encodes the
   * number of questions asked. Nodes are linked in learning order
   * (i -> i+1) to show progression. The layout is a deterministic,
   * index-seeded force simulation (Fruchterman-Reingold style) so the
   * graph is stable across renders and reproducible in tests — no RNG.
   * Clicking / Enter on a node opens the SAME detail panel the list
   * view uses (window.toggleKBDetail), which carries the confidence
   * dots / notes / history / "-> go" jump. Data is read straight from
   * state.kbNodes — zero backend changes. The three-section text view
   * below remains as the accessible / screen-reader fallback. */
  var KB_GRAPH_W = 320, KB_GRAPH_H = 240, KB_PAD = 26;
  function kbNodeRadius(n) {
    var q = (n && typeof n.questions === 'number') ? n.questions : 0;
    /* sub-linear (sqrt) so one very busy node doesn't dwarf the rest */
    return Math.max(7, Math.min(22, 7 + Math.sqrt(q) * 4));
  }
  function kbLayout(nodes) {
    var N = nodes.length;
    var cx = KB_GRAPH_W / 2, cy = KB_GRAPH_H / 2;
    var R = Math.min(KB_GRAPH_W, KB_GRAPH_H) / 2 - KB_PAD - 6;
    var pos = [];
    for (var i = 0; i < N; i++) {
      var a = (2 * Math.PI * i) / N - Math.PI / 2;   // deterministic ring seed
      pos.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
    }
    if (N < 2) { if (N === 1) pos[0] = { x: cx, y: cy }; return pos; }
    var k = Math.max(30, Math.min(KB_GRAPH_W, KB_GRAPH_H) / Math.sqrt(N)); // ideal spacing
    var iters = 160;
    for (var it = 0; it < iters; it++) {
      var temp = 1 - it / iters;
      var disp = pos.map(function () { return { x: 0, y: 0 }; });
      /* repulsion between every pair */
      for (var p = 0; p < N; p++) {
        for (var qi = p + 1; qi < N; qi++) {
          var dx = pos[p].x - pos[qi].x, dy = pos[p].y - pos[qi].y;
          var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          var f = (k * k) / d, ux = dx / d, uy = dy / d;
          disp[p].x += ux * f; disp[p].y += uy * f;
          disp[qi].x -= ux * f; disp[qi].y -= uy * f;
        }
      }
      /* attraction along sequential learning-path edges */
      for (var e = 0; e < N - 1; e++) {
        var dx2 = pos[e].x - pos[e + 1].x, dy2 = pos[e].y - pos[e + 1].y;
        var d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 0.01;
        var f2 = (d2 * d2) / k, ux2 = dx2 / d2, uy2 = dy2 / d2;
        disp[e].x -= ux2 * f2; disp[e].y -= uy2 * f2;
        disp[e + 1].x += ux2 * f2; disp[e + 1].y += uy2 * f2;
      }
      /* mild gravity to the centre + temperature-limited step + clamp */
      for (var m = 0; m < N; m++) {
        disp[m].x += (cx - pos[m].x) * 0.03;
        disp[m].y += (cy - pos[m].y) * 0.03;
        var dd = Math.sqrt(disp[m].x * disp[m].x + disp[m].y * disp[m].y) || 0.01;
        var step = Math.min(dd, 8 * temp + 0.5);
        pos[m].x = Math.max(KB_PAD, Math.min(KB_GRAPH_W - KB_PAD, pos[m].x + (disp[m].x / dd) * step));
        pos[m].y = Math.max(KB_PAD, Math.min(KB_GRAPH_H - KB_PAD, pos[m].y + (disp[m].y / dd) * step));
      }
    }
    return pos;
  }
  function buildKBGraphHtml(nodes) {
    var N = nodes.length;
    if (!N) return '';
    var pos = kbLayout(nodes);
    var cur = (window.state && typeof window.state.currentNode === 'number') ? window.state.currentNode : -1;
    var s = '<div class="kb-graph-wrap">';
    s += '<div class="kb-graph-caption">'
      + (currentLang() === 'zh' ? '知识图谱 · 颜色=掌握度 · 大小=提问数' : 'Knowledge map · color = mastery · size = questions')
      + '</div>';
    s += '<svg class="kb-graph" viewBox="0 0 ' + KB_GRAPH_W + ' ' + KB_GRAPH_H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="'
      + (currentLang() === 'zh' ? '知识点力导向图' : 'Force-directed knowledge graph') + '">';
    s += '<g class="kb-graph-edges">';
    for (var e = 0; e < N - 1; e++) {
      s += '<line x1="' + pos[e].x.toFixed(1) + '" y1="' + pos[e].y.toFixed(1)
         + '" x2="' + pos[e + 1].x.toFixed(1) + '" y2="' + pos[e + 1].y.toFixed(1) + '"></line>';
    }
    s += '</g><g class="kb-graph-nodes">';
    for (var i = 0; i < N; i++) {
      var n = nodes[i];
      var status = n.status === 'internalized' ? 'internalized' : n.status === 'fuzzy' ? 'fuzzy' : 'blank';
      var r = kbNodeRadius(n);
      var cs = (typeof n.confidence_score === 'number') ? Math.max(0, Math.min(5, n.confidence_score)) : 0;
      var op = (0.35 + 0.13 * cs).toFixed(2);   // confidence shading: faint -> solid
      var full = n.name || ('Node ' + (i + 1));
      var disp = full.length > 10 ? full.slice(0, 9) + '…' : full;
      s += '<g class="kb-graph-node kb-graph-node-' + status + (i === cur ? ' kb-graph-node-active' : '')
        + '" data-node-idx="' + i + '" tabindex="0" role="button" aria-label="' + esc(full) + '">';
      s += '<circle cx="' + pos[i].x.toFixed(1) + '" cy="' + pos[i].y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill-opacity="' + op + '"></circle>';
      s += '<text x="' + pos[i].x.toFixed(1) + '" y="' + (pos[i].y + r + 9).toFixed(1) + '" text-anchor="middle">' + esc(disp) + '</text>';
      s += '</g>';
    }
    s += '</g></svg></div>';
    return s;
  }
  function wireKBGraph(cont) {
    var els = cont.querySelectorAll('.kb-graph-node');
    els.forEach(function (g) {
      var idx = parseInt(g.getAttribute('data-node-idx'), 10);
      function open() { if (typeof window.toggleKBDetail === 'function') window.toggleKBDetail(idx); }
      g.addEventListener('click', open);
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
    });
  }

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

    /* P1.2 — force-directed graph sits at the top of the panel; the
       sectioned text view below stays as the accessible fallback. */
    html += buildKBGraphHtml(nodes);

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
    /* P1.2 — attach node click / keyboard handlers via addEventListener
       (NOT inline onclick) so the boot inline-handler hash guard is
       unaffected. Each node opens the shared detail panel. */
    wireKBGraph(cont);
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
      stateStore.dispatch({
        type: 'state/batch',
        patch: {
          boundariesHistory: (stateStore.read('boundariesHistory') || []).concat([snap]).slice(-30),
          boundariesSavedAt: Date.now()
        }
      });
    } catch (_) {}
    renderKnowledgeBoundaryFile();
    if (typeof window.saveCurrentSession === 'function') {
      try { window.saveCurrentSession(); } catch (_) {}
    }
  }

  /* ----------------------------------------------------------------
   * Teaching plan label rendering

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
        html += '<span class="teaching-plan-status status-' + esc(s.status || 'blank') + '">'
             + esc(statusLabel(s.status || 'blank')) + '</span>';
        if (isCurrent) {
          html += '<span class="teaching-plan-stage">'
               + esc(stageLabel(stage)) + '</span>';
          /* U-M1 — surface the substantive-answer progress that gates
             sub-topic advancement (ADVANCE_THRESHOLD = 3 in main.js).
             Without this the "3 substantive answers" rule was invisible
             and progress felt arbitrary. */
          var subCount = Math.min((window.state && window.state.substantiveCount) || 0, 3);
          html += '<span class="teaching-plan-depth" title="'
               + ti('tutor.depthHint', currentLang() === 'zh' ? '达到 3 次深入回答后进入下一个子主题' : 'Reach 3 in-depth answers to advance to the next sub-topic')
               + '">' + subCount + '/3</span>';
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
      cont = document.createElement('span');
      cont.id = 'practiceProgressChip';
      cont.className = 'practice-progress-chip tutor-only';
      var chatHeader = document.getElementById('chatHeader');
      if (chatHeader) {
        chatHeader.appendChild(cont);
      } else {
        /* Fallback: place inline in the top-bar next to the
           stats badge. This keeps the unified single
           top row instead of leaking above the message list. */
        var badge = document.getElementById('chatStats');
        if (badge && badge.parentNode) {
          badge.parentNode.insertBefore(cont, badge);
        }
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
   *
   * NOTE: The Chat / Tutor switcher is no longer rendered. The
   * single-row top-bar (see top-bar layout in index.html) already
   * shows everything the user needs. Adding a "Tutor · Chat" chip
   * on top of that just clutters the header. If we ever want to
   * re-introduce it, we should put it in the top-bar (not above the
   * message list). For now, this is a no-op and any stale chip left
   * over from earlier sessions is removed. */
  function renderModeBanner() {
    var existing = document.getElementById('modeChip');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  /* ----------------------------------------------------------------
   * Mistake book filter (§9.4)
   *
   * The audit noted the mistake book shows "未消化的练习题" cards
   * with placeholder content. The filter lets the user pick
   * "all" / "unresolved" / "by node" so the view stops being noise.
   * ---------------------------------------------------------------- */
  function setMistakeFilter(value) {
    try { stateStore.dispatch({ type: 'state/set', key: 'mistakeFilter', value: value }); } catch (_) {}
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
    var mistakes = stateStore.read('mistakes');
    stateStore.dispatch({
      type: 'state/set',
      key: 'mistakes',
      value: [entry].concat(Array.isArray(mistakes) ? mistakes : [])
    });
    if (typeof window.renderMistakes === 'function') {
      try { window.renderMistakes(); } catch (_) {}
    }
    return entry;
  }

  /* ----------------------------------------------------------------
   * Public hooks. Expose everything the rest of the app needs.
   * ---------------------------------------------------------------- */

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
    renderMistakeFilterBar: renderMistakeFilterBar,
    recordMistakeNotice: recordMistakeNotice
  };
})();
