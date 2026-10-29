// src/ui/usage.js — Phase C-3.5 extraction
// Usage modal: opens a heatmap of the last 365 days of
// token consumption. Supports month view (last 31 days) and
// shows tier-key-limits. Window exposures are routed
// through src/windowExports.js.

import { apiFetch } from '../util/api.ts';
var _usagePeriod='year';
var _usageListenersMounted=false;

export function mountUsageListeners(){
  var overlay=document.getElementById("usageOverlay");
  if(!overlay||_usageListenersMounted)return;
  _usageListenersMounted=true;
  overlay.addEventListener("click",function(event){
    var tab=event.target.closest&&event.target.closest("[data-usage-period]");
    if(!tab)return;
    if(tab.dataset.usagePeriod==="month")loadUsageMonth();
    else loadUsageData();
  });
  overlay.addEventListener("mouseover",function(event){
    var cell=event.target.closest&&event.target.closest(".usage-cal-day[data-date]");
    if(cell)showUsageTip({currentTarget:cell});
  });
  overlay.addEventListener("mouseout",function(event){
    var cell=event.target.closest&&event.target.closest(".usage-cal-day[data-date]");
    if(cell&&!cell.contains(event.relatedTarget))hideUsageTip();
  });
}
// i18n translator (window.t). Read lazily at call time: window.t is only
// assigned after i18n.js evaluates, but this module is pulled in first via
// windowExports.js, so a module-load capture would see undefined (and the
// modal would throw `t is not a function` on open).
function t(key) {
  return typeof window !== "undefined" && typeof window.t === "function" ? window.t(key) : key;
}

/* React migration bridge — publishes state so the React compatibility
   root renders the modal content. Installed by
   frontend/src/react/usageModal/usageModalStore.ts under `?react=1`. */
function _publishUsageState(bodyHtml) {
  try {
    var bridge = window.__socratesUsageBridge;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({
        isOpen: !document.getElementById("usageOverlay").classList.contains("hidden"),
        bodyHtml: bodyHtml || document.getElementById("usageBody").innerHTML || "",
        period: _usagePeriod,
      });
    }
  } catch (_) { /* swallow */ }
}

export function openUsageModal(){
  document.getElementById("usageOverlay").classList.remove("hidden");
  _publishUsageState();
  loadUsageData();
}
export function closeUsageModal(){
  document.getElementById("usageOverlay").classList.add("hidden");
  _publishUsageState();
}
export function loadUsageData(){
  _usagePeriod='year';
  var body=document.getElementById("usageBody");
  body.innerHTML='<div class="usage-loading"><span class="loading"><span></span><span></span><span></span></span> '+t("usage.loading")+'</div>';
  _publishUsageState();
  Promise.all([
    apiFetch("/api/usage/daily?days=365"),
    apiFetch("/api/usage/limits"),
  ]).then(function(results){
    renderUsageHeatmap(results[0],body,results[1],'year');
  }).catch(function(){
    body.innerHTML='<div class="usage-loading" style="color:hsl(0 60% 55%)">'+t("usage.failed")+'</div>';
    _publishUsageState();
  });
}
function collectUsageEntries(entries) {
  var lookup = {};
  var totalTokens = 0;
  var totalMsgs = 0;
  var maxDay = 1;
  entries.forEach(function (entry) {
    lookup[entry.day] = entry;
    totalTokens += parseInt(entry.tokens, 10) || 0;
    totalMsgs += parseInt(entry.messages, 10) || 0;
    maxDay = Math.max(maxDay, parseInt(entry.tokens, 10) || 0);
  });
  return { lookup: lookup, totalTokens: totalTokens, totalMsgs: totalMsgs, maxDay: maxDay };
}

function usageCalendarWeeks(lookup, period) {
  var now = new Date();
  var end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var start = new Date(end);
  start.setDate(start.getDate() - (period === 'month' ? 30 : 364));
  start.setDate(start.getDate() - start.getDay());

  var weeks = [];
  var week = [];
  var cursor = new Date(start);
  while (cursor <= end) {
    var date = new Date(cursor);
    var key = date.toISOString().slice(0, 10);
    var entry = lookup[key];
    week.push({
      date: key,
      tokens: entry ? parseInt(entry.tokens, 10) : 0,
      msgs: entry ? parseInt(entry.messages, 10) : 0,
      day: date.getDay(),
    });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (week.length) weeks.push(week);
  return weeks;
}

function usageMonthLabels(weeks) {
  var labels = [];
  var lastMonth = '';
  weeks.forEach(function (week, index) {
    if (!week.length) return;
    var month = new Date(week[0].date).toLocaleDateString('en-US', { month: 'short' });
    if (month !== lastMonth) {
      labels.push({ col: index, label: month });
      lastMonth = month;
    }
  });
  return labels;
}

function usageLevel(tokens, maxDay) {
  var value = parseInt(tokens, 10) || 0;
  if (value === 0) return 0;
  var ratio = value / maxDay;
  return ratio > 0.8 ? 5 : ratio > 0.6 ? 4 : ratio > 0.4 ? 3 : ratio > 0.2 ? 2 : 1;
}

function beagleUsageMarkup(limits) {
  if (!limits || !limits.beagleLimit) return '';
  var used = parseInt(limits.beagleUsed, 10) || 0;
  var limit = limits.beagleLimit;
  var percent = Math.min(100, Math.round(used / limit * 100));
  var color = percent >= 90 ? 'hsl(0 65% 55%)' : percent >= 70 ? 'hsl(35 80% 55%)' : 'hsl(var(--accent-000))';
  var html = '<div class="usage-beagle-section" style="margin-bottom:20px;padding:14px 16px;background:hsl(var(--bg-100));border-radius:10px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
  html += '<div style="font-size:calc(13px * var(--app-font-scale, 1));font-weight:600;color:hsl(var(--text-000))">Beagle Monthly Usage</div>';
  html += '<div style="font-size:calc(11px * var(--app-font-scale, 1));color:hsl(var(--text-500))">' + used.toLocaleString() + ' / ' + limit.toLocaleString() + ' tokens</div>';
  html += '</div><div style="height:8px;background:hsl(var(--bg-300));border-radius:4px;overflow:hidden">';
  html += '<div style="height:100%;width:' + percent + '%;background:' + color + ';border-radius:4px;transition:width .3s ease"></div></div>';
  if (percent >= 100) {
    html += '<div style="margin-top:6px;font-size:calc(11px * var(--app-font-scale, 1));color:hsl(0 65% 55%);font-weight:500">Limit reached. Add your own API key in Account → API Keys to continue using Beagle.</div>';
  } else if (percent >= 80) {
    html += '<div style="margin-top:6px;font-size:calc(11px * var(--app-font-scale, 1));color:hsl(35 80% 55%)">Approaching monthly limit (' + percent + '% used).</div>';
  }
  return html + '</div>';
}

function usageSummaryMarkup(entries, totalTokens, totalMsgs) {
  var dayCount = entries.length;
  var html = '<div class="usage-summary">';
  html += '<div class="usage-stat"><div class="usage-stat-val">' + totalTokens.toLocaleString() + '</div><div class="usage-stat-lbl">Total tokens</div></div>';
  html += '<div class="usage-stat"><div class="usage-stat-val">' + totalMsgs.toLocaleString() + '</div><div class="usage-stat-lbl">Messages</div></div>';
  html += '<div class="usage-stat"><div class="usage-stat-val">' + (dayCount > 0 ? Math.round(totalTokens / dayCount).toLocaleString() : 0) + '</div><div class="usage-stat-lbl">Avg tokens / active day</div></div>';
  html += '<div class="usage-stat"><div class="usage-stat-val">' + (dayCount > 0 ? Math.round(totalMsgs / dayCount).toLocaleString() : 0) + '</div><div class="usage-stat-lbl">Avg msgs / active day</div></div></div>';
  html += '<div class="usage-section-title">Daily Activity</div><div data-usage-period-placeholder></div>';
  return html;
}

function usageCalendarMarkup(weeks, monthLabels, maxDay) {
  var html = '<div class="usage-calendar-wrap"><div class="usage-calendar"><div class="usage-cal-day-lbl"></div>';
  var monthIndex = 0;
  for (var column = 0; column < weeks.length; column++) {
    var label = '';
    if (monthIndex < monthLabels.length && monthLabels[monthIndex].col === column) {
      label = monthLabels[monthIndex].label;
      monthIndex++;
    }
    html += '<div style="font-size:calc(8px * var(--app-font-scale, 1));color:hsl(var(--text-500));text-align:center">' + label + '</div>';
  }
  var dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (var row = 0; row < 7; row++) {
    html += '<div class="usage-cal-day-lbl">' + dayLabels[row] + '</div>';
    weeks.forEach(function (week) {
      if (row < week.length) {
        var day = week[row];
        var level = day.tokens > 0 ? usageLevel(day.tokens, maxDay) : 0;
        html += '<div class="usage-cal-day lv' + level + '" data-date="' + day.date + '" data-tokens="' + day.tokens + '" data-msgs="' + day.msgs + '"></div>';
      } else {
        html += '<div></div>';
      }
    });
  }
  html += '</div></div>';
  html += '<div class="usage-legend">Less<div class="usage-legend-cell usage-cal-day lv0"></div><div class="usage-legend-cell usage-cal-day lv1"></div><div class="usage-legend-cell usage-cal-day lv2"></div><div class="usage-legend-cell usage-cal-day lv3"></div><div class="usage-legend-cell usage-cal-day lv4"></div><div class="usage-legend-cell usage-cal-day lv5"></div>More</div>';
  return html + '<div class="usage-tooltip" id="usageTooltip"></div>';
}

function monthlyBreakdownMarkup(entries) {
  var monthMap = {};
  entries.forEach(function (entry) {
    var month = entry.day.slice(0, 7);
    if (!monthMap[month]) monthMap[month] = { days: {}, tokens: 0, msgs: 0 };
    monthMap[month].days[entry.day] = true;
    monthMap[month].tokens += parseInt(entry.tokens, 10) || 0;
    monthMap[month].msgs += parseInt(entry.messages, 10) || 0;
  });
  var html = '<div class="usage-breakdown"><div class="usage-section-title">Monthly Summary</div><table><thead><tr><th>Month</th><th>Days active</th><th>Tokens</th><th>Messages</th></tr></thead><tbody>';
  Object.keys(monthMap).sort().reverse().forEach(function (month) {
    var date = new Date(month + '-01');
    var label = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    var summary = monthMap[month];
    html += '<tr><td>' + label + '</td><td>' + Object.keys(summary.days).length + '</td><td>' + summary.tokens.toLocaleString() + '</td><td>' + summary.msgs.toLocaleString() + '</td></tr>';
  });
  return html + '</tbody></table></div>';
}

export function renderUsageHeatmap(data, body, limits, period) {
  period = period || 'year';
  _usagePeriod=period;
  var entries = data.entries || [];
  var totals = collectUsageEntries(entries);
  var weeks = usageCalendarWeeks(totals.lookup, period);
  var html = beagleUsageMarkup(limits);
  html += usageSummaryMarkup(entries, totals.totalTokens, totals.totalMsgs);
  html += usageCalendarMarkup(weeks, usageMonthLabels(weeks), totals.maxDay);
  html += monthlyBreakdownMarkup(entries);
  body.innerHTML = html;
  _publishUsageState();
}
export function showUsageTip(ev){
  var el=ev.currentTarget;
  var tip=document.getElementById("usageTooltip");
  if(!tip){tip=document.createElement("div");tip.id="usageTooltip";tip.className="usage-tooltip";document.body.appendChild(tip);}
  var date=el.dataset.date;
  var tokens=parseInt(el.dataset.tokens,10)||0;
  var msgs=parseInt(el.dataset.msgs,10)||0;
  tip.innerHTML='<strong>'+date+'</strong> — '+tokens.toLocaleString()+' tokens, '+msgs+' messages';
  tip.style.display="block";
  var rect=el.getBoundingClientRect();
  tip.style.left=Math.min(rect.left+rect.width/2-tip.offsetWidth/2,window.innerWidth-tip.offsetWidth-10)+"px";
  tip.style.top=(rect.top-tip.offsetHeight-6)+"px";
}
export function hideUsageTip(){var tip=document.getElementById("usageTooltip");if(tip)tip.style.display="none";}
export function loadUsageMonth(){
  _usagePeriod='month';
  var body=document.getElementById("usageBody");
  body.innerHTML='<div class="usage-loading"><span class="loading"><span></span><span></span><span></span></span> '+t("usage.loading")+'</div>';
  _publishUsageState();
  Promise.all([
    apiFetch("/api/usage/daily?days=31"),
    apiFetch("/api/usage/limits"),
  ]).then(function(results){
    renderUsageHeatmap(results[0],body,results[1],'month');
  }).catch(function(){
    body.innerHTML='<div class="usage-loading" style="color:hsl(0 60% 55%)">'+t("usage.failedGeneric")+'</div>';
    _publishUsageState();
  });
}
