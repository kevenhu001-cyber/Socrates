import React, { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { searchApi } from '../data/api/client';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Search'>;

/* No shared search-history store exists yet, so keep the last 5 submitted
 * queries in module state — survives navigation within the app session. */
const recentSearches: string[] = [];
function rememberQuery(q: string) {
  const idx = recentSearches.indexOf(q);
  if (idx >= 0) recentSearches.splice(idx, 1);
  recentSearches.unshift(q);
  if (recentSearches.length > 5) recentSearches.length = 5;
}

function hitKindLabel(item: Record<string, unknown>): string {
  const kind = String(item.kind || '');
  if (kind === 'message') return 'Message';
  if (String(item.mode || '') === 'tutor') return 'Tutor';
  return 'Chat';
}

export function SearchScreen({ navigation }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const t = useT();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const runSearch = async (text?: string) => {
    const q = (text ?? query).trim();
    if (!q) return;
    if (text !== undefined) setQuery(text);
    setBusy(true);
    setError('');
    try {
      setHits((await searchApi.query({ q, scope: 'all', limit: 50 })).hits);
      rememberQuery(q);
    } catch (caught) {
      // A failed request used to silently show the "start searching" prompt.
      setHits([]);
      setError(caught instanceof Error ? caught.message : t('search.failed'));
    } finally {
      setBusy(false);
      setSearched(true);
    }
  };
  const openHit = async (item: Record<string, unknown>) => {
    const sessionId = String(item.sessionId || (item.kind === 'session' ? item.id || '' : ''));
    if (!sessionId) return;
    try {
      await import('../stores/appStore').then(({ appStore }) => appStore.openSession(sessionId));
      navigation.navigate('Chat');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('search.failed'));
    }
  };
  return <Screen style={styles.screen}>
    <AppHeader title={t('more.search')} onNewChat={() => navigation.navigate('Home')} />
    <View style={styles.content}>
    <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
      <TextInput autoFocus value={query} onChangeText={setQuery} onSubmitEditing={() => { void runSearch(); }} placeholder={t('search.placeholder')} placeholderTextColor={colors.textSubtle} style={[styles.input, { color: colors.text, fontFamily: typography.body }]} />
      <AnimatedPressable accessibilityLabel={t('more.search')} onPress={() => { void runSearch(); }} style={[styles.go, { backgroundColor: colors.action, borderRadius: radius.pill }]}><Ionicons name="arrow-forward" size={20} color={colors.white} /></AnimatedPressable>
    </View>
    {error ? <Text style={[styles.error, { color: colors.danger, fontFamily: typography.body }]}>{error}</Text> : null}
    {busy ? <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} /> : (
      <FlatList
        data={hits}
        keyExtractor={(item, index) => String(item.id || item.sessionId || index)}
        contentContainerStyle={{ paddingTop: spacing.md }}
        renderItem={({ item }) => (
          <AnimatedPressable accessibilityLabel={t('search.openSession')} onPress={() => { void openHit(item); }} style={[styles.result, { borderBottomColor: colors.border }]}>
            <View style={styles.resultHead}>
              <Text style={[styles.resultKind, { color: colors.textSubtle, fontFamily: typography.medium }]}>{hitKindLabel(item)}</Text>
              <Text numberOfLines={1} style={[styles.resultTitle, { color: colors.text, fontFamily: typography.semibold }]}>{String(item.title || item.name || item.snippet || t('search.result'))}</Text>
            </View>
            <View style={styles.resultLine}>
              <Text numberOfLines={2} style={[styles.resultBody, { color: colors.textMuted, fontFamily: typography.body }]}>{String(item.preview || item.content || item.snippet || '')}</Text>
              <Ionicons name="chevron-forward" size={17} color={colors.textSubtle} />
            </View>
          </AnimatedPressable>
        )}
        ListEmptyComponent={error ? null : searched ? (
          <Text style={[styles.empty, { color: colors.textMuted, fontFamily: typography.body }]}>{t('search.noMatches')}</Text>
        ) : (
          <View style={styles.emptyWrap}>
            <Text style={[styles.empty, { color: colors.textMuted, fontFamily: typography.body }]}>{t('search.prompt')}</Text>
            {recentSearches.length ? (
              <View style={styles.recentList}>
                {recentSearches.map((q) => (
                  <AnimatedPressable key={q} accessibilityRole="button" onPress={() => { void runSearch(q); }} style={styles.recentRow}>
                    <Ionicons name="time-outline" size={15} color={colors.textSubtle} />
                    <Text numberOfLines={1} style={[styles.recentText, { color: colors.text, fontFamily: typography.body }]}>{q}</Text>
                  </AnimatedPressable>
                ))}
              </View>
            ) : null}
          </View>
        )}
      />
    )}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 }, content: { flex: 1, paddingHorizontal: 18 }, search: { minHeight: 56, borderWidth: 1, paddingLeft: 16, paddingRight: 8, flexDirection: 'row', alignItems: 'center' }, input: { flex: 1, fontSize: 15 }, go: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, result: { paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth }, resultHead: { flexDirection: 'row', alignItems: 'center', gap: 8 }, resultKind: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }, resultTitle: { flex: 1, fontSize: 14 }, resultLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }, resultBody: { flex: 1, fontSize: 13, lineHeight: 19, marginTop: 5 }, emptyWrap: { paddingTop: 0 }, empty: { textAlign: 'center', marginTop: 50 }, recentList: { marginTop: 24 }, recentRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 }, recentText: { flex: 1, fontSize: 14 }, error: { fontSize: 13, lineHeight: 19, marginTop: 14 },
});
