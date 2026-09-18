import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { EmbeddedTarget, Session } from '@socrates/contracts';
import { useTheme, useThemeController } from '../theme/ThemeProvider';
import { useResponsive } from '../theme/responsive';
import { useT } from '../i18n';
import { appStore, useAppStore } from '../stores/appStore';
import { BrandMark } from './BrandMark';
import { AnimatedPressable } from './AnimatedPressable';
import { ConfirmDialog } from './ConfirmDialog';
import { usageOverlay, storageOverlay } from '../cmdK/overlayStores';

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

/* Lightweight module-scoped signal so DrawerSurface can ask the
 * surrounding AppDrawer to mount the ProfileOverlay (the overlay needs
 * to live above the drawer modal, not inside it). */
let profileOpenListeners: Array<(open: boolean) => void> = [];
function emitProfile(open: boolean) {
  for (const l of profileOpenListeners) l(open);
}
export const profileOverlay = {
  open() {
    emitProfile(true);
  },
  close() {
    emitProfile(false);
  },
  subscribe(l: (open: boolean) => void) {
    profileOpenListeners.push(l);
    return () => {
      profileOpenListeners = profileOpenListeners.filter((x) => x !== l);
    };
  },
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

/* P2 1:1 — mirrors frontend `#sidebarNav` order
 * (new|projects|library|scheduled|plugins|exam|skills). Skills opens
 * the embedded skills surface, matching `index.html` skills iframe. */
const PRIMARY_ITEMS: DrawerItem[] = [
  { route: 'Home', label: DRAWER_LABELS.newChat, icon: 'add-circle-outline' },
  { route: 'Projects', label: DRAWER_LABELS.projects, icon: 'folder-open-outline' },
  { route: 'Library', label: DRAWER_LABELS.library, icon: 'library-outline' },
  { route: 'Scheduled', label: DRAWER_LABELS.scheduled, icon: 'calendar-outline' },
  { route: 'Plugins', label: DRAWER_LABELS.plugins, icon: 'extension-puzzle-outline' },
  { route: 'ExamSession', label: DRAWER_LABELS.exam, icon: 'document-text-outline' },
  { target: 'skills', label: DRAWER_LABELS.skills, icon: 'sparkles-outline' },
];

export function AppDrawer({ onNavigate, onOpenEmbedded }: Props) {
  const { open, closeDrawer } = useAppDrawer();
  const { sidebarWidth } = useResponsive();
  const t = useT();
  /* Strict parity: account/data overlays use the SPA itself as the single
   * implementation. This removes the native look-alike copies that had
   * drifted from ProfileModal/UsageModal/StorageModal. The Android shell
   * still owns navigation/back/system UI; the surface inside is the exact
   * authenticated SPA modal via the one-time web-session hand-off. */
  useEffect(() => profileOverlay.subscribe((open) => {
    if (!open) return;
    closeDrawer();
    profileOverlay.close();
    onOpenEmbedded('profile', t('profile.heading') || 'Account');
  }), [closeDrawer, onOpenEmbedded, t]);
  useEffect(() => usageOverlay.subscribe((open) => {
    if (!open) return;
    closeDrawer();
    usageOverlay.close();
    onOpenEmbedded('usage', t('usage.heading') || 'Token usage');
  }), [closeDrawer, onOpenEmbedded, t]);
  useEffect(() => storageOverlay.subscribe((open) => {
    if (!open) return;
    closeDrawer();
    storageOverlay.close();
    onOpenEmbedded('storage', t('storage.heading') || 'Storage');
  }), [closeDrawer, onOpenEmbedded, t]);
  const permanent = sidebarWidth !== null;
  if (permanent) {
    return (
      <DrawerSurface onNavigate={onNavigate} onOpenEmbedded={onOpenEmbedded} permanent />
    );
  }
  const slideAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (open) {
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [open, slideAnim]);

  const slideX = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [-288, 0] });
  const backdropOpacity = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Modal visible={open} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={closeDrawer}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable accessibilityLabel="Close navigation" onPress={closeDrawer} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View style={{ transform: [{ translateX: slideX }], height: '100%' }}>
          <DrawerSurface onNavigate={onNavigate} onOpenEmbedded={onOpenEmbedded} />
        </Animated.View>
      </View>
    </Modal>
  );
}

function DrawerSurface({ onNavigate, onOpenEmbedded, permanent = false }: Props & { permanent?: boolean }) {
  const { closeDrawer } = useAppDrawer();
  const { colors, radius, typography } = useTheme();
  const { sidebarWidth, isCompact } = useResponsive();
  const { mode: themeMode, toggle: toggleTheme } = useThemeController();
  const state = useAppStore();
  const t = useT();
  const [searchQuery, setSearchQuery] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null);

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

  /* P6 1:1 — session context menu mirrors frontend
   * `session-context-menu` and `RecentsScreen.openSessionActions`:
   * Rename / Pin-Unpin / Archive / Delete(confirm) / Cancel.
   * Previously Delete-only. */
  const handleSessionAction = (session: Session) => {
    const title = session.title || session.topic || t('chat.newConversation') || 'Conversation';
    const pinned = (session as { pinned?: boolean }).pinned === true;
    Alert.alert(title, undefined, [
      {
        text: t('library.rename') || 'Rename',
        onPress: () => {
          setRenameId(session.id);
          setRenameValue(title);
        },
      },
      {
        text: t(pinned ? 'library.unpin' : 'library.pin') || (pinned ? 'Unpin' : 'Pin'),
        onPress: () => {
          void appStore.togglePinnedSession(session as unknown as Pick<Session, 'id' | 'pinned'>).catch(() => undefined);
        },
      },
      {
        text: t('library.archive') || 'Archive',
        onPress: () => {
          void appStore.archiveSession(session.id).catch(() => undefined);
        },
      },
      {
        text: t('library.deleteChat') || t('common.delete') || 'Delete',
        style: 'destructive',
        onPress: () => {
          /* Destructive step uses the themed ConfirmDialog (same copy
           * as the old nested Alert), not a second Alert sheet. */
          setPendingDelete(session);
        },
      },
      { text: t('common.cancel') || 'Cancel', style: 'cancel' },
    ]);
  };

  const saveRename = async () => {
    if (!renameId || !renameValue.trim()) return;
    setRenameBusy(true);
    try {
      await appStore.renameSession(renameId, renameValue.trim());
      setRenameId(null);
    } catch {
      /* keep the dialog open so the user can retry */
    } finally {
      setRenameBusy(false);
    }
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
      style={[
        styles.item,
        item.route === 'Home' ? { backgroundColor: colors.surfaceHover } : null,
        { borderRadius: 8 },
      ]}
    >
      <Ionicons name={item.icon} size={16} color={colors.textMuted} />
      <Text
        style={[
          styles.itemText,
          {
            color: colors.text,
            fontFamily: typography.medium,
          },
        ]}
      >
        {t(item.label)}
      </Text>
    </AnimatedPressable>
  );

  const name = state.user?.displayName || state.user?.email?.split('@')[0] || t('more.learner') || 'Learner';
  const plan = state.user?.plan || state.user?.tier || 'Free plan';

  const isDark = colors.mode === 'dark';
  return (
    <BlurView
      tint={isDark ? 'dark' : 'light'}
      intensity={Platform.OS === 'web' ? 0 : 18}
      style={[
        styles.panel,
        permanent ? { width: sidebarWidth ?? 288, maxWidth: sidebarWidth ?? 288, flex: 1 } : null,
        !permanent && isCompact ? styles.panelCompact : null,
        { backgroundColor: isDark ? PANEL_FROSTED_DARK : PANEL_FROSTED_LIGHT, borderRightColor: colors.border },
      ]}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? PANEL_FROSTED_DARK : PANEL_FROSTED_LIGHT }]} />
      <SafeAreaView edges={['top', 'bottom', 'left']} style={styles.panelSafe}>
      {/* Brand Header */}
      <View style={[styles.brandRow, { borderBottomColor: colors.border }]}>
        <BrandMark size={18} />
        <Text style={[styles.brand, { color: colors.text, fontFamily: typography.semibold }]}>Socrates</Text>
        {!permanent ? (
          <View style={styles.brandActions}>
            <AnimatedPressable
              accessibilityLabel={t('sidebar.nav.new') || 'New chat'}
              onPress={() => activate(PRIMARY_ITEMS[0])}
              style={styles.headerAction}
            >
              <Ionicons name="create-outline" size={20} color={colors.textMuted} />
            </AnimatedPressable>
            <AnimatedPressable accessibilityLabel="Close navigation" onPress={closeDrawer} style={styles.headerAction}>
              <Ionicons name="albums-outline" size={20} color={colors.textMuted} />
            </AnimatedPressable>
          </View>
        ) : null}
      </View>

      {/* Main Scroll Content */}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Navigation list */}
        <View style={styles.group}>{PRIMARY_ITEMS.map(renderItem)}</View>

        {/* Frontend places search after the primary destinations. */}
        <View style={[styles.searchWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 16 }]}>
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
                      /* P2-3 alignment: active session background matches
                       * `frontend`'s `.recent-item.active { background: hsl(var(--bg-300)) }`
                       * (= `colors.surfaceHover`). The previous strong
                       * border + accent-on-accent styling over-emphasized
                       * the current row vs. the web app. */
                      backgroundColor: isCurrent ? colors.surfaceHover : 'transparent',
                      borderRadius: radius.md,
                    },
                  ]}
                >
                  <Ionicons
                    name={session.mode === 'tutor' ? 'school-outline' : 'chatbubble-outline'}
                    size={16}
                    color={isCurrent ? colors.text : colors.textMuted}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.sessionTitle,
                      {
                        color: colors.text,
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
      <View style={[styles.profile, { borderTopColor: colors.border, backgroundColor: isDark ? '#121212' : colors.surface }]}>
        <AnimatedPressable
          accessibilityLabel={t('profile.heading') || 'Account'}
          onPress={() => profileOverlay.open()}
          style={styles.profileTap}
        >
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
        </AnimatedPressable>

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

        <AnimatedPressable
          accessibilityLabel={t('sidebar.more.display') || 'Display & theme'}
          onPress={() => {
            closeDrawer();
            onOpenEmbedded('display', t('sidebar.more.display') || 'Display & theme');
          }}
          style={[styles.footerIconBtn, { borderRadius: radius.md }]}
        >
          <Ionicons name="options-outline" size={19} color={colors.textMuted} />
        </AnimatedPressable>

        {/* Settings button */}
        <AnimatedPressable
          accessibilityLabel={t('more.settings') || 'Settings'}
          onPress={() => {
            closeDrawer();
            onOpenEmbedded('api-settings', t('more.settings') || 'Settings');
          }}
          style={[styles.footerIconBtn, { borderRadius: radius.md }]}
        >
          <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
        </AnimatedPressable>

      </View>
      {/* Rename dialog — same card as `RecentsScreen` rename modal. */}
      <Modal visible={renameId !== null} transparent animationType="fade" onRequestClose={() => setRenameId(null)}>
        <View style={[styles.renameBackdrop, { backgroundColor: colors.scrim }]}>
          <View style={[styles.renameCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
            <Text style={[styles.renameTitle, { color: colors.text, fontFamily: typography.semibold }]}>{t('library.rename')}</Text>
            <TextInput
              autoFocus
              value={renameValue}
              onChangeText={setRenameValue}
              onSubmitEditing={() => { void saveRename(); }}
              placeholder={t('library.renamePlaceholder')}
              placeholderTextColor={colors.textSubtle}
              style={[styles.renameInput, { color: colors.text, borderColor: colors.borderStrong, backgroundColor: colors.background, borderRadius: radius.sm, fontFamily: typography.body }]}
              returnKeyType="done"
            />
            <View style={styles.renameActions}>
              <AnimatedPressable onPress={() => setRenameId(null)} style={styles.renameButton}>
                <Text style={[styles.renameButtonText, { color: colors.textMuted, fontFamily: typography.medium }]}>{t('common.cancel')}</Text>
              </AnimatedPressable>
              <AnimatedPressable
                disabled={renameBusy || !renameValue.trim()}
                onPress={() => { void saveRename(); }}
                style={[styles.renameButton, { backgroundColor: colors.accent, borderRadius: radius.sm }]}
              >
                <Text style={[styles.renameButtonText, { color: colors.white, fontFamily: typography.medium }]}>{t('library.saveName')}</Text>
              </AnimatedPressable>
            </View>
          </View>
        </View>
      </Modal>
      {/* Delete confirmation — themed ConfirmDialog mirroring
       * frontend `react/confirm/ConfirmDialog.tsx` (danger variant). */}
      <ConfirmDialog
        visible={pendingDelete !== null}
        title={t('library.deleteChat') || t('common.delete') || 'Delete'}
        message={t('library.deleteChatConfirm')}
        confirmLabel={t('common.delete') || 'Delete'}
        cancelLabel={t('common.cancel') || 'Cancel'}
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) void appStore.deleteSession(target.id).catch(() => undefined);
        }}
      />
      </SafeAreaView>
    </BlurView>
  );
}

/* P1-3 → P2 follow-up: replaced the previous alpha-layering
 * approximation with a real `<BlurView tint=… intensity=18>` from
 * `expo-blur` (now installed). The legacy `PANEL_FROSTED_*` constants
 * are kept as a CSS fallback for platforms where the blur runtime is
 * unavailable (e.g. legacy Android without the BlurView native
 * implementation) — DrawerSurface still references them as a final
 * background tint, so the frosted look survives an exception. */
/* frontend `.sidebar { background: hsl(var(--bg-000)/0.72); backdrop-filter: blur(12px) }`
 * — the frosted tint is the overlay token at 72% alpha in BOTH modes. */
const PANEL_FROSTED_DARK = '#121212';
const PANEL_FROSTED_LIGHT = '#fafafa';

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.64)' },
  /* frontend `.sidebar { width: var(--app-sidebar-width, 18rem) }` = 288px. */
  panel: { width: '86%', maxWidth: 288, height: '100%', flex: 1, borderRightWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  panelCompact: { width: 260, maxWidth: 260 },
  panelSafe: { flex: 1 },
  brandRow: {
    height: 48,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 0,
  },
  brand: { fontSize: 16, flex: 1 },
  brandActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headerAction: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 0,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 10,
    height: 34,
    borderWidth: 1,
    gap: 8,
    borderRadius: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  scroll: { paddingHorizontal: 8, paddingBottom: 18 },
  group: { gap: 0, paddingTop: 4 },
  item: {
    minHeight: 36,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  /* frontend `.recent-item { border-radius: 8px; padding: 8px 12px }` — no border. */
  sessionItem: {
    minHeight: 38,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 0,
  },
  sessionTitle: {
    fontSize: 12,
    flex: 1,
  },
  profile: {
    minHeight: 64,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  /* P0-4: row wrapper that receives the open-profile press. The
   * `flex: 1` lets the avatar + copy fill the available width while
   * the theme / sign-out icon buttons stay pinned to the right. */
  profileTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14 },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 13 },
  profilePlan: { fontSize: 11, marginTop: 1 },
  footerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  /* Rename dialog — same card as `RecentsScreen` rename modal. */
  renameBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  renameCard: { width: '100%', maxWidth: 340, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 16 },
  renameTitle: { fontSize: 16 },
  renameInput: { minHeight: 44, borderWidth: 1, paddingHorizontal: 12, fontSize: 14, marginTop: 12 },
  renameActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  renameButton: { minHeight: 40, minWidth: 76, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  renameButtonText: { fontSize: 13 },
});
