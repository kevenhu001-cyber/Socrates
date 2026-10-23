/* Shared progressive motion: no content depends on an animation completing. */
(function () {
  'use strict';
  var header = document.querySelector('.site-header');
  var main = document.querySelector('main');
  if (!header || !main) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var running = new Set();
  var observer;

  function animate(element, frames, options) {
    if (reduced.matches || !element.animate) return;
    var animation = element.animate(frames, options);
    running.add(animation);
    function settled() { running.delete(animation); }
    animation.finished.then(settled, settled);
  }

  var selectors = [
    '.home-hero-inner', '.feature-main', '.hero-plate', '.feature-intro',
    '.news-item', '.story-visual', '.story-layout > div', '.home-research-note', '.learning-layout > div',
    '.product-hero', '.product-preview', '.product-section-intro', '.product-feature-copy', '.product-sample', '.product-tool-grid > div',
    '.content-hero', '.research-note', '.company-visual', '.company-story', '.company-team', '.company-practices li', '.company-work-list li',
    '.page-head .shell', '.pricing-card', '.page-media-inline', '.ed-report-hero > .ed-shell', '.ed-article-hero-grid',
    'article > h2', 'article > blockquote'
  ];
  var elements = Array.from(main.querySelectorAll(selectors.join(',')));
  elements.forEach(function (element) { element.setAttribute('data-site-reveal', ''); });

  function reveal(element) {
    if (element.hasAttribute('data-site-seen')) return;
    element.setAttribute('data-site-seen', '');
    var index = Array.prototype.indexOf.call(element.parentElement.children, element);
    animate(element, [
      { opacity: 0, transform: 'translateY(20px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 650, delay: (index % 3) * 60, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
  }

  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        reveal(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px 48px 0px', threshold: .08 });
    elements.forEach(function (element) { observer.observe(element); });
  }

  var menu = header.querySelector('.site-mobile-menu');
  if (menu && 'MutationObserver' in window) {
    new MutationObserver(function () {
      if (menu.hidden) return;
      animate(menu, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' });
      menu.querySelectorAll('nav a').forEach(function (link, index) {
        animate(link, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 320, delay: index * 28, fill: 'backwards', easing: 'cubic-bezier(.22,1,.36,1)' });
      });
    }).observe(menu, { attributes: true, attributeFilter: ['hidden'] });
  }

  var reading = !!main.querySelector('article');
  if (reading) header.setAttribute('data-reading-progress', '');
  var scheduled = false;
  function updateScroll() {
    scheduled = false;
    header.classList.toggle('is-scrolled', window.scrollY > 12);
    if (!reading) return;
    var start = main.getBoundingClientRect().top + window.scrollY;
    var distance = main.scrollHeight - window.innerHeight;
    var progress = Math.max(0, Math.min(1, (window.scrollY - start) / Math.max(1, distance)));
    header.style.setProperty('--reading-progress', String(progress));
  }
  function scheduleScroll() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(updateScroll);
  }
  window.addEventListener('scroll', scheduleScroll, { passive: true });
  window.addEventListener('resize', scheduleScroll, { passive: true });
  window.addEventListener('pageshow', scheduleScroll);
  updateScroll();

  reduced.addEventListener('change', function () {
    if (!reduced.matches) return;
    running.forEach(function (animation) { animation.cancel(); });
    running.clear();
  });
  // A keyboard action should never wait for an entrance animation.
  document.addEventListener('focusin', function (event) {
    running.forEach(function (animation) {
      var target = animation.effect && animation.effect.target;
      if (target && target.contains(event.target)) animation.cancel();
    });
  });
}());
