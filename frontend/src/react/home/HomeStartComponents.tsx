/**
 * Landing empty state — web adapter for the shared React Native hero module
 * (packages/ui/src/home). The module draws; this file supplies copy (i18n)
 * and the web theme, keeping those host bindings out of the shared module.
 *
 * The landing entries that used to sit under the composer (chat shortcuts,
 * the phone suggestion line and the tutor starter cards) were removed on
 * 2026-11-16: the landing is the greeting plus the composer, nothing else.
 */
import { useSyncExternalStore } from 'react';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
import { HomeHero } from '@socrates/ui/home';
import { i18n } from '../../ui/legacyI18n.ts';
import { getGreeting, subscribeGreeting } from '../../legacy/greetingState.ts';

function t(key: string, fallback: string): string {
  return i18n(key, fallback);
}

const COMPACT_QUERY = '(max-width: 768px)';

function subscribeCompact(listener: () => void): () => void {
  const query = window.matchMedia(COMPACT_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

function compactSnapshot(): boolean {
  return window.matchMedia(COMPACT_QUERY).matches;
}

function useCompactLayout(): boolean {
  return useSyncExternalStore(subscribeCompact, compactSnapshot, () => false);
}

export function HomeHeroRoot() {
  useLocaleRefresh();
  const greeting = useSyncExternalStore(subscribeGreeting, getGreeting);
  const compact = useCompactLayout();
  return (
    <WebUiTheme>
      <HomeHero
        compact={compact}
        titleId="topicTitle"
        titleFontFamily="var(--font-display)"
        title={greeting || t('greeting.chat', 'Ready when you are')}
      />
    </WebUiTheme>
  );
}
