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

export function SearchScreen({ navigation }: Props) {
  const { colors, radius, spacing } = useTheme();
  const t = useT();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const runSearch = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError('');
    try {
      setHits((await searchApi.query({ q: query.trim(), scope: 'all', limit: 50 })).hits);
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
      <TextInput autoFocus value={query} onChangeText={setQuery} onSubmitEditing={runSearch} placeholder={t('search.placeholder')} placeholderTextColor={colors.textSubtle} style={[styles.input, { color: colors.text }]} />
      <AnimatedPressable accessibilityLabel={t('more.search')} onPress={runSearch} style={[styles.go, { backgroundColor: colors.action, borderRadius: radius.pill }]}><Ionicons name="arrow-forward" size={20} color={colors.white} /></AnimatedPressable>
    </View>
    {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    {busy ? <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} /> : (
      <FlatList
        data={hits}
        keyExtractor={(item, index) => String(item.id || item.sessionId || index)}
        contentContainerStyle={{ paddingTop: spacing.md }}
        renderItem={({ item }) => (
          <AnimatedPressable accessibilityLabel={t('search.openSession')} onPress={() => { void openHit(item); }} style={[styles.result, { borderBottomColor: colors.border }]}>
            <Text style={[styles.resultTitle, { color: colors.text }]}>{String(item.title || item.name || t('search.result'))}</Text>
            <View style={styles.resultLine}>
              <Text numberOfLines={2} style={[styles.resultBody, { color: colors.textMuted }]}>{String(item.preview || item.content || item.snippet || '')}</Text>
              <Ionicons name="chevron-forward" size={17} color={colors.textSubtle} />
            </View>
          </AnimatedPressable>
        )}
        ListEmptyComponent={error ? null : (
          <Text style={[styles.empty, { color: colors.textMuted }]}>{searched ? t('search.noMatches') : t('search.prompt')}</Text>
        )}
      />
    )}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 }, content: { flex: 1, paddingHorizontal: 18 }, search: { minHeight: 56, borderWidth: 1, paddingLeft: 16, paddingRight: 8, flexDirection: 'row', alignItems: 'center' }, input: { flex: 1, fontSize: 15 }, go: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, result: { paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth }, resultTitle: { fontSize: 15, fontWeight: '700' }, resultLine: { flexDirection: 'row', alignItems: 'center', gap: 10 }, resultBody: { flex: 1, fontSize: 13, lineHeight: 19, marginTop: 5 }, empty: { textAlign: 'center', marginTop: 50 }, error: { fontSize: 13, lineHeight: 19, marginTop: 14 },
});
