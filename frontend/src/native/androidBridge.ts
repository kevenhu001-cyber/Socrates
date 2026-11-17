/**
 * frontend/src/native/androidBridge.ts
 *
 * Bi-directional Hybrid Bridge between Socrates Android Host and Web SPA.
 *
 * Responsibilities:
 * 1. WindowInsets / Keyboard animation: Frame-by-frame keyboard height updates from
 *    Android WindowInsetsAnimationCallback are dispatched directly to KeyboardLift.
 * 2. System Back gesture interception: Intercepts Android back-press to dismiss modals,
 *    popovers, and mobile sidebar drawer before handing back control to Android.
 * 3. Haptic feedback: Dispatches micro-haptics (tick, success, warning) to native vibrator.
 * 4. Safe-area insets: Maps notch and gesture bars into CSS variables.
 */

import { closeSidebarOnMobile } from '../sidebar/sidebar.service.ts';
import { closeCmdK } from '../ui/cmdK.ts';
import { closeStorageModal } from '../ui/storage.ts';
import { closePromptTemplatesModal } from '../ui/promptTemplates.ts';
import { closeProfile } from '../ui/profile.ts';
import { closeCheatsheet } from '../ui/cheatsheet.ts';
import { closeShareModal } from '../ui/share.ts';
import { closeTagEditor } from '../session/organizeRuntime.ts';
import { closeConfirm } from '../ui/confirm.ts';
import { isFindOpen, closeFindInSession } from '../react/find-in-session/findInSession.actions.ts';
import { getKeyboardLift } from '../ui/keyboard/index.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

export interface SystemInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export type HapticType = 'tick' | 'success' | 'warning';

export interface SocratesNativeInterface {
  onKeyboardHeight(heightDp: number): void;
  handleBackPress(): boolean;
  setSystemInsets(insets: SystemInsets): void;
  isAndroidShell: boolean;
}

interface NativeAndroidHost {
  performHaptic?(type: string): void;
  postMessage?(messageJson: string): void;
  notifyPageReady?(): void;
}

function getAndroidHost(): NativeAndroidHost | null {
  if (typeof window === 'undefined') return null;
  const host = (window as unknown as { SocratesAndroid?: NativeAndroidHost }).SocratesAndroid;
  return host || null;
}

export function isAndroidHybrid(): boolean {
  return getAndroidHost() !== null;
}

/**
 * Trigger physical haptic feedback.
 * Falls back to Web Vibration API if native bridge is not available.
 */
export function triggerHaptic(type: HapticType = 'tick'): void {
  try {
    const host = getAndroidHost();
    if (host && typeof host.performHaptic === 'function') {
      host.performHaptic(type);
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      if (type === 'tick') navigator.vibrate(8);
      else if (type === 'success') navigator.vibrate([10, 30, 15]);
      else if (type === 'warning') navigator.vibrate([20, 40, 20]);
    }
  } catch (error) {
    reportSwallow(error, 'androidBridge.triggerHaptic');
  }
}

function isElementVisible(id: string): boolean {
  if (typeof document === 'undefined') return false;
  const element = document.getElementById(id);
  return Boolean(element && !element.classList.contains('hidden'));
}

/**
 * Handle system back-press event forwarded by the Android host.
 * Returns true if an overlay, modal or drawer was dismissed (event consumed).
 * Returns false if the web view is at root state, allowing Android to minimize or exit.
 */
export function handleBackPress(): boolean {
  // 1. In-session find bar
  if (typeof isFindOpen === 'function' && isFindOpen()) {
    closeFindInSession();
    return true;
  }

  // 2. Modals and overlays
  if (isElementVisible('confirmOverlay')) {
    closeConfirm(false);
    return true;
  }
  if (isElementVisible('cmdKOverlay')) {
    closeCmdK();
    return true;
  }
  if (isElementVisible('storageModalOverlay')) {
    closeStorageModal();
    return true;
  }
  if (isElementVisible('promptTemplatesOverlay')) {
    closePromptTemplatesModal();
    return true;
  }
  if (isElementVisible('profileOverlay')) {
    closeProfile();
    return true;
  }
  if (isElementVisible('settingsOverlay')) {
    void import('../react/settings/settings.service.ts')
      .then((m) => m.closeSettings())
      .catch((err) => reportSwallow(err, 'androidBridge.closeSettings'));
    return true;
  }
  if (isElementVisible('cheatsheetOverlay')) {
    closeCheatsheet();
    return true;
  }
  if (isElementVisible('usageOverlay')) {
    void import('../ui/usage.ts')
      .then((m) => m.closeUsageModal())
      .catch((err) => reportSwallow(err, 'androidBridge.closeUsageModal'));
    return true;
  }
  if (isElementVisible('tagEditorPopover')) {
    closeTagEditor();
    return true;
  }
  if (isElementVisible('shareOverlay')) {
    closeShareModal();
    return true;
  }

  // 3. Mobile sidebar drawer
  if (closeSidebarOnMobile()) {
    return true;
  }

  // No overlay was active; allow Android to handle back (e.g. exit/minimize)
  return false;
}

/**
 * Handle real-time keyboard height update from Android WindowInsetsAnimationCallback.
 */
export function onKeyboardHeight(heightDp: number): void {
  const windowKeyboard = typeof window !== 'undefined'
    ? (window as unknown as { __socratesKeyboard?: { notifyNativeKeyboard: (kind: 'show' | 'hide', height?: number) => void } }).__socratesKeyboard
    : null;
  const lift = getKeyboardLift() || windowKeyboard;
  if (lift && typeof lift.notifyNativeKeyboard === 'function') {
    if (heightDp > 0) {
      lift.notifyNativeKeyboard('show', heightDp);
    } else {
      lift.notifyNativeKeyboard('hide');
    }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--native-keyboard-inset', `${Math.max(0, heightDp)}px`);
  }
}

/**
 * Set system safe-area insets (status bar, navigation bar, cutouts).
 */
export function setSystemInsets(insets: SystemInsets): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--app-safe-top', `${Math.max(0, insets.top)}px`);
  root.style.setProperty('--app-safe-bottom', `${Math.max(0, insets.bottom)}px`);
  root.style.setProperty('--app-safe-left', `${Math.max(0, insets.left)}px`);
  root.style.setProperty('--app-safe-right', `${Math.max(0, insets.right)}px`);
}

/**
 * Initialize the native bridge on window.__socratesNative.
 */
export function initAndroidBridge(): void {
  if (typeof window === 'undefined') return;

  const bridge: SocratesNativeInterface = {
    onKeyboardHeight,
    handleBackPress,
    setSystemInsets,
    isAndroidShell: isAndroidHybrid(),
  };

  (window as unknown as { __socratesNative: SocratesNativeInterface }).__socratesNative = bridge;

  if (isAndroidHybrid()) {
    document.documentElement.classList.add('is-android-hybrid');
    const host = getAndroidHost();
    if (host && typeof host.notifyPageReady === 'function') {
      host.notifyPageReady();
    }
  }
}
