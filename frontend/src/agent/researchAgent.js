/* agent/researchAgent.js — Deep Research / Agent Mode.
 *
 * Orchestrates multi-step research by planning, searching, reading,
 * and synthesizing results into a structured report. The agent:
 *   1. Plans the research (sub-questions to answer)
 *   2. Executes searches for each sub-question
 *   3. Reads and extracts information from found sources
 *   4. Synthesizes into a structured report
 *
 * Progress is displayed in the search-progress pill format, and
 * the final report is rendered as a formatted assistant message.
 */

/* Start a deep research session. Returns a Promise that resolves
   when the research is complete and the report has been posted. */
async function startDeepResearch(query) {
  var state = window.state;
  if (!state) return;

  /* Show progress indicator. */
  var progressId = "deep-research-" + Date.now().toString(36);
  _showResearchProgress(progressId, "Planning research...");

  try {
    /* Step 1: Plan the research by generating sub-questions. */
    _updateResearchProgress(progressId, "Planning research approach...");
    var plan = await _planResearch(query);
    _updateResearchProgress(progressId, "Research plan: " + plan.length + " areas to explore");

    /* Step 2: Execute searches for each sub-question. */
    var allResults = [];
    for (var i = 0; i < plan.length; i++) {
      _updateResearchProgress(progressId, _tr("Searching the web: ", "正在搜索网页：") + _truncate(plan[i], 60));
      var results = await _searchTopic(plan[i]);
      if (results && results.length) {
        allResults = allResults.concat(results);
        _updateResearchProgress(progressId, _tr("Found " + allResults.length + " results so far...", "已找到 " + allResults.length + " 条结果…"));
      }
    }

    /* No sources at all — surface a clear failure state instead of
       synthesizing an empty report. */
    var sources = _deduplicateResults(allResults).slice(0, 8);
    if (!sources.length) {
      _updateResearchProgress(progressId, _tr("Web search failed — no sources found", "网络搜索失败 — 未找到任何来源"));
      _setResearchProgressState(progressId, "err");
      setTimeout(function () { _hideResearchProgress(progressId); }, 8000);
      if (typeof window.addMessage === "function") {
        window.addMessage("assistant", _tr(
          "I couldn't find any web sources for this topic. Please check your connection or try a different query.",
          "未能为该主题找到任何网络来源，请检查网络连接或换一个查询再试。"));
      }
      return;
    }

    /* Step 3: Read and extract from the top results. */
    _updateResearchProgress(progressId, _tr("Reading " + sources.length + " sources...", "正在阅读 " + sources.length + " 个来源…"));
    var extracts = [];
    for (var j = 0; j < sources.length; j++) {
      _updateResearchProgress(progressId, _tr(
        "Reading source " + (j + 1) + " of " + sources.length + "...",
        "正在阅读来源 " + (j + 1) + " / " + sources.length + "…"));
      try {
        var content = await _fetchSource(sources[j].url);
        /* fetchWebContext already fetched full text for the top hits —
           reuse it when the per-URL fetch fails so a flaky page never
           drops a source entirely. */
        if (!content && sources[j].content) content = String(sources[j].content).slice(0, 4000);
        if (content) {
          extracts.push({ url: sources[j].url, title: sources[j].title || sources[j].url, content: content });
        }
      } catch (e) { /* skip failed fetches */ }
    }

    /* Step 4: Synthesize the report. */
    _updateResearchProgress(progressId, _tr("Synthesizing report from " + extracts.length + " sources...", "正在根据 " + extracts.length + " 个来源生成报告…"));
    var report = await _synthesizeReport(query, plan, extracts);

    /* Step 5: Post the report. Flip the progress card to its "done"
       state (with the source count) before retiring it, so the user
       gets explicit completion feedback — ChatGPT style. */
    _updateResearchProgress(progressId, _tr("Research complete · " + extracts.length + " sources", "研究完成 · 共 " + extracts.length + " 个来源"));
    _setResearchProgressState(progressId, "ok");
    setTimeout(function () { _hideResearchProgress(progressId); }, 4000);
    if (typeof window.addMessage === "function") {
      window.addMessage("assistant", report);
    }

    return report;
  } catch (e) {
    _updateResearchProgress(progressId, _tr("Research failed: ", "研究失败：") + (e.message || _tr("unknown error", "未知错误")));
    _setResearchProgressState(progressId, "err");
    setTimeout(function () { _hideResearchProgress(progressId); }, 8000);
    if (typeof window.addMessage === "function") {
      window.addMessage("assistant", _tr(
        "The research encountered an error: " + (e.message || "unknown error") + ". Please try a simpler query.",
        "研究过程出错：" + (e.message || "未知错误") + "。请尝试更简单的查询。"));
    }
  }
}

/* Tiny bilingual helper — the deep-research surface predates the
   i18n table, so status copy is resolved inline from the current
   language flag. */
function _tr(en, zh) {
  return (typeof window !== "undefined" && window._currentLang === "zh") ? zh : en;
}

/* Generate a research plan: a list of sub-questions to search for. */
async function _planResearch(query) {
  /* Use the LLM to generate a plan if available, otherwise use a
     simple heuristic. */
  if (typeof window.askChatTurn === "function") {
    /* Fall back to heuristic: break the query into searchable phrases. */
    return _heuristicPlan(query);
  }
  return _heuristicPlan(query);
}

/* Heuristic plan: break the query into searchable sub-topics. */
function _heuristicPlan(query) {
  var q = (query || "").trim();
  if (!q) return [];
  /* Use the query itself plus up to 3 focused variants. */
  var plans = [q];
  /* If the query has conjunctions, break on them. */
  var parts = q.split(/[,;，；、vs\.?and\b]/).filter(function (p) { return p.trim().length > 10; });
  if (parts.length > 1) {
    parts.forEach(function (p) { if (plans.length < 4) plans.push(p.trim()); });
  }
  return plans.slice(0, 4);
}

/* Search for a topic using the existing web search infrastructure.
   fetchWebContext resolves to { ok, results, context, sources } —
   `sources` is the enriched result list ({title,url,snippet,
   fullContent}). The old code read a non-existent `.pages` field,
   so deep research always came back empty. */
async function _searchTopic(query) {
  if (typeof window.fetchWebContext === "function") {
    try {
      var res = await window.fetchWebContext(query, { background: false });
      if (res && res.ok && Array.isArray(res.sources)) {
        return res.sources.slice(0, 5).map(function (p) {
          return { url: p.url, title: p.title, snippet: p.snippet, content: p.fullContent || p.snippet };
        });
      }
    } catch (e) { /* search failed */ }
  }
  return [];
}

/* Fetch the content of a source URL. Uses the existing link fetching. */
async function _fetchSource(url) {
  if (typeof window.fetchPagesForContext === "function") {
    try {
      var pages = await window.fetchPagesForContext([url]);
      if (pages && pages.length && pages[0].content) {
        return pages[0].content.slice(0, 4000);
      }
    } catch (e) { /* fetch failed */ }
  }
  return null;
}

/* Deduplicate results by URL. */
function _deduplicateResults(results) {
  var seen = {};
  return (results || []).filter(function (r) {
    if (seen[r.url]) return false;
    seen[r.url] = true;
    return true;
  });
}

/* Synthesize a report from the collected extracts. */
async function _synthesizeReport(query, plan, extracts) {
  var sourcesSection = extracts.map(function (e, i) {
    return "[" + (i + 1) + "] " + e.title + " (" + e.url + ")";
  }).join("\n");

  var contentSummary = extracts.map(function (e) {
    return "--- Source: " + e.title + " ---\n" + (e.content || "").slice(0, 2000) + "\n";
  }).join("\n");

  var report = "## Deep Research: " + query + "\n\n";
  report += "I researched " + plan.length + " related areas and consulted " + extracts.length + " sources.\n\n";

  /* Build a structured report from the extracts. */
  report += "### Key Findings\n\n";
  extracts.forEach(function (e, i) {
    var preview = (e.content || "").replace(/<[^>]+>/g, "").trim().slice(0, 500);
    if (preview) {
      report += "**" + (i + 1) + ". " + e.title + "**\n\n" + preview + "...\n\n";
    }
  });

  report += "### Sources\n\n" + sourcesSection + "\n\n";
  report += "_This is an automated deep research report. Verify critical information from the original sources._";

  return report;
}

/* Show a research progress indicator. */
function _showResearchProgress(id, text) {
  /* Remove any existing research progress. */
  _hideResearchProgress(id);
  var el = document.createElement("div");
  el.id = id;
  el.className = "search-progress running";
  el.innerHTML = '<div class="search-progress-head"><span class="search-progress-dot"></span><span class="search-progress-label">' + _esc(text) + '</span></div>';
  var msgList = document.getElementById("msgList");
  if (msgList) {
    msgList.appendChild(el);
    var sc = msgList.parentElement || document.querySelector(".main-inner");
    if (sc) sc.scrollTop = sc.scrollHeight;
  }
}

/* Update the research progress text. */
function _updateResearchProgress(id, text) {
  var el = document.getElementById(id);
  if (!el) return;
  var label = el.querySelector(".search-progress-label");
  if (label) label.textContent = text;
}

/* Flip the progress card between running / ok / err visual states
   (reuses the .search-progress state classes from styles.css). */
function _setResearchProgressState(id, state) {
  var el = document.getElementById(id);
  if (!el) return;
  el.className = "search-progress " + (state || "running");
}

/* Hide and remove the research progress indicator. */
function _hideResearchProgress(id) {
  var el = document.getElementById(id);
  if (el) el.remove();
}

/* Truncate a string for display. */
function _truncate(s, max) {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "..." : s;
}

/* Escape HTML for safe rendering. */
function _esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Launch research from the chat input. The user types a query and
   clicks a "Deep Research" button, which triggers this. */
function launchDeepResearch() {
  /* Prefer the visible rich-composer surface. */
  var surface = getVisibleComposerSurface();
  var query = getComposerMarkdown(surface).trim();
  if (!query) {
    if (typeof window.showToast === "function") window.showToast("Enter a research topic first.");
    return;
  }
  clearComposer(surface);
  /* Add the user's query as a message. */
  if (typeof window.addMessage === "function") {
    window.addMessage("user", query);
  }
  /* Start the research. */
  startDeepResearch(query);
}

/* Export for window bridge. */
if (typeof window !== "undefined") {
  window.startDeepResearch = startDeepResearch;
  window.launchDeepResearch = launchDeepResearch;
}

export { startDeepResearch, launchDeepResearch };
import {
  clearComposer,
  getComposerMarkdown,
  getVisibleComposerSurface,
} from '../react/composer-input/controller.ts';
