import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';
import { Overlay } from './Overlay';
import { usageApi } from '../data/api/client';

export interface UsageOverlayProps {
  visible: boolean;
  onClose: () => void;
}

interface UsageEntry {
  day: string;
  tokens: number;
  messages: number;
}

interface UsageLimits {
  beagleLimit?: number;
  beagleUsed?: number;
  plan?: string;
}

/* A full 53-week GitHub-style grid is unreadable on phones, so the mobile
 * overlay shows the last ~16 weeks (112 days) — same UTC-day buckets the
 * web heatmap uses, same alpha-intensity ramp. */
const HEAT_DAYS = 112;

function toUtcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function UsageOverlay({ visible, onClose }: UsageOverlayProps) {
  const { colors, radius, typography, spacing, contentWidth, fontScale } = useTheme();
  const t = useT();
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [limits, setLimits] = useState<UsageLimits | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setBusy(true);
    setError('');
    Promise.all([usageApi.daily(HEAT_DAYS), usageApi.limits()])
      .then(([d, l]) => {
        if (!active) return;
        const rows = (d.entries || []).map((e) => ({
          day: String(e.day),
          tokens: Number(e.tokens) || 0,
          messages: Number(e.messages) || 0,
        }));
        setEntries(rows);
        setLimits((l as UsageLimits) || null);
        setBusy(false);
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Usage failed');
        setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [visible]);

  const lookup = useMemo(() => {
    const map: Record<string, UsageEntry> = {};
    entries.forEach((e) => {
      map[e.day] = e;
    });
    return map;
  }, [entries]);

  const { weeks, monthLabels } = useMemo(() => {
    /* Mirror the web grid: end = today (UTC), start = today-(HEAT_DAYS-1),
     * then back the start up to Sunday so each column is a full week. */
    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (HEAT_DAYS - 1));
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());

    const grid: Array<Array<{ key: string; tokens: number; inRange: boolean }>> = [];
    const labels: Array<{ col: number; label: string }> = [];
    let lastMonth = '';
    const cursor = new Date(start);
    let week: Array<{ key: string; tokens: number; inRange: boolean }> = [];
    while (cursor <= end) {
      const key = toUtcDayKey(cursor);
      week.push({ key, tokens: lookup[key]?.tokens || 0, inRange: true });
      if (week.length === 7) {
        const col = grid.length;
        const monthLabel = cursor.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
        if (monthLabel !== lastMonth) {
          labels.push({ col, label: monthLabel });
          lastMonth = monthLabel;
        }
        grid.push(week);
        week = [];
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    if (week.length) grid.push(week);
    return { weeks: grid, monthLabels: labels };
  }, [lookup]);

  const totals = useMemo(() => {
    let tokens = 0;
    let messages = 0;
    entries.forEach((e) => {
      tokens += e.tokens;
      messages += e.messages;
    });
    const activeDays = entries.length;
    return {
      tokens,
      messages,
      avgTokens: activeDays ? Math.round(tokens / activeDays) : 0,
      avgMessages: activeDays ? Math.round(messages / activeDays) : 0,
    };
  }, [entries]);

  const maxDay = useMemo(
    () => Math.max(1, ...entries.map((e) => e.tokens)),
    [entries],
  );

  const monthly = useMemo(() => {
    const map: Record<string, { days: Set<string>; tokens: number; messages: number }> = {};
    entries.forEach((e) => {
      const m = e.day.slice(0, 7);
      if (!map[m]) map[m] = { days: new Set(), tokens: 0, messages: 0 };
      map[m].days.add(e.day);
      map[m].tokens += e.tokens;
      map[m].messages += e.messages;
    });
    return Object.keys(map)
      .sort()
      .reverse()
      .map((m) => ({
        key: m,
        label: new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' }),
        ...map[m],
      }));
  }, [entries]);

  const beagleLimit = typeof limits?.beagleLimit === 'number' ? limits.beagleLimit : 0;
  const beagleUsed = typeof limits?.beagleUsed === 'number' ? limits.beagleUsed : 0;
  const beaglePct = beagleLimit > 0 ? Math.min(100, Math.round((beagleUsed / beagleLimit) * 100)) : 0;
  const beagleColor =
    beaglePct >= 90 ? colors.danger : beaglePct >= 70 ? '#d97706' : colors.accent;

  const cellSize = 14;
  const cellGap = 3;

  const statCard = (value: string, label: string) => (
    <View
      key={label}
      style={[
        styles.stat,
        {
          backgroundColor: colors.surfaceRaised,
          borderRadius: radius.md,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.sm,
        },
      ]}
    >
      <Text style={[styles.statVal, { color: colors.text, fontFamily: typography.semibold }]}>
        {value}
      </Text>
      <Text style={[styles.statLbl, { color: colors.textMuted }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );

  return (
    <Overlay
      visible={visible}
      onClose={onClose}
      maxWidth={Math.min(720, contentWidth)}
      testID="usage-overlay"
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 16,
          paddingHorizontal: spacing.md,
          paddingTop: spacing.md,
          paddingBottom: spacing.sm,
        },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <Text style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>
          {t('usage.heading') || 'Token usage'}
        </Text>
        <AnimatedPressable onPress={onClose} accessibilityLabel="Close usage" style={styles.closeBtn}>
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </AnimatedPressable>
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      {busy && entries.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: 28 }} />
      ) : (
        <ScrollView style={{ maxHeight: 460, marginTop: spacing.sm }}>
          {beagleLimit > 0 ? (
            <View
              style={[
                styles.beagle,
                {
                  backgroundColor: colors.surfaceRaised,
                  borderRadius: radius.md,
                  padding: spacing.sm,
                  marginBottom: spacing.sm,
                },
              ]}
            >
              <View style={styles.beagleHead}>
                <Text style={[styles.beagleTitle, { color: colors.text, fontFamily: typography.semibold }]}>
                  {t('usage.beagleMonthly') || 'Beagle monthly usage'}
                </Text>
                <Text style={[styles.beagleSub, { color: colors.textMuted }]}>
                  {beagleUsed.toLocaleString()} / {beagleLimit.toLocaleString()} tokens
                </Text>
              </View>
              <View style={[styles.beagleTrack, { backgroundColor: colors.surfacePressed, borderRadius: radius.sm }]}>
                <View
                  style={{
                    width: `${beaglePct}%`,
                    backgroundColor: beagleColor,
                    height: 8,
                    borderRadius: radius.sm,
                  }}
                />
              </View>
              {beaglePct >= 100 ? (
                <Text style={[styles.beagleWarn, { color: colors.danger }]}>
                  {t('usage.beagleLimitReached') || 'Limit reached. Add your own API key to continue using Beagle.'}
                </Text>
              ) : beaglePct >= 80 ? (
                <Text style={[styles.beagleWarn, { color: '#d97706' }]}>
                  {t('usage.beagleNearLimit') || `Approaching monthly limit (${beaglePct}% used).`}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Summary stats — same four cards as the web modal. */}
          <View style={styles.statsGrid}>
            {statCard(totals.tokens.toLocaleString(), t('usage.total') || 'Total tokens')}
            {statCard(totals.messages.toLocaleString(), t('usage.messages') || 'Messages')}
            {statCard(totals.avgTokens.toLocaleString(), t('usage.avgTokensPerDay') || 'Avg tokens / active day')}
            {statCard(totals.avgMessages.toLocaleString(), t('usage.avgMessagesPerDay') || 'Avg msgs / active day')}
          </View>

          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: typography.semibold }]}>
            {t('usage.dailyActivity') || 'Daily activity'}
          </Text>

          {entries.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textMuted, padding: spacing.md }]}>
              {t('usage.empty') || 'No usage recorded yet.'}
            </Text>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  {/* Month labels aligned to week columns. */}
                  <View style={[styles.monthRow, { marginLeft: 26, marginBottom: 4 }]}>
                    {weeks.map((_, col) => {
                      const lbl = monthLabels.find((m) => m.col === col);
                      return (
                        <Text
                          key={col}
                          style={[styles.monthLabel, { color: colors.textMuted, width: cellSize, marginRight: cellGap }]}
                          numberOfLines={1}
                        >
                          {lbl ? lbl.label : ''}
                        </Text>
                      );
                    })}
                  </View>
                  <View style={styles.gridRow}>
                    <View style={styles.dowCol}>
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                        <Text
                          key={d}
                          style={[styles.dowLabel, { color: colors.textMuted, height: cellSize, marginBottom: cellGap }]}
                        >
                          {d}
                        </Text>
                      ))}
                    </View>
                    {weeks.map((week, col) => (
                      <View key={col} style={{ marginRight: cellGap }}>
                        {week.map((cell) => {
                          const alpha = cell.tokens > 0 ? 0.15 + 0.85 * (cell.tokens / maxDay) : 0;
                          return (
                            <View
                              key={cell.key}
                              style={{
                                width: cellSize,
                                height: cellSize,
                                borderRadius: 3,
                                marginBottom: cellGap,
                                backgroundColor: cell.tokens > 0
                                  ? withAlpha(colors.accent, Math.min(1, alpha))
                                  : colors.surfacePressed,
                              }}
                              accessibilityLabel={`${cell.key}: ${cell.tokens.toLocaleString()} tokens`}
                            />
                          );
                        })}
                        {/* Pad a trailing partial week so columns stay aligned. */}
                        {Array.from({ length: 7 - week.length }).map((_, i) => (
                          <View
                            key={`pad-${i}`}
                            style={{ width: cellSize, height: cellSize, marginBottom: cellGap }}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
              </ScrollView>

              {/* Legend */}
              <View style={[styles.legend, { marginTop: spacing.xs }]}>
                <Text style={[styles.legendText, { color: colors.textMuted }]}>
                  {t('usage.less') || 'Less'}
                </Text>
                {[0, 0.25, 0.5, 0.75, 1].map((a) => (
                  <View
                    key={a}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      backgroundColor: a === 0 ? colors.surfacePressed : withAlpha(colors.accent, 0.15 + 0.85 * a),
                    }}
                  />
                ))}
                <Text style={[styles.legendText, { color: colors.textMuted }]}>
                  {t('usage.more') || 'More'}
                </Text>
              </View>
            </>
          )}

          {/* Monthly breakdown — same aggregation the web renders as a table. */}
          {monthly.length > 0 ? (
            <View style={{ marginTop: spacing.sm }}>
              <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: typography.semibold }]}>
                {t('usage.monthlySummary') || 'Monthly summary'}
              </Text>
              <View
                style={[
                  styles.breakdownHead,
                  { borderBottomColor: colors.borderSubtle, paddingVertical: 6 },
                ]}
              >
                <Text style={[styles.bdCell, styles.bdMonth, { color: colors.textMuted }]}>
                  {t('usage.month') || 'Month'}
                </Text>
                <Text style={[styles.bdCell, { color: colors.textMuted }]}>
                  {t('usage.daysActive') || 'Days'}
                </Text>
                <Text style={[styles.bdCell, { color: colors.textMuted }]}>
                  {t('usage.tokens') || 'Tokens'}
                </Text>
                <Text style={[styles.bdCell, { color: colors.textMuted }]}>
                  {t('usage.msgs') || 'Msgs'}
                </Text>
              </View>
              {monthly.map((m) => (
                <View
                  key={m.key}
                  style={[styles.breakdownRow, { borderBottomColor: colors.borderSubtle, paddingVertical: 8 }]}
                >
                  <Text style={[styles.bdCell, styles.bdMonth, { color: colors.text }]}>{m.label}</Text>
                  <Text style={[styles.bdCell, { color: colors.text }]}>{m.days.size}</Text>
                  <Text style={[styles.bdCell, { color: colors.text }]}>{m.tokens.toLocaleString()}</Text>
                  <Text style={[styles.bdCell, { color: colors.text }]}>{m.messages.toLocaleString()}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Plan / tier line (non-Beagle fields only — Beagle gets its own bar). */}
          {limits && typeof limits.plan === 'string' ? (
            <View
              style={[
                styles.planRow,
                {
                  backgroundColor: colors.surfaceRaised,
                  borderRadius: radius.md,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.sm,
                  marginTop: spacing.sm,
                },
              ]}
            >
              <Text style={[styles.planLabel, { color: colors.textMuted }]}>
                {t('usage.limits') || 'Tier limits'}
              </Text>
              <Text style={[styles.planValue, { color: colors.text, fontSize: Math.round(12 * fontScale) }]} numberOfLines={4}>
                {Object.entries(limits)
                  .filter(([key, value]) => key !== 'beagleLimit' && key !== 'beagleUsed' && ['string', 'number', 'boolean'].includes(typeof value))
                  .map(([key, value]) => `${key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}: ${String(value)}`)
                  .join('  ·  ') || t('usage.limitsEmpty') || 'No limits reported'}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </Overlay>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 720, borderWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 10 },
  title: { fontSize: 16 },
  closeBtn: { padding: 6 },
  error: { fontSize: 12, marginTop: 8 },
  beagle: {},
  beagleHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  beagleTitle: { fontSize: 13 },
  beagleSub: { fontSize: 11 },
  beagleTrack: { height: 8, overflow: 'hidden' },
  beagleWarn: { marginTop: 6, fontSize: 11 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  stat: { flexBasis: '47%', flexGrow: 1 },
  statVal: { fontSize: 16 },
  statLbl: { fontSize: 11, marginTop: 2 },
  sectionTitle: { fontSize: 13, marginTop: 14, marginBottom: 6 },
  monthRow: { flexDirection: 'row' },
  monthLabel: { fontSize: 8, overflow: 'hidden' },
  gridRow: { flexDirection: 'row' },
  dowCol: { width: 26 },
  dowLabel: { fontSize: 8, lineHeight: 14 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 10 },
  breakdownHead: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  breakdownRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  bdCell: { flex: 1, fontSize: 11, textAlign: 'right' },
  bdMonth: { flex: 2, textAlign: 'left' },
  planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  planValue: { flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  empty: { textAlign: 'center', fontSize: 13 },
});
