import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Keyboard, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {
  NavigationContainer,
  createNavigationContainerRef,
  DarkTheme,
  DefaultTheme,
  type NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { EmbeddedTarget } from '@socrates/contracts';
import { AppDrawer, AppDrawerProvider, profileOverlay, useAppDrawer, type NativeDestination } from './src/components/AppDrawer';
import { usageOverlay, storageOverlay } from './src/cmdK/overlayStores';
import { CmdKPalette } from './src/cmdK/CmdKPalette';
import { cmdKStore } from './src/cmdK/cmdKStore';
import { I18nProvider, useT } from './src/i18n';
import { appStore, useAppStore } from './src/stores/appStore';
import { getNetworkStatus, subscribeToNetworkStatus } from './src/native/network';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';
import { Newsreader_500Medium } from '@expo-google-fonts/newsreader';
import { NotoSansSC_400Regular } from '@expo-google-fonts/noto-sans-sc';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ShareModal } from './src/components/ShareModal';
import { ToastHost } from './src/components/Toast';
import { ProfileOverlay } from './src/components/ProfileOverlay';
import { UsageOverlay } from './src/components/UsageOverlay';
import { StorageOverlay } from './src/components/StorageOverlay';
import { nativeOverlayForEmbeddedTarget, nativeRouteForEmbeddedTarget } from './src/screens/embeddedBridge';
import { AuthScreen } from './src/screens/AuthScreen';
import { ArtifactPreviewScreen } from './src/screens/ArtifactPreviewScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { EmbeddedWebScreen } from './src/screens/EmbeddedWebScreen';
import { ExamScreen } from './src/screens/ExamScreen';
import { DisplaySettingsScreen } from './src/screens/DisplaySettingsScreen';
import { MoreScreen } from './src/screens/MoreScreen';
import { NewChatScreen } from './src/screens/NewChatScreen';
import { PluginsScreen } from './src/screens/PluginsScreen';
import { ProjectsScreen } from './src/screens/ProjectsScreen';
import { KnowledgeScreen } from './src/screens/KnowledgeScreen';
import { MistakesScreen } from './src/screens/MistakesScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { ScheduledScreen } from './src/screens/ScheduledScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
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
    case 'Display':
      ref.navigate('Display');
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

function NativeStack({ onRouteChange }: { onRouteChange?: (routeName: keyof RootStackParamList | null) => void }) {
  const authStatus = useAppStore((s) => s.authStatus);
  const { colors } = useTheme();
  if (authStatus === 'booting') return <LoadingScreen />;
  if (authStatus === 'signedOut') return <AuthScreen />;

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
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      onReady={() => onRouteChange?.(navigationRef.getCurrentRoute()?.name ?? null)}
      onStateChange={() => onRouteChange?.(navigationRef.getCurrentRoute()?.name ?? null)}
    >
      {/* freezeOnBlur suspends React work for screens hidden behind the top
       * one — a directory page left in the stack (Recents/Projects/…) stops
       * re-rendering on every store update while Chat streams on top of it. */}
      <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false, animation: 'fade', freezeOnBlur: true }}>
        <Stack.Screen name="Home" component={NewChatScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Tutor" component={TutorScreen} />
        <Stack.Screen name="Library" component={LibraryScreen} />
        <Stack.Screen name="ExamSession" component={ExamScreen} />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
        />
        <Stack.Screen
          name="Display"
          component={DisplaySettingsScreen}
          options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
        />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="More" component={MoreScreen} />
        <Stack.Screen name="Projects" component={ProjectsScreen} />
        <Stack.Screen name="Scheduled" component={ScheduledScreen} />
        <Stack.Screen name="Plugins" component={PluginsScreen} />
        <Stack.Screen name="Knowledge" component={KnowledgeScreen} />
        <Stack.Screen name="Mistakes" component={MistakesScreen} />
        <Stack.Screen name="Workspace" component={WorkspaceScreen} />
        <Stack.Screen name="Embedded" component={EmbeddedWebScreen} />
        <Stack.Screen name="ArtifactPreview" component={ArtifactPreviewScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function NativeApp() {
  const authStatus = useAppStore((s) => s.authStatus);
  const user = useAppStore((s) => s.user);
  const { open: drawerOpen, closeDrawer } = useAppDrawer();
  const { colors } = useTheme();
  const [currentRoute, setCurrentRoute] = useState<keyof RootStackParamList | null>('Home');
  const embeddedActive = currentRoute === 'Embedded';
  const [profileOpen, setProfileOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);

  /* Android draws edge-to-edge here (see plugins/withEdgeToEdge.js), so the
   * status bar has no colour of its own — only the icon brightness follows the
   * theme. RN ignores backgroundColor/translucent while edge-to-edge is on and
   * logs a warning per call, so they stay unset. */
  const statusBarStyle = colors.statusBarStyle === 'light' ? 'light-content' : 'dark-content';

  useEffect(() => {
    const unsubscribeProfile = profileOverlay.subscribe(setProfileOpen);
    const unsubscribeUsage = usageOverlay.subscribe(setUsageOpen);
    const unsubscribeStorage = storageOverlay.subscribe(setStorageOpen);
    return () => {
      unsubscribeProfile();
      unsubscribeUsage();
      unsubscribeStorage();
    };
  }, []);

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
      if (cmdKStore.isOpen()) {
        cmdKStore.close();
        return true;
      }
      if (Keyboard.isVisible()) {
        Keyboard.dismiss();
        return true;
      }
      if (drawerOpen) {
        closeDrawer();
        return true;
      }
      if (profileOpen || usageOpen || storageOpen) {
        if (profileOpen) profileOverlay.close();
        if (usageOpen) usageOverlay.close();
        if (storageOpen) storageOverlay.close();
        return true;
      }
      if (navigationRef.isReady() && navigationRef.canGoBack()) {
        navigationRef.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [closeDrawer, drawerOpen, profileOpen, storageOpen, usageOpen]);

  const navigate = useCallback((route: NativeDestination) => {
    navigateToDestination(navigationRef, route);
  }, []);

  const openEmbedded = useCallback((target: EmbeddedTarget, title: string) => {
    if (navigationRef.isReady()) {
      const nativeRoute = nativeRouteForEmbeddedTarget(target);
      if (nativeRoute) navigationRef.navigate(nativeRoute);
      else {
        const nativeOverlay = nativeOverlayForEmbeddedTarget(target);
        if (nativeOverlay === 'profile') profileOverlay.open();
        if (nativeOverlay === 'usage') usageOverlay.open();
        if (nativeOverlay === 'storage') storageOverlay.open();
        if (!nativeOverlay) navigationRef.navigate('Embedded', { target, title });
      }
    }
  }, []);

  return (
    <View style={[styles.root, styles.appFrame, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={statusBarStyle} />
      {authStatus === 'signedIn' && !embeddedActive ? <AppDrawer onNavigate={navigate} onOpenEmbedded={openEmbedded} activeRoute={currentRoute} /> : null}
      <View
        style={[
          styles.mainPane,
          /*
           * The permanent drawer participates in the root flex row and
           * already owns its 260dp column. Adding a second margin here
           * doubled the desktop/tablet inset (drawer + 260dp blank gutter),
           * which made every directory page drift from the web shell.
           */
          null,
        ]}
      >
        <NativeStack onRouteChange={setCurrentRoute} />
      </View>
      {authStatus === 'signedIn' ? <CmdKPalette onNavigate={navigate} onOpenEmbedded={openEmbedded} /> : null}
      {/* P0 1:1: frontend-style `.share-modal` + `.alert-container`.
       *  Mounted at the root so they overlay any screen or drawer route. */}
      <ShareModal />
      <ToastHost />
      <ProfileOverlay
        visible={profileOpen}
        user={user}
        onClose={() => profileOverlay.close()}
      />
      <UsageOverlay
        visible={usageOpen}
        onClose={() => usageOverlay.close()}
      />
      <StorageOverlay
        visible={storageOpen}
        onClose={() => storageOverlay.close()}
      />
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    JetBrainsMono_400Regular,
    Newsreader_500Medium,
    NotoSansSC_400Regular,
  });

  // Defensively initialize native runtime on mount rather than at module load
  useEffect(() => {
    void prepareAppRuntime().catch((err) => {
      console.warn('[App] Failed to prepare native app runtime:', err);
    });
  }, []);

  const revealApp = useCallback(() => {
    if (fontsLoaded) {
      void hideAppSplash().catch((err) => {
        console.warn('[App] Failed to hide app splash screen:', err);
      });
    }
  }, [fontsLoaded]);

  return (
    <KeyboardProvider>
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
    </KeyboardProvider>
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
