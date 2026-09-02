import 'react-native-gesture-handler';
import React, { useCallback, useEffect } from 'react';
import { ActivityIndicator, AppState, BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  createNavigationContainerRef,
  DarkTheme,
  DefaultTheme,
  type NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { EmbeddedTarget } from '@socrates/contracts';
import { AppDrawer, AppDrawerProvider, useAppDrawer, type NativeDestination } from './src/components/AppDrawer';
import { I18nProvider, useT } from './src/i18n';
import { appStore, useAppStore } from './src/stores/appStore';
import { getNetworkStatus, subscribeToNetworkStatus } from './src/native/network';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { ErrorBoundary } from './src/components/ErrorBoundary';
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

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Type-safe dispatcher that exhaustively routes to zero-parameter destinations
 * without type assertions like `as never` or `any`.
 */
function navigateToDestination(
  ref: NavigationContainerRefWithCurrent<RootStackParamList>,
  route: NativeDestination,
) {
  if (!ref.isReady()) return;
  switch (route) {
    case 'Home':
      ref.navigate('Home');
      break;
    case 'Chat':
      ref.navigate('Chat');
      break;
    case 'Tutor':
      ref.navigate('Tutor');
      break;
    case 'Library':
      ref.navigate('Library');
      break;
    case 'ExamSession':
      ref.navigate('ExamSession');
      break;
    case 'Settings':
      ref.navigate('Settings');
      break;
    case 'Search':
      ref.navigate('Search');
      break;
    case 'More':
      ref.navigate('More');
      break;
    case 'Projects':
      ref.navigate('Projects');
      break;
    case 'Scheduled':
      ref.navigate('Scheduled');
      break;
    case 'Plugins':
      ref.navigate('Plugins');
      break;
    case 'Knowledge':
      ref.navigate('Knowledge');
      break;
    case 'Mistakes':
      ref.navigate('Mistakes');
      break;
    case 'Workspace':
      ref.navigate('Workspace');
      break;
    default: {
      const _exhaustiveCheck: never = route;
      console.warn(`[Navigation] Unhandled destination route: ${_exhaustiveCheck}`);
    }
  }
}

function LoadingScreen() {
  const { colors, typography } = useTheme();
  const t = useT();
  return (
    <View style={[styles.loading, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.accent} />
      <Text style={[styles.loadingText, { color: colors.textMuted, fontFamily: typography.body }]}>
        {t('app.loading') || 'Loading...'}
      </Text>
    </View>
  );
}

function NativeStack() {
  const state = useAppStore();
  const { colors } = useTheme();
  if (state.authStatus === 'booting') return <LoadingScreen />;
  if (state.authStatus === 'signedOut') return <AuthScreen />;

  const baseNavTheme = colors.statusBarStyle === 'light' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseNavTheme,
    colors: {
      ...baseNavTheme.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.surface,
      border: colors.border,
      text: colors.text,
      notification: colors.accent,
    },
  };

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
  const { colors } = useTheme();

  // Keep system UI background dynamically in sync with the active theme color
  useEffect(() => {
    void setAppBackgroundColor(colors.background).catch((err) => {
      console.warn('[App] Failed to update system background color:', err);
    });
  }, [colors.background]);

  useEffect(() => {
    let active = true;

    // 1. Defensively bootstrap authentication and session state
    (async () => {
      try {
        await appStore.bootstrap();
      } catch (error) {
        console.error('[App] Bootstrap crashed in root effect:', error);
        // Force state unlock so the user is not left stuck on LoadingScreen
        if (active && appStore.getSnapshot().authStatus === 'booting') {
          appStore.setAuthStatusSignedOut();
        }
      }
    })();

    // 2. Safely read network status without swallowing errors
    getNetworkStatus()
      .then((online) => {
        if (active) appStore.setOnline(online);
      })
      .catch((error) => {
        console.warn('[App] Initial network status retrieval failed, assuming online:', error);
        if (active) appStore.setOnline(true);
      });

    // 3. Subscribe to network status changes
    const unsubscribeNetwork = subscribeToNetworkStatus((online) => {
      if (active) appStore.setOnline(online);
    });

    // 4. Handle app resume from background
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && active && appStore.getSnapshot().authStatus === 'signedIn') {
        appStore.resumeForeground().catch((err) => {
          console.warn('[App] Failed to resume foreground state:', err);
        });
      }
    });

    return () => {
      active = false;
      unsubscribeNetwork();
      appStateSubscription.remove();
    };
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

  const navigate = useCallback((route: NativeDestination) => {
    navigateToDestination(navigationRef, route);
  }, []);

  const openEmbedded = useCallback((target: EmbeddedTarget, title: string) => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('Embedded', { target, title });
    }
  }, []);

  return (
    <View style={[styles.root, styles.appFrame, { backgroundColor: colors.background }]}>
      {state.authStatus === 'signedIn' ? <AppDrawer onNavigate={navigate} onOpenEmbedded={openEmbedded} /> : null}
      <View style={styles.mainPane}><NativeStack /></View>
    </View>
  );
}

export default function App() {
  // Defensively initialize native runtime on mount rather than at module load
  useEffect(() => {
    void prepareAppRuntime().catch((err) => {
      console.warn('[App] Failed to prepare native app runtime:', err);
    });
  }, []);

  const revealApp = useCallback(() => {
    void hideAppSplash().catch((err) => {
      console.warn('[App] Failed to hide app splash screen:', err);
    });
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <View onLayout={revealApp} style={styles.root} testID="app-root">
        <ErrorBoundary>
          <ThemeProvider>
            <I18nProvider>
              <AppDrawerProvider>
                <NativeApp />
              </AppDrawerProvider>
            </I18nProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#101318',
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
