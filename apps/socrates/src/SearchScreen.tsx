import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SearchHit, Session } from '@socrates/contracts';
import type { ThemeMode } from '@socrates/theme';
import { getThemePaletteHex } from '@socrates/theme';

// Search screen — migration module 6 (Chat → Sidebar/Nav → Auth → Settings
// → Library/Projects → Search → …). Pure RN UI; App.tsx owns fetching.
// Local session titles filter instantly; the server full-text index
// (POST /api/search over sessions + messages) is debounced and dropped
// when a newer query overtakes it. Snippets may carry <mark> highlights;
// they are stripped to literal text — markup from search never executes.
export function stripSearchMarks(snippet: string): string {
  return snippet.replace(/<\/?mark>/gi, '');
}

export function SearchScreen({
  mode,
  sessions,
  serverSearch,
  onOpenSession,
  onClose,
}: {
  mode: ThemeMode;
  /** Local sessions for instant title/topic filtering (guest-safe). */
  sessions: Session[];
  /** Server full-text search; null when signed out/guest (local only). */
  serverSearch: ((query: string) => Promise<SearchHit[]>) | null;
  onOpenSession(sessionId: string): void;
  onClose(): void;
}) {
  const p = getThemePaletteHex(mode);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const needle = query.trim().toLowerCase();
  const local = useMemo(() => {
    if (needle.length < 2) return [];
    return sessions.filter((s) => !s.archivedAt && (`${s.title || ''} ${s.topic || ''}`.toLowerCase().includes(needle))).slice(0, 20);
  }, [sessions, needle]);

  useEffect(() => {
    if (!serverSearch || needle.length < 2) {
      setHits([]); setSearching(false); setError(null);
      return;
    }
    const id = ++requestId.current;
    setSearching(true); setError(null);
    const timer = setTimeout(() => {
      void serverSearch(query.trim()).then((result) => {
        if (requestId.current !== id) return;
        setHits(result); setSearching(false);
      }).catch((failure) => {
        if (requestId.current !== id) return;
        setError(failure instanceof Error ? failure.message : 'Search failed'); setSearching(false);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, serverSearch]);

  const showResults = needle.length >= 2;
  return (
    <View style={[styles.wrap, { backgroundColor: p.bg.page }]}>
      <View style={[styles.header, { borderBottomColor: p.border.default }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to chat" onPress={onClose} style={styles.back}>
          <Text style={[styles.backText, { color: p.text.primary }]}>‹</Text>
        </Pressable>
        <TextInput
          accessibilityLabel="Search conversations"
          value={query}
          onChangeText={setQuery}
          placeholder="Search conversations"
          placeholderTextColor={p.text.muted}
          autoFocus
          style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]}
        />
      </View>
      <View style={styles.body}>
        {!showResults ? (
          <Text style={[styles.status, { color: p.text.muted }]}>Type at least 2 characters to search titles, topics and messages.</Text>
        ) : (
          <FlatList
            data={[
              ...local.map((s) => ({ key: `local-${s.id}`, kind: 'local' as const, session: s })),
              ...hits.map((h, i) => ({ key: `hit-${h.kind}-${h.id}-${i}`, kind: 'hit' as const, hit: h })),
            ]}
            keyExtractor={(item) => item.key}
            ListEmptyComponent={
              searching ? (
                <Text style={[styles.status, { color: p.text.muted }]}>Searching…</Text>
              ) : error ? (
                <Text accessibilityRole="alert" style={[styles.status, { color: p.danger }]}>{error}</Text>
              ) : (
                <Text style={[styles.status, { color: p.text.muted }]}>No results for “{query.trim()}”.</Text>
              )
            }
            renderItem={({ item }) => {
              if (item.kind === 'local') {
                const s = item.session;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${s.title || s.topic || 'Untitled'}`}
                    onPress={() => onOpenSession(s.id)}
                    style={[styles.row, { borderColor: p.border.default }]}
                  >
                    <Text numberOfLines={1} style={[styles.rowTitle, { color: p.text.primary }]}>{s.title || s.topic || 'Untitled'}</Text>
                    <Text style={[styles.rowSub, { color: p.text.muted }]}>Conversation</Text>
                  </Pressable>
                );
              }
              const h = item.hit;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${h.kind === 'session' ? h.title || h.topic || 'conversation' : 'message in conversation'}`}
                  onPress={() => onOpenSession(h.sessionId)}
                  style={[styles.row, { borderColor: p.border.default }]}
                >
                  <Text numberOfLines={1} style={[styles.rowTitle, { color: p.text.primary }]}>
                    {h.kind === 'session' ? h.title || h.topic || 'Untitled' : `Message · ${stripSearchMarks(h.snippet || '').slice(0, 80)}`}
                  </Text>
                  {h.snippet ? (
                    <Text numberOfLines={2} style={[styles.rowSub, { color: p.text.secondary }]}>{stripSearchMarks(h.snippet)}</Text>
                  ) : null}
                  <Text style={[styles.rowSub, { color: p.text.muted }]}>{h.kind === 'session' ? 'Conversation' : 'Message match'}</Text>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  back: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 26 },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  body: { flex: 1, width: '100%', maxWidth: 768, alignSelf: 'center', padding: 16 },
  row: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSub: { fontSize: 13, marginTop: 4 },
  status: { textAlign: 'center', marginVertical: 12 },
});
