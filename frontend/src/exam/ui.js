export function examBody() {
  return document.getElementById('examViewBody');
}

export function examFooter() {
  return document.getElementById('examViewFooter');
}

export function examTitle() {
  return document.getElementById('examViewTitle');
}

export function examUiIsZh() {
  return window._currentLang === 'zh';
}

export function examUiL(en, zh) {
  return examUiIsZh() ? zh : en;
}

export function setExamTitle(title) {
  const viewTitle = examTitle();
  const barTitle = document.getElementById('examTitleBar');
  if (viewTitle) viewTitle.textContent = title;
  if (barTitle) barTitle.textContent = title;
}
