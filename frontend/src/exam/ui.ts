import { getCurrentLanguage } from '../i18n/languageState.ts';

export function examBody() {
  return document.getElementById('examViewLegacyBody') || document.getElementById('examViewBody');
}

export function examFooter() {
  return document.getElementById('examViewLegacyFooter') || document.getElementById('examViewFooter');
}

export function examTitle() {
  return document.getElementById('examViewTitle');
}

export function examUiIsZh() {
  return getCurrentLanguage() === 'zh';
}

export function examUiL(en: string, zh: string) {
  return examUiIsZh() ? zh : en;
}

export function setExamTitle(title: string) {
  const viewTitle = examTitle();
  const barTitle = document.getElementById('examTitleBar');
  if (viewTitle) viewTitle.textContent = title;
  if (barTitle) barTitle.textContent = title;
}
