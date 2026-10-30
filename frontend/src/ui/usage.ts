interface UsageEntry { day: string; tokens: number | string; messages: number | string }
interface UsageCalendarDay { date: string; tokens: number; msgs: number; day: number }
interface UsageMonthLabel { col: number; label: string }
interface UsageLimits { beagleLimit: number | string; beagleUsed: number | string }
interface UsageDailyResponse { entries: UsageEntry[] }
// src/ui/usage.ts — Phase C-3.5 extraction
// Usage modal: opens a heatmap of the last 365 days of
// token consumption. Supports month view (last 31 days) and
// shows tier-key-limits. Window exposures are routed
// through src/windowExports.ts.

import { apiFetch } from '../util/api.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";
import { publishUsageState, type UsagePeriod } from './usageState.ts';

let _usageListenersMounted=false;

export function mountUsageListeners(){
  const overlay=document.getElementById("usageOverlay");
  if(!overlay||_usageListenersMounted)return;
  _usageListenersMounted=true;
  overlay.addEventListener("click",function(event){
    const tab=(event.target as Element)!.closest&&(event.target as Element)!.closest("[data-usage-period]");
    if(!tab)return;
    if((tab as HTMLElement).dataset.usagePeriod==="month")loadUsageMonth();
    else loadUsageData();
  });
  overlay.addEventListener("mouseover",function(event){
    const cell=(event.target as Element)!.closest&&(event.target as Element)!.closest(".usage-cal-day[data-date]");
    if(cell)showUsageTip({currentTarget:cell});
  });
  overlay.addEventListener("mouseout",function(event){
    const cell=(event.target as Element)!.closest&&(event.target as Element)!.closest(".usage-cal-day[data-date]");
    if(cell&&!cell.contains((event.relatedTarget as Node | null)))hideUsageTip();
  });
}
// i18n translator (window.t). Read lazily at call time: window.t is only
// assigned after i18n.ts evaluates, but this module is pulled in first via
// windowExports.js, so a module-load capture would see undefined (and the
// modal would throw `t is not a function` on open).
function t(key: string) {
  return typeof window !== "undefined" && typeof browserWindow.t === "function" ? browserWindow.t(key) : key;
}

export function openUsageModal(){
  document.getElementById("usageOverlay")!.classList.remove("hidden");
  loadUsageData();
}
export function closeUsageModal(){
  document.getElementById("usageOverlay")!.classList.add("hidden");
}
export function loadUsageData(){
  publishUsageState('<div class="usage-loading"><span class="loading"><span></span><span></span><span></span></span> '+t("usage.loading")+'</div>', 'year');
  Promise.all([
    apiFetch<UsageDailyResponse>("/api/usage/daily?days=365"),
    apiFetch<UsageLimits>("/api/usage/limits"),
  ]).then(function(results){
    renderUsageHeatmap(results[0],results[1],'year');
  }).catch(function(){
    publishUsageState('<div class="usage-loading" style="color:hsl(0 60% 55%)">'+t("usage.failed")+'</div>', 'year');
  });
}
function collectUsageEntries(entries: UsageEntry[]) {
  const lookup: Record<string, UsageEntry> = {};
  let totalTokens = 0;
  let totalMsgs = 0;
  let maxDay = 1;
  entries.forEach(function (entry) {
    lookup[entry.day] = entry;
    totalTokens += parseInt(String(entry.tokens), 10) || 0;
    totalMsgs += parseInt(String(entry.messages), 10) || 0;
    maxDay = Math.max(maxDay, parseInt(String(entry.tokens), 10) || 0);
  });
  return { lookup: lookup, totalTokens: totalTokens, totalMsgs: totalMsgs, maxDay: maxDay };
}

function usageCalendarWeeks(lookup: Record<string, UsageEntry>, period: UsagePeriod) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - (period === 'month' ? 30 : 364));
  start.setDate(start.getDate() - start.getDay());

  const weeks: UsageCalendarDay[][] = [];
  let week: UsageCalendarDay[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const date = new Date(cursor);
    const key = date.toISOString().slice(0, 10);
    const entry = lookup[key];
    week.push({
      date: key,
      tokens: entry ? parseInt(String(entry.tokens), 10) : 0,
      msgs: entry ? parseInt(String(entry.messages), 10) : 0,
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

function usageMonthLabels(weeks: UsageCalendarDay[][]): UsageMonthLabel[] {
  const labels: UsageMonthLabel[] = [];
  let lastMonth = '';
  weeks.forEach(function (week, index) {
    if (!week.length) return;
    const month = new Date(week[0].date).toLocaleDateString('en-US', { month: 'short' });
    if (month !== lastMonth) {
      labels.push({ col: index, label: month });
      lastMonth = month;
    }
  });
  return labels;
}

function usageLevel(tokens: number | string, maxDay: number) {
  const value = parseInt(String(tokens), 10) || 0;
  if (value === 0) return 0;
  const ratio = value / maxDay;
  return ratio > 0.8 ? 5 : ratio > 0.6 ? 4 : ratio > 0.4 ? 3 : ratio > 0.2 ? 2 : 1;
}

function beagleUsageMarkup(limits: { beagleLimit: number | string; beagleUsed: number | string }) {
  if (!limits || !limits.beagleLimit) return '';
  const used = parseInt(String(limits.beagleUsed), 10) || 0;
  const limit = Number(limits.beagleLimit);
  const percent = Math.min(100, Math.round(used / limit * 100));
  const color = percent >= 90 ? 'hsl(0 65% 55%)' : percent >= 70 ? 'hsl(35 80% 55%)' : 'hsl(var(--accent-000))';
  let html = '<div class="usage-beagle-section" style="margin-bottom:20px;padding:14px 16px;background:hsl(var(--bg-100));border-radius:10px">';
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

function usageSummaryMarkup(entries: UsageEntry[], totalTokens: number, totalMsgs: number) {
  const dayCount = entries.length;
  let html = '<div class="usage-summary">';
  html += '<div class="usage-stat"><div class="usage-stat-val">' + totalTokens.toLocaleString() + '</div><div class="usage-stat-lbl">Total tokens</div></div>';
  html += '<div class="usage-stat"><div class="usage-stat-val">' + totalMsgs.toLocaleString() + '</div><div class="usage-stat-lbl">Messages</div></div>';
  html += '<div class="usage-stat"><div class="usage-stat-val">' + (dayCount > 0 ? Math.round(totalTokens / dayCount).toLocaleString() : 0) + '</div><div class="usage-stat-lbl">Avg tokens / active day</div></div>';
  html += '<div class="usage-stat"><div class="usage-stat-val">' + (dayCount > 0 ? Math.round(totalMsgs / dayCount).toLocaleString() : 0) + '</div><div class="usage-stat-lbl">Avg msgs / active day</div></div></div>';
  html += '<div class="usage-section-title">Daily Activity</div><div data-usage-period-placeholder></div>';
  return html;
}

function usageCalendarMarkup(weeks: UsageCalendarDay[][], monthLabels: UsageMonthLabel[], maxDay: number) {
  let html = '<div class="usage-calendar-wrap"><div class="usage-calendar"><div class="usage-cal-day-lbl"></div>';
  let monthIndex = 0;
  for (let column = 0; column < weeks.length; column++) {
    let label = '';
    if (monthIndex < monthLabels.length && monthLabels[monthIndex].col === column) {
      label = monthLabels[monthIndex].label;
      monthIndex++;
    }
    html += '<div style="font-size:calc(8px * var(--app-font-scale, 1));color:hsl(var(--text-500));text-align:center">' + label + '</div>';
  }
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let row = 0; row < 7; row++) {
    html += '<div class="usage-cal-day-lbl">' + dayLabels[row] + '</div>';
    weeks.forEach(function (week) {
      if (row < week.length) {
        const day = week[row];
        const level = day.tokens > 0 ? usageLevel(day.tokens, maxDay) : 0;
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

function monthlyBreakdownMarkup(entries: UsageEntry[]) {
  const monthMap: Record<string, { days: Record<string, boolean>; tokens: number; msgs: number }> = {};
  entries.forEach(function (entry) {
    const month = entry.day.slice(0, 7);
    if (!monthMap[month]) monthMap[month] = { days: {}, tokens: 0, msgs: 0 };
    monthMap[month].days[entry.day] = true;
    monthMap[month].tokens += parseInt(String(entry.tokens), 10) || 0;
    monthMap[month].msgs += parseInt(String(entry.messages), 10) || 0;
  });
  let html = '<div class="usage-breakdown"><div class="usage-section-title">Monthly Summary</div><table><thead><tr><th>Month</th><th>Days active</th><th>Tokens</th><th>Messages</th></tr></thead><tbody>';
  Object.keys(monthMap).sort().reverse().forEach(function (month) {
    const date = new Date(month + '-01');
    const label = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    const summary = monthMap[month];
    html += '<tr><td>' + label + '</td><td>' + Object.keys(summary.days).length + '</td><td>' + summary.tokens.toLocaleString() + '</td><td>' + summary.msgs.toLocaleString() + '</td></tr>';
  });
  return html + '</tbody></table></div>';
}

export function renderUsageHeatmap(data: { entries: UsageEntry[] }, limits: UsageLimits, period: UsagePeriod = 'year') {
  const entries = data.entries || [];
  const totals = collectUsageEntries(entries);
  const weeks = usageCalendarWeeks(totals.lookup, period);
  let html = beagleUsageMarkup(limits);
  html += usageSummaryMarkup(entries, totals.totalTokens, totals.totalMsgs);
  html += usageCalendarMarkup(weeks, usageMonthLabels(weeks), totals.maxDay);
  html += monthlyBreakdownMarkup(entries);
  publishUsageState(html, period);
  return html;
}
export function showUsageTip(ev: Pick<Event, 'currentTarget'>){
  const el=ev.currentTarget;
  if (!(el instanceof HTMLElement)) return;
  let tip=document.getElementById("usageTooltip");
  if(!tip){tip=document.createElement("div");tip.id="usageTooltip";tip.className="usage-tooltip";document.body.appendChild(tip);}
  const date=(el as HTMLElement)!.dataset.date;
  const tokens=parseInt((el as HTMLElement)!.dataset.tokens!,10)||0;
  const msgs=parseInt((el as HTMLElement)!.dataset.msgs!,10)||0;
  tip.innerHTML='<strong>'+date+'</strong> — '+tokens.toLocaleString()+' tokens, '+msgs+' messages';
  tip.style.display="block";
  const rect=(el as Element)!.getBoundingClientRect();
  tip.style.left=Math.min(rect.left+rect.width/2-tip.offsetWidth/2,browserWindow.innerWidth-tip.offsetWidth-10)+"px";
  tip.style.top=(rect.top-tip.offsetHeight-6)+"px";
}
export function hideUsageTip(){const tip=document.getElementById("usageTooltip");if(tip)tip.style.display="none";}
export function loadUsageMonth(){
  publishUsageState('<div class="usage-loading"><span class="loading"><span></span><span></span><span></span></span> '+t("usage.loading")+'</div>', 'month');
  Promise.all([
    apiFetch<UsageDailyResponse>("/api/usage/daily?days=31"),
    apiFetch<UsageLimits>("/api/usage/limits"),
  ]).then(function(results){
    renderUsageHeatmap(results[0],results[1],'month');
  }).catch(function(){
    publishUsageState('<div class="usage-loading" style="color:hsl(0 60% 55%)">'+t("usage.failedGeneric")+'</div>', 'month');
  });
}
