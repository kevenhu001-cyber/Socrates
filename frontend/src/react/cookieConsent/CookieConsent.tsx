import { useLayoutEffect, useState } from 'react';
import { Button } from '../ui/shadcn/button';
import { i18n } from '../legacy/gateway.ts';
import {
  CONSENT_ACCEPT,
  CONSENT_ESSENTIAL,
  getConsentPreference,
  getCookieConsentAuthPlacement,
  getCookieConsentPrivacyUrl,
  setConsentPreference,
  syncCookieConsentPlacement,
} from '../../cookieConsent.js';

function t(key: string, fallback: string): string {
  return i18n(key, fallback);
}

export function CookieConsent() {
  const [hasChoice, setHasChoice] = useState(() => getConsentPreference() !== null);
  const privacyUrl = getCookieConsentPrivacyUrl();
  const authPlacement = getCookieConsentAuthPlacement();

  useLayoutEffect(() => {
    if (!hasChoice) syncCookieConsentPlacement(authPlacement);
  }, [authPlacement, hasChoice]);

  if (hasChoice) return null;

  const choose = (choice: string) => {
    setConsentPreference(choice);
    setHasChoice(true);
  };

  return (
    <div id="socratesCookieConsent" className={`socrates-cookie-consent${authPlacement ? ' socrates-cookie-consent--auth' : ''}`}
      role="region" aria-label={t('consent.title', 'We respect your privacy')} data-testid="cookie-consent-banner">
      <strong className="socrates-cookie-consent-title" data-i18n-key="consent.title">
        {t('consent.title', 'We respect your privacy')}
      </strong>
      <p className="socrates-cookie-consent-message" data-i18n-key="consent.message">
        {t('consent.message', 'We use strictly necessary cookies to make Socrates work. Non-essential cookies (for example analytics) are only placed after you choose to allow them.')}
      </p>
      <div className="socrates-cookie-consent-actions">
        <Button variant="secondary" type="button" className="socrates-cookie-consent-btn secondary"
          data-consent-choice={CONSENT_ESSENTIAL} onClick={() => choose(CONSENT_ESSENTIAL)}>
          <span data-i18n-key="consent.essential">{t('consent.essential', 'Essential only')}</span>
        </Button>
        <Button variant="default" type="button" className="socrates-cookie-consent-btn primary"
          data-consent-choice={CONSENT_ACCEPT} onClick={() => choose(CONSENT_ACCEPT)}>
          <span data-i18n-key="consent.accept">{t('consent.accept', 'Accept all')}</span>
        </Button>
      </div>
      <a className="socrates-cookie-consent-link" href={privacyUrl}
        target={/^https?:/i.test(privacyUrl) ? '_blank' : undefined}
        rel={/^https?:/i.test(privacyUrl) ? 'noopener noreferrer' : undefined}
        data-i18n-key="consent.learnMore">{t('consent.learnMore', 'Privacy policy')}</a>
    </div>
  );
}
