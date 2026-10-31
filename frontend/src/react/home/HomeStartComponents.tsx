import { Button } from '../ui/shadcn/button';
import { i18n } from '../legacy/gateway.ts';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { focusComposer, getComposerMarkdown, setComposerMarkdown } from '../../composer/controller.ts';
import { composeAction } from '../../extensions/index.ts';
import { toggleWebSearch } from '../../chat/webSearchToggle.ts';
import { webSearchOn } from '../../config/providers.ts';
import { openAttachmentPicker } from '../../attachments/render.ts';

function t(key: string, fallback: string): string {
  return i18n(key, fallback);
}

const QUICK_ACTIONS = [
  {
    action: 'upload',
    label: 'home.quick.upload',
    fallback: 'Add images or files',
    icon: <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M4 17.5 8 13a2 2 0 0 1 3 0l2 2 1.5-1.5a2 2 0 0 1 3 0l3 3.5" /></>,
  },
  {
    action: 'write',
    label: 'home.quick.write',
    fallback: 'Write or edit',
    icon: <><path d="m14.5 5.5 4 4M5 19l3.6-.9L19.2 7.5a2.8 2.8 0 0 0-4-4L4.6 14.1 3.7 18a.8.8 0 0 0 1 1Z" /></>,
  },
  {
    action: 'research',
    label: 'home.quick.research',
    fallback: 'Search the web',
    icon: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c4.5 4.7 4.5 12.3 0 17-4.5-4.7-4.5-12.3 0-17Z" /></>,
  },
] as const;

const TUTOR_PROMPTS = [
  { prompt: 'understand', glyph: '◇' },
  { prompt: 'practice', glyph: '↗' },
  { prompt: 'plan', glyph: '☷' },
] as const;

function DismissIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m7 7 10 10M17 7 7 17" /></svg>;
}

function useLocaleRefresh() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const onLanguageChange = () => refresh((revision) => revision + 1);
    document.addEventListener('socrates:langchange', onLanguageChange);
    return () => document.removeEventListener('socrates:langchange', onLanguageChange);
  }, []);
}

function applyTutorPrompt(promptName: string) {
  const prompt = i18n(`home.tutor.${promptName}.prompt`, '');
  if (!prompt) return;
  const draft = getComposerMarkdown('topic').trimEnd();
  setComposerMarkdown('topic', draft ? `${draft}\n\n${prompt}` : prompt);
  focusComposer('topic');
}

export function HomeQuickActions() {
  useLocaleRefresh();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [searchEnabled, setSearchEnabled] = useState(webSearchOn);
  const actionButtons = useRef<Record<string, HTMLButtonElement | null>>({});

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

  function dismiss(action: string, event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const nextDismissed = new Set(dismissed);
    nextDismissed.add(action);
    setDismissed(nextDismissed);
    requestAnimationFrame(() => {
      const next = QUICK_ACTIONS.find((item) => !nextDismissed.has(item.action));
      const nextButton = next ? actionButtons.current[next.action] : null;
      if (nextButton?.isConnected) nextButton.focus();
      else focusComposer('topic');
    });
  }

  return (
    <>
      {QUICK_ACTIONS.map(({ action, label, fallback, icon }) => (
        <div className="home-quick-action" key={action} hidden={dismissed.has(action)}>
          <Button
            ref={(element) => { actionButtons.current[action] = element; }}
            variant="surface"
            type="button"
            className="home-quick-action-primary"
            data-home-action={action}
            aria-pressed={action === 'research' ? searchEnabled : undefined}
            onClick={() => runAction(action)}
          >
            <span className="home-quick-action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{icon}</svg>
            </span>
            <span className="home-quick-action-copy"><span data-i18n-key={label}>{t(label, fallback)}</span></span>
          </Button>
          <Button variant="surface" type="button" className="home-quick-action-dismiss" data-home-dismiss onClick={(event) => dismiss(action, event)}
            data-i18n-aria="home.quick.dismiss" data-i18n-title="home.quick.dismiss"
            aria-label={t('home.quick.dismiss', 'Dismiss quick action')} title={t('home.quick.dismiss', 'Dismiss quick action')}>
            <DismissIcon />
          </Button>
        </div>
      ))}
    </>
  );
}

export function HomeTutorStarters() {
  useLocaleRefresh();
  return (
    <>
      <h2 id="homeTutorHeading" data-i18n-key="home.tutor.heading">{t('home.tutor.heading', 'Start with a good question')}</h2>
      <div className="home-tutor-grid">
        {TUTOR_PROMPTS.map(({ prompt, glyph }) => (
          <Button variant="surface" type="button" className="home-tutor-card" data-home-prompt={prompt} key={prompt} onClick={() => applyTutorPrompt(prompt)}>
            <span className="home-tutor-card-icon" aria-hidden="true">{glyph}</span>
            <strong data-i18n-key={`home.tutor.${prompt}.title`}>{t(`home.tutor.${prompt}.title`, '')}</strong>
            <span data-i18n-key={`home.tutor.${prompt}.hint`}>{t(`home.tutor.${prompt}.hint`, '')}</span>
          </Button>
        ))}
      </div>
    </>
  );
}
