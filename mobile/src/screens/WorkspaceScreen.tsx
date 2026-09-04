import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppHeader } from '../components/AppHeader';
import { CanvasBlock } from '../components/CanvasBlock';
import { Screen } from '../components/Screen';
import { appStore } from '../stores/appStore';
import { useT } from '../i18n';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Workspace'>;

export function WorkspaceScreen({ navigation }: Props) {
  const t = useT();
  return (
    <Screen style={styles.screen}>
      <AppHeader title={t('workspace.canvasTitle')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.canvasWrap}>
          <CanvasBlock
            label={t('composer.write')}
            originalText={t('workspace.canvasStarter')}
            onIterate={(text) => {
              appStore.setDraft(text);
              navigation.navigate('Home');
            }}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  canvasWrap: { width: '100%', maxWidth: 768, alignSelf: 'center' },
});
