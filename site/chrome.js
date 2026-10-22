(function () {
  'use strict';

  var header = document.querySelector('.site-header');
  var footer = document.querySelector('.site-footer');
  if (!header || !footer) return;

  var toggle = header.querySelector('[data-site-menu-toggle]');
  var menu = header.querySelector('.site-mobile-menu');
  var mobile = window.matchMedia('(max-width: 1080px)');
  var scrim = document.createElement('div');
  scrim.className = 'site-menu-scrim';
  scrim.hidden = true;
  scrim.setAttribute('aria-hidden', 'true');
  document.body.appendChild(scrim);
  var background = [document.querySelector('main'), footer].filter(Boolean);
  var savedInert = [];

  function setMenu(open, restoreFocus) {
    if (open === (toggle.getAttribute('aria-expanded') === 'true')) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', toggle.getAttribute(open ? 'data-close-label' : 'data-open-label'));
    menu.hidden = !open;
    scrim.hidden = !open;
    document.documentElement.classList.toggle('site-menu-open', open);
    if (open) {
      savedInert = background.map(function (element) { return element.inert; });
      background.forEach(function (element) { element.inert = true; });
      menu.querySelector('a').focus({ preventScroll: true });
    } else {
      background.forEach(function (element, index) { element.inert = savedInert[index]; });
      if (restoreFocus) toggle.focus({ preventScroll: true });
    }
  }

  toggle.addEventListener('click', function () {
    setMenu(toggle.getAttribute('aria-expanded') !== 'true', true);
  });
  scrim.addEventListener('click', function () { setMenu(false, true); });
  menu.addEventListener('click', function (event) {
    if (event.target.closest('a')) setMenu(false, true);
  });
  document.addEventListener('keydown', function (event) {
    if (toggle.getAttribute('aria-expanded') !== 'true') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setMenu(false, true);
    } else if (event.key === 'Tab') {
      var links = Array.from(header.querySelectorAll('a[href], button')).filter(function (element) {
        return element.getClientRects().length > 0;
      });
      var first = links[0];
      var last = links[links.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  mobile.addEventListener('change', function () {
    if (mobile.matches) return;
    var focused = menu.contains(document.activeElement) || document.activeElement === toggle;
    var href = document.activeElement.getAttribute('href');
    setMenu(false, false);
    if (focused) {
      var destination = Array.from(header.querySelectorAll('.site-nav a')).find(function (link) {
        return link.getAttribute('href') === href;
      });
      (destination || header.querySelector('.site-brand')).focus({ preventScroll: true });
    }
  });
  header.setAttribute('data-chrome-ready', '');

  var groups = footer.querySelectorAll('details.site-footer-col');
  var compact = window.matchMedia('(max-width: 760px)');
  var footerFocus = null;
  // A breakpoint can hide a summary before the media-query callback runs.
  // Remember focus so the browser's automatic blur cannot strand it on body.
  document.addEventListener('focusin', function (event) {
    footerFocus = footer.contains(event.target) ? event.target : null;
  });
  document.addEventListener('pointerdown', function (event) {
    if (!footer.contains(event.target)) footerFocus = null;
  });
  function syncFooter() {
    groups.forEach(function (group) {
      var summary = group.querySelector('summary');
      var active = document.activeElement === document.body && footerFocus ? footerFocus : document.activeElement;
      var focused = group.contains(active);
      group.open = !compact.matches;
      // Never leave focus inside a hidden panel or a desktop-hidden summary.
      if (focused && compact.matches && active !== summary) {
        summary.focus({ preventScroll: true });
      } else if (focused && !compact.matches && active === summary) {
        group.querySelector('a').focus({ preventScroll: true });
      }
    });
  }
  footer.setAttribute('data-chrome-ready', '');
  syncFooter();
  compact.addEventListener('change', syncFooter);
})();
