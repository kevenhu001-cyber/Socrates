import React, { memo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from './AnimatedPressable';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';

type ActionId = 'upload' | 'write' | 'research';

const ACTIONS: Array<{
  id: ActionId;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
}> = [
  { id: 'upload', icon: 'images-outline', label: 'home.quick.upload' },
  { id: 'write', icon: 'pencil-outline', label: 'home.quick.write' },
  { id: 'research', icon: 'search-outline', label: 'home.quick.research' },
];

export interface HomeQuickActionsProps {
  onUpload: () => void;
  onWrite: () => void;
  onResearch: () => void;
}

/** Native port of the three live shortcuts in frontend/index.html. */
export const HomeQuickActions = memo(function HomeQuickActions({
  onUpload,
  onWrite,
  onResearch,
}: HomeQuickActionsProps) {
  const { colors, typography, radius } = useTheme();
  const t = useT();
  const [dismissed, setDismissed] = useState<Set<ActionId>>(() => new Set());
  const handlers: Record<ActionId, () => void> = {
    upload: onUpload,
    write: onWrite,
    research: onResearch,
  };

  return (
    <View
      accessibilityLabel={t('home.quick.label')}
      style={styles.container}
    >
      {ACTIONS.filter((action) => !dismissed.has(action.id)).map((action) => (
        <View key={action.id} style={styles.row}>
          <AnimatedPressable
            testID={`home-quick-action-${action.id}`}
            accessibilityRole="button"
            accessibilityLabel={t(action.label)}
            onPress={handlers[action.id]}
            style={[styles.action, { borderRadius: radius.md }]}
          >
            <View style={styles.icon}>
              <Ionicons name={action.icon} size={24} color={colors.textMuted} />
            </View>
            <Text style={[styles.label, { color: colors.textMuted, fontFamily: typography.body }]}>
              {t(action.label)}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            testID={`home-quick-action-dismiss-${action.id}`}
            accessibilityRole="button"
            accessibilityLabel={t('home.quick.dismiss')}
            onPress={() => setDismissed((current) => new Set(current).add(action.id))}
            style={styles.dismiss}
          >
            <Ionicons name="close" size={17} color={colors.textSubtle} />
          </AnimatedPressable>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 620, alignSelf: 'center', marginTop: 24 },
  row: { minHeight: 52, width: '100%', paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  action: { flex: 1, minWidth: 0, minHeight: 52, paddingHorizontal: 0, flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 16, lineHeight: 24 },
  dismiss: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
