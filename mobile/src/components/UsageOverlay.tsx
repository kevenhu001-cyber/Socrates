import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';
import { Overlay } from './Overlay';
import { usageApi } from '../data/api/client';

export interface UsageOverlayProps {
  visible: boolean;
  onClose: () => void;
}

interface DayRow {
  date: string;
  tokens: number;
  requests: number;
}

export function UsageOverlay({ visible, onClose }: UsageOverlayProps) {
  const { colors, radius, typography, spacing, contentWidth, fontScale } = useTheme();
  const t = useT();
  const [days, setDays] = useState<DayRow[]>([]);
  const [total, setTotal] = useState(0);
  const [limits, setLimits] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<7 | 30>(7);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setBusy(true);
    setError('');
    Promise.all([usageApi.daily(period), usageApi.limits()])
      .then(([d, l]) => {
        if (!active) return;
        setDays((d.days || []) as DayRow[]);
        setTotal(typeof d.total === 'number' ? d.total : 0);
        setLimits(l || null);
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
  }, [visible, period]);

  const maxTokens = days.reduce((m, d) => Math.max(m, d.tokens || 0), 0);

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
          /* frontend `.usage-modal { width: min(720px, 94vw) }`
           * (`styles.css:2311`). */
        },
      ]}
    >
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text, fontFamily: typography.display }]}>
                {t('usage.heading') || 'Token usage'}
              </Text>
              <AnimatedPressable onPress={onClose} accessibilityLabel="Close usage" style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </AnimatedPressable>
            </View>

            <View style={[styles.tabs, { backgroundColor: colors.surfaceRaised, borderRadius: radius.md, marginTop: spacing.sm }]}>
              {([7, 30] as const).map((p) => {
                const active = period === p;
                return (
                  <AnimatedPressable
                    key={p}
                    onPress={() => setPeriod(p)}
                    style={[
                      styles.tab,
                      {
                        backgroundColor: active ? colors.surfaceHover : 'transparent',
                        borderRadius: radius.sm,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        {
                          color: active ? colors.text : colors.textMuted,
                          fontFamily: active ? typography.semibold : typography.medium,
                        },
                      ]}
                    >
                      {p === 7
                        ? t('usage.last7Days') || 'Last 7 days'
                        : t('usage.last30Days') || 'Last 30 days'}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>

            {error ? (
              <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
            ) : null}

            {busy && days.length === 0 ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 28 }} />
            ) : (
              <ScrollView style={{ maxHeight: 360, marginTop: spacing.sm }}>
                <View
                  style={[
                    styles.totalRow,
                    {
                      backgroundColor: colors.surfaceRaised,
                      borderRadius: radius.md,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: spacing.sm,
                      marginBottom: spacing.sm,
                    },
                  ]}
                >
                  <Text style={[styles.totalLabel, { color: colors.textMuted }]}>
                    {t('usage.total') || 'Total tokens'}
                  </Text>
                  <Text style={[styles.totalValue, { color: colors.text, fontFamily: typography.display, fontSize: Math.round(18 * fontScale) }]}>
                    {total.toLocaleString()}
                  </Text>
                </View>
                {days.length === 0 ? (
                  <Text style={[styles.empty, { color: colors.textMuted, padding: spacing.md }]}>
                    {t('usage.empty') || 'No usage recorded yet.'}
                  </Text>
                ) : (
                  days.map((day) => {
                    const widthPct = maxTokens > 0 ? Math.max(0.04, day.tokens / maxTokens) : 0;
                    return (
                      <View key={day.date} style={[styles.row, { paddingVertical: 6 }]}>
                        <Text style={[styles.date, { color: colors.textMuted }]}>{day.date}</Text>
                        <View style={[styles.barTrack, { backgroundColor: colors.surfacePressed, borderRadius: radius.sm }]}>
                          <View
                            style={{
                              width: `${widthPct * 100}%`,
                              backgroundColor: colors.accent,
                              height: 8,
                              borderRadius: radius.sm,
                            }}
                          />
                        </View>
                        <Text style={[styles.tokens, { color: colors.text }]}>{day.tokens.toLocaleString()}</Text>
                      </View>
                    );
                  })
                )}
                {limits ? (
                  <View
                    style={[
                      styles.totalRow,
                      {
                        backgroundColor: colors.surfaceRaised,
                        borderRadius: radius.md,
                        paddingHorizontal: spacing.sm,
                        paddingVertical: spacing.sm,
                        marginTop: spacing.sm,
                      },
                    ]}
                  >
                    <Text style={[styles.totalLabel, { color: colors.textMuted }]}>
                      {t('usage.limits') || 'Tier limits'}
                    </Text>
                    <Text style={[styles.totalValue, { color: colors.text, fontSize: 12 }]} numberOfLines={3}>
                      {JSON.stringify(limits)}
                    </Text>
                  </View>
                ) : null}
              </ScrollView>
            )}
    </Overlay>
  );
}

const styles = StyleSheet.create({
  /* frontend `.usage-modal`: width min(720px, 94vw), radius 16px. */
  card: { width: '100%', maxWidth: 720, borderWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18 },
  closeBtn: { padding: 6 },
  tabs: { flexDirection: 'row', padding: 3 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 32 },
  tabText: { fontSize: 13 },
  error: { fontSize: 12, marginTop: 8 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  totalValue: { fontSize: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  date: { width: 70, fontSize: 11 },
  barTrack: { flex: 1, height: 8, overflow: 'hidden' },
  tokens: { width: 80, fontSize: 12, textAlign: 'right' },
  empty: { textAlign: 'center', fontSize: 13 },
});
