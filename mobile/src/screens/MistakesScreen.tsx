import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Mistake } from '@socrates/contracts';
import { mistakesApi } from '../data/api/client';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { appStore } from '../stores/appStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Mistakes'>;
type Filter = 'all' | 'unresolved' | 'resolved';

interface ParsedOption {
  letter: string;
  text: string;
  tag: 'correct' | 'wrong' | 'neutral';
}

function parseOptionsAndStem(item: Mistake): { stem: string; options: ParsedOption[] } {
  const content = item.questionContent || '';
  const userAns = (item.userAnswer || '').trim();
  const correctAns = (item.correctAnswer || '').trim();

  // Check if content embeds "A. ... \n B. ... \n C. ... \n D. ..."
  const optionRegex = /(?:^|\n)\s*([A-D])[\.\)]\s*(.+?)(?=\n\s*[A-D][\.\)]|$)/gs;
  const matches = [...content.matchAll(optionRegex)];

  if (matches.length >= 2) {
    const firstMatchIndex = matches[0].index ?? 0;
    const stem = content.slice(0, firstMatchIndex).trim();
    const options: ParsedOption[] = matches.map((m) => {
      const letter = m[1].toUpperCase();
      const text = m[2].trim();
      let tag: 'correct' | 'wrong' | 'neutral' = 'neutral';
      if (correctAns && (letter === correctAns.toUpperCase() || text.toLowerCase() === correctAns.toLowerCase())) {
        tag = 'correct';
      } else if (userAns && (letter === userAns.toUpperCase() || text.toLowerCase() === userAns.toLowerCase())) {
        tag = 'wrong';
      }
      return { letter, text, tag };
    });
    return { stem, options };
  }

  // If no embedded A/B/C/D, build from userAnswer and correctAnswer
  const options: ParsedOption[] = [];
  if (userAns) {
    const letter = userAns.length <= 2 ? userAns.toUpperCase() : 'A';
    options.push({ letter, text: userAns, tag: 'wrong' });
  }
  if (correctAns && correctAns !== userAns) {
    const letter = correctAns.length <= 2 ? correctAns.toUpperCase() : 'B';
    options.push({ letter, text: correctAns, tag: 'correct' });
  }
  return { stem: content, options };
}

function formatTime(isoStr?: string | null): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return '';
  }
}

export function MistakesScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const [filter, setFilter] = useState<Filter>('unresolved');
  const [items, setItems] = useState<Mistake[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Mistake | null>(null);

  const load = async (nextFilter = filter) => {
    setLoading(true);
    setError('');
    try {
      setItems((await mistakesApi.list(nextFilter === 'all' ? undefined : nextFilter === 'resolved')).items);
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

  const remove = (item: Mistake) => setPendingDelete(item);

  const confirmRemove = () => {
    const item = pendingDelete;
    if (!item) return;
    setPendingDelete(null);
    setBusyId(item.id);
    void mistakesApi.remove(item.id)
      .then(() => setItems((current) => current.filter((entry) => entry.id !== item.id)))
      .catch((caught) => setError(caught instanceof Error ? caught.message : t('mistakes.loadFailed')))
      .finally(() => setBusyId(null));
  };

  const handleRedo = async (item: Mistake) => {
    const parsed = parseOptionsAndStem(item);
    setBusyId(item.id);
    setError('');
    try {
      const ok = await appStore.openMistakeRedo({
        sessionId: item.sessionId,
        source: item.source,
        question: parsed.stem || item.questionContent,
        options: parsed.options.map(({ letter, text }) => ({ letter, text })),
        correctAnswer: item.correctAnswer,
      });
      if (ok) navigation.navigate('Chat');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('mistakes.loadFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen style={styles.screen}>
      <AppHeader title={t('mistakes.heading')} onNewChat={() => { appStore.startNewSession('chat'); navigation.navigate('Home'); }} />

      {/* 1:1 Parity with frontend `.mistake-filter-bar` (styles.css:4223-4240) */}
      <View style={[styles.filterBar, { borderBottomColor: withAlpha(colors.border, 0.12) }]}>
        {(['all', 'unresolved', 'resolved'] as const).map((value) => {
          const selected = filter === value;
          const label = value === 'all'
            ? t('mistakes.all') || 'All'
            : value === 'unresolved'
              ? t('mistakes.unresolved') || 'Unresolved'
              : t('mistakes.resolved') || 'Conquered';
          return (
            <AnimatedPressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setFilter(value)}
              style={[
                styles.filterBtn,
                selected && [styles.filterBtnActive, { backgroundColor: withAlpha(colors.surfaceRaised, 0.6) }],
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  {
                    color: selected ? colors.text : colors.textMuted,
                    fontFamily: selected ? typography.semibold : typography.medium,
                  },
                ]}
              >
                {label}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger, fontFamily: typography.body }]}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle-outline" size={40} color={colors.textSubtle} />
          <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.display }]}>
            {t('mistakes.emptyTitle') || 'No mistakes recorded'}
          </Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted, fontFamily: typography.body }]}>
            {filter === 'resolved'
              ? (t('mistakes.emptyResolved') || 'No resolved mistakes yet. Mark mistakes as conquered after redoing them.')
              : (t('mistakes.emptyBody') || 'Wrong quiz picks and incorrect practice attempts will land here for review.')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const resolved = Boolean(item.isResolved);
            const busy = busyId === item.id;
            const { stem, options } = parseOptionsAndStem(item);
            const timeStr = formatTime(item.collectedAt);

            return (
              /* 1:1 Parity with frontend `.mistake-card` (styles.css:3296-3315) */
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: resolved ? withAlpha(colors.surface, 0.4) : 'rgba(127, 29, 29, 0.16)',
                    borderColor: resolved ? withAlpha(colors.border, 0.3) : 'rgba(220, 38, 38, 0.35)',
                    borderLeftColor: resolved ? colors.success : colors.danger,
                  },
                ]}
              >
                {/* Meta line: TYPE / TOPIC / TIME / CONQUERED TAG */}
                <View style={styles.metaRow}>
                  <View style={[styles.typeBadge, { backgroundColor: resolved ? 'rgba(34, 197, 94, 0.25)' : 'rgba(220, 38, 38, 0.3)' }]}>
                    <Text style={[styles.typeText, { color: resolved ? '#86efac' : '#fca5a5' }]}>
                      {item.source || 'QUIZ'}
                    </Text>
                  </View>
                  {item.nodeName ? (
                    <Text numberOfLines={1} style={[styles.topicText, { color: colors.textMuted }]}>
                      {item.nodeName}
                    </Text>
                  ) : null}
                  {timeStr ? (
                    <Text style={[styles.timeText, { color: colors.textSubtle }]}>
                      {timeStr}
                    </Text>
                  ) : null}
                  {resolved ? (
                    <View style={styles.conqueredBadge}>
                      <Text style={styles.conqueredText}>conquered</Text>
                    </View>
                  ) : null}
                </View>

                {/* Question Stem */}
                <Text style={[styles.questionStem, { color: colors.text, fontFamily: typography.body }]}>
                  {stem}
                </Text>

                {/* Options with A/B/C/D tag chips (.mistake-opt.correct-tag / .wrong-tag) */}
                {options.length > 0 ? (
                  <View style={styles.optionsList}>
                    {options.map((opt, optIdx) => {
                      const isCorrect = opt.tag === 'correct';
                      const isWrong = opt.tag === 'wrong';
                      return (
                        <View
                          key={`${opt.letter}-${optIdx}`}
                          style={[
                            styles.optionRow,
                            isCorrect && styles.optionRowCorrect,
                            isWrong && styles.optionRowWrong,
                          ]}
                        >
                          <View
                            style={[
                              styles.letterBadge,
                              { borderColor: withAlpha(colors.textSubtle, 0.4) },
                              isCorrect && styles.letterBadgeCorrect,
                              isWrong && styles.letterBadgeWrong,
                            ]}
                          >
                            <Text
                              style={[
                                styles.letterText,
                                { color: colors.textMuted },
                                (isCorrect || isWrong) && styles.letterTextActive,
                              ]}
                            >
                              {opt.letter}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.optionText,
                              { color: colors.text },
                              isCorrect && styles.optionTextCorrect,
                              isWrong && styles.optionTextWrong,
                            ]}
                          >
                            {opt.text}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {/* Redo Quiz Button (.mistake-redo-btn styles.css:3310-3311) */}
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel={t('mistakes.redo') || 'Redo'}
                  disabled={busy}
                  onPress={() => { void handleRedo(item); }}
                  style={[
                    styles.redoBtn,
                    {
                      backgroundColor: withAlpha(colors.accent, 0.12),
                      borderColor: withAlpha(colors.accent, 0.3),
                    },
                  ]}
                >
                  <Text style={[styles.redoBtnText, { color: colors.accent }]}>
                    {t('mistakes.redo') || 'Redo Quiz'}
                  </Text>
                </AnimatedPressable>

                {/* Actions row: Conquered / Reopen + Delete */}
                <View style={[styles.actionsRow, { borderTopColor: withAlpha(colors.border, 0.1) }]}>
                  <AnimatedPressable
                    disabled={busy}
                    onPress={() => { void updateResolution(item); }}
                    style={styles.actionBtn}
                  >
                    <Ionicons
                      name={resolved ? 'refresh-outline' : 'checkmark-circle-outline'}
                      size={15}
                      color={resolved ? colors.accent : colors.success}
                    />
                    <Text
                      style={[
                        styles.actionBtnText,
                        { color: resolved ? colors.accent : colors.success },
                      ]}
                    >
                      {busy ? (t('app.loading') || '...') : resolved ? (t('mistakes.reopen') || 'Reopen') : (t('mistakes.resolve') || 'Mark conquered')}
                    </Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    disabled={busy}
                    accessibilityLabel={t('mistakes.delete') || 'Delete'}
                    onPress={() => remove(item)}
                    style={styles.actionBtn}
                  >
                    <Ionicons name="trash-outline" size={15} color={colors.textSubtle} />
                  </AnimatedPressable>
                </View>
              </View>
            );
          }}
        />
      )}

      <ConfirmDialog
        visible={pendingDelete !== null}
        title={t('mistakes.delete') || 'Delete mistake'}
        message={pendingDelete?.questionContent}
        confirmLabel={t('mistakes.delete') || 'Delete'}
        cancelLabel={t('common.cancel') || 'Cancel'}
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmRemove}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  filterBar: {
    display: 'flex',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'transparent',
  },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  filterBtnActive: {},
  filterText: {
    fontSize: 11,
  },
  list: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  card: {
    marginHorizontal: 4,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 0.5,
    borderLeftWidth: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  topicText: {
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  timeText: {
    fontSize: 10,
    marginLeft: 'auto',
  },
  conqueredBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  conqueredText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#86efac',
    textTransform: 'uppercase',
  },
  questionStem: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  optionsList: {
    flexDirection: 'column',
    gap: 3,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  optionRowCorrect: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  optionRowWrong: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
  },
  letterBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  letterBadgeCorrect: {
    borderColor: '#22c55e',
    backgroundColor: '#22c55e',
  },
  letterBadgeWrong: {
    borderColor: '#ef4444',
    backgroundColor: '#ef4444',
  },
  letterText: {
    fontSize: 9,
    fontWeight: '600',
  },
  letterTextActive: {
    color: '#ffffff',
  },
  optionText: {
    fontSize: 11.5,
    lineHeight: 16,
    flex: 1,
  },
  optionTextCorrect: {
    color: '#4ade80',
  },
  optionTextWrong: {
    color: '#f87171',
  },
  redoBtn: {
    width: '100%',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  redoBtnText: {
    fontSize: 11,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '500',
  },
  loading: {
    marginTop: 56,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 22,
    textAlign: 'center',
    marginTop: 12,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  error: {
    marginHorizontal: 16,
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
  },
});
