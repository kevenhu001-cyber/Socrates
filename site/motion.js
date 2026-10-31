/* Shared progressive motion: no content depends on an animation completing. */
(function () {
  'use strict';
  var header = document.querySelector('.site-header');
  var main = document.querySelector('main');
  if (!header || !main) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var running = new Set();
  var observer;

  // Quiet motion in the reference style: short fades with a small rise.
  var ease = 'cubic-bezier(.22,1,.36,1)';

  function animate(element, frames, options, allowReduced) {
    if ((reduced.matches && !allowReduced) || !element.animate) return;
    var animation = element.animate(frames, options);
    running.add(animation);
    function settled() { running.delete(animation); }
    animation.finished.then(settled, settled);
  }

  // The bar is clear at the top and frosts once the page moves under it.
  header.setAttribute('data-scroll-aware', '');

  // Home hero: the title rises line by line out of a mask (the words stay
  // fully opaque, so the largest paint is not delayed), then the lede, the
  // question box and the starters follow. Runs once, about a second.
  var hero = main.querySelector('.home-hero-inner');
  if (hero && !reduced.matches && document.body.animate) {
    var title = hero.querySelector('h1');
    if (title && !title.querySelector('.hero-line')) {
      var lines = [[]];
      Array.from(title.childNodes).forEach(function (node) {
        if (node.nodeName === 'BR') lines.push([]);
        else lines[lines.length - 1].push(node);
      });
      title.textContent = '';
      lines.forEach(function (nodes, index) {
        // Each line is its own block, so the <br> between them is dropped.
        var line = document.createElement('span');
        line.className = 'hero-line';
        var inner = document.createElement('span');
        nodes.forEach(function (node) {
          // Leading spaces after a <br> would indent the centred line.
          if (node.nodeType === 3) node.nodeValue = node.nodeValue.replace(/^\s+/, '');
          inner.appendChild(node);
        });
        line.appendChild(inner);
        title.appendChild(line);
        animate(inner, [{ transform: 'translateY(105%)' }, { transform: 'translateY(0)' }],
          { duration: 800, delay: 60 + index * 90, easing: ease, fill: 'backwards' });
      });
    }
    var follow = [hero.querySelector('.home-hero-lede'), hero.querySelector('.ask-box')]
      .concat(Array.from(hero.querySelectorAll('.ask-suggestions > *')));
    follow.forEach(function (element, index) {
      if (!element) return;
      animate(element, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 600, delay: 260 + Math.min(index, 2) * 90 + Math.max(0, index - 2) * 40, easing: ease, fill: 'backwards' });
    });
  }

  var selectors = [
    '.feature-main', '.hero-plate', '.feature-intro',
    '.news-item', '.story-visual', '.story-layout > div', '.home-research-note', '.learning-layout > div',
    '.product-hero', '.product-preview', '.product-section-intro', '.product-feature-copy', '.product-sample', '.product-tool-grid > div',
    '.content-hero', '.research-note', '.company-visual', '.company-story', '.company-team', '.company-practices li', '.company-work-list li',
    '.page-head .shell', '.pricing-card', '.page-media-inline', '.ed-report-hero > .ed-shell', '.ed-article-hero-grid',
    '.home-faq-head', '.home-faq-item', '.home-cta-inner',
    '.m-intro', '.m-tablist', '.m-card', '.m-graph-copy', '.m-graph-stage', '.m-rail-head', '.m-step', '.m-table-wrap', '.m-faq',
    'article > h2', 'article > blockquote'
  ];
  var elements = Array.from(main.querySelectorAll(selectors.join(',')));
  elements.forEach(function (element) { element.setAttribute('data-site-reveal', ''); });

  function reveal(element) {
    if (element.hasAttribute('data-site-seen')) return;
    element.setAttribute('data-site-seen', '');
    var host = element.parentElement.tagName === 'LI' ? element.parentElement : element;
    var index = Array.prototype.indexOf.call(host.parentElement.children, host);
    // A light fade with a 12px rise over 500ms, once; siblings in a grid
    // arrive 60ms apart (at most four steps, so nothing waits long).
    animate(element, [
      { opacity: 0, transform: 'translateY(12px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 500, delay: (index % 4) * 60, easing: ease, fill: 'backwards' });
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

  // Scroll narrative: children of [data-sequence] arrive one after another
  // (a conversation turn by turn, a map node by node, steps in order). The
  // content is in the DOM and readable before, during and without this.
  var sequences = Array.from(main.querySelectorAll('[data-sequence]'));
  function play(container) {
    var items = Array.from(container.children);
    var step = container.matches('.demo-thread, .product-chat') ? 260 : 100;
    var base = container.classList.contains('demo-map-canvas') ? 1000 : 150;
    items.forEach(function (item, index) {
      animate(item, [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 400, delay: base + index * step, easing: ease, fill: 'backwards' });
    });
  }
  if (sequences.length && 'IntersectionObserver' in window) {
    var sequenceObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        play(entry.target);
        sequenceObserver.unobserve(entry.target);
      });
    }, { threshold: .25 });
    sequences.forEach(function (container) { sequenceObserver.observe(container); });
  }

  var menu = header.querySelector('.site-mobile-menu');
  if (menu && 'MutationObserver' in window) {
    new MutationObserver(function () {
      if (menu.hidden) return;
      // The panel fades; reduced motion keeps the fade and drops all movement.
      animate(menu, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: ease }, true);
      if (reduced.matches) return;
      // Links arrive in reading order: 6px rise, 30ms apart, capped at 240ms.
      menu.querySelectorAll('nav a, .site-mobile-utilities a').forEach(function (link, index) {
        animate(link, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 250, delay: Math.min(index * 30, 240), fill: 'backwards', easing: ease });
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
