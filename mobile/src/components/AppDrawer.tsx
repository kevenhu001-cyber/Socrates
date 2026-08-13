import React, { createContext, useContext, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { EmbeddedTarget } from '@socrates/contracts';
import { useTheme } from '../theme/ThemeProvider';
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

type NativeDestination = 'Home' | 'Library' | 'Search' | 'ExamSession' | 'Settings' | 'More' | 'Workspace' | 'Projects' | 'Scheduled' | 'Plugins' | 'Knowledge' | 'Mistakes';

type Props = {
  onNavigate: (route: NativeDestination) => void;
  onOpenEmbedded: (target: EmbeddedTarget, title: string) => void;
};

type DrawerItem = { route?: NativeDestination; target?: EmbeddedTarget; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] };

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
  more: 'drawer.more',
} as const;

const PRIMARY_ITEMS: DrawerItem[] = [
  { route: 'Home', label: DRAWER_LABELS.newChat, icon: 'create-outline' },
  { route: 'Library', label: DRAWER_LABELS.library, icon: 'library-outline' },
  { route: 'Projects', label: DRAWER_LABELS.projects, icon: 'folder-open-outline' },
  { route: 'Scheduled', label: DRAWER_LABELS.scheduled, icon: 'calendar-outline' },
  { route: 'Plugins', label: DRAWER_LABELS.plugins, icon: 'extension-puzzle-outline' },
  { route: 'ExamSession', label: DRAWER_LABELS.exam, icon: 'document-text-outline' },
];

const SECONDARY_ITEMS: DrawerItem[] = [
  { route: 'Search', label: DRAWER_LABELS.search, icon: 'search-outline' },
  { route: 'Knowledge', label: DRAWER_LABELS.knowledge, icon: 'git-network-outline' },
  { route: 'Mistakes', label: DRAWER_LABELS.mistakes, icon: 'book-outline' },
  { target: 'skills', label: DRAWER_LABELS.skills, icon: 'sparkles-outline' },
  { target: 'api-settings', label: DRAWER_LABELS.apiSettings, icon: 'key-outline' },
  { route: 'Settings', label: DRAWER_LABELS.settings, icon: 'settings-outline' },
  { route: 'More', label: DRAWER_LABELS.more, icon: 'ellipsis-horizontal-outline' },
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
  const { colors, typography } = useTheme();
  const state = useAppStore();
  const t = useT();

  const activate = (item: DrawerItem) => {
    closeDrawer();
    if (item.route) onNavigate(item.route);
    else if (item.target) onOpenEmbedded(item.target, t(item.label));
  };

  const renderItem = (item: DrawerItem) => (
    <AnimatedPressable
      key={item.route || item.target}
      accessibilityRole="button"
      accessibilityLabel={t(item.label)}
      onPress={() => activate(item)}
      style={styles.item}
    >
      <Ionicons name={item.icon} size={21} color={colors.textMuted} />
      <Text style={[styles.itemText, { color: colors.text, fontFamily: typography.medium }]}>{t(item.label)}</Text>
    </AnimatedPressable>
  );

  const name = state.user?.displayName || state.user?.email || t('more.learner');
  return (
    <SafeAreaView edges={['top', 'bottom', 'left']} style={[styles.panel, permanent && styles.permanentPanel, { backgroundColor: '#141414', borderRightColor: colors.border }]}>
          <View style={styles.brandRow}>
            <BrandMark size={30} />
            <Text style={[styles.brand, { color: colors.text, fontFamily: typography.display }]}>Socrates</Text>
            {!permanent ? <AnimatedPressable accessibilityLabel="Close navigation" onPress={closeDrawer} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </AnimatedPressable> : null}
          </View>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.group}>{PRIMARY_ITEMS.map(renderItem)}</View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.group}>{SECONDARY_ITEMS.map(renderItem)}</View>
          </ScrollView>
          <View style={[styles.profile, { borderTopColor: colors.border }]}>
            <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
              <Text style={[styles.avatarText, { color: colors.textInverse, fontFamily: typography.bold }]}>{name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.profileCopy}>
              <Text numberOfLines={1} style={[styles.profileName, { color: colors.text, fontFamily: typography.semibold }]}>{name}</Text>
              <Text numberOfLines={1} style={[styles.profileEmail, { color: colors.textSubtle, fontFamily: typography.body }]}>{state.user?.email || ''}</Text>
            </View>
            <AnimatedPressable accessibilityLabel={t('common.signOut')} onPress={() => { closeDrawer(); void appStore.logout(); }} style={styles.logout}>
              <Ionicons name="log-out-outline" size={22} color={colors.textMuted} />
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
  brandRow: { height: 72, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 9 },
  brand: { fontSize: 20, flex: 1 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 10, paddingBottom: 18 },
  group: { gap: 2 },
  item: { minHeight: 48, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 13 },
  itemText: { fontSize: 15 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12, marginVertical: 12 },
  profile: { minHeight: 76, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15 },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 14 },
  profileEmail: { fontSize: 11, marginTop: 3 },
  logout: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
