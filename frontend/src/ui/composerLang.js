/* ui/composerLang.js — compact language switcher inside the landing
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

function _closeAll() {
  document.querySelectorAll(".composer-lang[data-open='true']").forEach(function (chip) {
    chip.setAttribute("data-open", "false");
    var t = chip.querySelector(".composer-lang-trigger");
    if (t) t.setAttribute("aria-expanded", "false");
  });
}

function _toggle(el) {
  var chip = el && el.closest ? el.closest(".composer-lang") : null;
  if (!chip) return;
  var open = chip.getAttribute("data-open") === "true";
  _closeAll();
  if (!open) {
    chip.setAttribute("data-open", "true");
    var t = chip.querySelector(".composer-lang-trigger");
    if (t) t.setAttribute("aria-expanded", "true");
  }
}

function _pick(item) {
  var lang = item && item.getAttribute("data-lang");
  if (!lang) return;
  _closeAll();
  if (typeof window.setLang === "function") window.setLang(lang);
}

if (typeof document !== "undefined") {
  document.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;
    var trigger = e.target.closest(".composer-lang-trigger");
    if (trigger) { _toggle(trigger); return; }
    var item = e.target.closest(".composer-lang-item");
    if (item) { _pick(item); return; }
    /* Click inside the chip but not on a control — keep it open. */
    if (e.target.closest(".composer-lang")) return;
    _closeAll();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") _closeAll();
  });
}
