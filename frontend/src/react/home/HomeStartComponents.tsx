/**
 * Landing empty state — web adapters for the shared React Native module
 * (packages/ui/src/home). The module draws; this file supplies copy (i18n),
 * behaviour (composer, extensions, web search) and the web theme, so the
 * same components can mount in apps/socrates later without these bindings.
 */
/* Must run before any react-native-web module evaluates (see rnwGlobal.ts). */
import '../rn/rnwGlobal';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
import { HomeHero, HomeShortcuts, HomeStarters, type HomeShortcut } from '@socrates/ui/home';
import { i18n } from '../legacy/gateway.ts';
import { focusComposer, getComposerMarkdown, setComposerMarkdown } from '../../composer/controller.ts';
import { composeAction } from '../../extensions/index.ts';
import { toggleWebSearch } from '../../chat/webSearchToggle.ts';
import { webSearchOn } from '../../config/providers.ts';
import { openAttachmentPicker } from '../../attachments/render.ts';
import { getGreeting, subscribeGreeting } from '../../ui/greetingState.ts';

function t(key: string, fallback: string): string {
  return i18n(key, fallback);
}

const QUICK_ACTIONS = [
  { action: 'upload', label: 'home.quick.upload', fallback: 'Add images or files' },
  { action: 'write', label: 'home.quick.write', fallback: 'Write or edit' },
  { action: 'research', label: 'home.quick.research', fallback: 'Search the web' },
] as const;

const TUTOR_PROMPTS = ['understand', 'practice', 'plan'] as const;

export function HomeHeroRoot() {
  useLocaleRefresh();
  const greeting = useSyncExternalStore(subscribeGreeting, getGreeting);
  return (
    <WebUiTheme>
      <HomeHero titleId="topicTitle" title={greeting || t('greeting.chat', 'Ready when you are')} />
    </WebUiTheme>
  );
}

function applyTutorPrompt(promptName: string) {
  const prompt = i18n(`home.tutor.${promptName}.prompt`, '');
  if (!prompt) return;
  const draft = getComposerMarkdown('topic').trimEnd();
  setComposerMarkdown('topic', draft ? `${draft}\n\n${prompt}` : prompt);
  focusComposer('topic');
}

export function HomeQuickActions({ host }: { host: HTMLElement }) {
  useLocaleRefresh();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [searchEnabled, setSearchEnabled] = useState(webSearchOn);

  useEffect(() => {
    const syncSearch = () => setSearchEnabled(webSearchOn);
    document.addEventListener('socrates:websearchchange', syncSearch);
    return () => document.removeEventListener('socrates:websearchchange', syncSearch);
  }, []);

  function runAction(action: string) {
    if (action === 'upload') {
      openAttachmentPicker('composerAttachInput');
    } else if (action === 'research') {
      toggleWebSearch();
      setSearchEnabled(webSearchOn);
      focusComposer('topic');
    } else if (action === 'write') {
      composeAction();
    }
  }

  function dismiss(action: string) {
    const nextDismissed = new Set(dismissed);
    nextDismissed.add(action);
    setDismissed(nextDismissed);
    /* Keep keyboard focus in the row: move to the next remaining shortcut,
       or back to the composer when the row is empty. */
    requestAnimationFrame(() => {
      const next = QUICK_ACTIONS.find((item) => !nextDismissed.has(item.action));
      const nextButton = next
        ? host.querySelector<HTMLElement>(`[data-testid="home-shortcut-action-${next.action}"]`)
        : null;
      if (nextButton?.isConnected) nextButton.focus();
      else focusComposer('topic');
    });
  }

  const items: HomeShortcut[] = QUICK_ACTIONS
    .filter(({ action }) => !dismissed.has(action))
    .map(({ action, label, fallback }) => ({
      id: action,
      label: t(label, fallback),
      pressed: action === 'research' ? searchEnabled : undefined,
    }));

  return (
    <WebUiTheme>
      <HomeShortcuts
        items={items}
        label={t('chrome.quickActions', 'Quick actions')}
        dismissLabel={t('home.quick.dismiss', 'Dismiss quick action')}
        onSelect={runAction}
        onDismiss={dismiss}
      />
    </WebUiTheme>
  );
}

export function HomeTutorStarters() {
  useLocaleRefresh();
  return (
    <WebUiTheme>
      <HomeStarters
        heading={t('home.tutor.heading', 'Start with a good question')}
        headingId="homeTutorHeading"
        items={TUTOR_PROMPTS.map((prompt) => ({
          id: prompt,
          title: t(`home.tutor.${prompt}.title`, ''),
          hint: t(`home.tutor.${prompt}.hint`, ''),
        }))}
        onSelect={applyTutorPrompt}
      />
    </WebUiTheme>
  );
}
