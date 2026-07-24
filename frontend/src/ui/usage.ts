// src/ui/usage.ts — Phase C-3.5 extraction
// Usage modal: opens a heatmap of the last 365 days of
// token consumption.

import { apiFetch } from '../util/api.js';
// i18n translator (window.t). Lazy read so the module
// does not require a circular import with i18n.js.
const _t = (typeof window !== 'undefined' ? (window as any).t : null) as ((key: string) => string) | null;

interface UsageEntry {
  day: string;
  tokens: string | number;
  messages: string | number;
}

interface UsageLimits {
  beagleLimit?: number;
  beagleUsed?: number | string;
  [key: string]: unknown;
}

interface UsageData {
  entries?: UsageEntry[];
}

/* React migration bridge — publishes state so the React compatibility
   root renders the modal content. */
function _publishUsageState(bodyHtml?: string): void {
  try {
    const bridge = (window as any).__socratesUsageBridge;
    if (bridge && typeof bridge.publish === 'function') {
      bridge.publish({
        isOpen: !document.getElementById('usageOverlay')!.classList.contains('hidden'),
        bodyHtml: bodyHtml || document.getElementById('usageBody')!.innerHTML || '',
      });
    }
  } catch (_) { /* swallow */ }
}

/* React mode owns the usage modal's children. */
function _reactOwnsUsageModal(): boolean {
  const el = document.getElementById('usageOverlay');
  return !!(el && el.dataset && el.dataset.reactMigrationRuntime === 'usage-modal');
}

function t(key: string): string {
  return _t ? _t(key) : key;
}

export function openUsageModal(): void {
  const overlay = document.getElementById('usageOverlay')!;
  overlay.classList.remove('hidden');
  _publishUsageState();
  loadUsageData();
}

export function closeUsageModal(): void {
  document.getElementById('usageOverlay')!.classList.add('hidden');
  _publishUsageState();
}

export function loadUsageData(): void {
  const body = document.getElementById('usageBody') as HTMLElement;
  body.innerHTML = '<div class="usage-loading"><span class="loading"><span></span><span></span><span></span></span> ' + t('usage.loading') + '</div>';
  _publishUsageState();
  Promise.all([
    apiFetch('/api/usage/daily?days=365'),
    apiFetch('/api/usage/limits'),
  ]).then(function (results: unknown[]) {
    renderUsageHeatmap(results[0] as UsageData, body, results[1] as UsageLimits, 'year');
  }).catch(function () {
    body.innerHTML = '<div class="usage-loading" style="color:hsl(0 60% 55%)">' + t('usage.failed') + '</div>';
    _publishUsageState();
  });
}

export function renderUsageHeatmap(data: UsageData, body: HTMLElement, limits: UsageLimits, period?: string): void {
  period = period || 'year';
  const entries = data.entries || [];
  const lookup: Record<string, UsageEntry> = {};
  let totalTokens = 0, totalMsgs = 0;
  entries.forEach(function (e: UsageEntry) {
    lookup[e.day] = e;
    totalTokens += parseInt(String(e.tokens), 10) || 0;
    totalMsgs += parseInt(String(e.messages), 10) || 0;
  });
  /* Compute max daily tokens for color scaling */
  const maxDay = entries.reduce(function (m: number, e: UsageEntry) { return Math.max(m, parseInt(String(e.tokens), 10) || 0); }, 1);
  function level(v: string | number): number {
    const n = parseInt(String(v), 10) || 0;
    if (n === 0) return 0;
    const r = n / maxDay;
    return r > 0.8 ? 5 : r > 0.6 ? 4 : r > 0.4 ? 3 : r > 0.2 ? 2 : 1;
  }

  /* Build date grid */
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayRange = period === 'month' ? 30 : 364;
  const start = new Date(end);
  start.setDate(start.getDate() - dayRange);
  /* Align start to Sunday */
  const startDow = start.getDay();
  start.setDate(start.getDate() - startDow);

  const days: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  /* Build weeks array: array of 7-element arrays */
  interface DayCell {
    date: string;
    tokens: number;
    msgs: number;
    day: number;
  }
  const weeks: DayCell[][] = [];
  let curWeek: DayCell[] = [];
  days.forEach(function (d: Date) {
    const key = d.toISOString().slice(0, 10);
    const e = lookup[key];
    curWeek.push({ date: key, tokens: e ? parseInt(String(e.tokens), 10) : 0, msgs: e ? parseInt(String(e.messages), 10) : 0, day: d.getDay() });
    if (curWeek.length === 7) { weeks.push(curWeek); curWeek = []; }
  });
  if (curWeek.length) { weeks.push(curWeek); }

  /* Month labels */
  interface MonthLabel { col: number; label: string; }
  const monthLabels: MonthLabel[] = [];
  let lastMth = '';
  weeks.forEach(function (w: DayCell[], wi: number) {
    if (!w.length) return;
    const d = new Date(w[0].date);
    const mth = d.toLocaleDateString('en-US', { month: 'short' });
    if (mth !== lastMth) { monthLabels.push({ col: wi, label: mth }); lastMth = mth; }
  });

  /* Build HTML */
  let html = '';

  /* Beagle monthly usage bar */
  if (limits && (limits as UsageLimits).beagleLimit) {
    const beagleUsed = parseInt(String((limits as UsageLimits).beagleUsed), 10) || 0;
    const beagleLimit = (limits as UsageLimits).beagleLimit!;
    const beaglePct = Math.min(100, Math.round(beagleUsed / beagleLimit * 100));
    const barColor = beaglePct >= 90 ? 'hsl(0 65% 55%)' : beaglePct >= 70 ? 'hsl(35 80% 55%)' : 'hsl(var(--accent-000))';
    html += '<div class="usage-beagle-section" style="margin-bottom:20px;padding:14px 16px;background:hsl(var(--bg-100));border-radius:10px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '<div style="font-size:calc(13px * var(--app-font-scale, 1));font-weight:600;color:hsl(var(--text-000))">Beagle Monthly Usage</div>';
    html += '<div style="font-size:calc(11px * var(--app-font-scale, 1));color:hsl(var(--text-500))">' + beagleUsed.toLocaleString() + ' / ' + beagleLimit.toLocaleString() + ' tokens</div>';
    html += '</div>';
    html += '<div style="height:8px;background:hsl(var(--bg-300));border-radius:4px;overflow:hidden">';
    html += '<div style="height:100%;width:' + beaglePct + '%;background:' + barColor + ';border-radius:4px;transition:width .3s ease"></div>';
    html += '</div>';
    if (beaglePct >= 100) {
      html += '<div style="margin-top:6px;font-size:calc(11px * var(--app-font-scale, 1));color:hsl(0 65% 55%);font-weight:500">Limit reached. Add your own API key in Account → API Keys to continue using Beagle.</div>';
    } else if (beaglePct >= 80) {
      html += '<div style="margin-top:6px;font-size:calc(11px * var(--app-font-scale, 1));color:hsl(35 80% 55%)">Approaching monthly limit (' + beaglePct + '% used).</div>';
    }
    html += '</div>';
  }

  /* Summary stats */
  html += '<div class="usage-summary">';
  html += '<div class="usage-stat"><div class="usage-stat-val">' + totalTokens.toLocaleString() + '</div><div class="usage-stat-lbl">Total tokens</div></div>';
  html += '<div class="usage-stat"><div class="usage-stat-val">' + totalMsgs.toLocaleString() + '</div><div class="usage-stat-lbl">Messages</div></div>';
  const dayCount = entries.length;
  html += '<div class="usage-stat"><div class="usage-stat-val">' + (dayCount > 0 ? Math.round(totalTokens / dayCount).toLocaleString() : '0') + '</div><div class="usage-stat-lbl">Avg tokens / active day</div></div>';
  html += '<div class="usage-stat"><div class="usage-stat-val">' + (dayCount > 0 ? Math.round(totalMsgs / dayCount).toLocaleString() : '0') + '</div><div class="usage-stat-lbl">Avg msgs / active day</div></div>';
  html += '</div>';

  /* Period tabs */
  html += '<div class="usage-section-title">Daily Activity</div>';
  html += '<div class="usage-period-tabs">';
  html += '<button class="usage-period-tab' + (period === 'year' ? ' active' : '') + '" onclick="loadUsageData()">Last 12 months</button>';
  html += '<button class="usage-period-tab' + (period === 'month' ? ' active' : '') + '" onclick="loadUsageMonth()">This month</button>';
  html += '</div>';

  /* Heatmap grid */
  html += '<div class="usage-calendar-wrap"><div class="usage-calendar">';

  /* Day-of-week labels */
  const dowLbl = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  weeks.forEach(function (_w: DayCell[], wi: number) {
    /* Month label row for first week only */
    if (wi === 0) {
      html += '<div class="usage-cal-day-lbl"></div>';
      let mthIdx = 0;
      for (let c = 0; c < weeks.length; c++) {
        let lbl = '';
        if (mthIdx < monthLabels.length && monthLabels[mthIdx].col === c) {
          lbl = monthLabels[mthIdx].label;
          mthIdx++;
        }
        html += '<div style="font-size:calc(8px * var(--app-font-scale, 1));color:hsl(var(--text-500));text-align:center">' + lbl + '</div>';
      }
    }
  });
  /* Day rows */
  for (let row = 0; row < 7; row++) {
    html += '<div class="usage-cal-day-lbl">' + dowLbl[row] + '</div>';
    weeks.forEach(function (w: DayCell[]) {
      if (row < w.length) {
        const d = w[row];
        const lv = d.tokens > 0 ? level(d.tokens) : 0;
        html += '<div class="usage-cal-day lv' + lv + '" data-date="' + d.date + '" data-tokens="' + d.tokens + '" data-msgs="' + d.msgs + '" onmouseenter="showUsageTip(event)" onmouseleave="hideUsageTip()"></div>';
      } else {
        html += '<div></div>';
      }
    });
  }

  html += '</div></div>';

  /* Legend */
  html += '<div class="usage-legend">Less<div class="usage-legend-cell usage-cal-day lv0"></div><div class="usage-legend-cell usage-cal-day lv1"></div><div class="usage-legend-cell usage-cal-day lv2"></div><div class="usage-legend-cell usage-cal-day lv3"></div><div class="usage-legend-cell usage-cal-day lv4"></div><div class="usage-legend-cell usage-cal-day lv5"></div>More</div>';
  html += '<div class="usage-tooltip" id="usageTooltip"></div>';

  /* Monthly breakdown */
  html += '<div class="usage-breakdown"><div class="usage-section-title">Monthly Summary</div><table><thead><tr><th>Month</th><th>Days active</th><th>Tokens</th><th>Messages</th></tr></thead><tbody>';
  const monthMap: Record<string, { days: Record<string, boolean>; tokens: number; msgs: number }> = {};
  entries.forEach(function (e: UsageEntry) {
    const m = e.day.slice(0, 7);
    if (!monthMap[m]) monthMap[m] = { days: {}, tokens: 0, msgs: 0 };
    monthMap[m].days[e.day] = true;
    monthMap[m].tokens += parseInt(String(e.tokens), 10) || 0;
    monthMap[m].msgs += parseInt(String(e.messages), 10) || 0;
  });
  const mKeys = Object.keys(monthMap).sort().reverse();
  mKeys.forEach(function (m: string) {
    const d = new Date(m + '-01');
    const lbl = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    const mm = monthMap[m];
    html += '<tr><td>' + lbl + '</td><td>' + Object.keys(mm.days).length + '</td><td>' + mm.tokens.toLocaleString() + '</td><td>' + mm.msgs.toLocaleString() + '</td></tr>';
  });
  html += '</tbody></table></div>';

  body.innerHTML = html;
  _publishUsageState();
}

export function showUsageTip(ev: MouseEvent): void {
  const el = ev.currentTarget as HTMLElement;
  let tip = document.getElementById('usageTooltip') as HTMLElement | null;
  if (!tip) { tip = document.createElement('div'); tip.id = 'usageTooltip'; tip.className = 'usage-tooltip'; document.body.appendChild(tip); }
  const date = el.dataset.date;
  const tokens = parseInt(el.dataset.tokens || '0', 10) || 0;
  const msgs = parseInt(el.dataset.msgs || '0', 10) || 0;
  tip.innerHTML = '<strong>' + date + '</strong> — ' + tokens.toLocaleString() + ' tokens, ' + msgs + ' messages';
  tip.style.display = 'block';
  const rect = el.getBoundingClientRect();
  tip.style.left = Math.min(rect.left + rect.width / 2 - tip.offsetWidth / 2, window.innerWidth - tip.offsetWidth - 10) + 'px';
  tip.style.top = (rect.top - tip.offsetHeight - 6) + 'px';
}

export function hideUsageTip(): void {
  const tip = document.getElementById('usageTooltip');
  if (tip) tip.style.display = 'none';
}

export function loadUsageMonth(): void {
  const body = document.getElementById('usageBody') as HTMLElement;
  body.innerHTML = '<div class="usage-loading"><span class="loading"><span></span><span></span><span></span></span> ' + t('usage.loading') + '</div>';
  _publishUsageState();
  Promise.all([
    apiFetch('/api/usage/daily?days=31'),
    apiFetch('/api/usage/limits'),
  ]).then(function (results: unknown[]) {
    renderUsageHeatmap(results[0] as UsageData, body, results[1] as UsageLimits, 'month');
  }).catch(function () {
    body.innerHTML = '<div class="usage-loading" style="color:hsl(0 60% 55%)">' + t('usage.failedGeneric') + '</div>';
    _publishUsageState();
  });
}
