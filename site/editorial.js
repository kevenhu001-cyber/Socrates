(function () {
  'use strict';

  function initialiseReferenceNavigation() {
    if (document.documentElement.lang && document.documentElement.lang.toLowerCase().indexOf('zh') === 0) return;
    var current = window.location.pathname.split('/').pop() || 'index.html';
    var items = [
      { href: 'research.html', label: 'Research' },
      { href: 'policy.html', label: 'Principles' },
      { href: 'learn.html', label: 'Learn' },
      { href: 'announcements.html', label: 'News' },
      { href: 'about.html', label: 'Company' }
    ];

    document.querySelectorAll('[data-ed-nav]').forEach(function (nav) {
      var panel = nav.querySelector('[data-menu-panel]');
      if (!panel) return;
      panel.replaceChildren();
      items.forEach(function (item) {
        var link = document.createElement('a');
        link.href = item.href;
        link.textContent = item.label;
        if (current === item.href) link.setAttribute('aria-current', 'page');
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
      var rows = document.querySelectorAll('[data-ed-item]');
      controls.forEach(function (control) {
        control.addEventListener('click', function () {
          var target = control.getAttribute('data-ed-filter');
          controls.forEach(function (item) { item.classList.toggle('is-active', item === control); item.setAttribute('aria-pressed', String(item === control)); });
          rows.forEach(function (row) { row.hidden = target !== 'all' && row.getAttribute('data-ed-item') !== target; });
        });
      });
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

  document.addEventListener('DOMContentLoaded', function () {
    initialiseReferenceNavigation();
    initialiseMenus();
    initialiseFilters();
    initialiseReveal();
  });
}());
