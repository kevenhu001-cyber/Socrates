(function () {
  'use strict';

  /* --------------------------------------------------------------
   * Path helpers
   * -------------------------------------------------------------- */
  function depthFromPath() {
    var segs = window.location.pathname.split('/').filter(function (s) { return s.length > 0; });
    var last = segs[segs.length - 1] || '';
    return /\.html$/.test(last) ? segs.length - 1 : segs.length;
  }
  function rootPrefix() {
    return new Array(depthFromPath() + 1).join('../');
  }
  function isChinesePage() {
    return document.documentElement.lang && document.documentElement.lang.toLowerCase().indexOf('zh') === 0;
  }

  /* --------------------------------------------------------------
   * Reference navigation (auto-renders the nav items the legacy
   * hand-written pages share). Stays unchanged for compatibility.
   * -------------------------------------------------------------- */
  function initialiseReferenceNavigation() {
    if (isChinesePage()) return;
    var pathname = window.location.pathname;
    var isResearchArticle = pathname.indexOf('/research/') !== -1;
    var prefix = isResearchArticle ? '../../' : '';
    var current = pathname.split('/').filter(Boolean).pop() || 'index';
    var items = [
      { href: prefix + 'research', label: 'Research', key: 'research' },
      { href: prefix + 'policy', label: 'Principles', key: 'policy' },
      { href: prefix + 'learn', label: 'Learn', key: 'learn' },
      { href: prefix + 'announcements', label: 'News', key: 'announcements' },
      { href: prefix + 'about', label: 'Company', key: 'about' },
      { href: prefix + 'zh/index', label: '中文', key: 'zh/index' }
    ];

    document.querySelectorAll('[data-ed-nav]').forEach(function (nav) {
      var panel = nav.querySelector('[data-menu-panel]');
      if (!panel) return;
      panel.replaceChildren();
      items.forEach(function (item) {
        var link = document.createElement('a');
        link.href = item.href;
        link.textContent = item.label;
        if (current === item.key) link.setAttribute('aria-current', 'page');
        panel.appendChild(link);
      });
    });
  }

  /* --------------------------------------------------------------
   * Mobile menu (clip-path reveal + staggered link fade-in via CSS)
   * -------------------------------------------------------------- */
  function initialiseMenus() {
    document.querySelectorAll('[data-ed-nav]').forEach(function (nav) {
      var button = nav.querySelector('[data-menu-button]');
      var panel = nav.querySelector('[data-menu-panel]');
      if (!button || !panel) return;
      function closeMenu(restoreFocus) {
        nav.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('ed-menu-open');
        if (restoreFocus) button.focus();
      }
      button.addEventListener('click', function () {
        var willOpen = !nav.classList.contains('is-open');
        nav.classList.toggle('is-open', willOpen);
        button.setAttribute('aria-expanded', String(willOpen));
        document.body.classList.toggle('ed-menu-open', willOpen);
      });
      panel.querySelectorAll('a').forEach(function (link) { link.addEventListener('click', function () { closeMenu(false); }); });
      document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeMenu(true); });
      document.addEventListener('click', function (event) { if (!nav.contains(event.target)) closeMenu(false); });
    });
  }

  /* --------------------------------------------------------------
   * Publication / news filters + search
   * -------------------------------------------------------------- */
  function initialiseFilters() {
    document.querySelectorAll('[data-ed-filters]').forEach(function (group) {
      var controls = group.querySelectorAll('[data-ed-filter]');
      var scope = group.closest('section') || document;
      group._activeFilter = 'all';
      controls.forEach(function (control) {
        control.addEventListener('click', function () {
          var target = control.getAttribute('data-ed-filter');
          group._activeFilter = target;
          controls.forEach(function (item) { item.classList.toggle('is-active', item === control); item.setAttribute('aria-pressed', String(item === control)); });
          updatePublicationVisibility(scope, group);
        });
      });
    });
  }

  function updatePublicationVisibility(scope, group) {
    var target = group && group._activeFilter ? group._activeFilter : 'all';
    var input = scope.querySelector('[data-ed-search]');
    var term = input ? input.value.trim().toLowerCase() : '';
    var rows = scope.querySelectorAll('[data-ed-publication], [data-ed-item]');
    var visibleCount = 0;
    rows.forEach(function (row) {
      var categoryMatch = target === 'all' || row.getAttribute('data-ed-item') === target;
      var textMatch = !term || row.textContent.toLowerCase().indexOf(term) !== -1;
      var isVisible = categoryMatch && textMatch;
      row.hidden = !isVisible;
      if (isVisible) visibleCount += 1;
    });
    var empty = scope.querySelector('[data-ed-empty]');
    if (empty) empty.hidden = visibleCount !== 0;
  }

  function initialiseSearch() {
    document.querySelectorAll('[data-ed-search]').forEach(function (input) {
      var scope = input.closest('section') || document;
      var group = scope.querySelector('[data-ed-filters]');
      input.addEventListener('input', function () { updatePublicationVisibility(scope, group); });
    });
  }

  /* --------------------------------------------------------------
   * Reveal animations
   *   .ed-reveal          single element fade-up
   *   .ed-reveal-stagger  waves its direct children on the same view
   * -------------------------------------------------------------- */
  function initialiseReveal() {
    var nodes = document.querySelectorAll('.ed-reveal, .ed-reveal-stagger');
    if (!nodes.length) return;
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach(function (node) { node.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: .08, rootMargin: '0px 0px -40px' });
    nodes.forEach(function (node) { observer.observe(node); });
  }

  /* --------------------------------------------------------------
   * Hero word-by-word animation
   *   Splits text nodes on whitespace and wraps each word in a span.
   *   Inline child elements (e.g. <em>, <a>) are preserved as
   *   separate sub-trees so a sentence with formatting stays
   *   readable and screen-reader friendly. Activation is opt-in
   *   via the data-animate-text attribute on any heading.
   * -------------------------------------------------------------- */
  function wrapWordsInNode(node, depth) {
    depth = depth || 0;
    if (node.nodeType === Node.TEXT_NODE) {
      var text = node.textContent;
      if (!text) return null;
      // Only treat the literal text as wrappable; if we're inside an
      // anchor, leave the text alone so screen readers still announce
      // the link as a unit.
      var parent = node.parentNode;
      if (parent && (parent.tagName === 'A' || parent.classList && parent.classList.contains('ed-word'))) {
        return null;
      }
      var frag = document.createDocumentFragment();
      var regex = /(\s+)|(\S+)/g;
      var match;
      var wordIndex = 0;
      while ((match = regex.exec(text)) !== null) {
        if (match[1]) {
          var space = document.createElement('span');
          space.className = 'ed-word-space';
          space.textContent = match[1];
          frag.appendChild(space);
        } else {
          var word = document.createElement('span');
          word.className = 'ed-word';
          word.textContent = match[2];
          // Short stagger so a long sentence still finishes fast.
          wordIndex += 1;
          word.style.transitionDelay = (Math.min(wordIndex * 28, 360)) + 'ms';
          frag.appendChild(word);
        }
      }
      return frag;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      // Skip script/style; clone the element and re-wrap its children.
      if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return null;
      var clone = node.cloneNode(false);
      var child = node.firstChild;
      while (child) {
        var replaced = wrapWordsInNode(child, depth + 1);
        if (replaced) clone.appendChild(replaced);
        else clone.appendChild(child.cloneNode(true));
        child = child.nextSibling;
      }
      return clone;
    }
    return null;
  }

  function initialiseWordAnimation() {
    var nodes = document.querySelectorAll('[data-animate-text]');
    if (!nodes.length) return;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var mobile = window.innerWidth < 820;
    if (!('IntersectionObserver' in window) || reduceMotion || mobile) {
      nodes.forEach(function (node) { node.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: .25, rootMargin: '0px 0px -10%' });
    nodes.forEach(function (node) {
      // Walk once and wrap. Use a fragment, then replace children.
      var frag = document.createDocumentFragment();
      var child = node.firstChild;
      while (child) {
        var replaced = wrapWordsInNode(child);
        if (replaced) frag.appendChild(replaced);
        else frag.appendChild(child.cloneNode(true));
        child = child.nextSibling;
      }
      node.textContent = '';
      node.appendChild(frag);
      observer.observe(node);
    });
  }

  /* --------------------------------------------------------------
   * Sticky header — toggles .is-scrolled after a small threshold so
   * the nav becomes a denser, blurred bar as the user moves past
   * the hero (Anthropic's exact trick).
   * -------------------------------------------------------------- */
  function initialiseStickyHeader() {
    var header = document.querySelector('.ed-header');
    if (!header) return;
    var threshold = 24;
    var ticking = false;
    var lastState = null;
    function update() {
      var y = window.scrollY || window.pageYOffset || 0;
      var state = y > threshold;
      if (state !== lastState) {
        header.classList.toggle('is-scrolled', state);
        lastState = state;
      }
      ticking = false;
    }
    function request() { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }
    window.addEventListener('scroll', request, { passive: true });
    update();
  }

  /* --------------------------------------------------------------
   * Footer enrichment
   *   Injects a social icon row and a language pill inside the
   *   brand column, so the footer's primary CTA surface is the
   *   same on every page without hand-editing HTML.
   * -------------------------------------------------------------- */
  function socialIcon(name) {
    var svg = '';
    var common = 'fill="currentColor"';
    if (name === 'github') {
      svg = '<path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.16-.02-2.11-3.2.7-3.88-1.36-3.88-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18.91-.25 1.89-.38 2.86-.38.97 0 1.95.13 2.86.38 2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.73.8 1.18 1.83 1.18 3.09 0 4.42-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" ' + common + '></path>';
    } else if (name === 'x') {
      svg = '<path d="M18.244 2H21l-6.52 7.46L22 22h-6.07l-4.76-6.22L5.7 22H3l6.97-7.97L2.4 2h6.22l4.3 5.69L18.244 2zm-1.06 18h1.69L7.86 4H6.06l11.124 16z" ' + common + '></path>';
    } else if (name === 'youtube') {
      svg = '<path d="M23.5 6.2a3 3 0 0 0-2.1-2.12C19.46 3.5 12 3.5 12 3.5s-7.46 0-9.4.58A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.12C4.54 20.5 12 20.5 12 20.5s7.46 0 9.4-.58a3 3 0 0 0 2.1-2.12A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z" ' + common + '></path>';
    } else if (name === 'linkedin') {
      svg = '<path d="M20.45 20.45h-3.55V14.9c0-1.32-.03-3.02-1.84-3.02-1.85 0-2.13 1.44-2.13 2.93v5.64H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.84 3.37-1.84 3.6 0 4.27 2.37 4.27 5.45v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zm-1.78 13.02h3.55V9H3.56v11.45z" ' + common + '></path>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + svg + '</svg>';
  }

  function initialiseFooter() {
    var brand = document.querySelector('.ed-footer-brand');
    if (!brand) return;
    var prefix = rootPrefix();

    // Social row.
    if (!brand.querySelector('.ed-footer-social')) {
      var social = document.createElement('div');
      social.className = 'ed-footer-social';
      social.innerHTML =
        '<a href="https://github.com/" target="_blank" rel="noopener" aria-label="GitHub">' + socialIcon('github') + '</a>' +
        '<a href="https://x.com/" target="_blank" rel="noopener" aria-label="X">' + socialIcon('x') + '</a>' +
        '<a href="https://www.youtube.com/" target="_blank" rel="noopener" aria-label="YouTube">' + socialIcon('youtube') + '</a>' +
        '<a href="https://www.linkedin.com/" target="_blank" rel="noopener" aria-label="LinkedIn">' + socialIcon('linkedin') + '</a>';
      brand.appendChild(social);
    }

    // Language pill — already linked in the brand column via "中文" /
    // "English"; we just give it a visible capsule.
    var langExisting = brand.querySelector('a[href*="/zh/index"], a[href*="../zh/index"], a[href*="zh/index"]');
    if (langExisting && !langExisting.classList.contains('ed-footer-lang')) {
      langExisting.classList.add('ed-footer-lang');
    }
  }

  /* --------------------------------------------------------------
   * Home stage scroll effect (unchanged behavior, slightly smoother)
   * -------------------------------------------------------------- */
  function initialiseStageZoom() {
    var stage = document.querySelector('.ed-home-stage');
    if (!stage) return;
    var img = stage.querySelector('img');
    var veil = document.createElement('div');
    veil.className = 'ed-stage-veil';
    stage.appendChild(veil);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      veil.style.opacity = '0';
      return;
    }
    var ticking = false;
    function update() {
      var rect = stage.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var mobile = window.innerWidth < 820;
      var maxScale = mobile ? 1.05 : 1.15;
      var veilBase = mobile ? 0 : 0.7;
      var total = rect.height + vh;
      var p = Math.max(0, Math.min(1, (vh - rect.top) / total));
      var scale = 1 + (maxScale - 1) * p;
      if (img) img.style.transform = 'scale(' + scale.toFixed(4) + ')';
      veil.style.opacity = String((veilBase * (1 - p)).toFixed(3));
      ticking = false;
    }
    function request() {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request, { passive: true });
    request();
  }

  /* --------------------------------------------------------------
   * Boot
   * -------------------------------------------------------------- */
  function boot() {
    initialiseReferenceNavigation();
    initialiseMenus();
    initialiseFilters();
    initialiseSearch();
    initialiseStageZoom();
    initialiseStickyHeader();
    initialiseReveal();
    initialiseWordAnimation();
    initialiseFooter();
    if (window.SocratesLocale && typeof window.SocratesLocale.localizeLinks === 'function') {
      window.SocratesLocale.localizeLinks();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
