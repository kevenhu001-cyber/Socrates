import { stateStore } from './state/store.ts';
import { esc } from './render/helpers.ts';
import { scheduleTurnToTopForMessage } from './chat/turnAnchor.ts';
import { reportSwallow } from './util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "./types/runtimeWindow.ts";
import { getCurrentLanguage } from './i18n/languageState.ts';
import type { TutorMistakeFilterProps } from './react/tutor/TutorMistakeFilter.tsx';

interface KnowledgeNode {
  name: string; status: string; confidence_score?: number; questions?: number;
  verifiedCount?: number; system_note?: string; user_note?: string;
}
type KnowledgeSectionEntry = { node: KnowledgeNode; idx: number };


function renderTutorMistakeFilter(host: HTMLElement, props: TutorMistakeFilterProps) {
  void import('./react/tutor/tutorMistakeFilterHost.tsx').then(({ renderTutorMistakeFilter: render }) => {
    if (host.isConnected) render(host, props);
  }).catch((error) => reportSwallow(error, 'tutorSocratic.js:renderMistakeFilter'));
}

function renderTutorSnapshotAction(host: HTMLElement, label: string, onClick: () => void) {
  void import('./react/tutor/tutorSnapshotActionHost.tsx').then(({ renderTutorSnapshotAction: render }) => {
    if (host.isConnected) render(host, label, onClick);
  }).catch((error) => reportSwallow(error, 'tutorSocratic.js:renderSnapshotAction'));
}

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

const tutorSocraticRuntime = (function () {
  'use strict';

  /* A-R1 perf — coalesce KB re-renders inside one rAF. */
  let _kbRenderPending = false;

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
  /* U-H4 — localized label for a sub-topic mastery status
     (blank / fuzzy / internalized). Prefers the i18n key, falling
     back to inline bilingual copy so the plan sidebar never shows a
     raw internal identifier. */
  function statusLabel(status: string) {
    if (status === 'internalized') return ti('tutor.statusInternalized', currentLang() === 'zh' ? '已内化' : 'Internalized');
    if (status === 'fuzzy')        return ti('tutor.statusFuzzy',        currentLang() === 'zh' ? '模糊' : 'Fuzzy');
    return ti('tutor.statusBlank', currentLang() === 'zh' ? '空白' : 'Blank');
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
  const KB_GRAPH_W = 320, KB_GRAPH_H = 240, KB_PAD = 26;
  function kbNodeRadius(n: { questions?: unknown; }) {
    const q = (n && typeof n.questions === 'number') ? n.questions : 0;
    /* sub-linear (sqrt) so one very busy node doesn't dwarf the rest */
    return Math.max(7, Math.min(22, 7 + Math.sqrt(q) * 4));
  }
  function kbLayout(nodes: unknown[]) {
    const N = nodes.length;
    const cx = KB_GRAPH_W / 2, cy = KB_GRAPH_H / 2;
    const R = Math.min(KB_GRAPH_W, KB_GRAPH_H) / 2 - KB_PAD - 6;
    const pos = [];
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i) / N - Math.PI / 2;   // deterministic ring seed
      pos.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
    }
    if (N < 2) { if (N === 1) pos[0] = { x: cx, y: cy }; return pos; }
    const k = Math.max(30, Math.min(KB_GRAPH_W, KB_GRAPH_H) / Math.sqrt(N)); // ideal spacing
    const iters = 160;
    for (let it = 0; it < iters; it++) {
      const temp = 1 - it / iters;
      const disp = pos.map(function () { return { x: 0, y: 0 }; });
      /* repulsion between every pair */
      for (let p = 0; p < N; p++) {
        for (let qi = p + 1; qi < N; qi++) {
          const dx = pos[p].x - pos[qi].x, dy = pos[p].y - pos[qi].y;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const f = (k * k) / d, ux = dx / d, uy = dy / d;
          disp[p].x += ux * f; disp[p].y += uy * f;
          disp[qi].x -= ux * f; disp[qi].y -= uy * f;
        }
      }
      /* attraction along sequential learning-path edges */
      for (let e = 0; e < N - 1; e++) {
        const dx2 = pos[e].x - pos[e + 1].x, dy2 = pos[e].y - pos[e + 1].y;
        const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 0.01;
        const f2 = (d2 * d2) / k, ux2 = dx2 / d2, uy2 = dy2 / d2;
        disp[e].x -= ux2 * f2; disp[e].y -= uy2 * f2;
        disp[e + 1].x += ux2 * f2; disp[e + 1].y += uy2 * f2;
      }
      /* mild gravity to the centre + temperature-limited step + clamp */
      for (let m = 0; m < N; m++) {
        disp[m].x += (cx - pos[m].x) * 0.03;
        disp[m].y += (cy - pos[m].y) * 0.03;
        const dd = Math.sqrt(disp[m].x * disp[m].x + disp[m].y * disp[m].y) || 0.01;
        const step = Math.min(dd, 8 * temp + 0.5);
        pos[m].x = Math.max(KB_PAD, Math.min(KB_GRAPH_W - KB_PAD, pos[m].x + (disp[m].x / dd) * step));
        pos[m].y = Math.max(KB_PAD, Math.min(KB_GRAPH_H - KB_PAD, pos[m].y + (disp[m].y / dd) * step));
      }
    }
    return pos;
  }
  function buildKBGraphHtml(nodes: KnowledgeNode[]) {
    const N = nodes.length;
    if (!N) return '';
    const pos = kbLayout(nodes);
    const cur = typeof stateStore.read("currentNode") === 'number' ? stateStore.read("currentNode") : -1;
    let s = '<div class="kb-graph-wrap">';
    s += '<div class="kb-graph-caption">'
      + (currentLang() === 'zh' ? '知识图谱 · 颜色=掌握度 · 大小=提问数' : 'Knowledge map · color = mastery · size = questions')
      + '</div>';
    s += '<svg class="kb-graph" viewBox="0 0 ' + KB_GRAPH_W + ' ' + KB_GRAPH_H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="'
      + (currentLang() === 'zh' ? '知识点力导向图' : 'Force-directed knowledge graph') + '">';
    s += '<g class="kb-graph-edges">';
    for (let e = 0; e < N - 1; e++) {
      s += '<line x1="' + pos[e].x.toFixed(1) + '" y1="' + pos[e].y.toFixed(1)
         + '" x2="' + pos[e + 1].x.toFixed(1) + '" y2="' + pos[e + 1].y.toFixed(1) + '"></line>';
    }
    s += '</g><g class="kb-graph-nodes">';
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      const status = n.status === 'internalized' ? 'internalized' : n.status === 'fuzzy' ? 'fuzzy' : 'blank';
      const r = kbNodeRadius(n);
      const cs = (typeof n.confidence_score === 'number') ? Math.max(0, Math.min(5, n.confidence_score)) : 0;
      const op = (0.35 + 0.13 * cs).toFixed(2);   // confidence shading: faint -> solid
      const full = n.name || ('Node ' + (i + 1));
      const disp = full.length > 10 ? full.slice(0, 9) + '…' : full;
      s += '<g class="kb-graph-node kb-graph-node-' + status + (i === cur ? ' kb-graph-node-active' : '')
        + '" data-node-idx="' + i + '" tabindex="0" role="button" aria-label="' + esc(full) + '">';
      s += '<circle cx="' + pos[i].x.toFixed(1) + '" cy="' + pos[i].y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill-opacity="' + op + '"></circle>';
      s += '<text x="' + pos[i].x.toFixed(1) + '" y="' + (pos[i].y + r + 9).toFixed(1) + '" text-anchor="middle">' + esc(disp) + '</text>';
      s += '</g>';
    }
    s += '</g></svg></div>';
    return s;
  }
  function wireKBGraph(cont: HTMLElement) {
    const els = cont.querySelectorAll('.kb-graph-node');
    els.forEach(function (g: Element) {
      const idx = parseInt(g.getAttribute('data-node-idx') || '', 10);
      function open() { if (typeof browserWindow.toggleKBDetail === 'function') browserWindow.toggleKBDetail(idx); }
      g.addEventListener('click', open);
      g.addEventListener('keydown', function (event: Event) {
        const ev = event as KeyboardEvent;
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
    });
  }

  function renderKnowledgeSections(sections: { internalized: KnowledgeSectionEntry[]; fuzzy: KnowledgeSectionEntry[]; blank: KnowledgeSectionEntry[]; }) {
    let html = '';
    if (sections.internalized.length) {
      html += '<div class="kb-section-title">'
           + ti('tutor.kbSectionInternalized', currentLang() === 'zh' ? '已内化' : 'Internalized')
           + ' <span class="kb-section-count">' + sections.internalized.length + '</span></div>';
      sections.internalized.forEach(function (entry) {
        const verified = entry.node.verifiedCount || entry.node.questions || 0;
        html += '<div class="kb-node kb-node-internalized">'
             + '<div class="kb-node-name">'
             + esc(entry.node.name || ('Node ' + (entry.idx + 1)))
             + ' <span class="kb-verify-tag">'
             + ti('tutor.kbVerifiedTag', currentLang() === 'zh' ? '验证 x' : 'verified x') + verified
             + '</span></div>'
             + '</div>';
      });
    }
    if (sections.fuzzy.length) {
      html += '<div class="kb-section-title">'
           + ti('tutor.kbSectionFuzzy', currentLang() === 'zh' ? '模糊' : 'Fuzzy')
           + ' <span class="kb-section-count">' + sections.fuzzy.length + '</span></div>';
      sections.fuzzy.forEach(function (entry) {
        html += '<div class="kb-node kb-node-fuzzy">';
        html += '<div class="kb-node-name">'
             + esc(entry.node.name || ('Node ' + (entry.idx + 1))) + '</div>';
        if (entry.node.system_note) {
          html += '<div class="kb-node-system-note"><span class="kb-tag-system">[系统]</span> '
               + esc(entry.node.system_note) + '</div>';
        }
        if (entry.node.user_note) {
          html += '<div class="kb-node-user-note"><span class="kb-tag-user">[我]</span> '
               + esc(entry.node.user_note) + '</div>';
        }
        html += '</div>';
      });
    }
    if (sections.blank.length) {
      html += '<div class="kb-section-title">'
           + ti('tutor.kbSectionBlank', currentLang() === 'zh' ? '未探测' : 'Not yet explored')
           + ' <span class="kb-section-count">' + sections.blank.length + '</span></div>';
      sections.blank.forEach(function (entry) {
        html += '<div class="kb-node kb-node-blank">'
             + '<div class="kb-node-name">'
             + esc(entry.node.name || ('Node ' + (entry.idx + 1))) + '</div>'
             + '</div>';
      });
    }
    return html;
  }

  function renderBoundaryHistory(history: Array<{ date?: unknown; summary?: unknown }>) {
    if (!history.length) return '';
    let html = '<div class="kb-section-title kb-section-title-secondary">'
      + ti('tutor.kbHistory', currentLang() === 'zh' ? '存档历史' : 'Snapshot history')
      + '</div><ul class="kb-history-list">';
    history.slice(-8).reverse().forEach(function (entry) {
      html += '<li class="kb-history-item">'
           + '<span class="kb-history-date">' + esc(entry.date) + '</span>'
           + '<span class="kb-history-summary">' + esc(entry.summary || '') + '</span></li>';
    });
    return html + '</ul>';
  }

  function renderKnowledgeBoundaryFile(opts?: { immediate?: boolean }) {
    opts = opts || {};
    const cont = document.getElementById('kbContent');
    if (!cont) return;

    const nodes = (browserWindow.stateStore.read("kbNodes") || []) as KnowledgeNode[];
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
      (browserWindow.requestAnimationFrame || function (cb) { setTimeout(cb, 16); })(function () {
        _kbRenderPending = false;
        renderKnowledgeBoundaryFile({ immediate: true });
      });
      return;
    }

    const sections: { internalized: KnowledgeSectionEntry[]; fuzzy: KnowledgeSectionEntry[]; blank: KnowledgeSectionEntry[] } = { internalized: [], fuzzy: [], blank: [] };
    nodes.forEach(function (n, i) {
      const s = n.status === 'internalized' ? 'internalized'
            : n.status === 'fuzzy'        ? 'fuzzy' : 'blank';
      sections[s].push({ node: n, idx: i });
    });

    const today = new Date().toISOString().slice(0, 10);
    let html = '';
    html += '<div class="kb-file-header">';
    html += '<div class="kb-file-title">'
         + ti('tutor.kbFileTitle', currentLang() === 'zh' ? '知识边界' : 'Knowledge Boundary')
         + '</div>';
    html += '<div class="kb-file-meta">'
         + ti('tutor.kbLastUpdated', currentLang() === 'zh' ? '最后更新' : 'Last updated')
         + ': ' + today + '</div>';
    html += '<span class="kb-file-snapshot-host"></span>';
    html += '</div>';

    /* P1.2 — force-directed graph sits at the top of the panel; the
       sectioned text view below stays as the accessible fallback. */
    html += buildKBGraphHtml(nodes);

    /* §6.5 — change log. Keep the most recent 8 entries; older ones
       stay in the session save and are not lost. */
    const history = browserWindow.stateStore.read("boundariesHistory") || [];
    html += renderKnowledgeSections(sections);
    html += renderBoundaryHistory(history);
    cont.innerHTML = html;
    /* P1.2 — attach node click / keyboard handlers via addEventListener
       (NOT inline onclick) so the boot inline-handler hash guard is
       unaffected. Each node opens the shared detail panel. */
    wireKBGraph(cont);
    /* Wire the snapshot button. We capture a one-line summary of
       the section sizes so the user can compare past snapshots
       at a glance (§6.6). */
    const snapshotHost = cont.querySelector<HTMLElement>('.kb-file-snapshot-host');
    if (snapshotHost) {
      renderTutorSnapshotAction(
        snapshotHost,
        ti('tutor.kbSnapshot', currentLang() === 'zh' ? '存档当前版本' : 'Save snapshot'),
        saveBoundarySnapshot
      );
    }
  }

  function saveBoundarySnapshot() {
    const nodes = browserWindow.stateStore.read("kbNodes") || [];
    const counts = { internalized: 0, fuzzy: 0, blank: 0 };
    nodes.forEach(function (n: { status: string; }) {
      const s = n.status === 'internalized' ? 'internalized'
            : n.status === 'fuzzy'        ? 'fuzzy' : 'blank';
      counts[s]++;
    });
    const summary = 'I ' + counts.internalized + ' · F ' + counts.fuzzy + ' · B ' + counts.blank;
    const snap = {
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
    } catch (error) { reportSwallow(error, 'tutorSocratic.js:498'); }
    renderKnowledgeBoundaryFile();
    if (typeof browserWindow.saveCurrentSession === 'function') {
      try { browserWindow.saveCurrentSession(); } catch (error) { reportSwallow(error, 'tutorSocratic.js:501'); }
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
    const cont = document.getElementById('teachingPlanContent');
    if (!cont) return;
    const plan = browserWindow.stateStore.read("teachingPlan");
    let html = '';
    if (plan && plan.subtopics && plan.subtopics.length) {
      const curIdx = plan.currentSubtopicIdx || 0;
      const stage = (browserWindow.stateStore.read("teachingStage") || 'motivate');
      let doneCount = 0;
      plan.subtopics.forEach(function (s: { status: string; }) { if (s.status === 'internalized') doneCount++; });
      const totalCount = plan.subtopics.length;
      const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

      html += '<div class="teaching-plan">';
      html += '<div class="teaching-plan-title">'
           + ti('tutor.planTitle', currentLang() === 'zh' ? '教学计划' : 'Teaching plan')
           + '</div>';
      html += '<div class="teaching-plan-progress">'
           + '<div class="teaching-plan-progress-bar"><div class="teaching-plan-progress-fill" style="width:' + pct + '%"></div></div>'
           + '<div class="teaching-plan-progress-text">' + doneCount + ' / ' + totalCount + ' (' + pct + '%)</div>'
           + '</div>';
      plan.subtopics.forEach(function (s: { status: string; name: unknown; }, i: number) {
        const isCurrent = (i === curIdx && s.status !== 'internalized');
        const isDone = s.status === 'internalized';
        let cls = 'teaching-plan-subtopic';
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
          const subCount = Math.min(browserWindow.stateStore.read("substantiveCount") || 0, 3);
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
    let cont = document.getElementById('practiceProgressChip');
    if (!cont) {
      cont = document.createElement('span');
      cont.id = 'practiceProgressChip';
      cont.className = 'practice-progress-chip tutor-only';
      /* #chatHeader / #chatStats were removed from the shell — anchor the
         chip to .top-bar-left (the model-switcher row) so the practice
         progress pill actually mounts. The tutor-only class keeps it out
         of chat mode. */
      const topBarLeft = document.querySelector('.top-bar-left');
      if (topBarLeft) {
        topBarLeft.appendChild(cont);
      }
    }
    const phase = browserWindow.stateStore.read("practicePhase");
    if (!phase) { cont.innerHTML = ''; return; }
    const attempts = browserWindow.stateStore.read("practiceAttempts") || 0;
    const phaseText = phase === 'foundation'
      ? ti('tutor.practiceFoundation', currentLang() === 'zh' ? '基础' : 'Foundation')
      : ti('tutor.practiceTransfer',   currentLang() === 'zh' ? '变式' : 'Transfer');
    /* Slim inline: phase pill · attempt count. Node name is the
       already-shown in the current sub-topic header so we don't
       repeat it here. */
    const attemptsShort = '·' + attempts;
    cont.innerHTML =
      '<span class="practice-progress-chip-phase">' + esc(phaseText) + '</span>' +
      '<span class="practice-progress-chip-attempts">' + esc(attemptsShort) + '</span>';
  }

  /* ----------------------------------------------------------------
   * Mistake book filter (§9.4)
   *
   * The audit noted the mistake book shows "未消化的练习题" cards
   * with placeholder content. The filter lets the user pick
   * "all" / "unresolved" / "by node" so the view stops being noise.
   * ---------------------------------------------------------------- */
  function setMistakeFilter(value: string) {
    try { stateStore.dispatch({ type: 'state/set', key: 'mistakeFilter', value: value }); } catch (error) { reportSwallow(error, 'tutorSocratic.js:634'); }
    if (typeof browserWindow.renderMistakes === 'function') {
      try { browserWindow.renderMistakes(); } catch (error) { reportSwallow(error, 'tutorSocratic.js:636'); }
    }
  }
  function renderMistakeFilterBar() {
    let cont = document.getElementById('mistakeFilterBar');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'mistakeFilterBar';
      cont.className = 'mistake-filter-bar tutor-only';
      const panel = document.getElementById('mistakesPanel');
      if (panel) panel.insertBefore(cont, panel.firstChild);
    }
    const cur = String(browserWindow.stateStore.read("mistakeFilter") || 'all');
    renderTutorMistakeFilter(cont, {
      value: cur,
      labels: {
        all: ti('tutor.mistakeFilterAll', 'all'),
        unresolved: ti('tutor.mistakeFilterUnresolved', 'unresolved'),
        resolved: ti('tutor.mistakeFilterResolved', 'resolved')
      },
      onChange: setMistakeFilter
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
    if (typeof browserWindow.renderMistakes === 'function') {
      try { browserWindow.renderMistakes(); } catch (error) { reportSwallow(error, 'tutorSocratic.js:692'); }
    }
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
    renderKnowledgeBoundaryFile: renderKnowledgeBoundaryFile,
    saveBoundarySnapshot: saveBoundarySnapshot,
    renderTeachingPlan: renderTeachingPlan,
    renderPracticeProgress: renderPracticeProgress,
    renderMistakeFilterBar: renderMistakeFilterBar,
    recordMistakeNotice: recordMistakeNotice
  };
})();

browserWindow.tutorSocratic = tutorSocraticRuntime;
export type TutorSocraticRuntime = typeof tutorSocraticRuntime;
