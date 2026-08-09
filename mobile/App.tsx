import 'react-native-gesture-handler';
import React, { useCallback, useEffect } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { NavigationContainer, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Newsreader_500Medium } from '@expo-google-fonts/newsreader';
import { NotoSansSC_400Regular } from '@expo-google-fonts/noto-sans-sc';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import type { EmbeddedTarget } from '@socrates/contracts';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { I18nProvider } from './src/i18n';
import { appStore, useAppStore } from './src/stores/appStore';
import { AuthScreen } from './src/screens/AuthScreen';
import { NewChatScreen } from './src/screens/NewChatScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { RecentsScreen } from './src/screens/RecentsScreen';
import { TutorScreen } from './src/screens/TutorScreen';
import { ExamScreen } from './src/screens/ExamScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ArtifactPreviewScreen } from './src/screens/ArtifactPreviewScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { ShareScreen } from './src/screens/ShareScreen';
import { EmbeddedWebScreen } from './src/screens/EmbeddedWebScreen';
import { AppDrawer, AppDrawerProvider } from './src/components/AppDrawer';
import { BrandMark } from './src/components/BrandMark';
import { registerPushNotifications, subscribeToNotificationNavigation } from './src/native/push';
import { getNetworkStatus, subscribeToNetworkStatus } from './src/native/network';
import type { RootStackParamList } from './src/navigation/types';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
void SystemUI.setBackgroundColorAsync('#000000').catch(() => undefined);

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

function AuthenticatedApp() {
  const { colors } = useTheme();
  const navigationTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
      primary: colors.accent,
    },
  };

  useEffect(() => {
    void registerPushNotifications().catch(() => undefined);
    return subscribeToNotificationNavigation((sessionId) => {
      if (!navigationRef.isReady()) return;
      void appStore.openSession(sessionId).then(() => navigationRef.navigate('Chat'));
    });
  }, []);

  const navigate = useCallback((route: 'Home' | 'Library' | 'Search' | 'ExamSession' | 'Settings') => {
    if (!navigationRef.isReady()) return;
    if (route === 'Home') appStore.startNewSession('chat');
    navigationRef.navigate(route);
  }, []);

  const openEmbedded = useCallback((target: EmbeddedTarget, title: string) => {
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('Embedded', { target, title });
  }, []);

  return (
    <AppDrawerProvider>
      <NavigationContainer ref={navigationRef} theme={navigationTheme}>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade' }}
        >
          <Stack.Screen name="Home" component={NewChatScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="Tutor" component={TutorScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="Library" component={RecentsScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="ExamSession" component={ExamScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="Search" component={SearchScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="Embedded" component={EmbeddedWebScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="Share" component={ShareScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="ArtifactPreview" component={ArtifactPreviewScreen} options={{ animation: 'slide_from_right' }} />
        </Stack.Navigator>
      </NavigationContainer>
      <AppDrawer onNavigate={navigate} onOpenEmbedded={openEmbedded} />
    </AppDrawerProvider>
  );
}

function Root() {
  const state = useAppStore();
  const { colors } = useTheme();

  useEffect(() => { void appStore.bootstrap(); }, []);
  useEffect(() => {
    void getNetworkStatus().then((online) => appStore.setOnline(online)).catch(() => appStore.setOnline(false));
    return subscribeToNetworkStatus((online) => appStore.setOnline(online));
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') appStore.stopGenerating();
      else void appStore.resumeForeground();
    });
    return () => subscription.remove();
  }, []);

  if (state.authStatus === 'booting') {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <BrandMark size={72} />
        <ActivityIndicator style={styles.spinner} color={colors.accent} />
      </View>
    );
  }
  if (state.authStatus === 'signedOut') return <AuthScreen />;
  return <AuthenticatedApp />;
}

function FontGate() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Newsreader_500Medium,
    NotoSansSC_400Regular,
  });

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded, error]);

  if (!loaded && !error) return null;
  return <Root />;
}

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeProvider>
        <I18nProvider>
          <StatusBar style="light" />
          <FontGate />
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  spinner: { marginTop: 22 },
});
