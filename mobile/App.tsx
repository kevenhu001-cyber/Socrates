import 'react-native-gesture-handler';
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { WebAppScreen } from './src/screens/WebAppScreen';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
void SystemUI.setBackgroundColorAsync('#000000').catch(() => undefined);

/**
 * The Android client deliberately renders the same responsive web product as
 * desktop/mobile web. Keeping one product surface prevents the native client
 * from drifting behind new tools, settings, authentication flows, and visual
 * changes added to `frontend/`.
 *
 * The native splash is dismissed as soon as React lays out its first frame.
 * Network and authentication work must never control the OS splash lifetime;
 * WebAppScreen owns a recoverable in-app loading/error state instead.
 */
export default function App() {
  const revealApp = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <View onLayout={revealApp} style={styles.root} testID="app-root">
        <WebAppScreen />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
