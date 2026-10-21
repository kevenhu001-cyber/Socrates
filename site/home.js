(function () {
  'use strict';

  var reduceMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var header = document.querySelector('[data-site-header]');
  var toggle = document.querySelector('[data-menu-toggle]');
  var panel = document.getElementById('site-menu');

  function isChinese() {
    return document.documentElement.lang.toLowerCase().indexOf('zh') === 0;
  }

  if (header) {
    var scrollTicking = false;

    function syncScrolled() {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
      scrollTicking = false;
    }

    window.addEventListener('scroll', function () {
      if (scrollTicking) return;
      scrollTicking = true;
      window.requestAnimationFrame(syncScrolled);
    }, { passive: true });

    syncScrolled();
  }

  function setMenu(open, restoreFocus) {
    if (!header || !toggle) return;

    header.classList.toggle('is-menu-open', open);
    document.body.classList.toggle('is-menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open
      ? (isChinese() ? '关闭菜单' : 'Close menu')
      : (isChinese() ? '打开菜单' : 'Open menu'));

    if (!open && restoreFocus) toggle.focus();
  }

  if (header && toggle && panel) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true', false);
    });

    Array.prototype.forEach.call(panel.querySelectorAll('a'), function (link) {
      link.addEventListener('click', function () { setMenu(false, false); });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && header.classList.contains('is-menu-open')) {
        setMenu(false, true);
      }
    });

    if (window.matchMedia) {
      var desktop = window.matchMedia('(min-width: 1024px)');
      var onDesktop = function (event) {
        if (event.matches) setMenu(false, false);
      };
      if (desktop.addEventListener) desktop.addEventListener('change', onDesktop);
      else if (desktop.addListener) desktop.addListener(onDesktop);
    }
  }

  function initReveal() {
    var revealItems = document.querySelectorAll('[data-reveal]');
    if (!revealItems.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(revealItems, function (item) {
        item.classList.add('is-revealed');
      });
      return;
    }

    document.documentElement.classList.add('reveal-ready');

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, {
      rootMargin: '0px 0px -6% 0px',
      threshold: 0.1
    });

    Array.prototype.forEach.call(revealItems, function (item) {
      observer.observe(item);
    });
  }

  initReveal();
}());
