import { sanitizeUrl } from "../util/safe.js";
import { copyText, setCopyFeedback, trTool } from "./toolCardHelpers.js";

function hostFromUrl(url) {
  try {
    if (!url || url === "#") return "";
    return new URL(url).host.replace(/^www\./, "");
  } catch (_) {
    return "";
  }
}

function normalizeSearchResults(results) {
  const seen = new Set();
  return results.reduce(function (normalized, source) {
    source = source || {};
    const rawUrl = String(source.url || "").trim();
    const url = sanitizeUrl(rawUrl);
    const title = String(source.title || rawUrl || "Untitled result").trim();
    const key = (url || "#") + "\n" + title.toLowerCase();
    if (seen.has(key)) return normalized;
    seen.add(key);
    normalized.push({
      title,
      rawUrl,
      url,
      host: hostFromUrl(url),
      snippet: String(source.snippet || source.description || "").trim(),
      date: String(source.date || source.published || "").trim(),
      source: String(source.source || source.engine || "").trim(),
      matchedQuery: String(source.matchedQuery || "").trim(),
    });
    return normalized;
  }, []);
}

function createCopyAction(className, label, getText) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    copyText(getText()).then(function () { setCopyFeedback(button, true); })
      .catch(function () { setCopyFeedback(button, false); });
  });
  return button;
}

function sourceCitation(source, index) {
  return "[" + (index + 1) + "] " + source.title
    + (source.url && source.url !== "#" ? " - " + source.url : "");
}

function createSearchHeader(sources, query) {
  const head = document.createElement("div");
  head.className = "wsr-header";
  const summary = document.createElement("span");
  summary.className = "wsr-summary";
  const singular = sources.length === 1;
  summary.textContent = trTool(
    singular ? "tool.sourceForQuery" : "tool.sourcesForQuery",
    singular ? '{n} source for "{query}"' : '{n} sources for "{query}"',
    { n: sources.length, query }
  );
  head.appendChild(summary);
  head.appendChild(createCopyAction(
    "wsr-copy-all",
    trTool("tool.copySources", "Copy sources"),
    function () { return sources.map(sourceCitation).join("\n"); }
  ));
  return head;
}

function createResultLink(source) {
  const title = document.createElement("a");
  title.className = "wsr-title";
  title.href = source.url || "#";
  title.textContent = source.title;
  if (source.url && source.url !== "#") {
    title.target = "_blank";
    title.rel = "noopener noreferrer";
  } else {
    title.classList.add("is-disabled");
    title.setAttribute("aria-disabled", "true");
    title.setAttribute("tabindex", "-1");
  }
  return title;
}

function appendResultMetadata(body, source) {
  const meta = document.createElement("div");
  meta.className = "wsr-meta";
  const host = document.createElement("span");
  host.className = "wsr-host";
  host.textContent = source.host || trTool("tool.linkUnavailable", "Link unavailable");
  meta.appendChild(host);
  if (source.source) {
    const engine = document.createElement("span");
    engine.className = "wsr-source";
    engine.textContent = source.source;
    meta.appendChild(engine);
  }
  if (source.date) {
    const date = document.createElement("span");
    date.className = "wsr-date";
    date.textContent = source.date;
    meta.appendChild(date);
  }
  body.appendChild(meta);
}

function createSearchResultItem(source, index) {
  const item = document.createElement("article");
  item.className = "wsr-item";
  if (!source.host) item.classList.add("wsr-item-muted");

  const idx = document.createElement("span");
  idx.className = "wsr-index";
  idx.textContent = "[" + (index + 1) + "]";
  idx.title = source.host || trTool("tool.unavailableSource", "Unavailable source");
  item.appendChild(idx);

  const body = document.createElement("div");
  body.className = "wsr-body";
  body.appendChild(createResultLink(source));
  appendResultMetadata(body, source);
  if (source.snippet) {
    const snippet = document.createElement("p");
    snippet.className = "wsr-snippet";
    snippet.textContent = source.snippet;
    body.appendChild(snippet);
  }

  const actions = document.createElement("div");
  actions.className = "wsr-actions";
  actions.appendChild(createCopyAction(
    "wsr-copy",
    trTool("tool.copyCitation", "Copy citation"),
    function () { return sourceCitation(source, index); }
  ));
  body.appendChild(actions);
  item.appendChild(body);
  return item;
}

/* Build search results with text nodes and sanitized links so untrusted
   provider payloads cannot escape into tool card markup. */
export function renderWebSearchResults(out, results, query) {
  if (!out || !Array.isArray(results) || !results.length) return false;
  const sources = normalizeSearchResults(results);
  if (!sources.length) return false;

  const wrap = document.createElement("div");
  wrap.className = "web-search-results";
  if (query) wrap.appendChild(createSearchHeader(sources, query));
  sources.forEach(function (source, index) {
    wrap.appendChild(createSearchResultItem(source, index));
  });
  out.replaceChildren(wrap);
  out.classList.remove("error");
  return true;
}
