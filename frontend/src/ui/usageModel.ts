export interface UsageEntry {
  day: string;
  tokens: number | string;
  messages: number | string;
}

export interface UsageLimits {
  beagleLimit: number | string;
  beagleUsed: number | string;
}

export interface UsageCalendarDay {
  date: string;
  tokens: number;
  msgs: number;
  day: number;
}

export interface UsageMonthLabel {
  col: number;
  label: string;
}

export interface UsageTotals {
  lookup: Record<string, UsageEntry>;
  totalTokens: number;
  totalMsgs: number;
  maxDay: number;
}

export interface UsageMonthSummary {
  month: string;
  activeDays: number;
  tokens: number;
  messages: number;
}

export type UsagePeriod = 'year' | 'month';

function numeric(value: number | string): number {
  return Number.parseInt(String(value), 10) || 0;
}

export function collectUsageEntries(entries: UsageEntry[]): UsageTotals {
  const lookup: Record<string, UsageEntry> = {};
  let totalTokens = 0;
  let totalMsgs = 0;
  let maxDay = 1;
  entries.forEach((entry) => {
    lookup[entry.day] = entry;
    totalTokens += numeric(entry.tokens);
    totalMsgs += numeric(entry.messages);
    maxDay = Math.max(maxDay, numeric(entry.tokens));
  });
  return { lookup, totalTokens, totalMsgs, maxDay };
}

export function usageCalendarWeeks(
  lookup: Record<string, UsageEntry>,
  period: UsagePeriod,
  today = new Date(),
): UsageCalendarDay[][] {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
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
      tokens: entry ? numeric(entry.tokens) : 0,
      msgs: entry ? numeric(entry.messages) : 0,
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

export function usageMonthLabels(weeks: UsageCalendarDay[][]): UsageMonthLabel[] {
  const labels: UsageMonthLabel[] = [];
  let lastMonth = '';
  weeks.forEach((week, index) => {
    if (!week.length) return;
    const month = new Date(week[0].date).toLocaleDateString('en-US', { month: 'short' });
    if (month !== lastMonth) {
      labels.push({ col: index, label: month });
      lastMonth = month;
    }
  });
  return labels;
}

export function usageLevel(tokens: number, maxDay: number): number {
  if (tokens === 0) return 0;
  const ratio = tokens / maxDay;
  return ratio > 0.8 ? 5 : ratio > 0.6 ? 4 : ratio > 0.4 ? 3 : ratio > 0.2 ? 2 : 1;
}

export function monthlyUsageSummaries(entries: UsageEntry[]): UsageMonthSummary[] {
  const monthMap: Record<string, { days: Record<string, boolean>; tokens: number; messages: number }> = {};
  entries.forEach((entry) => {
    const month = entry.day.slice(0, 7);
    if (!monthMap[month]) monthMap[month] = { days: {}, tokens: 0, messages: 0 };
    monthMap[month].days[entry.day] = true;
    monthMap[month].tokens += numeric(entry.tokens);
    monthMap[month].messages += numeric(entry.messages);
  });
  return Object.keys(monthMap).sort().reverse().map((month) => {
    const date = new Date(month + '-01');
    return {
      month: date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
      activeDays: Object.keys(monthMap[month].days).length,
      tokens: monthMap[month].tokens,
      messages: monthMap[month].messages,
    };
  });
}

export function beagleUsageSummary(limits: UsageLimits | null): {
  used: number;
  limit: number;
  percent: number;
  color: string;
  message: 'limit' | 'approaching' | null;
} | null {
  if (!limits || !limits.beagleLimit) return null;
  const used = numeric(limits.beagleUsed);
  const limit = Number(limits.beagleLimit);
  const percent = Math.min(100, Math.round(used / limit * 100));
  const color = percent >= 90
    ? 'hsl(0 65% 55%)'
    : percent >= 70
      ? 'hsl(35 80% 55%)'
      : 'hsl(var(--accent-000))';
  return { used, limit, percent, color, message: percent >= 100 ? 'limit' : percent >= 80 ? 'approaching' : null };
}
