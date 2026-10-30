export type AppLanguage = 'zh' | 'en';

let currentLanguage: AppLanguage = 'zh';

export function getCurrentLanguage(): AppLanguage {
  return currentLanguage;
}

export function setCurrentLanguage(language: AppLanguage): void {
  currentLanguage = language;
}
