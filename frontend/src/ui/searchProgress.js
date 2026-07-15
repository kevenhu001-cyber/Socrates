/* ui/searchProgress.js — extracted from main.js (Search Progress Log).
 * A streaming, collapsible activity log that surfaces each step of
 * fetchWebContext as it happens.
 *
 * Exports: SEARCH_PROGRESS_LABELS, trSearchLabel, _formatEngineBreakdown,
 *          startSearchProgress
 *
 * Reads from window.*: _currentLang, scrollMainToBottom
 */

import { esc } from '../render/helpers.js';

export var SEARCH_PROGRESS_LABELS = {
  en: {
    started:    'Searching the web for "\u007Btopic\u007D"',
    expanding:  'Tried {n} query variants',
    querying:   'Q: {query}',
    got_results:'  \u00B7 {n} results',
    retry:      '\u21BB First round was thin. Retrying with the original query\u2026',
    fetching:   'Reading {n} pages\u2026',
    fetched:    '[OK] Read {ok}/{total} pages',
    scored:     '  \u00B7 top match {topRel}% relevance',
    filtered:   '  \u00B7 kept {kept}, dropped {dropped}',
    good:       '[OK] Quality OK ({score}/5)',
    retry_low:  '\u21BB First round was thin. AI rewriting the query\u2026',
    retry_rewrote:'\u21BB New query: {q}',
    retry_still_bad:'\u21BB Still thin. Proceeding with what we have.',
    done:       '{n} sources \u00B7 {engines} \u00B7 {fetched} read',
    error:      'Search failed: {msg}',
    warn:       '[!] {msg}',
    cancelled:  'Search cancelled.',
    ceiling:    'Search exceeded {sec}s \u2014 proceeding without web context.',
  },
  zh: {
    started:    '\u6B63\u5728\u641C\u7D22\uFF1A\u201C{topic}\u201D',
    expanding:  '\u5C1D\u8BD5\u4E86 {n} \u4E2A\u67E5\u8BE2\u53D8\u4F53',
    querying:   '{query}',
    got_results:'  \u00B7 {n} \u6761\u7ED3\u679C',
    retry:      '\u21BB \u7B2C\u4E00\u8F6E\u7ED3\u679C\u504F\u5C11\uFF0C\u6B63\u5728\u7528\u539F\u67E5\u8BE2\u91CD\u8BD5\u2026',
    fetching:   '\u6B63\u5728\u9605\u8BFB {n} \u4E2A\u9875\u9762\u2026',
    fetched:    '[OK] \u5DF2\u8BFB {ok}/{total} \u4E2A\u9875\u9762',
    scored:     '  \u00B7 \u6700\u4F73\u5339\u914D\u76F8\u5173\u5EA6 {topRel}%',
    filtered:   '  \u00B7 \u4FDD\u7559 {kept}\uFF0C\u5254\u9664 {dropped}',
    good:       '[OK] \u8D28\u91CF\u826F\u597D\uFF08{score}/5\uFF09',
    retry_low:  '\u21BB \u7B2C\u4E00\u8F6E\u7ED3\u679C\u504F\u5C11\uFF0CAI \u6B63\u5728\u6539\u5199\u67E5\u8BE2\u2026',
    retry_rewrote:'\u21BB \u65B0\u67E5\u8BE2\uFF1A{q}',
    retry_still_bad:'\u21BB \u4ECD\u4E0D\u7406\u60F3\uFF0C\u7EE7\u7EED\u3002',
    done:       '{n} \u6761\u6765\u6E90 \u00B7 {engines} \u00B7 \u5DF2\u8BFB {fetched}',
    error:      '\u641C\u7D22\u5931\u8D25\uFF1A{msg}',
    warn:       '[!] {msg}',
    cancelled:  '\u641C\u7D22\u5DF2\u53D6\u6D88\u3002',
    ceiling:    '\u641C\u7D22\u8D85\u8FC7 {sec}s \uFF0C\u5C06\u5728\u6CA1\u6709\u7F51\u7EDC\u4E0A\u4E0B\u6587\u7684\u60C5\u51B5\u4E0B\u7EE7\u7EED\u3002',
  },
};

export function trSearchLabel(key, vars) {
  var lang = (typeof window !== "undefined" && window._currentLang === 'zh') ? 'zh' : 'en';
  var labels = SEARCH_PROGRESS_LABELS[lang] || SEARCH_PROGRESS_LABELS.en;
  var tpl = labels[key] || (SEARCH_PROGRESS_LABELS.en[key] || key);
  if (!vars) return tpl;
  return tpl.replace(/\{(\w+)\}/g, function (m, name) {
    return (vars[name] != null) ? String(vars[name]) : m;
  });
}

export function _formatEngineBreakdown(engines) {
  if (!engines || typeof engines !== 'object') return '';
  var keys = Object.keys(engines);
  if (!keys.length) return '';
  keys.sort(function (a, b) { return (engines[b] - engines[a]) || (a < b ? -1 : 1); });
  return keys.map(function (k) {
    var labelMap = { bing: 'Bing', google: 'Google', baidu: 'Baidu',
                     wikipedia: 'Wikipedia', arxiv: 'arXiv', ddg: 'DDG',
                     web: 'Web' };
    var label = labelMap[k] || k;
    return label + ' \u00D7' + engines[k];
  }).join(', ');
}

export function startSearchProgress(topic, opts) {
  opts = opts || {};
  var mount = opts.mount;
  if (!mount) {
    var lastAssistant = document.querySelector('.msg.assistant:last-child .msg-body');
    if (lastAssistant) mount = lastAssistant;
  }
  if (!mount) {
    var diag = document.querySelector('#diagnosticView .diag-loading-text, #diagnosticView .diag-loading');
    if (diag) mount = diag;
  }
  var root = document.createElement('div');
  root.className = 'search-progress running';
  if (opts.collapsed === false) root.classList.add('open');

  var head = document.createElement('div');
  head.className = 'search-progress-head';
  head.innerHTML =
    '<span class="search-progress-pulse"></span>' +
    '<span class="search-progress-title">' + esc(trSearchLabel('started', { topic: topic || '' })) + '</span>' +
    '<span class="search-progress-chev">\u25BE</span>';
  root.appendChild(head);

  var stepsList = document.createElement('ul');
  stepsList.className = 'search-progress-steps';
  root.appendChild(stepsList);

  if (mount) {
    if (mount.firstChild) mount.insertBefore(root, mount.firstChild);
    else mount.appendChild(root);
  } else {
    root.classList.add('search-progress-floating');
    var msgList = document.getElementById('msgList');
    if (msgList && msgList.parentNode) {
      msgList.parentNode.insertBefore(root, msgList.nextSibling);
    } else {
      document.body.appendChild(root);
    }
  }

  head.addEventListener('click', function () { root.classList.toggle('open'); });

  function makeStepEl(text, kind) {
    var li = document.createElement('li');
    li.className = 'search-progress-step ' + (kind || 'running');
    var icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = kind === 'ok' ? '+' : kind === 'warn' ? '!' : kind === 'err' ? 'x' : '\u00B7';
    var t = document.createElement('span');
    t.className = 'text';
    t.textContent = text;
    li.appendChild(icon);
    li.appendChild(t);
    stepsList.appendChild(li);
    return li;
  }

  var pendingSteps = [];
  var rafScheduled = false;
  function scheduleFlush() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(function () {
      rafScheduled = false;
      var pending = pendingSteps;
      pendingSteps = [];
      for (var i = 0; i < pending.length; i++) {
        var p = pending[i];
        makeStepEl(p.text, p.kind);
        if (p.autoscroll && typeof window.scrollMainToBottom === 'function') window.scrollMainToBottom();
      }
    });
  }

  function renderEvent(ev) {
    var d = ev.data || {};
    switch (ev.kind) {
      case 'started':
        return null;
      case 'expanding':
        return { text: trSearchLabel('expanding', { n: d.count || 0 }), kind: 'running' };
      case 'querying':
        return { text: trSearchLabel('querying', { query: d.query || '' }), kind: 'running' };
      case 'got_results':
        return { text: trSearchLabel('got_results', { n: d.count || 0 }), kind: d.count > 0 ? 'ok' : 'warn' };
      case 'retry':
        return { text: trSearchLabel('retry'), kind: 'warn' };
      case 'fetching':
        return { text: trSearchLabel('fetching', { n: d.count || 0 }), kind: 'running' };
      case 'fetched':
        if (d.error) return { text: trSearchLabel('warn', { msg: d.error }), kind: 'warn' };
        return { text: trSearchLabel('fetched', { ok: d.okCount || 0, total: d.total || 0 }), kind: d.okCount > 0 ? 'ok' : 'warn' };
      case 'scored':
        return { text: trSearchLabel('scored', { topRel: d.topRel || 0 }), kind: 'running' };
      case 'filtered':
        return { text: trSearchLabel('filtered', { kept: d.keptCount || 0, dropped: d.droppedCount || 0 }), kind: 'running' };
      case 'done':
        return null;
      case 'error':
        return { text: trSearchLabel('error', { msg: d.message || 'failed' }), kind: 'err' };
      default:
        return null;
    }
  }

  function appendSynthetic(text, kind) {
    pendingSteps.push({ text: text, kind: kind || 'running', autoscroll: true });
    scheduleFlush();
  }

  function onStep(ev) {
    var step = renderEvent(ev);
    if (step) appendSynthetic(step.text, step.kind);
  }

  function finalize(summary) {
    summary = summary || {};
    var st = summary.state || 'ok';
    root.classList.remove('running');
    root.classList.add(st);
    var titleEl = head.querySelector('.search-progress-title');
    var chev = head.querySelector('.search-progress-chev');
    if (opts.collapsed === false) {
      /* Keep .open. */
    } else {
      root.classList.remove('open');
    }
    if (chev) chev.style.display = '';
    if (st === 'err') {
      if (titleEl) titleEl.textContent = trSearchLabel('error', { msg: summary.message || 'failed' });
    } else if (st === 'warn') {
      if (titleEl) titleEl.textContent = trSearchLabel('warn', { msg: summary.message || '' });
    } else {
      var engineStr = _formatEngineBreakdown(summary.engines);
      if (titleEl) {
        titleEl.textContent = trSearchLabel('done', {
          n: summary.finalCount || 0,
          engines: engineStr || '\u2014',
          fetched: summary.fetchedCount || 0,
        });
      }
    }
  }

  function remove() {
    if (root && root.parentNode) root.parentNode.removeChild(root);
  }

  return {
    onStep: onStep,
    appendStep: appendSynthetic,
    finalize: finalize,
    remove: remove,
  };
}
