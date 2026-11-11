/* Shared progressive motion: no content depends on an animation completing. */
(function () {
  'use strict';
  var header = document.querySelector('.site-header');
  var main = document.querySelector('main');
  if (!header || !main) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mobileViewport = window.matchMedia('(max-width: 760px)');
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

  // Home hero: no entrance of its own. The first screen has exactly one
  // motion, the question mark written out of the dot field (hero-mark.js);
  // the title, the question box and the starters are simply there, which is
  // also what lets the reader start typing at once. (Round 8 removed the
  // line-by-line title rise: it repeated the mark's "a question appears".)

  var selectors = [
    '.feature-main', '.hero-plate', '.feature-intro',
    '.news-item', '.story-visual', '.home-research-note', '.learning-layout > div',
    '.product-hero', '.product-preview', '.product-section-intro', '.product-feature-copy', '.product-sample', '.product-tool-grid > div',
    '.content-hero', '.research-note', '.company-visual', '.company-story', '.company-team', '.company-practices li', '.company-work-list li',
    '.page-head .shell', '.pricing-card', '.page-media-inline', '.ed-report-hero > .ed-shell', '.ed-article-hero-grid',
    '.home-faq-head', '.home-faq-item', '.home-cta-inner',
    '.m-intro', '.m-tablist', '.m-card', '.m-graph-copy', '.m-graph-stage', '.m-rail-head', '.m-step', '.m-table-wrap', '.m-faq',
    'article > h2', 'article > blockquote'
  ];
  var elements = Array.from(main.querySelectorAll(selectors.join(',')));
  elements.forEach(function (element) { element.setAttribute('data-site-reveal', ''); });

  // A block that scrolls in arrives with one quiet fade, all at once:
  // no rise and no sibling stagger (round 9 dropped both; they said
  // nothing about the content). Reduced motion shows it as it is.
  function reveal(element) {
    if (element.hasAttribute('data-site-seen')) return;
    element.setAttribute('data-site-seen', '');
    animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: ease, fill: 'backwards' });
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

  // [data-sequence] blocks (a short thread, a pair of map nodes) used to
  // arrive child by child; round 9 shows them whole, since the order of
  // arrival added nothing the layout does not already say.

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
  var previousScrollY = window.scrollY;
  var downwardDistance = 0;
  var upwardDistance = 0;
  var keyboardNavigation = false;
  function updateScroll() {
    scheduled = false;
    var scrollY = window.scrollY;
    header.classList.toggle('is-scrolled', scrollY > 12);

    // On the narrow home page, keep the chapter content clear while reading:
    // the sticky bar retreats after a deliberate downward scroll and returns
    // as soon as the reader scrolls up. The sticky slot stays in layout, so
    // this never shifts the page. Anchor targets already reserve header+24px.
    if (!document.body.classList.contains('home-refresh') || !mobileViewport.matches) {
      header.classList.remove('is-hidden-on-scroll');
      downwardDistance = 0;
      upwardDistance = 0;
    } else {
      var delta = scrollY - previousScrollY;
      var keepVisible = scrollY <= 12
        || document.documentElement.classList.contains('site-menu-open')
        || (keyboardNavigation && header.contains(document.activeElement));
      if (keepVisible) {
        header.classList.remove('is-hidden-on-scroll');
        downwardDistance = 0;
        upwardDistance = 0;
      } else if (delta > 0) {
        downwardDistance += delta;
        upwardDistance = 0;
        if (scrollY > 140 && downwardDistance >= 24) header.classList.add('is-hidden-on-scroll');
      } else if (delta < 0) {
        upwardDistance += -delta;
        downwardDistance = 0;
        if (upwardDistance >= 12) header.classList.remove('is-hidden-on-scroll');
      }
    }
    previousScrollY = scrollY;
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
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Tab') keyboardNavigation = true;
  });
  document.addEventListener('pointerdown', function () { keyboardNavigation = false; }, { passive: true });
  updateScroll();

  // Plan cards: on hover a hairline is drawn around the card from its top
  // left corner, the same line that threads the questions elsewhere. It is
  // one SVG rect per card with pathLength=1, so only its dash offset moves.
  if (document.body.classList.contains('pricing-page') && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var svgNS = 'http://www.w3.org/2000/svg';
    main.querySelectorAll('.plan, .ed-price-card').forEach(function (card) {
      if (card.querySelector('.m-trace')) return;
      var svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('class', 'm-trace');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      var rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('pathLength', '1');
      svg.appendChild(rect);
      card.appendChild(svg);
      card.setAttribute('data-trace', '');
    });
  }

  // Round 7 / 10: the footer wordmark's point, a square block of halftone
  // dots, waits loose and as light as the letters; when the reader reaches
  // the end of the page it gathers to its cells and turns ink, answering the
  // point of the hero's question mark. Without scripts or with reduced
  // motion it simply sits there, in ink.
  var wordmark = document.querySelector('[data-wordmark]');
  if (wordmark && 'IntersectionObserver' in window) {
    var lit = new IntersectionObserver(function (entries) {
      if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
      wordmark.classList.add('is-lit');
      lit.disconnect();
    }, { threshold: .95 });
    lit.observe(wordmark);
  } else if (wordmark) {
    wordmark.classList.add('is-lit');
  }

  reduced.addEventListener('change', function () {
    if (!reduced.matches) return;
    running.forEach(function (animation) { animation.cancel(); });
    running.clear();
  });
  // A keyboard action should never wait for an entrance animation.
  document.addEventListener('focusin', function (event) {
    if (header.contains(event.target)) {
      header.classList.remove('is-hidden-on-scroll');
      downwardDistance = 0;
      upwardDistance = 0;
    }
    running.forEach(function (animation) {
      var target = animation.effect && animation.effect.target;
      if (target && target.contains(event.target)) animation.cancel();
    });
  });
}());

/* Round 9 · 404, back to the start (lives here, not in its own file, so
   the page loads no extra script before the shared chrome).
   Round 10: the page shows the home page's halftone question mark with its
   point missing. Choosing "Go to the home page" gathers the stroke's dots,
   the end of the stem first, into the point's square block (~0.9s): the
   point that opens the home page. Then it goes there. Reduced motion, a
   modified click or a missing Web Animations API simply follow the link. */
(function () {
  'use strict';
  var link = document.querySelector('.nf-primary');
  var svg = document.querySelector('.nf-mark');
  if (!link || !svg || !svg.animate) return;
  var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var point = svg.querySelector('.nf-point');
  var gap = svg.querySelector('.nf-gap');
  var cells = Array.prototype.slice.call(svg.querySelectorAll('.nf-stroke circle'));
  var blocks = Array.prototype.slice.call(point.querySelectorAll('circle'));
  var ease = 'cubic-bezier(.22,1,.36,1)';
  var going = false;
  link.addEventListener('click', function (event) {
    if (going || reduced.matches || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    going = true;
    var href = link.href;
    var px = 0;
    var py = 0;
    blocks.forEach(function (c) { px += c.cx.baseVal.value / blocks.length; py += c.cy.baseVal.value / blocks.length; });
    svg.setAttribute('data-gathering', '');
    var last = 0;
    cells.forEach(function (cell, i) {
      // The end of the stroke, nearest the point, arrives first.
      var delay = (cells.length - 1 - i) * 5;
      last = Math.max(last, delay);
      var dx = px - cell.cx.baseVal.value;
      var dy = py - cell.cy.baseVal.value;
      cell.animate([
        { transform: 'translate(0, 0)', opacity: 1 },
        { transform: 'translate(' + dx * .85 + 'px,' + dy * .85 + 'px)', opacity: 1, offset: .8 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px)', opacity: 0 }
      ], { duration: 560, delay: delay, easing: ease, fill: 'forwards' });
    });
    if (gap) gap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: last + 300, fill: 'forwards' });
    point.style.opacity = '1';
    var grow = null;
    blocks.forEach(function (c, i) {
      // The block appears cell by cell from its centre outwards.
      var d = Math.hypot(c.cx.baseVal.value - px, c.cy.baseVal.value - py);
      grow = c.animate([{ opacity: 0, transform: 'scale(.2)', transformOrigin: c.cx.baseVal.value + 'px ' + c.cy.baseVal.value + 'px' },
        { opacity: 1, transform: 'scale(1)', transformOrigin: c.cx.baseVal.value + 'px ' + c.cy.baseVal.value + 'px' }],
        { duration: 260, delay: last + 340 + d * 50, easing: ease, fill: 'both' });
    });
    var gone = false;
    function go() { if (gone) return; gone = true; window.location.href = href; }
    if (grow) grow.finished.then(function () { window.setTimeout(go, 80); }, go);
    else go();
    window.setTimeout(go, 1200); // never strand the reader on this page
  });
  // Coming back from the home page through the back/forward cache.
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    going = false;
    svg.removeAttribute('data-gathering');
    point.style.opacity = '';
    svg.getAnimations({ subtree: true }).forEach(function (a) { a.cancel(); });
  });
}());
