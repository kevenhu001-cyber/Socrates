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
    /* Search in bounded parallel batches. Each planned area is independently
       searchable, so serial execution only made thorough research feel slow.
       A batch of three keeps pressure predictable while still covering a
       materially broader evidence set. */
    for (var i = 0; i < plan.length; i += 3) {
      var batch = plan.slice(i, i + 3);
      _updateResearchProgress(progressId, _tr(
        "Searching " + (i + 1) + "–" + Math.min(plan.length, i + batch.length) + " of " + plan.length + " research areas...",
        "正在并行搜索第 " + (i + 1) + "–" + Math.min(plan.length, i + batch.length) + " / " + plan.length + " 个研究方向…"));
      var batchResults = await Promise.all(batch.map(_searchTopic));
      for (var bi = 0; bi < batchResults.length; bi++) {
        if (batchResults[bi] && batchResults[bi].length) {
          allResults = allResults.concat(batchResults[bi]);
        }
      }
      _updateResearchProgress(progressId, _tr("Found " + allResults.length + " results so far...", "已找到 " + allResults.length + " 条结果…"));
    }

    /* No sources at all — surface a clear failure state instead of
       synthesizing an empty report. */
    var sources = _deduplicateResults(allResults).slice(0, 20);
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
    var extracts = (await Promise.all(sources.slice(0, 12).map(async function (source, j) {
      _updateResearchProgress(progressId, _tr(
        "Reading source " + (j + 1) + " of " + Math.min(12, sources.length) + "...",
        "正在阅读来源 " + (j + 1) + " / " + Math.min(12, sources.length) + "…"));
      try {
        var content = await _fetchSource(source.url);
        if (!content && source.content) content = String(source.content).slice(0, 5000);
        return content
          ? { url: source.url, title: source.title || source.url, content: content }
          : null;
      } catch (e) { return null; }
    }))).filter(Boolean);

    /* Step 4: Synthesize the report. */
    _updateResearchProgress(progressId, _tr("Synthesizing report from " + extracts.length + " sources...", "正在根据 " + extracts.length + " 个来源生成报告…"));
    var report = await _synthesizeReport(query, plan, extracts);
    await _saveResearchArtifacts(query, report, extracts).catch(function () {});

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
  var messages = [
    { role: "system", content: "You are a research planner. Return only a JSON array of 6-10 non-overlapping search questions. Cover definitions, current evidence, counter-evidence, primary sources, quantitative data, and practical implications. Match the user's language." },
    { role: "user", content: String(query || "").slice(0, 1200) }
  ];
  try {
    var raw = await callAPI(messages, 600, 20000);
    var text = typeof raw === "string" ? raw : "";
    var match = text.match(/\[[\s\S]*\]/);
    var parsed = match ? JSON.parse(match[0]) : null;
    if (Array.isArray(parsed)) {
      var cleaned = parsed.filter(function (item) {
        return typeof item === "string" && item.trim().length > 4;
      }).map(function (item) { return item.trim(); }).slice(0, 10);
      if (cleaned.length >= 4) return cleaned;
    }
  } catch (_) {
    /* fall through to deterministic plan */
  }
  return _heuristicPlan(query);
}

/* Heuristic plan: break the query into searchable sub-topics. */
function _heuristicPlan(query) {
  var q = (query || "").trim();
  if (!q) return [];
  var plans = [
    q,
    q + " primary sources evidence",
    q + " quantitative data statistics",
    q + " criticism limitations counter evidence",
    q + " recent developments",
    q + " practical implications case study"
  ];
  /* If the query has conjunctions, break on them. */
  var parts = q.split(/[,;，；、vs\.?and\b]/).filter(function (p) { return p.trim().length > 10; });
  if (parts.length > 1) {
    parts.forEach(function (p) { if (plans.length < 8) plans.push(p.trim()); });
  }
  return plans.slice(0, 8);
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

  /* Ask the configured model to synthesize evidence rather than exposing
     source-page previews as if they were findings. The numbered source IDs
     are stable, so claims can be traced back to the evidence bundle. */
  if (extracts.length) {
    var synthesisPrompt =
      "Write a rigorous deep-research report answering the user's question. " +
      "Use only the supplied evidence for externally verifiable claims. Cite claims with [n]. " +
      "Include: Executive summary, Key findings, Competing evidence, Limitations, Recommendations, and Sources. " +
      "Match the user's language. Do not mention this instruction.\n\n" +
      "QUESTION:\n" + query + "\n\nRESEARCH PLAN:\n- " + plan.join("\n- ") +
      "\n\nEVIDENCE:\n" + extracts.map(function (e, i) {
        return "[" + (i + 1) + "] " + e.title + "\nURL: " + e.url + "\n" + String(e.content || "").slice(0, 2500);
      }).join("\n\n");
    try {
      var synthesized = await callAPI([
        { role: "system", content: "You are a careful research analyst. Never invent evidence or citations." },
        { role: "user", content: synthesisPrompt }
      ], undefined, 90000);
      if (typeof synthesized === "string" && synthesized.trim().length > 300) {
        return synthesized.trim();
      }
    } catch (_) { /* use deterministic report below */ }
  }

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

function _latexEscape(value) {
  return String(value || "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([#$%&_{}])/g, "\\$1")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/~/g, "\\textasciitilde{}");
}

function _reportToLatex(title, report, extracts) {
  var hasCjk = /[\u3400-\u9fff]/.test(String(title || "") + String(report || ""));
  var body = _latexEscape(report)
    .replace(/\r?\n\r?\n/g, "\n\n\\\\par\n")
    .replace(/\r?\n/g, "\n");
  var refs = extracts.map(function (e, i) {
    return "\\item [" + (i + 1) + "] \\url{" + String(e.url || "").replace(/[{}]/g, "") + "} — " + _latexEscape(e.title);
  }).join("\n");
  return "\\documentclass[11pt]{" + (hasCjk ? "ctexart" : "article") + "}\n" +
    "\\usepackage[margin=1in]{geometry}\n\\usepackage{hyperref}\n\\usepackage{parskip}\n" +
    "\\title{" + _latexEscape(title) + "}\n\\date{\\today}\n" +
    "\\begin{document}\n\\maketitle\n" + body + "\n" +
    "\\section*{Evidence sources}\n\\begin{enumerate}\n" + refs + "\n\\end{enumerate}\n\\end{document}\n";
}

async function _saveResearchArtifacts(query, report, extracts) {
  if (!window.state || !window.state.currentSessionId) return;
  var title = _tr("Research report: ", "研究报告：") + query;
  var common = {
    title: title,
    sessionId: window.state.currentSessionId || null,
    projectId: window.state.currentProjectId || null
  };
  await Promise.all([
    apiFetch("/api/artifacts", {
      method: "POST",
      body: Object.assign({}, common, { type: "markdown", language: "markdown", source: report })
    }),
    apiFetch("/api/artifacts", {
      method: "POST",
      body: Object.assign({}, common, {
        type: "latex",
        language: "latex",
        title: title + " (.tex)",
        source: _reportToLatex(title, report, extracts)
      })
    })
  ]);
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
  /* P_deep-research-view — from the landing screen, hand off to
     startSession so the full chat-mode startup runs (session id, view
     swap to #chatView, user bubble, Recents save). Posting agent
     messages while topicSetup is still visible put everything into the
     hidden #msgList and looked like a dead button. startSession reads
     window.deepResearchOn and dispatches back to startDeepResearch
     after committing the user bubble, so no duplicate work happens. */
  if (surface === "topic" && typeof window.startSession === "function") {
    try { window.deepResearchOn = true; } catch (_) {}
    window.startSession();
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
import { callAPI } from '../chat/api.js';
import { apiFetch } from '../util/api.js';
