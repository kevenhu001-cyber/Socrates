import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

type Listener = (enabled: boolean | null) => void;
type MotionSubscription = { remove: () => void };

let preference: boolean | null = null;
let initialized = false;
let subscription: MotionSubscription | undefined;
const listeners = new Set<Listener>();

function publish(enabled: boolean) {
  preference = Boolean(enabled);
  listeners.forEach((listener) => listener(preference));
}

function initializePreference() {
  if (initialized) return;
  initialized = true;
  try {
    subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', publish);
  } catch {
    // Older shells may not expose the change event; use the initial query.
  }
  try {
    void AccessibilityInfo.isReduceMotionEnabled().then(publish, () => publish(true));
  } catch {
    // Prefer a static accessible state if the platform query is unavailable.
    publish(true);
  }
}

/**
 * A null value means the platform preference has not resolved yet. Callers
 * should avoid non-essential motion until it is known, so a user who enabled
 * Reduce Motion never sees a first-mount animation while the query is in flight.
 * The native preference query and event subscription are shared app-wide.
 */
export function useReducedMotion(): boolean | null {
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(preference);

  useEffect(() => {
    listeners.add(setReducedMotion);
    setReducedMotion(preference);
    initializePreference();
    return () => {
      listeners.delete(setReducedMotion);
    };
  }, []);

  return reducedMotion;
}

export function motionAllowed(value: boolean | null): boolean {
  return value === false;
}

// Keep the handle referenced for the module lifetime: screens mount/unmount
// while an app-level accessibility preference change must remain observable.
void subscription;
