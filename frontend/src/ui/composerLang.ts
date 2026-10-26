/* ui/composerLang.ts — compact language switcher inside the landing
 * composer (the "中 ˅" chip in the reference home).
 *
 * P_landing-reference. The chip is desktop-only (CSS hides it under 769px,
 * where the focused mobile composer shows the effort icon instead). The
 * trigger label comes from the i18n pipeline via data-i18n-key=
 * "composer.lang.current", so setLang() refreshes it together with the
 * rest of the chrome.
 *
 * Deliberately NOT wired through data-action: effortPicker.js shows that
 * self-contained document-level listeners keep the inline-handlers contract
 * (every data-action name must resolve on window) untouched, and this menu
 * has exactly two fixed items.
 */

function _closeAll(): void {
  document.querySelectorAll(".composer-lang[data-open='true']").forEach((chip) => {
    chip.setAttribute('data-open', 'false');
    const t = chip.querySelector('.composer-lang-trigger');
    if (t) t.setAttribute('aria-expanded', 'false');
  });
}

function _toggle(el: Element | null): void {
  const chip = el && el.closest ? el.closest('.composer-lang') : null;
  if (!chip) return;
  const open = chip.getAttribute('data-open') === 'true';
  _closeAll();
  if (!open) {
    chip.setAttribute('data-open', 'true');
    const t = chip.querySelector('.composer-lang-trigger');
    if (t) t.setAttribute('aria-expanded', 'true');
  }
}

function _pick(item: Element | null): void {
  const lang = item && item.getAttribute ? item.getAttribute('data-lang') : null;
  if (!lang) return;
  _closeAll();
  const w = window as unknown as { setLang?: (lang: string) => void };
  if (typeof w.setLang === 'function') w.setLang(lang);
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    if (!target || !target.closest) return;
    const trigger = target.closest('.composer-lang-trigger');
    if (trigger) { _toggle(trigger); return; }
    const item = target.closest('.composer-lang-item');
    if (item) { _pick(item); return; }
    /* Click inside the chip but not on a control — keep it open. */
    if (target.closest('.composer-lang')) return;
    _closeAll();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _closeAll();
  });
}
