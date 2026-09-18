import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardEvent,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { useAppStore, appStore } from '../stores/appStore';
import { useThemeController } from '../theme/ThemeProvider';
import { cmdKStore } from './cmdKStore';
import { profileOverlay } from '../components/AppDrawer';
import { usageOverlay, storageOverlay } from './overlayStores';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type CmdKind = 'nav' | 'session' | 'theme' | 'skills' | 'settings';

interface Command {
  id: string;
  kind: CmdKind;
  title: string;
  hint?: string;
  icon: keyof typeof Ionicons.glyphMap;
  run: () => void | Promise<void>;
}

function score(item: Command, q: string): number {
  if (!q) return 1; // empty query shows everything
  const needle = q.toLowerCase();
  const hay = `${item.title} ${item.hint ?? ''}`.toLowerCase();
  if (hay.startsWith(needle)) return 100;
  const idx = hay.indexOf(needle);
  if (idx === 0) return 80;
  if (idx > 0) return 60 - Math.min(idx, 50);
  // token contains any char of query
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length ? 20 : 0;
}

export function CmdKPalette() {
  const { colors, radius, spacing, typography, contentWidth, fontScale } = useTheme();
  const fs = (n: number) => Math.round(n * fontScale);
  const t = useT();
  const nav = useNavigation<Nav>();
  const { mode: themeMode, setPreference: setThemePreference } = useThemeController();
  const state = useAppStore();
  const sessions = state.sessions;
  const [open, setOpen] = useState(cmdKStore.isOpen());
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listRef = useRef<FlatList<Command>>(null);
  const inputRef = useRef<TextInput>(null);
  const keyboardHeight = useRef(0);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    return cmdKStore.subscribe((next) => {
      setOpen(next);
      if (next) {
        setQuery('');
        setSelected(0);
        setTimeout(() => inputRef.current?.focus(), 80);
      } else {
        Keyboard.dismiss();
      }
    });
  }, []);

  useEffect(() => {
    const show = (e: KeyboardEvent) => {
      keyboardHeight.current = e.endCoordinates?.height ?? 0;
      setKeyboardOffset(keyboardHeight.current);
    };
    const hide = () => {
      keyboardHeight.current = 0;
      setKeyboardOffset(0);
    };
    const subShow = Keyboard.addListener('keyboardDidShow', show);
    const subHide = Keyboard.addListener('keyboardDidHide', hide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const navigate = (route: keyof RootStackParamList) => {
    cmdKStore.close();
    setTimeout(() => nav.navigate(route as never), 0);
  };

  const navItems: Command[] = useMemo(
    () => [
      { id: 'nav.home', kind: 'nav', title: t('sidebar.nav.chat') || 'Chat', icon: 'chatbubble-outline', run: () => navigate('Home') },
      { id: 'nav.chat', kind: 'nav', title: t('sidebar.nav.new') || 'New chat', icon: 'add-circle-outline', run: () => navigate('Home') },
      { id: 'nav.tutor', kind: 'nav', title: t('sidebar.nav.tutor') || 'Tutor', icon: 'school-outline', run: () => navigate('Tutor') },
      { id: 'nav.library', kind: 'nav', title: t('sidebar.nav.library') || 'Library', icon: 'folder-outline', run: () => navigate('Library') },
      { id: 'nav.exam', kind: 'nav', title: t('sidebar.nav.exam') || 'Exam', icon: 'document-text-outline', run: () => navigate('ExamSession') },
      { id: 'nav.search', kind: 'nav', title: t('sidebar.nav.search') || 'Search', icon: 'search-outline', run: () => navigate('Search') },
      { id: 'nav.projects', kind: 'nav', title: t('sidebar.nav.projects') || 'Projects', icon: 'cube-outline', run: () => navigate('Projects') },
      { id: 'nav.scheduled', kind: 'nav', title: t('sidebar.nav.scheduled') || 'Scheduled', icon: 'time-outline', run: () => navigate('Scheduled') },
      { id: 'nav.plugins', kind: 'nav', title: t('sidebar.nav.plugins') || 'Plugins', icon: 'extension-puzzle-outline', run: () => navigate('Plugins') },
      {
        id: 'nav.settings',
        kind: 'nav',
        title: t('more.settings') || 'Settings',
        icon: 'settings-outline',
        run: () => navigate('Settings'),
      },
    ],
    // The translation hook fires on language switch; refresh titles on t change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  const recentSessions: Command[] = useMemo(
    () =>
      sessions.slice(0, 8).map((session) => ({
        id: `session.${session.id}`,
        kind: 'session' as const,
        title: session.title || session.topic || t('chat.newConversation') || 'Untitled',
        hint: session.mode === 'tutor' ? t('sidebar.nav.tutor') : t('sidebar.nav.chat'),
        icon: (session.mode === 'tutor' ? 'school-outline' : 'chatbubble-outline') as keyof typeof Ionicons.glyphMap,
        run: async () => {
          cmdKStore.close();
          try {
            await appStore.openSession(session.id);
            nav.navigate('Chat');
          } catch {
            /* ignore — surface in toast later */
          }
        },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, t]
  );

  const themeItem: Command[] = useMemo(
    () => [
      {
        id: 'theme.toggle',
        kind: 'theme' as const,
        title:
          themeMode === 'dark'
            ? t('display.themeLight') || 'Switch to light'
            : t('display.themeDark') || 'Switch to dark',
        icon: themeMode === 'dark' ? 'sunny-outline' : 'moon-outline',
        run: () => {
          cmdKStore.close();
          void setThemePreference(themeMode === 'dark' ? 'light' : 'dark');
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themeMode, t]
  );

  const skillItem: Command[] = useMemo(
    () => [
      {
        id: 'skill.templates',
        kind: 'skills' as const,
        title: t('sidebar.more.skills') || 'Skills & shortcuts',
        hint: t('composer.menu.skillsHint') || 'Create your own',
        icon: 'flash-outline',
        run: () => {
          cmdKStore.close();
          (nav.navigate as (route: string, params: unknown) => void)('Embedded', { target: 'skills', title: 'skills' });
        },
      },
      {
        id: 'skill.apiSettings',
        kind: 'settings' as const,
        title: 'API Settings',
        icon: 'key-outline',
        run: () => {
          cmdKStore.close();
          navigate('Settings');
        },
      },
      {
        id: 'overlays.usage',
        kind: 'settings' as const,
        title: t('usage.heading') || 'Token usage',
        icon: 'analytics-outline',
        run: () => {
          cmdKStore.close();
          usageOverlay.open();
        },
      },
      {
        id: 'overlays.profile',
        kind: 'settings' as const,
        title: t('profile.heading') || 'Account',
        icon: 'person-circle-outline',
        run: () => {
          cmdKStore.close();
          profileOverlay.open();
        },
      },
      {
        id: 'overlays.storage',
        kind: 'settings' as const,
        title: t('storage.heading') || 'Storage',
        icon: 'server-outline',
        run: () => {
          cmdKStore.close();
          storageOverlay.open();
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  const all: Command[] = useMemo(
    () => [...navItems, ...recentSessions, ...themeItem, ...skillItem],
    [navItems, recentSessions, themeItem, skillItem]
  );

  const filtered: Command[] = useMemo(() => {
    if (!query.trim()) return all;
    const scored = all
      .map((item) => ({ item, s: score(item, query.trim()) }))
      .filter((entry) => entry.s > 0)
      .sort((a, b) => b.s - a.s);
    return scored.map((entry) => entry.item);
  }, [all, query]);

  useEffect(() => {
    if (selected >= filtered.length) setSelected(0);
  }, [filtered, selected]);

  const execute = (item: Command) => {
    setOpen(false);
    cmdKStore.close();
    void item.run();
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => {
        cmdKStore.close();
      }}
      statusBarTranslucent
    >
      <Pressable
        accessibilityLabel="Close command palette"
        onPress={() => cmdKStore.close()}
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}
      >
        <KeyboardAvoidingViewWrapper offset={keyboardOffset}>
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={[
              styles.panel,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: 14,
              },
            ]}
          >
            <View
              style={[
                styles.searchRow,
                {
                  borderBottomColor: colors.border,
                  paddingHorizontal: spacing.md,
                },
              ]}
            >
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                placeholder={t('search.placeholder') || 'Search anything…'}
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, fontFamily: typography.body, fontSize: fs(15) }]}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                onKeyPress={(e) => {
                  // No-op on native; on web Cmd+K intercept handled in host.
                  if (e.nativeEvent.key === 'Escape') cmdKStore.close();
                }}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear">
                  <Ionicons name="close-circle" size={18} color={colors.textSubtle} />
                </Pressable>
              ) : null}
            </View>
            <FlatList
              ref={listRef}
              data={filtered}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 360 }}
              renderItem={({ item, index }) => {
                const active = index === selected;
                return (
                  <Pressable
                    onPress={() => execute(item)}
                    onHoverIn={Platform.OS === 'web' ? () => setSelected(index) : undefined}
                    style={[
                      styles.row,
                      {
                        backgroundColor: active ? colors.surfaceHover : 'transparent',
                        paddingHorizontal: spacing.md,
                      },
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={18}
                      color={active ? colors.accent : colors.textMuted}
                    />
                    <View style={styles.rowText}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.rowTitle,
                          {
                            color: active ? colors.text : colors.text,
                            fontFamily: active ? typography.semibold : typography.body,
                            fontSize: fs(14),
                          },
                        ]}
                      >
                        {item.title}
                      </Text>
                      {item.hint ? (
                        <Text
                          numberOfLines={1}
                          style={[styles.rowHint, { color: colors.textMuted, fontSize: fs(12) }]}
                        >
                          {item.hint}
                        </Text>
                      ) : null}
                    </View>
                    {item.kind === 'session' ? (
                      <Text style={[styles.rowKind, { color: colors.textSubtle, fontSize: fs(11) }]}>
                        {(t('cmdK.sessionLabel') as string) || 'recent'}
                      </Text>
                    ) : item.kind === 'theme' ? (
                      <Text style={[styles.rowKind, { color: colors.textSubtle, fontSize: fs(11) }]}>
                        {(t('cmdK.themeLabel') as string) || 'theme'}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text
                  style={[
                    styles.empty,
                    { color: colors.textMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.lg },
                  ]}
                >
                  {t('search.noMatches') || 'No matches'}
                </Text>
              }
            />
            <View
              style={[
                styles.footer,
                { borderTopColor: colors.border, paddingHorizontal: spacing.md },
              ]}
            >
              <Text style={[styles.footerText, { color: colors.textSubtle, fontSize: fs(11) }]}>
                {(t('cmdK.footer') as string) || '↑↓ to navigate · enter to run · esc to close'}
              </Text>
            </View>
          </Pressable>
        </KeyboardAvoidingViewWrapper>
      </Pressable>
    </Modal>
  );
}

/* Wrap the floating panel in a small view that lifts above the keyboard
 * on iOS. The KeyboardAvoidingView component lives at the bottom of this
 * file to keep the main component tree flat. */
function KeyboardAvoidingViewWrapper({
  offset,
  children,
}: {
  offset: number;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.center, { paddingBottom: offset }]}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 88, paddingHorizontal: 16 },
  /* frontend `.cmdk-panel`: width min(640px, 92vw), radius 14px. */
  inner: { width: '100%', maxWidth: 640 },
  panel: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingVertical: 8,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14 },
  rowHint: { fontSize: 12, marginTop: 2 },
  rowKind: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  empty: { textAlign: 'center', fontSize: 13 },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  footerText: { fontSize: 11, textAlign: 'center' },
});
