import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { appStore } from '../stores/appStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Workspace'>;
type Destination = Exclude<keyof RootStackParamList, 'Home' | 'Chat' | 'Tutor' | 'Embedded' | 'ArtifactPreview' | 'Workspace' | 'More'>;

const ITEMS: Array<[Destination, string, React.ComponentProps<typeof Ionicons>['name']]> = [
  ['Projects', 'workspace.openProjects', 'folder-open-outline'],
  ['Scheduled', 'workspace.openScheduled', 'calendar-outline'],
  ['Plugins', 'workspace.openPlugins', 'extension-puzzle-outline'],
  ['Library', 'workspace.openLibrary', 'library-outline'],
  ['Knowledge', 'workspace.openKnowledge', 'git-network-outline'],
  ['Mistakes', 'workspace.openMistakes', 'book-outline'],
];

export function WorkspaceScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  return (
    <Screen style={styles.screen}>
      <AppHeader title={t('more.workspace')} onNewChat={() => { appStore.startNewSession('chat'); navigation.navigate('Home'); }} />
      <View style={styles.intro}>
        <Text style={[styles.kicker, { color: colors.textSubtle }]}>{t('workspace.kicker')}</Text>
        <Text style={[styles.heading, { color: colors.text, fontFamily: typography.display }]}>{t('workspace.heading')}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{t('workspace.body')}</Text>
      </View>
      <View style={styles.grid}>
        {ITEMS.map(([route, label, icon]) => (
          <AnimatedPressable
            key={route}
            onPress={() => navigation.navigate(route)}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}
          >
            <View style={[styles.icon, { backgroundColor: colors.surfaceRaised, borderRadius: radius.md }]}>
              <Ionicons name={icon} size={22} color={colors.accent} />
            </View>
            <Text style={[styles.cardTitle, { color: colors.text, fontFamily: typography.semibold }]}>{t(label)}</Text>
            <Ionicons name="arrow-forward" size={17} color={colors.textSubtle} />
          </AnimatedPressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  intro: { paddingHorizontal: 20, paddingTop: 10 },
  kicker: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
  heading: { fontSize: 31, lineHeight: 38, marginTop: 10 },
  body: { fontSize: 14, lineHeight: 22, marginTop: 10 },
  grid: { padding: 18, gap: 10 },
  card: { minHeight: 76, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, fontSize: 15 },
});
