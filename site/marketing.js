(function () {
  'use strict';

  /* The legacy marketing shell imports the shared brand layer early so the
   * variables exist. Load it once more after the legacy rules so the shared
   * typography and warm-paper component styles win the cascade. */
  if (!document.querySelector('link[href$="/brand.css"], link[href="brand.css"], link[href="../brand.css"]')) {
    var brandLink = document.createElement('link');
    brandLink.rel = 'stylesheet';
    brandLink.href = '/brand.css';
    document.head.appendChild(brandLink);
  }

  var isChinese = document.documentElement.lang.toLowerCase().indexOf('zh') === 0;
  var focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function localizedRoot() {
    return isChinese ? '/zh/' : '/';
  }

  function pageName() {
    var pathname = window.location.pathname.replace(/\/$/, '').replace(/\.html$/, '');
    if (pathname === '/zh') return 'index';
    var name = pathname.split('/').pop();
    return name || 'index';
  }

  function localHref(page, hash) {
    return localizedRoot() + page + (hash || '');
  }

  function navigationItems(homepage) {
    if (homepage) {
      var homeLabels = isChinese ? {
        product: '\u4ea7\u54c1', method: '\u65b9\u6cd5', research: '\u7814\u7a76', company: '\u516c\u53f8', pricing: '\u5957\u9910'
      } : {
        product: 'Product', method: 'Method', research: 'Research', company: 'Company', pricing: 'Pricing'
      };
      return [
        { key: 'product', label: homeLabels.product, href: '#product' },
        { key: 'method', label: homeLabels.method, href: '#method' },
        { key: 'research', label: homeLabels.research, href: localHref('guide') },
        { key: 'company', label: homeLabels.company, href: localHref('about') },
        { key: 'pricing', label: homeLabels.pricing, href: localHref('pricing') }
      ];
    }
    var labels = isChinese ? {
      product: '产品', research: '研究', developer: '开发者', company: '公司', pricing: '套餐', updates: '更新'
    } : {
      product: 'Product', research: 'Research', developer: 'Developers', company: 'Company', pricing: 'Pricing', updates: 'Updates'
    };
    return [
      { key: 'product', label: labels.product, href: homepage ? '#product' : localHref('product') },
      { key: 'research', label: labels.research, href: homepage ? '#method' : localHref('guide') },
      { key: 'developer', label: labels.developer, href: homepage ? '#developers' : localHref('product', '#developers') },
      { key: 'company', label: labels.company, href: localHref('about') },
      { key: 'pricing', label: labels.pricing, href: localHref('pricing') },
      { key: 'updates', label: labels.updates, href: homepage ? '#updates' : localHref('guide') }
    ];
  }

  function currentKey() {
    var name = pageName();
    if (name === 'product') return 'product';
    if (name === 'guide') return 'research';
    if (name === 'about' || name === 'contact') return 'company';
    if (name === 'pricing') return 'pricing';
    return '';
  }

  function setLocaleLink(link) {
    if (!link) return;
    var targetLocale = isChinese ? 'en' : 'zh';
    var localeApi = window.SocratesLocale;
    link.href = localeApi ? localeApi.hrefFor(localeApi.currentHref(), targetLocale) : (isChinese ? '/' : '/zh/');
    link.textContent = targetLocale === 'zh' ? '中文' : 'English';
    link.setAttribute('lang', targetLocale === 'zh' ? 'zh-CN' : 'en');
    link.setAttribute('data-socrates-locale', targetLocale);
    if (link.getAttribute('data-locale-bound') !== 'true') {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        if (localeApi) localeApi.setLocale(targetLocale);
        else {
          try { localStorage.setItem('socrates-lang', targetLocale); } catch (error) {}
          window.location.href = link.href;
        }
      });
      link.setAttribute('data-locale-bound', 'true');
    }
  }

  function normalizeMarketingNavigation() {
    var homepage = pageName() === 'index';
    document.querySelectorAll('.mk-nav[data-site-nav]').forEach(function (nav) {
      var panel = nav.querySelector('[data-menu-panel]');
      if (!panel) return;
      panel.innerHTML = '';
      navigationItems(homepage).forEach(function (item) {
        var link = document.createElement('a');
        link.href = item.href;
        link.textContent = item.label;
        if (item.key === currentKey()) link.setAttribute('aria-current', 'page');
        panel.appendChild(link);
      });
      var actions = nav.querySelector('.mk-nav-actions');
      var locale = actions && actions.querySelector('.mk-nav-locale');
      if (!locale && actions) {
        locale = actions.querySelector('a:last-child');
        if (locale) locale.classList.add('mk-nav-locale');
      }
      setLocaleLink(locale);
    });
  }

  function normalizeHomepageNavigation() {
    if (pageName() !== 'index') return;
    var panel = document.querySelector('.xa-nav[data-menu-panel]');
    if (!panel) return;
    panel.innerHTML = '';
    navigationItems(true).forEach(function (item) {
      var link = document.createElement('a');
      link.href = item.href;
      link.textContent = item.label;
      panel.appendChild(link);
    });
    setLocaleLink(document.querySelector('.xa-locale'));
  }

  function normalizeLegacyNavigation() {
    document.querySelectorAll('.page > nav:not([data-site-nav])').forEach(function (nav) {
      var panel = nav.querySelector('.nav-links');
      if (!panel) return;
      panel.innerHTML = '';
      navigationItems(false).forEach(function (item) {
        var link = document.createElement('a');
        link.href = item.href;
        link.textContent = item.label;
        if (item.key === currentKey()) link.className = 'nav-active';
        panel.appendChild(link);
      });
      var locale = document.createElement('a');
      locale.className = 'lang-switch';
      panel.appendChild(locale);
      setLocaleLink(locale);
      var cta = document.createElement('a');
      cta.className = 'cta-btn';
      cta.href = 'https://app.topodrive.top';
      cta.textContent = isChinese ? '开始学习' : 'Start learning';
      panel.appendChild(cta);
      nav.setAttribute('data-site-nav', 'legacy');
      panel.setAttribute('data-menu-panel', '');
      var inner = nav.querySelector('.nav-inner');
      if (!inner) return;
      var button = inner.querySelector('[data-menu-button]');
      if (!button) {
        button = document.createElement('button');
        button.className = 'mk-menu-button';
        button.type = 'button';
        button.setAttribute('data-menu-button', '');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-label', isChinese ? '打开菜单' : 'Open menu');
        button.innerHTML = '<span></span><span></span><span></span>';
        inner.appendChild(button);
      }
    });
  }

  function ensureMobilePanel(nav, panel) {
    var holder = panel.closest('.mk-mobile-panel, .xa-mobile-panel');
    if (holder) return holder;
    holder = document.createElement('div');
    holder.className = nav.classList.contains('xa-header') ? 'xa-mobile-panel' : 'mk-mobile-panel';
    var inner = nav.querySelector('.mk-nav-inner, .xa-header-inner, .nav-inner') || nav;
    inner.insertBefore(holder, inner.querySelector('[data-menu-button]'));
    holder.appendChild(panel);
    var actions = nav.querySelector('.mk-nav-actions, .xa-header-actions');
    if (actions) holder.appendChild(actions);
    return holder;
  }

  function closeMenu(nav, button, restoreFocus) {
    var panel = nav._menuPanel;
    nav.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', isChinese ? '打开菜单' : 'Open menu');
    if (panel) panel.setAttribute('aria-hidden', window.matchMedia('(max-width: 720px)').matches ? 'true' : 'false');
    document.body.classList.remove('menu-open');
    if (restoreFocus && nav._menuReturnFocus && typeof nav._menuReturnFocus.focus === 'function') nav._menuReturnFocus.focus();
  }

  function openMenu(nav, button, panel) {
    nav._menuReturnFocus = document.activeElement;
    nav._menuPanel = panel;
    nav.classList.add('is-open');
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-label', isChinese ? '关闭菜单' : 'Close menu');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-open');
    var first = panel.querySelector(focusableSelector);
    if (first) window.setTimeout(function () { first.focus(); }, 0);
  }

  function bindNavigation(nav) {
    var button = nav.querySelector('[data-menu-button]');
    var rawPanel = nav.querySelector('[data-menu-panel]');
    if (!button || !rawPanel) return;
    var panel = ensureMobilePanel(nav, rawPanel);
    nav._menuPanel = panel;
    panel.setAttribute('aria-hidden', window.matchMedia('(max-width: 720px)').matches ? 'true' : 'false');
    window.addEventListener('resize', function () {
      if (!nav.classList.contains('is-open')) panel.setAttribute('aria-hidden', window.matchMedia('(max-width: 720px)').matches ? 'true' : 'false');
    });
    button.addEventListener('click', function () {
      if (nav.classList.contains('is-open')) closeMenu(nav, button, false);
      else openMenu(nav, button, panel);
    });
    document.addEventListener('click', function (event) {
      if (!nav.contains(event.target)) closeMenu(nav, button, false);
    });
    document.addEventListener('keydown', function (event) {
      if (!nav.classList.contains('is-open')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(nav, button, true);
        return;
      }
      if (event.key !== 'Tab') return;
      var focusables = Array.prototype.slice.call(panel.querySelectorAll(focusableSelector));
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    panel.querySelectorAll('a').forEach(function (link) { link.addEventListener('click', function () { closeMenu(nav, button, false); }); });
  }

  function initNavigation() {
    normalizeMarketingNavigation();
    normalizeHomepageNavigation();
    normalizeLegacyNavigation();
    document.querySelectorAll('[data-site-nav]').forEach(bindNavigation);
  }

  function initReveal() {
    var items = document.querySelectorAll('.mk-reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      items.forEach(function (item) { item.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries, current) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        current.unobserve(entry.target);
      });
    }, { threshold: .12, rootMargin: '0px 0px -40px' });
    items.forEach(function (item) { observer.observe(item); });
  }

  function initTabs() {
    document.querySelectorAll('[data-tabs]').forEach(function (group) {
      var buttons = group.querySelectorAll('[data-tab-target]');
      var panels = group.querySelectorAll('[data-tab-panel]');
      if (!buttons.length || !panels.length) return;
      buttons.forEach(function (button) {
        button.addEventListener('click', function () {
          var target = button.getAttribute('data-tab-target');
          buttons.forEach(function (item) { item.setAttribute('aria-selected', String(item === button)); });
          panels.forEach(function (panel) { panel.hidden = panel.getAttribute('data-tab-panel') !== target; });
        });
      });
    });
  }

  function initPricing() {
    var toggle = document.querySelector('[data-billing-toggle]');
    if (!toggle) return;
    var buttons = toggle.querySelectorAll('button');
    var prices = document.querySelectorAll('[data-price-monthly]');
    var notes = document.querySelectorAll('[data-annual-note]');
    function setBilling(mode) {
      buttons.forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.billing === mode)); });
      prices.forEach(function (price) { price.textContent = mode === 'annual' ? price.dataset.priceAnnual : price.dataset.priceMonthly; });
      notes.forEach(function (note) { note.hidden = mode !== 'annual'; });
    }
    buttons.forEach(function (button) { button.addEventListener('click', function () { setBilling(button.dataset.billing); }); });
    setBilling('monthly');
  }

  function initFaq() {
    document.querySelectorAll('[data-faq-button]').forEach(function (button) {
      button.addEventListener('click', function () {
        var item = button.closest('.mk-faq-item');
        if (!item) return;
        var open = item.classList.toggle('is-open');
        button.setAttribute('aria-expanded', String(open));
      });
    });
  }

  function initScrollIndex() {
    var links = document.querySelectorAll('[data-scroll-index] a');
    if (!links.length || !('IntersectionObserver' in window)) return;
    var sections = Array.prototype.map.call(links, function (link) { return document.querySelector(link.hash); }).filter(Boolean);
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (link) { link.classList.toggle('is-active', link.hash === '#' + entry.target.id); });
      });
    }, { rootMargin: '-30% 0px -58% 0px', threshold: 0 });
    sections.forEach(function (section) { observer.observe(section); });
  }

  function initSearch() {
    var toggle = document.querySelector('[data-search-toggle]');
    var panel = document.querySelector('[data-search-panel]');
    var input = document.querySelector('[data-search-input]');
    var closeButton = document.querySelector('[data-search-close]');
    var form = document.querySelector('[data-search-form]');
    var hint = document.querySelector('[data-search-hint]');
    if (!toggle || !panel) return;
    function closeSearch(restoreFocus) {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (restoreFocus) toggle.focus();
    }
    function openSearch() {
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      if (input) window.setTimeout(function () { input.focus(); }, 0);
    }
    toggle.addEventListener('click', function () { if (panel.hidden) openSearch(); else closeSearch(true); });
    if (closeButton) closeButton.addEventListener('click', function () { closeSearch(true); });
    if (form) form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!input || !hint) return;
      hint.textContent = input.value.trim() ? (isChinese ? '已准备好从这个问题开始。' : 'Ready to start with that question.') : (isChinese ? '请输入一个主题或问题。' : 'Enter a topic or question to begin.');
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !panel.hidden) closeSearch(true);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initNavigation();
    initReveal();
    initTabs();
    initPricing();
    initFaq();
    initScrollIndex();
    initSearch();
  });
}());
