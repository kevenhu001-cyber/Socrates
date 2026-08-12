(function () {
  'use strict';

  function initialiseReferenceNavigation() {
    if (document.documentElement.lang && document.documentElement.lang.toLowerCase().indexOf('zh') === 0) return;
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

  function initialiseReveal() {
    var nodes = document.querySelectorAll('.ed-reveal');
    if (!nodes.length || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach(function (node) { node.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: .08, rootMargin: '0px 0px -28px' });
    nodes.forEach(function (node) { observer.observe(node); });
  }

  function initialiseBrandLogos() {
    // Resolve the logo once per page based on how deep the current page is
    // below the site root (root pages -> logo.png; zh/* and research/<slug>/
    // pages need ../ and ../../ respectively). This keeps a single feature
    // in one place instead of hand-editing every marketing/zh/research page.
    var segs = window.location.pathname.split('/').filter(function (s) { return s.length > 0; });
    var last = segs[segs.length - 1] || '';
    var depth = /\.html$/.test(last) ? segs.length - 1 : segs.length;
    var src = new Array(depth + 1).join('../') + 'logo.png';

    document.querySelectorAll('.ed-brand').forEach(function (brand) {
      if (brand.hasAttribute('data-ed-logo')) return;
      var img = document.createElement('img');
      img.className = 'ed-brand-mark';
      img.src = src + '?cb=20260814';
      img.alt = '';
      img.width = 24;
      img.height = 24;
      brand.prepend(img);
      brand.setAttribute('data-ed-logo', '1');
    });
  }

  function initialiseStageZoom() {
    // Homepage hero scroll effect. On desktop the dark stage illustration starts
    // under a near-black veil and zooms/lifts as the visitor scrolls. On small
    // screens the same scroll drives only a gentle zoom and NEVER darkens the
    // hero — the stage fills most of the first viewport, so a veil would read as
    // a broken black box instead of a reveal. Respects prefers-reduced-motion.
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
      var veilBase = mobile ? 0 : 0.7; // mobile: keep the hero legible
      // progress 0..1: stage fully below the fold -> comfortably scrolled past
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

  document.addEventListener('DOMContentLoaded', function () {
    initialiseBrandLogos();
    initialiseReferenceNavigation();
    initialiseMenus();
    initialiseFilters();
    initialiseSearch();
    initialiseStageZoom();
    initialiseReveal();
  });
}());
