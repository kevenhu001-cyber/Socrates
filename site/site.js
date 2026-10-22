(function () {
  'use strict';

  var doc = document;
  doc.documentElement.classList.add('js');

  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var menuBtn = doc.querySelector('[data-menu-btn]');
  var mobileMenu = doc.querySelector('[data-mobile-menu]');

  if (menuBtn && mobileMenu) {
    // Scrim behind the open panel: tapping outside closes the menu, which
    // is what a phone user expects and what a mouse user expects too.
    var scrim = doc.createElement('div');
    scrim.className = 'home-menu-scrim';
    scrim.hidden = true;
    doc.body.appendChild(scrim);

    var lastFocused = null;

    var setMenu = function (open) {
      if (open === (menuBtn.getAttribute('aria-expanded') === 'true')) return;

      if (open) lastFocused = doc.activeElement;

      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      mobileMenu.classList.toggle('is-open', open);
      doc.body.classList.toggle('is-locked', open);
      scrim.classList.toggle('is-on', open);

      if (open) {
        scrim.hidden = false;
        // Let the scrim paint before it fades in.
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            scrim.classList.add('is-on');
          });
        });
        // Move focus into the panel so keyboard users are not stranded
        // behind the overlay.
        var first = mobileMenu.querySelector('a');
        if (first) first.focus({ preventScroll: true });
      } else {
        scrim.classList.remove('is-on');
        window.setTimeout(function () {
          if (menuBtn.getAttribute('aria-expanded') !== 'true') scrim.hidden = true;
        }, reduceMotion ? 0 : 280);
        if (lastFocused && typeof lastFocused.focus === 'function') {
          lastFocused.focus({ preventScroll: true });
        }
        lastFocused = null;
      }
    };

    menuBtn.addEventListener('click', function () {
      setMenu(menuBtn.getAttribute('aria-expanded') !== 'true');
    });

    mobileMenu.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });

    scrim.addEventListener('click', function () {
      setMenu(false);
    });

    doc.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setMenu(false);
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 960) setMenu(false);
    });
  }

  var footerGroups = doc.querySelectorAll('details.home-footer-col');
  if (footerGroups.length && window.matchMedia) {
    var compactFooter = window.matchMedia('(max-width: 760px)');
    var syncFooter = function () {
      footerGroups.forEach(function (group) {
        // Do not strand keyboard focus inside a panel when a resize hides it.
        if (compactFooter.matches && group.contains(doc.activeElement)) {
          var summary = group.querySelector('summary');
          if (summary && summary !== doc.activeElement) summary.focus({ preventScroll: true });
        }
        group.open = !compactFooter.matches;
      });
    };

    syncFooter();
    compactFooter.addEventListener('change', syncFooter);
  }

  var items = doc.querySelectorAll('[data-reveal]');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach(function (item) {
      item.classList.add('is-in');
    });
    return;
  }

  var pending = [];
  items.forEach(function (item) {
    pending.push(item);
  });

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: '200px 0px 200px 0px', threshold: 0.01 }
  );

  items.forEach(function (item) {
    observer.observe(item);
  });

  // Safety net. The observer samples positions per frame, so a fast flick or
  // an anchor jump can skip a section entirely — and a section that never
  // receives "is-in" would stay invisible forever. The sweep therefore tests
  // how far the element has travelled, not whether it is on screen right
  // now: anything whose top edge has passed the viewport (from below or
  // from above) has been reached and must be shown.
  var sweeping = false;

  var sweep = function () {
    var viewport = (window.innerHeight || doc.documentElement.clientHeight) + 100;
    pending = pending.filter(function (item) {
      if (item.classList.contains('is-in')) return false;
      if (item.getBoundingClientRect().top <= viewport) {
        item.classList.add('is-in');
        observer.unobserve(item);
        return false;
      }
      return true;
    });
    sweeping = false;
  };

  var scheduleSweep = function () {
    if (sweeping) return;
    sweeping = true;
    window.requestAnimationFrame(sweep);
  };

  window.addEventListener('scroll', scheduleSweep, { passive: true });
  window.addEventListener('resize', scheduleSweep, { passive: true });
  window.addEventListener('hashchange', scheduleSweep);
  window.addEventListener('load', scheduleSweep);

  scheduleSweep();
})();
