/* Shared progressive motion: no content depends on an animation completing. */
(function () {
  'use strict';
  var header = document.querySelector('.site-header');
  var main = document.querySelector('main');
  if (!header || !main) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var running = new Set();
  var observer;

  var ease = 'cubic-bezier(.22,1,.36,1)';

  function animate(element, frames, options, allowReduced) {
    if ((reduced.matches && !allowReduced) || !element.animate) return;
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
    '.home-faq-head', '.home-faq-item', '.home-cta-inner',
    'article > h2', 'article > blockquote'
  ];
  var elements = Array.from(main.querySelectorAll(selectors.join(',')));
  elements.forEach(function (element) { element.setAttribute('data-site-reveal', ''); });

  function reveal(element) {
    if (element.hasAttribute('data-site-seen')) return;
    element.setAttribute('data-site-seen', '');
    var index = Array.prototype.indexOf.call(element.parentElement.children, element);
    // B7: rise 32px and fade in over 700ms on the base curve, once.
    animate(element, [
      { opacity: 0, transform: 'translateY(32px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 700, delay: (index % 3) * 60, easing: ease, fill: 'backwards' });
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
      // The panel fades; reduced motion keeps the fade and drops all movement.
      animate(menu, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: ease }, true);
      if (reduced.matches) return;
      // Links arrive in reading order: 24px rise, 60ms apart, sequence capped at 400ms.
      menu.querySelectorAll('nav a, .site-mobile-utilities a').forEach(function (link, index) {
        animate(link, [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 500, delay: Math.min(index * 60, 400), fill: 'backwards', easing: ease });
      });
    }).observe(menu, { attributes: true, attributeFilter: ['hidden'] });
  }

  // B11 tagline: each word moves from 30% to full opacity in reading order as
  // the block crosses the viewport. One rAF-throttled scroll handler drives it;
  // reduced motion and missing APIs leave the text at full colour.
  var taglines = Array.from(main.querySelectorAll('[data-word-reveal]'));
  var words = [];
  function splitWords(block) {
    var locale = block.closest('[lang]') ? block.closest('[lang]').getAttribute('lang') : 'en';
    var segmenter = window.Intl && Intl.Segmenter ? new Intl.Segmenter(locale, { granularity: 'word' }) : null;
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    var list = [];
    nodes.forEach(function (node) {
      var parts = segmenter
        ? Array.from(segmenter.segment(node.nodeValue), function (part) { return part.segment; })
        : node.nodeValue.split(/(\s+)/);
      var fragment = document.createDocumentFragment();
      var current = null;
      parts.forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { fragment.appendChild(document.createTextNode(part)); current = null; return; }
        // Punctuation joins the word before it so it never lights on its own.
        if (current && !/[\p{L}\p{N}]/u.test(part)) { current.textContent += part; return; }
        current = document.createElement('span');
        current.className = 'site-word';
        current.textContent = part;
        fragment.appendChild(current);
        list.push(current);
      });
      node.parentNode.replaceChild(fragment, node);
    });
    block.setAttribute('data-word-ready', '');
    return list;
  }
  if (taglines.length && !reduced.matches && 'requestAnimationFrame' in window) {
    taglines.forEach(function (block) { words.push({ block: block, list: splitWords(block), lit: 0 }); });
  }
  function updateWords() {
    var height = window.innerHeight;
    words.forEach(function (entry) {
      if (entry.lit >= entry.list.length) return;
      var box = entry.block.getBoundingClientRect();
      // Starts as the block's top passes 85% of the viewport, ends as its bottom passes 55%.
      var start = height * .85;
      var end = height * .55;
      var progress = (start - box.top) / Math.max(1, (start - end) + box.height);
      var target = Math.max(entry.lit, Math.min(entry.list.length, Math.floor(progress * (entry.list.length + 1))));
      for (var i = entry.lit; i < target; i += 1) entry.list[i].classList.add('is-lit');
      entry.lit = target;
    });
  }
  reduced.addEventListener('change', function () {
    if (!reduced.matches) return;
    words.forEach(function (entry) {
      entry.list.forEach(function (word) { word.classList.add('is-lit'); });
      entry.lit = entry.list.length;
    });
  });

  var reading = !!main.querySelector('article');
  if (reading) header.setAttribute('data-reading-progress', '');
  var scheduled = false;
  function updateScroll() {
    scheduled = false;
    header.classList.toggle('is-scrolled', window.scrollY > 12);
    if (words.length) updateWords();
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
