import { esc } from '../render/helpers.js';

/* Build a collapsible "Sources" card listing the URLs the model had
   access to. The card is appended to the assistant bubble so the user
   can trace any cited fact back to its source. */
export function renderSourcesCard(results) {
  if (!Array.isArray(results) || !results.length) return null;
  var wrap = document.createElement("div");
  wrap.className = "sources-card";
  var first = results[0];
  var rest = results.slice(1);
  var html = "";
  html += '<div class="sources-head" onclick="this.parentElement.classList.toggle(\'open\')">';
  html += '<span class="sources-icon">↗</span>';
  html += '<span class="sources-label">Sources</span>';
  html += '<span class="sources-count">' + results.length + '</span>';
  if (rest.length) html += '<span class="sources-chev">▾</span>';
  html += '</div>';
  html += renderSourceRow(first, 1, { expanded: true });
  if (rest.length) {
    html += '<div class="sources-rest">';
    for (var i = 0; i < rest.length; i++) html += renderSourceRow(rest[i], i + 2);
    html += '</div>';
  }
  wrap.innerHTML = html;

  wrap.addEventListener('click', function (ev) {
    var t = ev.target;
    var copyBtn = t.closest && t.closest('.sources-copy');
    if (copyBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      var u = copyBtn.getAttribute('data-copy-url') || '';
      copyToClipboard(u).then(function () {
        var orig = copyBtn.innerHTML;
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = copyBtn.innerHTML.replace('Copy URL', 'Copied');
        setTimeout(function () {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = orig;
        }, 1400);
      }).catch(function () {
        try {
          if (typeof window.showToast === "function") window.showToast('Copy failed');
        } catch (_) {}
      });
      return;
    }
    var row = t.closest && t.closest('a.sources-row[data-sources-toggle]');
    if (row) {
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      ev.stopPropagation();
      var wrap2 = row.parentElement;
      if (!wrap2) return;
      var opened = wrap2.classList.toggle('open');
      row.setAttribute('aria-expanded', opened ? 'true' : 'false');
    }
  });

  return wrap;
}

function copyToClipboard(text) {
  if (!text) return Promise.resolve(false);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text)
      .then(function () { return true; })
      .catch(function () { return copyToClipboardFallback(text); });
  }
  return Promise.resolve(copyToClipboardFallback(text));
}

function copyToClipboardFallback(text) {
  try {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

function renderSourceRow(s, idx, opts) {
  if (!s || !s.url) return "";
  opts = opts || {};
  var url = String(s.url);
  if (url.indexOf("http://") !== 0 && url.indexOf("https://") !== 0) {
    return '<div class="sources-row" data-bad-url="1"><span class="sources-num">[' + idx + ']</span><span class="sources-title">' + esc(s.title || "(no title)") + '</span><span class="sources-bad">non-http url</span></div>';
  }
  var title = esc(s.title || url);
  var host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (_) {}

  return '' +
    '<div class="sources-row-wrap' + (opts.expanded ? ' open' : '') + '">' +
      '<a class="sources-row" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" ' +
           'data-sources-toggle="1" aria-expanded="' + (opts.expanded ? 'true' : 'false') + '">' +
        '<span class="sources-num">[' + idx + ']</span>' +
        '<span class="sources-title">' + title + '</span>' +
        '<span class="sources-host">' + esc(host) + '</span>' +
        '<span class="sources-row-chev" aria-hidden="true">▾</span>' +
      '</a>' +
      renderSourceDetail(s, idx) +
    '</div>';
}

function renderSourceDetail(s, idx) {
  var url = String(s.url);
  var html = '<div class="sources-detail" role="region" aria-label="Source ' + idx + ' details">';
  var engine = s.source || 'web';
  var engineLabel = ({ 'minimax-cli': 'MiniMax CLI', 'minimax': 'MiniMax', 'bing': 'Bing', 'searxng': 'SearXNG' })[engine] || engine;

  html += '<div class="sources-meta-row">';
  html += '<span class="sources-engine-pill" data-engine="' + esc(engine) + '"><span class="sources-engine-dot"></span>' + esc(engineLabel) + '</span>';
  if (s.date) html += '<span class="sources-date">' + esc(s.date) + '</span>';
  if (typeof s._relevance === 'number') {
    var relLabel = s._relevance >= 70 ? 'high relevance' : s._relevance >= 45 ? 'medium relevance' : 'low relevance';
    var relClass = s._relevance >= 70 ? 'high' : s._relevance >= 45 ? 'med' : 'low';
    html += '<span class="sources-relevance" data-rel="' + relClass + '">' + relLabel + '</span>';
  }
  html += '</div>';

  if (s.snippet) {
    html += '<div class="sources-snippet">' + esc(s.snippet) + '</div>';
  } else {
    html += '<div class="sources-snippet sources-snippet-empty">No snippet available.</div>';
  }

  if (s.matchedQuery) {
    html += '<div class="sources-matched-q">Matched query: <code>' + esc(s.matchedQuery) + '</code></div>';
  }

  if (s.fullContent) {
    var excerpt = s.fullContent.length > 1200 ? s.fullContent.slice(0, 1197) + '…' : s.fullContent;
    var truncatedTag = s.truncated ? ' <span class="sources-truncated-tag">(truncated excerpt)</span>' : '';
    html += '<details class="sources-fulltext">' +
              '<summary>Full text excerpt' + truncatedTag + '</summary>' +
              '<div class="sources-fulltext-body">' + esc(excerpt) + '</div>' +
            '</details>';
  }

  html += '<div class="sources-actions">' +
            '<a class="sources-open" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
              '<svg class="icon-inline" viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">' +
                '<path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A.5.5 0 0 0 1 3.5v10A.5.5 0 0 0 1.5 14h10a.5.5 0 0 0 .5-.5V7.864a.5.5 0 0 0-1 0V13H2V4h5.136a.5.5 0 0 0 .5-.5z"/>' +
                '<path d="M14 .5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0 0 1H12.79l-7.147 7.146a.5.5 0 0 0 .708.708L13.5 1.707V3.5a.5.5 0 0 0 1 0v-3z"/>' +
              '</svg>' +
              ' Open original' +
            '</a>' +
            '<button type="button" class="sources-copy" data-copy-url="' + esc(url) + '">' +
              '<svg class="icon-inline" viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">' +
                '<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/>' +
                '<path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>' +
              '</svg>' +
              ' Copy URL' +
            '</button>' +
          '</div>';

  html += '</div>';
  return html;
}
