import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { EmbeddedTarget, Session } from '@socrates/contracts';
import { useTheme, useThemeController } from '../theme/ThemeProvider';
import { motionEasing } from '../theme/theme';
import { mobileDrawerWidth, useResponsive } from '../theme/responsive';
import { useT } from '../i18n';
import { appStore, useAppStore } from '../stores/appStore';
import { BrandMark } from './BrandMark';
import { AnimatedPressable } from './AnimatedPressable';
import { ConfirmDialog } from './ConfirmDialog';
import { usageOverlay, storageOverlay } from '../cmdK/overlayStores';
import { cmdKStore } from '../cmdK/cmdKStore';

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
  | 'Display'
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
  /** Current navigator route name — drives the active primary-item highlight. */
  activeRoute?: string | null;
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
  more: 'sidebar.nav.more',
  exam: 'sidebar.nav.exam',
  search: 'more.search',
  knowledge: 'drawer.knowledge',
  mistakes: 'drawer.mistakes',
  skills: 'drawer.skills',
  apiSettings: 'drawer.apiSettings',
  settings: 'more.settings',
} as const;

/* Mirrors the web sidebar's visible order at phone width
 * (`frontend/src/react/sidebar/SidebarNav.tsx`): New chat / Library / Projects
 * / Scheduled / Plugins / More. Exam, Skills and keyboard shortcuts live in
 * the web's More popover, which is the native More screen here. */
const PRIMARY_ITEMS: DrawerItem[] = [
  { route: 'Home', label: DRAWER_LABELS.newChat, icon: 'create-outline' },
  { route: 'Library', label: DRAWER_LABELS.library, icon: 'library-outline' },
  { route: 'Projects', label: DRAWER_LABELS.projects, icon: 'folder-open-outline' },
  { route: 'Scheduled', label: DRAWER_LABELS.scheduled, icon: 'calendar-outline' },
  { route: 'Plugins', label: DRAWER_LABELS.plugins, icon: 'extension-puzzle-outline' },
  { route: 'More', label: DRAWER_LABELS.more, icon: 'ellipsis-horizontal' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/* Mirrors `frontend/src/react/session-list/SessionList.tsx:timeGroupLabel` —
 * the same helper exists locally in `RecentsScreen` but is not exported. */
function sessionTimeGroup(session: Session, now: Date): string {
  if (session.pinned) return 'Pinned';
  const raw = session.updatedAt || session.createdAt || Date.now();
  const d = new Date(raw);
  const ts = d.getTime();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startOfDay) return 'Today';
  if (ts >= startOfDay - 86400000) return 'Yesterday';
  if (ts >= startOfDay - 7 * 86400000) return 'Previous 7 days';
  if (ts >= startOfDay - 30 * 86400000) return 'Previous 30 days';
  if (d.getFullYear() === now.getFullYear()) return MONTH_NAMES[d.getMonth()];
  return String(d.getFullYear());
}

/* Mirrors `frontend/src/react/session-list/sessionList.bridge.ts:formatRelativeTime`
 * (the compact variant used inside `RecentsScreen`). */
function formatRelativeTime(rawDate: unknown): string {
  if (!rawDate) return '';
  const ts = new Date(String(rawDate)).getTime();
  if (Number.isNaN(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 0) return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(ts);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(ts);
}

/* Mirrors `SessionList.tsx:buildMeta`: relative time + "N Qs" + a
 * Branched / Re-explained marker when the session forks another. */
function sessionMeta(session: Session, t: (key: string, params?: Record<string, string | number>) => string): string {
  const parts: string[] = [];
  const rel = formatRelativeTime(session.updatedAt || session.createdAt);
  if (rel) parts.push(rel);
  const qCount = session.totalQ;
  if (typeof qCount === 'number' && qCount > 0) {
    parts.push(qCount === 1 ? t('session.questionCountOne') : t('session.questionCount', { n: qCount }));
  }
  const branched = session.branchedFrom;
  if (branched && typeof branched === 'object' && !Array.isArray(branched)) {
    parts.push((branched as { reExplain?: boolean }).reExplain ? 'Re-explained' : 'Branched');
  }
  return parts.join(' · ');
}

type SessionListItem =
  | { kind: 'header'; label: string; key: string }
  | { kind: 'row'; session: Session; key: string };

function groupSessionsByTime(sessions: Session[]): SessionListItem[] {
  const now = new Date();
  const items: SessionListItem[] = [];
  let prevGroup: string | null = null;
  for (const session of sessions) {
    const group = sessionTimeGroup(session, now);
    if (group !== prevGroup) {
      items.push({ kind: 'header', label: group, key: `g-${group}` });
      prevGroup = group;
    }
    items.push({ kind: 'row', session, key: session.id });
  }
  return items;
}

export function AppDrawer({ onNavigate, onOpenEmbedded, activeRoute }: Props) {
  const { open, closeDrawer } = useAppDrawer();
  const { sidebarWidth } = useResponsive();
  const { colors } = useTheme();
  const t = useT();
  /* Cmd+K and the drawer publish these signals. The root app renders the
   * native overlays above both the drawer and the active screen. */
  useEffect(() => profileOverlay.subscribe((open) => {
    if (!open) return;
    closeDrawer();
  }), [closeDrawer]);
  useEffect(() => usageOverlay.subscribe((open) => {
    if (!open) return;
    closeDrawer();
  }), [closeDrawer]);
  useEffect(() => storageOverlay.subscribe((open) => {
    if (!open) return;
    closeDrawer();
  }), [closeDrawer]);
  const slideAnim = useRef(new Animated.Value(0)).current;
  /* Keep the Modal mounted through the exit animation. `prevOpen` edge-
   * triggers each open/close so exactly one timing runs per transition —
   * `setMounted(true)` must not restart the entrance — and the `finished`
   * guard keeps a cancelled exit from unmounting a reopened drawer. */
  const [mounted, setMounted] = useState(open);
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open === prevOpenRef.current) return;
    prevOpenRef.current = open;
    if (open) {
      setMounted(true);
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 280,
        easing: motionEasing.out,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 220,
        easing: motionEasing.out,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open, slideAnim]);

  const permanent = sidebarWidth !== null;
  if (permanent) {
    return (
      <DrawerSurface onNavigate={onNavigate} onOpenEmbedded={onOpenEmbedded} activeRoute={activeRoute} permanent />
    );
  }

  const slideX = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [-mobileDrawerWidth, 0] });
  const backdropOpacity = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={closeDrawer}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity, backgroundColor: colors.scrimDrawer }]}>
          <Pressable accessibilityLabel={t('common.closeNavigation')} onPress={closeDrawer} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View style={{ transform: [{ translateX: slideX }], height: '100%' }}>
          <DrawerSurface onNavigate={onNavigate} onOpenEmbedded={onOpenEmbedded} activeRoute={activeRoute} />
        </Animated.View>
      </View>
    </Modal>
  );
}

function DrawerSurface({ onNavigate, onOpenEmbedded, activeRoute, permanent = false }: Props & { permanent?: boolean }) {
  const { closeDrawer } = useAppDrawer();
  const { colors, radius, typography } = useTheme();
  const { sidebarWidth, isCompact, isDesktop } = useResponsive();
  const { mode: themeMode, toggle: toggleTheme } = useThemeController();
  const sessions = useAppStore((s) => s.sessions);
  const activeSessionId = useAppStore((s) => s.activeSession?.id);
  const user = useAppStore((s) => s.user);
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
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        (s.title && s.title.toLowerCase().includes(q)) ||
        (s.topic && s.topic.toLowerCase().includes(q))
    );
  }, [searchQuery, sessions]);

  /* Pinned first (web `timeGroupLabel` gives them their own leading
   * "Pinned" group), then newest-first within each group. */
  const sessionListItems = useMemo(() => {
    const sorted = [...filteredSessions].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bt - at;
    });
    return groupSessionsByTime(sorted.slice(0, 30));
  }, [filteredSessions]);

  const renderItem = (item: DrawerItem) => {
    const isActive = item.route != null && item.route === activeRoute;
    return (
      <AnimatedPressable
        key={item.route || item.target}
        accessibilityRole="button"
        accessibilityLabel={t(item.label)}
        onPress={() => activate(item)}
        style={[
          styles.item,
          isDesktop ? styles.itemDesktop : styles.itemCompact,
          isActive ? { backgroundColor: colors.surfaceHover } : null,
          { borderRadius: 8 },
        ]}
      >
        <Ionicons name={item.icon} size={isDesktop ? 16 : 20} color={isActive ? colors.text : colors.textMuted} />
        <Text
          style={[
            styles.itemText,
            !isDesktop ? styles.itemTextCompact : null,
            {
              color: colors.text,
              fontFamily: isActive ? typography.medium : typography.body,
            },
          ]}
        >
          {t(item.label)}
        </Text>
      </AnimatedPressable>
    );
  };

  const name = user?.displayName || user?.email?.split('@')[0] || t('more.learner') || 'Learner';
  const plan = user?.plan || user?.tier || 'Free plan';

  const isDark = colors.mode === 'dark';
  /* Permanent desktop rail uses the dedicated `rail` token
   * (web sidebar #171717 / #f7f7f5). The temporary drawer keeps the
   * translucent overlay tint under the BlurView. */
  const panelBackground = colors.rail;
  return (
    <BlurView
      tint={isDark ? 'dark' : 'light'}
      intensity={0}
      style={[
        styles.panel,
        permanent ? { width: sidebarWidth ?? mobileDrawerWidth, maxWidth: sidebarWidth ?? mobileDrawerWidth, flex: 1 } : null,
        !permanent && isCompact ? styles.panelCompact : null,
        { backgroundColor: panelBackground, borderRightColor: colors.border },
      ]}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: panelBackground }]} />
      <SafeAreaView edges={['top', 'bottom', 'left']} style={styles.panelSafe}>
      {/* Brand Header */}
      <View style={[styles.brandRow, isDesktop ? styles.brandRowDesktop : null, { borderBottomColor: colors.border }]}>
        <BrandMark size={20} />
        <Text style={[styles.brand, { color: colors.text, fontFamily: typography.semibold }]}>Socrates</Text>
        {!permanent ? (
          <View style={styles.brandActions}>
            <AnimatedPressable
              accessibilityLabel={t('cmdK.placeholder')}
              onPress={() => {
                closeDrawer();
                cmdKStore.open();
              }}
              style={styles.headerAction}
            >
              <Ionicons name="search-outline" size={20} color={colors.textMuted} />
            </AnimatedPressable>
            <AnimatedPressable
              accessibilityLabel={t('sidebar.nav.new') || 'New chat'}
              onPress={() => activate(PRIMARY_ITEMS[0])}
              style={styles.headerAction}
            >
              <Ionicons name="create-outline" size={20} color={colors.textMuted} />
            </AnimatedPressable>
            <AnimatedPressable accessibilityLabel={t('common.closeNavigation')} onPress={closeDrawer} style={styles.headerAction}>
              <Ionicons name="close-outline" size={20} color={colors.textMuted} />
            </AnimatedPressable>
          </View>
        ) : (
          <AnimatedPressable
            accessibilityLabel={t('cmdK.placeholder')}
            onPress={() => cmdKStore.open()}
            style={styles.headerAction}
          >
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          </AnimatedPressable>
        )}
      </View>

      {/* Main Scroll Content */}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Navigation list */}
        <View style={[styles.group, isDesktop ? styles.groupDesktop : null]}>{PRIMARY_ITEMS.map(renderItem)}</View>

        {/* Frontend places search after the primary destinations. Web box:
         * 8px radius, 32px high, hairline border on the bg-200 surface. */}
        <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 8 }]}>
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
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.clear')} onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={colors.textSubtle} />
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Recents Session List — 10–11px medium uppercase header, no count
         * (web `.recents-header` dropped the tally with the session list
         * redesign). */}
        <View style={styles.recentsHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted, fontFamily: typography.medium }]}>
            {t('sidebar.recentSessions') || 'Recent chats'}
          </Text>
        </View>

        <View style={styles.sessionList}>
          {sessionListItems.length === 0 ? (
            <Text style={[styles.emptySessions, { color: colors.textMuted }]}>
              {searchQuery ? (t('search.noMatches') || 'No matching chats') : (t('chat.emptyHistory') || 'No recent chats yet')}
            </Text>
          ) : (
            sessionListItems.map((item) => {
              if (item.kind === 'header') {
                return (
                  <Text
                    key={item.key}
                    style={[styles.sessionGroupLabel, { color: colors.textSubtle, fontFamily: typography.medium }]}
                  >
                    {item.label}
                  </Text>
                );
              }
              const session = item.session;
              const isCurrent = activeSessionId === session.id;
              const meta = sessionMeta(session, t);
              return (
                <AnimatedPressable
                  key={item.key}
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
                  <View style={styles.sessionCopy}>
                    <View style={styles.sessionTitleRow}>
                      {session.pinned ? (
                        <Ionicons
                          name="pin"
                          size={10}
                          color={colors.textSubtle}
                          style={styles.sessionPinIcon}
                        />
                      ) : null}
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
                    </View>
                    {meta ? (
                      <Text
                        numberOfLines={1}
                        style={[styles.sessionMeta, { color: colors.textMuted, fontFamily: typography.body }]}
                      >
                        {meta}
                      </Text>
                    ) : null}
                  </View>
                </AnimatedPressable>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Footer Profile & Preferences */}
      {/* Web `.sidebar-footer` keeps only the hairline top border — the row
       * sits on the panel surface, not a separate band. */}
      <View style={[styles.profile, { borderTopColor: colors.border }]}>
        <AnimatedPressable
          accessibilityLabel={t('profile.heading') || 'Account'}
          onPress={() => profileOverlay.open()}
          style={styles.profileTap}
        >
          {/* Web `.user-avatar`: 32px neutral circle, page-colored glyph
           * (text-200 bg / bg-100 fg). */}
          <View style={[styles.avatar, { backgroundColor: colors.textMuted }]}>
            <Text style={[styles.avatarText, { color: colors.background, fontFamily: typography.semibold }]}>
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
          accessibilityLabel={t('common.toggleTheme')}
          onPress={() => void toggleTheme()}
          style={[styles.footerIconBtn, { borderRadius: radius.md }]}
        >
          <Ionicons
            name={themeMode === 'dark' ? 'sunny-outline' : 'moon-outline'}
            size={20}
            color={colors.textMuted}
          />
        </AnimatedPressable>

        <AnimatedPressable
          accessibilityLabel={t('sidebar.more.display') || 'Display & theme'}
          onPress={() => {
            closeDrawer();
            onNavigate('Display');
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
            onNavigate('Settings');
          }}
          style={[styles.footerIconBtn, { borderRadius: radius.md }]}
        >
          <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
        </AnimatedPressable>

      </View>
      {/* Rename dialog — same card as `RecentsScreen` rename modal. */}
      <Modal visible={renameId !== null} transparent animationType="fade" onRequestClose={() => setRenameId(null)}>
        <View style={[styles.renameBackdrop, { backgroundColor: colors.scrimModal }]}>
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
                <Text style={[styles.renameButtonText, { color: colors.textInverse, fontFamily: typography.medium }]}>{t('library.saveName')}</Text>
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
 * `expo-blur` (now installed). The token-derived panel tint remains a
 * deterministic fallback when the native blur implementation is unavailable. */
const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: { position: 'absolute', inset: 0 },
  /* Web mobile/tablet drawer: 300px. */
  panel: { width: '86%', maxWidth: mobileDrawerWidth, height: '100%', flex: 1, borderRightWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  panelCompact: {
    width: mobileDrawerWidth,
    maxWidth: mobileDrawerWidth,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
  },
  panelSafe: { flex: 1 },
  brandRow: {
    height: 48,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 0,
  },
  brandRowDesktop: { height: 60 },
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
    height: 40,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    borderRadius: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  scroll: { paddingHorizontal: 8, paddingBottom: 18 },
  group: { gap: 0, paddingTop: 4 },
  groupDesktop: { paddingTop: 7 },
  item: {
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemCompact: { minHeight: 44, paddingHorizontal: 10, gap: 14, borderRadius: 12 },
  itemDesktop: { minHeight: 36 },
  itemText: { fontSize: 14 },
  itemTextCompact: { fontSize: 15 },
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
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sessionList: {
    gap: 2,
  },
  /* Web `.recents-time-label` — same 10–11px medium uppercase treatment as
   * the section header, pinned above each time group. */
  sessionGroupLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
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
  sessionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sessionPinIcon: {
    marginTop: 1,
  },
  sessionTitle: {
    fontSize: 12,
    flex: 1,
  },
  sessionMeta: {
    fontSize: 11,
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
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12 },
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
