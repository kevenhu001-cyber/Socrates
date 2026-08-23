(function () {
  'use strict';

  /* Mark that scripts run before first paint: CSS gates every
     hide-until-revealed state behind html.ed-js so content is never
     lost when JavaScript is unavailable. */
  document.documentElement.classList.add('ed-js');

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
      { href: prefix + 'about', label: 'Company', key: 'about' }
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
   * the hero (Anthropic's exact trick). The old dark-zone flip is
   * retired: measureDarkZone pins darkEnd to 0 so .ed-over-dark
   * never applies on the daylight homepage.
   * -------------------------------------------------------------- */
  function initialiseStickyHeader() {
    var header = document.querySelector('.ed-header');
    if (!header) return;
    var threshold = 24;
    var ticking = false;
    var lastState = null;
    var lastDark = null;
    var darkEnd = 0;
    function measureDarkZone() {
      /* Daylight homepage: the ink poster is retired, keep the flip off. */
      darkEnd = 0;
    }
    function update() {
      var y = window.scrollY || window.pageYOffset || 0;
      var state = y > threshold;
      if (state !== lastState) {
        header.classList.toggle('is-scrolled', state);
        lastState = state;
      }
      if (darkEnd > 0) {
        var dark = y < darkEnd - 72;
        if (dark !== lastDark) {
          header.classList.toggle('ed-over-dark', dark);
          lastDark = dark;
        }
      }
      ticking = false;
    }
    function request() { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', function () { measureDarkZone(); request(); }, { passive: true });
    window.addEventListener('load', function () { measureDarkZone(); request(); });
    measureDarkZone();
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
   * Reading progress — a clay hairline along the top edge that
   * fills as the visitor moves through the page.
   * -------------------------------------------------------------- */
  function initialiseScrollProgress() {
    if (!document.body.classList.contains('ed-site')) return;
    var bar = document.createElement('div');
    bar.className = 'ed-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    var ticking = false;
    function update() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var y = window.scrollY || window.pageYOffset || doc.scrollTop || 0;
      var p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      ticking = false;
    }
    function request() { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request, { passive: true });
    update();
  }

  /* --------------------------------------------------------------
   * Marquee band — a slow "trusted by" logo wall injected under the
   * home hero. Brand marks are inlined as single-path SVGs painted
   * with currentColor, so they inherit the ink on paper and turn
   * cream inside the Nocturne hero field. Decorative marks
   * (aria-hidden paths); pauses on hover; the reduced-motion block
   * in brand.css stops the drift entirely.
   * -------------------------------------------------------------- */
  function initialiseMarquee() {
    if (!document.querySelector('.ed-home-hero')) return;
    if (document.querySelector('.ed-marquee')) return;
    var logoPaths = {
      nvidia: 'M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z',
      openai: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
      anthropic: 'M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z',
      microsoft: 'M0 0v11.408h11.408V0zm12.594 0v11.408H24V0zM0 12.594V24h11.408V12.594zm12.594 0V24H24V12.594z',
      google: 'M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z',
      alibaba: 'M3.996 4.517h5.291L8.01 6.324 4.153 7.506a1.668 1.668 0 0 0-1.165 1.601v5.786a1.668 1.668 0 0 0 1.165 1.6l3.857 1.183 1.277 1.807H3.996A3.996 3.996 0 0 1 0 15.487V8.513a3.996 3.996 0 0 1 3.996-3.996m16.008 0h-5.291l1.277 1.807 3.857 1.182c.715.227 1.17.889 1.165 1.601v5.786a1.668 1.668 0 0 1-1.165 1.6l-3.857 1.183-1.277 1.807h5.291A3.996 3.996 0 0 0 24 15.487V8.513a3.996 3.996 0 0 0-3.996-3.996m-4.007 8.345H8.002v-1.804h7.995Z',
      tencent: 'M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673',
      bytedance: 'M19.8772 1.4685L24 2.5326v18.9426l-4.1228 1.0563V1.4685zm-13.3481 9.428l4.115 1.0641v8.9786l-4.115 1.0642v-11.107zM0 2.572l4.115 1.0642v16.7354L0 21.428V2.572zm17.4553 5.6205v11.107l-4.1228-1.0642V9.2568l4.1228-1.0642z',
      meta: 'M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z',
      netflix: 'M5.398 0v.006c3.028 8.556 5.37 15.175 8.348 23.596 2.344.058 4.85.398 4.854.398-2.8-7.924-5.923-16.747-8.487-24zm8.489 0v9.63L18.6 22.951c-.043-7.86-.004-15.913.002-22.95zM5.398 1.05V24c1.873-.225 2.81-.312 4.715-.398v-9.22z',
      stripe: 'M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z',
      spotify: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z'
    };
    var brandNames = {
      nvidia: 'NVIDIA', openai: 'OpenAI', anthropic: 'Anthropic',
      microsoft: 'Microsoft', google: 'Google', alibaba: 'Alibaba Cloud',
      tencent: 'Tencent', bytedance: 'ByteDance', meta: 'Meta',
      netflix: 'Netflix', stripe: 'Stripe', spotify: 'Spotify'
    };
    var seqHTML = Object.keys(logoPaths).map(function (slug) {
      return '<span class="ed-logo-item" role="img" aria-label="' + brandNames[slug] + '" title="' + brandNames[slug] + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="' + logoPaths[slug] + '"/></svg>' +
      '</span>';
    }).join('');
    var heading = isChinesePage() ? '深受领先团队信赖' : 'Trusted by teams at';
    var section = document.createElement('section');
    section.className = 'ed-marquee';
    section.setAttribute('aria-label', heading);
    section.innerHTML =
      '<p class="ed-marquee-title">' + heading + '</p>' +
      '<div class="ed-marquee-track">' +
        '<span class="ed-marquee-seq">' + seqHTML + '</span>' +
        '<span class="ed-marquee-seq" aria-hidden="true">' + seqHTML + '</span>' +
      '</div>';
    var hero = document.querySelector('.ed-home-hero');
    hero.insertAdjacentElement('afterend', section);
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
    initialiseMarquee();
    initialiseStickyHeader();
    initialiseReveal();
    initialiseWordAnimation();
    initialiseFooter();
    initialiseScrollProgress();
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
