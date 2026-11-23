import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../ui/shadcn/button';
import { i18n } from '../../ui/legacyI18n.ts';
import { getCurrentLanguage } from '../../i18n/languageState.ts';
import {
  CONSENT_ACCEPT,
  CONSENT_ESSENTIAL,
  getConsentPreference,
  getCookieConsentPrivacyUrl,
  setConsentPreference,
} from '../../cookieConsent.ts';

const ZH_FALLBACKS: Record<string, string> = {
  'consent.title': '我们尊重你的隐私',
  'consent.message':
    '我们使用严格必需的 Cookie 来让 Socrates 正常运行。只有在你允许后，我们才会放置非必要 Cookie（例如分析 Cookie）。',
  'consent.essential': '仅必要 Cookie',
  'consent.accept': '全部接受',
  'consent.learnMore': '隐私政策',
};

function t(key: string, enFallback: string): string {
  const isZh = getCurrentLanguage() === 'zh';
  const effectiveFallback = isZh && ZH_FALLBACKS[key] ? ZH_FALLBACKS[key] : enFallback;
  const res = i18n(key, effectiveFallback);
  return res !== key ? res : effectiveFallback;
}

export function CookieConsent() {
  const [hasChoice, setHasChoice] = useState(() => getConsentPreference() !== null);
  const [, setLangTick] = useState(0);
  const privacyUrl = getCookieConsentPrivacyUrl();
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleLangChange = () => setLangTick((n) => n + 1);
    window.addEventListener('socrates:languagechange', handleLangChange);
    return () => window.removeEventListener('socrates:languagechange', handleLangChange);
  }, []);

  useLayoutEffect(() => {
    bannerRef.current?.showPopover?.();
  }, [hasChoice]);

  if (hasChoice) return null;

  const choose = (choice: string) => {
    setConsentPreference(choice);
    setHasChoice(true);
  };

  return (
    <div
      ref={bannerRef}
      id="socratesCookieConsent"
      className="socrates-cookie-consent"
      popover="manual"
      role="region"
      aria-label={t('consent.title', 'We respect your privacy')}
      data-testid="cookie-consent-banner"
    >
      <strong className="socrates-cookie-consent-title" data-i18n-key="consent.title">
        {t('consent.title', 'We respect your privacy')}
      </strong>
      <p className="socrates-cookie-consent-message" data-i18n-key="consent.message">
        {t(
          'consent.message',
          'We use strictly necessary cookies to make Socrates work. Non-essential cookies (for example analytics) are only placed after you choose to allow them.',
        )}
      </p>
      <div className="socrates-cookie-consent-actions">
        <Button
          variant="secondary"
          type="button"
          className="socrates-cookie-consent-btn secondary"
          data-consent-choice={CONSENT_ESSENTIAL}
          onClick={() => choose(CONSENT_ESSENTIAL)}
        >
          <span data-i18n-key="consent.essential">{t('consent.essential', 'Essential only')}</span>
        </Button>
        <Button
          variant="default"
          type="button"
          className="socrates-cookie-consent-btn primary"
          data-consent-choice={CONSENT_ACCEPT}
          onClick={() => choose(CONSENT_ACCEPT)}
        >
          <span data-i18n-key="consent.accept">{t('consent.accept', 'Accept all')}</span>
        </Button>
      </div>
      <a
        className="socrates-cookie-consent-link"
        href={privacyUrl}
        target={/^https?:/i.test(privacyUrl) ? '_blank' : undefined}
        rel={/^https?:/i.test(privacyUrl) ? 'noopener noreferrer' : undefined}
        data-i18n-key="consent.learnMore"
      >
        {t('consent.learnMore', 'Privacy policy')}
      </a>
    </div>
  );
}
