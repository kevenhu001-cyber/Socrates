import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Mistake } from '@socrates/contracts';
import { mistakesApi } from '../data/api/client';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { appStore } from '../stores/appStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Mistakes'>;
type Filter = 'unresolved' | 'resolved';

export function MistakesScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const [filter, setFilter] = useState<Filter>('unresolved');
  const [items, setItems] = useState<Mistake[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async (nextFilter = filter) => {
    setLoading(true);
    setError('');
    try {
      setItems((await mistakesApi.list(nextFilter === 'resolved')).items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('mistakes.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(filter); }, [filter]);

  const updateResolution = async (item: Mistake) => {
    setBusyId(item.id);
    try {
      const updated = await mistakesApi.resolve(item.id, !item.isResolved);
      setItems((current) => current.filter((entry) => entry.id !== updated.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('mistakes.loadFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = (item: Mistake) => Alert.alert(t('mistakes.delete'), item.questionContent, [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('mistakes.delete'),
      style: 'destructive',
      onPress: () => {
        setBusyId(item.id);
        void mistakesApi.remove(item.id)
          .then(() => setItems((current) => current.filter((entry) => entry.id !== item.id)))
          .catch((caught) => setError(caught instanceof Error ? caught.message : t('mistakes.loadFailed')))
          .finally(() => setBusyId(null));
      },
    },
  ]);

  return (
    <Screen style={styles.screen}>
      <AppHeader title={t('mistakes.heading')} onNewChat={() => { appStore.startNewSession('chat'); navigation.navigate('Home'); }} />
      <View style={[styles.filters, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        {(['unresolved', 'resolved'] as const).map((value) => {
          const selected = filter === value;
          return (
            <AnimatedPressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setFilter(value)}
              style={[styles.filterButton, selected && { backgroundColor: colors.surfaceRaised, borderRadius: radius.sm }]}
            >
              <Text style={{ color: selected ? colors.text : colors.textMuted, fontFamily: typography.medium }}>
                {value === 'unresolved' ? t('mistakes.unresolved') : t('mistakes.resolved')}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle-outline" size={40} color={colors.textSubtle} />
          <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.display }]}>{t('mistakes.emptyTitle')}</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>{t('mistakes.emptyBody')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const resolved = !!item.isResolved;
            const busy = busyId === item.id;
            return (
              <View style={[styles.row, { borderBottomColor: colors.border }]}>
                <View style={[styles.marker, { backgroundColor: resolved ? colors.successSoft : colors.dangerSoft, borderRadius: radius.sm }]}>
                  <Ionicons name={resolved ? 'checkmark' : 'alert-outline'} size={18} color={resolved ? colors.success : colors.danger} />
                </View>
                <View style={styles.copy}>
                  <Text style={[styles.question, { color: colors.text, fontFamily: typography.semibold }]}>{item.questionContent}</Text>
                  {item.nodeName ? <Text style={[styles.node, { color: colors.accent }]}>{item.nodeName}</Text> : null}
                  {item.userAnswer ? <Text style={[styles.answer, { color: colors.textMuted }]} numberOfLines={2}>{item.userAnswer}</Text> : null}
                  {item.correctAnswer ? <Text style={[styles.correct, { color: colors.success }]} numberOfLines={2}>{item.correctAnswer}</Text> : null}
                  <View style={styles.actions}>
                    <AnimatedPressable disabled={busy} onPress={() => { void updateResolution(item); }} style={styles.action}>
                      <Text style={{ color: colors.accent, fontSize: 12 }}>{busy ? t('app.loading') : resolved ? t('mistakes.reopen') : t('mistakes.resolve')}</Text>
                    </AnimatedPressable>
                    <AnimatedPressable disabled={busy} accessibilityLabel={t('mistakes.delete')} onPress={() => remove(item)} style={styles.action}>
                      <Ionicons name="trash-outline" size={17} color={colors.textSubtle} />
                    </AnimatedPressable>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  filters: { marginHorizontal: 18, minHeight: 48, padding: 4, borderWidth: 1, borderRadius: 14, flexDirection: 'row' },
  filterButton: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 18, paddingBottom: 24 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 17, borderBottomWidth: StyleSheet.hairlineWidth },
  marker: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  question: { fontSize: 15, lineHeight: 21 },
  node: { fontSize: 11, marginTop: 7 },
  answer: { fontSize: 12, lineHeight: 18, marginTop: 7 },
  correct: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 10 },
  action: { minHeight: 30, justifyContent: 'center' },
  loading: { marginTop: 56 },
  empty: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 120 },
  emptyTitle: { fontSize: 24, textAlign: 'center', marginTop: 13 },
  emptyBody: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 10 },
  error: { marginHorizontal: 18, marginTop: 10, fontSize: 12, lineHeight: 18 },
});
