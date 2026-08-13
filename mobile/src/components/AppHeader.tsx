import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { AnimatedPressable } from './AnimatedPressable';
import { useAppDrawer } from './AppDrawer';
import { useT } from '../i18n';

type Props = {
  title?: string;
  mode?: 'chat' | 'tutor';
  showModeSwitch?: boolean;
  conversationActive?: boolean;
  onModeChange?: (mode: 'chat' | 'tutor') => void;
  onNewChat?: () => void;
  onShare?: () => void;
  onMore?: () => void;
};

export function AppHeader({
  title,
  mode = 'chat',
  showModeSwitch = false,
  conversationActive = false,
  onModeChange,
  onNewChat,
  onShare,
  onMore,
}: Props) {
  const { colors, typography } = useTheme();
  const t = useT();
  const { openDrawer } = useAppDrawer();
  return (
    <View style={styles.header}>
      <AnimatedPressable accessibilityLabel={t('common.openNavigation')} onPress={openDrawer} style={[styles.circle, { borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised }]}>
        <Ionicons name="menu-outline" size={29} color={colors.text} />
      </AnimatedPressable>

      {showModeSwitch ? (
        <View style={[styles.modeSwitch, { borderColor: colors.borderStrong, backgroundColor: '#464646' }]}>
          {(['chat', 'tutor'] as const).map((value) => {
            const selected = value === mode;
            return (
              <AnimatedPressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => onModeChange?.(value)}
                style={[styles.modeButton, selected && { backgroundColor: '#292929' }]}
              >
                <Text style={[styles.modeText, { color: colors.text, fontFamily: typography.semibold }]}>{value === 'chat' ? t('sidebar.nav.chat') : t('sidebar.nav.tutor')}</Text>
              </AnimatedPressable>
            );
          })}
        </View>
      ) : title ? (
        <Text numberOfLines={1} style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>{title}</Text>
      ) : null}

      {conversationActive ? (
        <View style={[styles.actionPill, { borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised }]}>
          <AnimatedPressable accessibilityLabel={t('common.share')} onPress={onShare} style={styles.pillAction}>
            <Ionicons name="share-outline" size={25} color={colors.text} />
          </AnimatedPressable>
          <AnimatedPressable accessibilityLabel={t('common.more')} onPress={onMore} style={styles.pillAction}>
            <Ionicons name="ellipsis-horizontal" size={25} color={colors.text} />
          </AnimatedPressable>
        </View>
      ) : (
        <AnimatedPressable accessibilityLabel={t('sidebar.nav.new')} onPress={onNewChat} style={[styles.circle, { borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised }]}>
          <Ionicons name="create-outline" size={27} color={colors.text} />
        </AnimatedPressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { height: 96, paddingHorizontal: 24, paddingBottom: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  circle: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modeSwitch: { position: 'absolute', left: '50%', bottom: 16, width: 198, height: 58, marginLeft: -99, padding: 4, borderRadius: 29, borderWidth: 1, flexDirection: 'row', gap: 2 },
  modeButton: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  modeText: { fontSize: 18 },
  title: { position: 'absolute', left: 84, right: 84, bottom: 33, textAlign: 'center', fontSize: 17 },
  actionPill: { width: 104, height: 52, paddingHorizontal: 3, borderRadius: 26, borderWidth: 1, flexDirection: 'row' },
  pillAction: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
