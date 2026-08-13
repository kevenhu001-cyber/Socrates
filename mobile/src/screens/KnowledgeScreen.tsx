import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { KnowledgeNode } from '@socrates/contracts';
import { knowledgeApi } from '../data/api/client';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { appStore } from '../stores/appStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Knowledge'>;

export function KnowledgeScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const [items, setItems] = useState<KnowledgeNode[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void knowledgeApi.list().then((result) => { setItems(result.items); setSummary(result.summary); }).catch((caught) => setError(caught instanceof Error ? caught.message : t('knowledge.loadFailed'))).finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, KnowledgeNode>();
    items.forEach((item) => {
      const key = item.nodeName || item.sessionTitle || 'Unknown';
      const existing = map.get(key);
      if (!existing || statusRank(item.status) > statusRank(existing.status)) map.set(key, item);
    });
    return [...map.values()].sort((a, b) => statusRank(a.status) - statusRank(b.status));
  }, [items]);

  return <Screen style={styles.screen}>
    <AppHeader title={t('knowledge.heading')} onNewChat={() => { appStore.startNewSession('chat'); navigation.navigate('Home'); }} />
    {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    {loading ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : grouped.length === 0 ? <View style={styles.empty}><Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.display }]}>{t('knowledge.emptyTitle')}</Text><Text style={[styles.emptyBody, { color: colors.textMuted }]}>{t('knowledge.emptyBody')}</Text></View> : <FlatList data={grouped} keyExtractor={(item, index) => `${item.nodeName || item.sessionId}-${index}`} contentContainerStyle={styles.list} ListHeaderComponent={<View style={styles.summary}><Text style={[styles.total, { color: colors.text, fontFamily: typography.display }]}>{t('knowledge.total', { count: summary.total || grouped.length })}</Text><View style={styles.legend}>{(['internalized', 'fuzzy', 'blank'] as const).map((status) => <View key={status} style={styles.legendItem}><View style={[styles.dot, { backgroundColor: statusColor(status, colors) }]} /><Text style={{ color: colors.textMuted, fontSize: 11 }}>{t(`knowledge.${status}`)}</Text></View>)}</View></View>} renderItem={({ item }) => <View style={[styles.row, { borderBottomColor: colors.border }]}><View style={[styles.dot, { backgroundColor: statusColor(item.status, colors) }]} /><View style={styles.copy}><Text style={[styles.name, { color: colors.text, fontFamily: typography.semibold }]}>{item.nodeName || item.sessionTitle || '—'}</Text><Text numberOfLines={1} style={[styles.source, { color: colors.textMuted }]}>{item.sessionTitle || ''}</Text></View><Text style={{ color: statusColor(item.status, colors), fontSize: 11 }}>{t(`knowledge.${item.status === 'internalized' || item.status === 'fuzzy' ? item.status : 'blank'}`)}</Text></View>} />}
  </Screen>;
}

function statusRank(status: string) { return status === 'internalized' ? 3 : status === 'fuzzy' ? 2 : 1; }
function statusColor(status: string, colors: ReturnType<typeof import('../theme/ThemeProvider').useTheme>['colors']) { return status === 'internalized' ? colors.success : status === 'fuzzy' ? colors.accent : colors.textSubtle; }
const styles = StyleSheet.create({ screen: { paddingTop: 0 }, list: { paddingHorizontal: 18, paddingBottom: 24 }, summary: { paddingVertical: 18 }, total: { fontSize: 24 }, legend: { flexDirection: 'row', gap: 14, marginTop: 12 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, dot: { width: 9, height: 9, borderRadius: 5 }, row: { minHeight: 68, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 }, copy: { flex: 1, minWidth: 0 }, name: { fontSize: 15 }, source: { fontSize: 11, marginTop: 4 }, loading: { marginTop: 50 }, empty: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 130 }, emptyTitle: { fontSize: 24, textAlign: 'center' }, emptyBody: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 10 }, error: { marginHorizontal: 18, marginTop: 8, fontSize: 12 } });
