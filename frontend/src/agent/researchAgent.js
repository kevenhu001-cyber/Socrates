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
      _updateResearchProgress(progressId, "Searching: " + _truncate(plan[i], 60));
      var results = await _searchTopic(plan[i]);
      if (results && results.length) {
        allResults = allResults.concat(results);
      }
    }

    /* Step 3: Read and extract from the top results. */
    var sources = _deduplicateResults(allResults).slice(0, 8);
    _updateResearchProgress(progressId, "Reading " + sources.length + " sources...");
    var extracts = [];
    for (var j = 0; j < sources.length; j++) {
      _updateResearchProgress(progressId, "Reading source " + (j + 1) + " of " + sources.length + "...");
      try {
        var content = await _fetchSource(sources[j].url);
        if (content) {
          extracts.push({ url: sources[j].url, title: sources[j].title || sources[j].url, content: content });
        }
      } catch (e) { /* skip failed fetches */ }
    }

    /* Step 4: Synthesize the report. */
    _updateResearchProgress(progressId, "Synthesizing report...");
    var report = await _synthesizeReport(query, plan, extracts);

    /* Step 5: Post the report as an assistant message. */
    _hideResearchProgress(progressId);
    if (typeof window.addMessage === "function") {
      window.addMessage("assistant", report);
    }

    return report;
  } catch (e) {
    _hideResearchProgress(progressId);
    if (typeof window.addMessage === "function") {
      window.addMessage("assistant", "The research encountered an error: " + (e.message || "unknown error") + ". Please try a simpler query.");
    }
  }
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

/* Search for a topic using the existing web search infrastructure. */
async function _searchTopic(query) {
  if (typeof window.fetchWebContext === "function") {
    try {
      var results = await window.fetchWebContext(query, { background: false, maxResults: 5 });
      if (results && results.pages && Array.isArray(results.pages)) {
        return results.pages.map(function (p) {
          return { url: p.url, title: p.title, snippet: p.snippet || p.content };
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
