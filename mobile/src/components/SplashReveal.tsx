import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { hideAppSplash } from '../native/appRuntime';
import { useThemeController } from '../theme/ThemeProvider';

export function SplashReveal({ fontsLoaded, children }: { fontsLoaded: boolean; children: React.ReactNode }) {
  const { ready: themeReady } = useThemeController();
  const [hasLayout, setHasLayout] = useState(false);
  const didHide = useRef(false);
  const onLayout = useCallback(() => setHasLayout(true), []);

  useEffect(() => {
    if (!fontsLoaded || !themeReady || !hasLayout || didHide.current) return;
    didHide.current = true;
    void hideAppSplash().catch((error) => {
      console.warn('[App] Failed to hide app splash screen:', error);
    });
  }, [fontsLoaded, hasLayout, themeReady]);

  return (
    <View onLayout={onLayout} style={styles.root} testID="app-root">
      {children}
    </View>
  );
}

const styles = {
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
};
