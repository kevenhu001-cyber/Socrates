import { getCurrentLanguage } from '../i18n/languageState.ts';

export function examUiIsZh() {
  return getCurrentLanguage() === 'zh';
}

export function examUiL(en: string, zh: string) {
  return examUiIsZh() ? zh : en;
}
