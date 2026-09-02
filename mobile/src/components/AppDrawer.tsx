import React, { createContext, useContext, useMemo, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { EmbeddedTarget, Session } from '@socrates/contracts';
import { useTheme, useThemeController } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { appStore, useAppStore } from '../stores/appStore';
import { BrandMark } from './BrandMark';
import { AnimatedPressable } from './AnimatedPressable';

type DrawerContextValue = {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const DrawerContext = createContext<DrawerContextValue>({
  open: false,
  openDrawer: () => undefined,
  closeDrawer: () => undefined,
});

export function AppDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({
    open,
    openDrawer: () => setOpen(true),
    closeDrawer: () => setOpen(false),
  }), [open]);
  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export function useAppDrawer() {
  return useContext(DrawerContext);
}

export type NativeDestination =
  | 'Home'
  | 'Chat'
  | 'Tutor'
  | 'Library'
  | 'Search'
  | 'ExamSession'
  | 'Settings'
  | 'More'
  | 'Workspace'
  | 'Projects'
  | 'Scheduled'
  | 'Plugins'
  | 'Knowledge'
  | 'Mistakes';

type Props = {
  onNavigate: (route: NativeDestination) => void;
  onOpenEmbedded: (target: EmbeddedTarget, title: string) => void;
};

type DrawerItem = {
  route?: NativeDestination;
  target?: EmbeddedTarget;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

const DRAWER_LABELS = {
  newChat: 'sidebar.nav.new',
  library: 'sidebar.nav.library',
  projects: 'drawer.projects',
  scheduled: 'drawer.scheduled',
  plugins: 'drawer.plugins',
  exam: 'sidebar.nav.exam',
  search: 'more.search',
  knowledge: 'drawer.knowledge',
  mistakes: 'drawer.mistakes',
  skills: 'drawer.skills',
  apiSettings: 'drawer.apiSettings',
  settings: 'more.settings',
} as const;

const PRIMARY_ITEMS: DrawerItem[] = [
  { route: 'Home', label: DRAWER_LABELS.newChat, icon: 'add-circle-outline' },
  { route: 'Projects', label: DRAWER_LABELS.projects, icon: 'folder-open-outline' },
  { route: 'Library', label: DRAWER_LABELS.library, icon: 'library-outline' },
  { route: 'Scheduled', label: DRAWER_LABELS.scheduled, icon: 'calendar-outline' },
  { route: 'Plugins', label: DRAWER_LABELS.plugins, icon: 'extension-puzzle-outline' },
  { route: 'ExamSession', label: DRAWER_LABELS.exam, icon: 'document-text-outline' },
];

export function AppDrawer({ onNavigate, onOpenEmbedded }: Props) {
  const { open, closeDrawer } = useAppDrawer();
  const { width } = useWindowDimensions();
  const permanent = Platform.OS === 'windows' || (Platform.OS === 'web' && width >= 1080);
  if (permanent) return <DrawerSurface onNavigate={onNavigate} onOpenEmbedded={onOpenEmbedded} permanent />;
  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={closeDrawer}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Close navigation" onPress={closeDrawer} style={styles.backdrop} />
        <DrawerSurface onNavigate={onNavigate} onOpenEmbedded={onOpenEmbedded} />
      </View>
    </Modal>
  );
}

function DrawerSurface({ onNavigate, onOpenEmbedded, permanent = false }: Props & { permanent?: boolean }) {
  const { closeDrawer } = useAppDrawer();
  const { colors, radius, typography } = useTheme();
  const { mode: themeMode, toggle: toggleTheme } = useThemeController();
  const state = useAppStore();
  const t = useT();
  const [searchQuery, setSearchQuery] = useState('');

  const activate = (item: DrawerItem) => {
    closeDrawer();
    if (item.route) {
      if (item.route === 'Home') {
        appStore.startNewSession('chat');
      }
      onNavigate(item.route);
    } else if (item.target) {
      onOpenEmbedded(item.target, t(item.label));
    }
  };

  const openSession = async (session: Session) => {
    closeDrawer();
    await appStore.openSession(session.id);
    onNavigate('Chat');
  };

  const handleSessionAction = (session: Session) => {
    Alert.alert(session.title || t('chat.newConversation') || 'Conversation', undefined, [
      {
        text: t('common.delete') || 'Delete',
        style: 'destructive',
        onPress: () => {
          void appStore.deleteSession(session.id);
        },
      },
      { text: t('common.cancel') || 'Cancel', style: 'cancel' },
    ]);
  };

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return state.sessions;
    const q = searchQuery.toLowerCase();
    return state.sessions.filter(
      (s) =>
        (s.title && s.title.toLowerCase().includes(q)) ||
        (s.topic && s.topic.toLowerCase().includes(q))
    );
  }, [searchQuery, state.sessions]);

  const renderItem = (item: DrawerItem) => (
    <AnimatedPressable
      key={item.route || item.target}
      accessibilityRole="button"
      accessibilityLabel={t(item.label)}
      onPress={() => activate(item)}
      style={[styles.item, { borderRadius: radius.md }]}
    >
      <Ionicons name={item.icon} size={20} color={item.route === 'Home' ? colors.accent : colors.textMuted} />
      <Text
        style={[
          styles.itemText,
          {
            color: item.route === 'Home' ? colors.accent : colors.text,
            fontFamily: item.route === 'Home' ? typography.semibold : typography.medium,
          },
        ]}
      >
        {t(item.label)}
      </Text>
    </AnimatedPressable>
  );

  const name = state.user?.displayName || state.user?.email || t('more.learner') || 'Learner';
  const plan = state.user?.plan || state.user?.tier || 'Free plan';

  return (
    <SafeAreaView
      edges={['top', 'bottom', 'left']}
      style={[
        styles.panel,
        permanent && styles.permanentPanel,
        { backgroundColor: colors.surface, borderRightColor: colors.border },
      ]}
    >
      {/* Brand Header */}
      <View style={[styles.brandRow, { borderBottomColor: colors.border }]}>
        <BrandMark size={28} />
        <Text style={[styles.brand, { color: colors.text, fontFamily: typography.display }]}>Socrates</Text>
        {!permanent ? (
          <AnimatedPressable accessibilityLabel="Close navigation" onPress={closeDrawer} style={styles.closeButton}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </AnimatedPressable>
        ) : null}
      </View>

      {/* Instant Search Bar */}
      <View style={[styles.searchWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.md }]}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('sidebar.searchPlaceholder') || 'Search chats...'}
          placeholderTextColor={colors.textMuted}
          style={[styles.searchInput, { color: colors.text, fontFamily: typography.body }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color={colors.textSubtle} />
          </Pressable>
        ) : null}
      </View>

      {/* Main Scroll Content */}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Navigation list */}
        <View style={styles.group}>{PRIMARY_ITEMS.map(renderItem)}</View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Recents Session List */}
        <View style={styles.recentsHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted, fontFamily: typography.semibold }]}>
            {t('sidebar.recentSessions') || 'Recent chats'}
          </Text>
          <Text style={[styles.sessionCount, { color: colors.textSubtle }]}>{filteredSessions.length}</Text>
        </View>

        <View style={styles.sessionList}>
          {filteredSessions.length === 0 ? (
            <Text style={[styles.emptySessions, { color: colors.textMuted }]}>
              {searchQuery ? (t('search.noMatches') || 'No matching chats') : (t('chat.emptyHistory') || 'No recent chats yet')}
            </Text>
          ) : (
            filteredSessions.slice(0, 30).map((session) => {
              const isCurrent = state.activeSession?.id === session.id;
              return (
                <AnimatedPressable
                  key={session.id}
                  onPress={() => void openSession(session)}
                  onLongPress={() => handleSessionAction(session)}
                  style={[
                    styles.sessionItem,
                    {
                      backgroundColor: isCurrent ? colors.surfacePressed : 'transparent',
                      borderRadius: radius.md,
                      borderColor: isCurrent ? colors.borderStrong : 'transparent',
                    },
                  ]}
                >
                  <Ionicons
                    name={session.mode === 'tutor' ? 'school-outline' : 'chatbubble-outline'}
                    size={16}
                    color={isCurrent ? colors.accent : colors.textMuted}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.sessionTitle,
                      {
                        color: isCurrent ? colors.accent : colors.text,
                        fontFamily: isCurrent ? typography.semibold : typography.body,
                      },
                    ]}
                  >
                    {session.title || session.topic || t('chat.newConversation') || 'Untitled chat'}
                  </Text>
                </AnimatedPressable>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Footer Profile & Preferences */}
      <View style={[styles.profile, { borderTopColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
          <Text style={[styles.avatarText, { color: colors.textInverse, fontFamily: typography.bold }]}>
            {name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileCopy}>
          <Text numberOfLines={1} style={[styles.profileName, { color: colors.text, fontFamily: typography.semibold }]}>
            {name}
          </Text>
          <Text numberOfLines={1} style={[styles.profilePlan, { color: colors.textMuted, fontFamily: typography.body }]}>
            {plan}
          </Text>
        </View>

        {/* Theme switcher toggle */}
        <AnimatedPressable
          accessibilityLabel="Toggle Theme"
          onPress={() => void toggleTheme()}
          style={[styles.footerIconBtn, { borderRadius: radius.md }]}
        >
          <Ionicons
            name={themeMode === 'dark' ? 'sunny-outline' : 'moon-outline'}
            size={20}
            color={colors.accent}
          />
        </AnimatedPressable>

        {/* Settings button */}
        <AnimatedPressable
          accessibilityLabel={t('more.settings') || 'Settings'}
          onPress={() => {
            closeDrawer();
            onNavigate('Settings');
          }}
          style={[styles.footerIconBtn, { borderRadius: radius.md }]}
        >
          <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
        </AnimatedPressable>

        {/* Sign out */}
        <AnimatedPressable
          accessibilityLabel={t('common.signOut') || 'Sign out'}
          onPress={() => {
            closeDrawer();
            void appStore.logout();
          }}
          style={[styles.footerIconBtn, { borderRadius: radius.md }]}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        </AnimatedPressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.64)' },
  panel: { width: '86%', maxWidth: 340, borderRightWidth: 1 },
  permanentPanel: { width: 320, maxWidth: 320, flex: 1 },
  brandRow: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brand: { fontSize: 20, flex: 1 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 10,
    height: 38,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  scroll: { paddingHorizontal: 10, paddingBottom: 18 },
  group: { gap: 2, paddingTop: 4 },
  item: {
    minHeight: 42,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemText: { fontSize: 14 },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 8,
    marginVertical: 10,
  },
  recentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sessionCount: {
    fontSize: 11,
  },
  sessionList: {
    gap: 2,
  },
  emptySessions: {
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontStyle: 'italic',
  },
  sessionItem: {
    minHeight: 38,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sessionTitle: {
    fontSize: 13,
    flex: 1,
  },
  profile: {
    minHeight: 70,
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14 },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 13 },
  profilePlan: { fontSize: 11, marginTop: 1 },
  footerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
