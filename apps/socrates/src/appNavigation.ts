import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import { BackHandler } from 'react-native';
import type { User } from '@socrates/contracts';
import type { SidebarNavItem, SidebarUser, UiStrings } from '@socrates/ui';
import type { AppStrings } from './strings';

export type AppScreen = 'chat' | 'settings' | 'projects' | 'search' | 'providers' | 'files' | 'assistants' | 'exam-setup' | 'tutor-setup';

interface HardwareBackOptions {
  modelMenuOpen: boolean;
  assistantMenuOpen: boolean;
  providersReturn: 'settings' | 'chat';
  screen: AppScreen;
  compact: boolean;
  sidebarOpen: boolean;
  setModelMenuOpen: (open: boolean) => void;
  setAssistantMenuOpen: (open: boolean) => void;
  setMovePickSession: (id: string | null) => void;
  setScreen: Dispatch<SetStateAction<AppScreen>>;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
}

/** Keeps Android back handling ordered with the active overlay and route. */
export function useHardwareBackNavigation({
  modelMenuOpen,
  assistantMenuOpen,
  providersReturn,
  screen,
  compact,
  sidebarOpen,
  setModelMenuOpen,
  setAssistantMenuOpen,
  setMovePickSession,
  setScreen,
  setSidebarOpen,
}: HardwareBackOptions) {
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (modelMenuOpen) { setModelMenuOpen(false); return true; }
      if (assistantMenuOpen) { setAssistantMenuOpen(false); return true; }
      if (screen === 'providers') { setScreen(providersReturn); return true; }
      if (screen !== 'chat') { setMovePickSession(null); setScreen('chat'); return true; }
      if (compact && sidebarOpen) { setSidebarOpen(false); return true; }
      return false;
    });
    return () => listener.remove();
  }, [assistantMenuOpen, compact, modelMenuOpen, providersReturn, screen, sidebarOpen, setAssistantMenuOpen, setModelMenuOpen, setMovePickSession, setScreen, setSidebarOpen]);
}

interface SidebarNavigationOptions {
  screen: AppScreen;
  compact: boolean;
  user: User | null;
  accountPlan: string;
  appCopy: AppStrings;
  uiCopy: UiStrings;
  setScreen: Dispatch<SetStateAction<AppScreen>>;
  setProvidersReturn: Dispatch<SetStateAction<'settings' | 'chat'>>;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  createSession(): void;
  openAssistantMenu(): void;
  loadProviders(): Promise<void>;
}

/** Builds stable sidebar destinations and the signed-in footer identity. */
export function useSidebarNavigation({
  screen,
  compact,
  user,
  accountPlan,
  appCopy,
  uiCopy,
  setScreen,
  setProvidersReturn,
  setSidebarOpen,
  createSession,
  openAssistantMenu,
  loadProviders,
}: SidebarNavigationOptions) {
  const navItems = useMemo<SidebarNavItem[]>(() => {
    const closeDrawer = () => { if (compact) setSidebarOpen(false); };
    const goTo = (destination: AppScreen) => { closeDrawer(); setScreen(destination); };
    return [
      { key: 'new', label: uiCopy.newChat, icon: 'new-chat', onPress: createSession },
      { key: 'library', label: uiCopy.navLibrary, icon: 'library', active: screen === 'files', onPress: () => goTo('files') },
      { key: 'projects', label: uiCopy.navProjects, accessibilityLabel: appCopy.openProjects, icon: 'projects', active: screen === 'projects', onPress: () => goTo('projects') },
      { key: 'scheduled', label: uiCopy.navScheduled, icon: 'scheduled', onPress: () => undefined },
      { key: 'plugins', label: uiCopy.navPlugins, icon: 'plugins', onPress: () => undefined },
      { key: 'sites', label: uiCopy.navSites, icon: 'sites', badge: uiCopy.newBadge, onPress: () => undefined },
      {
        key: 'more',
        label: uiCopy.navMore,
        icon: 'more',
        onPress: () => undefined,
        menu: [
          ...(!user || user.isGuest ? [] : [{ label: appCopy.openAssistantMenu, onPress: () => { closeDrawer(); openAssistantMenu(); } }]),
          { label: appCopy.assistantTitle, onPress: () => goTo('assistants') },
          { label: appCopy.openProviders, onPress: () => { closeDrawer(); setProvidersReturn('chat'); setScreen('providers'); void loadProviders(); } },
          { label: uiCopy.newExam, onPress: () => goTo('exam-setup') },
          { label: uiCopy.newTutor, onPress: () => goTo('tutor-setup') },
        ],
      },
    ];
  }, [appCopy, compact, createSession, loadProviders, openAssistantMenu, screen, setProvidersReturn, setScreen, setSidebarOpen, uiCopy, user]);

  const sidebarUser = useMemo<SidebarUser | null>(() => user ? {
    initials: (user.displayName || user.email || '?').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
    name: user.displayName || user.email || uiCopy.brand,
    plan: user.tier ? user.tier[0].toUpperCase() + user.tier.slice(1) : accountPlan,
  } : null, [accountPlan, uiCopy.brand, user]);

  return { navItems, sidebarUser };
}
