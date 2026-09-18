import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/ThemeProvider';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Workspace'>;

export function WorkspaceScreen({ navigation }: Props) {
  const { colors } = useTheme();

  /* The web information architecture has no standalone Workspace hub. Its
   * workspace entry points are Library, Projects, and Plugins, while the
   * remaining destinations are separate sidebar pages. Keep this route only
   * as a backwards-compatible deep-link alias and land on the first real
   * workspace directory instead of rendering a mobile-only card dashboard. */
  useEffect(() => {
    navigation.replace('Library');
  }, [navigation]);

  return (
    <Screen style={styles.screen}>
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
