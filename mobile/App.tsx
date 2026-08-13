import 'react-native-gesture-handler';
import React, { useCallback, useEffect } from 'react';
import { ActivityIndicator, AppState, BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { EmbeddedTarget } from '@socrates/contracts';
import { AppDrawer, AppDrawerProvider, useAppDrawer } from './src/components/AppDrawer';
import { I18nProvider, useT } from './src/i18n';
import { appStore, useAppStore } from './src/stores/appStore';
import { getNetworkStatus, subscribeToNetworkStatus } from './src/native/network';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { AuthScreen } from './src/screens/AuthScreen';
import { ArtifactPreviewScreen } from './src/screens/ArtifactPreviewScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { EmbeddedWebScreen } from './src/screens/EmbeddedWebScreen';
import { ExamScreen } from './src/screens/ExamScreen';
import { MoreScreen } from './src/screens/MoreScreen';
import { NewChatScreen } from './src/screens/NewChatScreen';
import { PluginsScreen } from './src/screens/PluginsScreen';
import { ProjectsScreen } from './src/screens/ProjectsScreen';
import { KnowledgeScreen } from './src/screens/KnowledgeScreen';
import { MistakesScreen } from './src/screens/MistakesScreen';
import { RecentsScreen } from './src/screens/RecentsScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { ScheduledScreen } from './src/screens/ScheduledScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ShareScreen } from './src/screens/ShareScreen';
import { TutorScreen } from './src/screens/TutorScreen';
import { WorkspaceScreen } from './src/screens/WorkspaceScreen';
import type { RootStackParamList } from './src/navigation/types';
import { hideAppSplash, prepareAppRuntime, setAppBackgroundColor } from './src/native/appRuntime';

void prepareAppRuntime();
void setAppBackgroundColor('#000000');

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#000000',
    card: '#141414',
    border: '#2A2A2A',
    text: '#F7F7F7',
    primary: '#E9BE53',
  },
};

function LoadingScreen() {
  const { colors, typography } = useTheme();
  const t = useT();
  return (
    <View style={[styles.loading, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.accent} />
      <Text style={[styles.loadingText, { color: colors.textMuted, fontFamily: typography.body }]}>
        {t('app.loading')}
      </Text>
    </View>
  );
}

function NativeStack() {
  const state = useAppStore();
  if (state.authStatus === 'booting') return <LoadingScreen />;
  if (state.authStatus === 'signedOut') return <AuthScreen />;

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="Home" component={NewChatScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Tutor" component={TutorScreen} />
        <Stack.Screen name="Library" component={RecentsScreen} />
        <Stack.Screen name="ExamSession" component={ExamScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="More" component={MoreScreen} />
        <Stack.Screen name="Projects" component={ProjectsScreen} />
        <Stack.Screen name="Scheduled" component={ScheduledScreen} />
        <Stack.Screen name="Plugins" component={PluginsScreen} />
        <Stack.Screen name="Knowledge" component={KnowledgeScreen} />
        <Stack.Screen name="Mistakes" component={MistakesScreen} />
        <Stack.Screen name="Workspace" component={WorkspaceScreen} />
        <Stack.Screen name="Embedded" component={EmbeddedWebScreen} />
        <Stack.Screen name="Share" component={ShareScreen} />
        <Stack.Screen name="ArtifactPreview" component={ArtifactPreviewScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function NativeApp() {
  const state = useAppStore();
  const { open: drawerOpen, closeDrawer } = useAppDrawer();

  useEffect(() => {
    let active = true;
    void appStore.bootstrap();
    void getNetworkStatus().then((online) => {
      if (active) appStore.setOnline(online);
    }).catch(() => undefined);
    const unsubscribeNetwork = subscribeToNetworkStatus((online) => {
      if (active) appStore.setOnline(online);
    });
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && active && appStore.getSnapshot().authStatus === 'signedIn') {
        void appStore.resumeForeground();
      }
    });
    return () => {
      active = false;
      unsubscribeNetwork();
      appStateSubscription.remove();
    };
    // Bootstrap and native subscriptions belong to the process lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerOpen) {
        closeDrawer();
        return true;
      }
      if (navigationRef.isReady() && navigationRef.canGoBack()) {
        navigationRef.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [closeDrawer, drawerOpen]);

  const navigate = useCallback((route: 'Home' | 'Library' | 'Search' | 'ExamSession' | 'Settings' | 'More' | 'Workspace' | 'Projects' | 'Scheduled' | 'Plugins' | 'Knowledge' | 'Mistakes') => {
    if (navigationRef.isReady()) navigationRef.navigate(route);
  }, []);

  const openEmbedded = useCallback((target: EmbeddedTarget, title: string) => {
    if (navigationRef.isReady()) navigationRef.navigate('Embedded', { target, title });
  }, []);

  return (
    <View style={[styles.root, styles.appFrame]}>
      {state.authStatus === 'signedIn' ? <AppDrawer onNavigate={navigate} onOpenEmbedded={openEmbedded} /> : null}
      <View style={styles.mainPane}><NativeStack /></View>
    </View>
  );
}

export default function App() {
  const revealApp = useCallback(() => {
    void hideAppSplash();
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <View onLayout={revealApp} style={styles.root} testID="app-root">
        <ThemeProvider>
          <I18nProvider>
            <AppDrawerProvider>
              <NativeApp />
            </AppDrawerProvider>
          </I18nProvider>
        </ThemeProvider>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  appFrame: {
    flexDirection: 'row',
  },
  mainPane: {
    flex: 1,
    minWidth: 0,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
  },
});
