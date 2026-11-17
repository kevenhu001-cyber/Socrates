/**
 * Landing empty state — web adapter for the shared React Native hero module
 * (packages/ui/src/home). The module draws; this file supplies copy (i18n)
 * and the web theme, keeping those host bindings out of the shared module.
 *
 * The landing entries that used to sit under the composer (chat shortcuts,
 * the phone suggestion line and the tutor starter cards) were removed on
 * 2026-11-16: the landing is the greeting plus the composer, nothing else.
 */
/* Must run before any react-native-web module evaluates (see rnwGlobal.ts). */
import '../rn/rnwGlobal';
import { useSyncExternalStore } from 'react';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
import { HomeHero } from '@socrates/ui/home';
import { i18n } from '../legacy/gateway.ts';
import { getGreeting, subscribeGreeting } from '../../legacy/greetingState.ts';

function t(key: string, fallback: string): string {
  return i18n(key, fallback);
}

export function HomeHeroRoot() {
  useLocaleRefresh();
  const greeting = useSyncExternalStore(subscribeGreeting, getGreeting);
  return (
    <WebUiTheme>
      <HomeHero titleId="topicTitle" title={greeting || t('greeting.chat', 'Ready when you are')} />
    </WebUiTheme>
  );
}
