/**
 * i18n/localeRevision.ts — the locale as an external store.
 *
 * `setLang()` used to announce a language change with a DOM CustomEvent, and
 * every surface that needed to re-localize had to remember to listen for it.
 * The transcript surfaces never did, so tool labels, thinking captions and
 * visualization chrome kept the previous language until something else
 * re-rendered the row. This module is the source of truth those surfaces read
 * through `useLocale()` / `useLocaleRefresh()`; the event stays for the legacy
 * listeners that are not React components.
 */
import { getCurrentLanguage, type AppLanguage } from './languageState.ts';

let revision = 0;
const listeners = new Set<() => void>();
let snapshot: LocaleSnapshot = { lang: 'zh', revision: 0 };

/** Bump the revision after the language has been applied to the DOM. */
export function bumpLocaleRevision(): void {
  revision += 1;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* empty-catch: intentional — a detached subscriber must not break the toggle. */
    }
  });
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLocaleRevision(): number {
  return revision;
}

export interface LocaleSnapshot {
  lang: AppLanguage;
  revision: number;
}

/** Stable snapshot object: a new identity only when the language changes. */
export function getLocaleSnapshot(): LocaleSnapshot {
  return snapshot;
}

snapshot = { lang: getCurrentLanguage(), revision };

/** Called by `setLang()` after the DOM pass so subscribers see the new value. */
export function publishLocale(lang: AppLanguage): void {
  snapshot = { lang, revision };
  bumpLocaleRevision();
}

export function __resetLocaleForTests(): void {
  revision = 0;
  snapshot = { lang: getCurrentLanguage(), revision };
}
