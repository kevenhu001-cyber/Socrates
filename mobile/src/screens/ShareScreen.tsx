import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { native } from '../native/native';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Share'>;

export function ShareScreen({ route, navigation }: Props) {
  const { colors, radius } = useTheme();
  const t = useT();
  return (
    <Screen scroll>
      <Text style={[styles.kicker, { color: colors.textSubtle }]}>{t('share.kicker')}</Text>
      <Text style={[styles.heading, { color: colors.text }]}>{t('share.heading')}</Text>
      <Text style={[styles.label, { color: colors.textMuted }]}>{route.params.title || t('share.link')}</Text>
      <Text selectable style={[styles.url, { color: colors.text }]}>{route.params.url}</Text>
      <AnimatedPressable onPress={() => native.share(route.params.url)} style={[styles.button, { backgroundColor: colors.text, borderRadius: radius.md }]}>
        <Text style={{ color: colors.background, fontWeight: '700' }}>{t('common.share')}</Text>
      </AnimatedPressable>
      <AnimatedPressable onPress={() => navigation.goBack()} style={styles.cancel}>
        <Text style={{ color: colors.textMuted }}>{t('common.done')}</Text>
      </AnimatedPressable>
    </Screen>
  );
}

const styles = StyleSheet.create({ kicker: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700', paddingTop: 14 }, heading: { fontSize: 31, lineHeight: 38, marginTop: 10, marginBottom: 25 }, label: { fontSize: 12 }, url: { fontSize: 14, lineHeight: 21, marginTop: 12 }, button: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 24 }, cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 } });
