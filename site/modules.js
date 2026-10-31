/* Shared marketing modules: tabs, card rail arrows and the knowledge-graph
   highlight. Every module is readable without this script: tab panels
   stack, the rail scrolls natively and the graph is fully drawn. */
(function () {
  'use strict';
  var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /* Tabs: WAI-ARIA tab pattern with roving tabindex and arrow keys. */
  Array.prototype.forEach.call(document.querySelectorAll('[data-tabs]'), function (root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (tab) { return document.getElementById(tab.getAttribute('aria-controls')); });
    function select(index, focus) {
      tabs.forEach(function (tab, i) {
        var on = i === index;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.tabIndex = on ? 0 : -1;
        if (panels[i]) { panels[i].classList.toggle('is-active', on); panels[i].hidden = !on; }
      });
      if (focus) {
        tabs[index].focus();
        if (tabs[index].scrollIntoView && tabs[index].parentElement.scrollWidth > tabs[index].parentElement.clientWidth) {
          tabs[index].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
        }
      }
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i, false); });
      tab.addEventListener('keydown', function (event) {
        var next = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (i + 1) % tabs.length;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        if (next === null) return;
        event.preventDefault();
        select(next, true);
      });
    });
    var start = tabs.findIndex(function (tab) { return tab.getAttribute('aria-selected') === 'true'; });
    select(start < 0 ? 0 : start, false);
  });

  /* Rail: round arrow buttons scroll by one card; they disable at the ends. */
  Array.prototype.forEach.call(document.querySelectorAll('[data-rail]'), function (root) {
    var track = root.querySelector('.m-rail');
    var prev = root.querySelector('[data-rail-prev]');
    var next = root.querySelector('[data-rail-next]');
    if (!track || !prev || !next) return;
    function step() {
      var card = track.firstElementChild;
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return card ? card.getBoundingClientRect().width + gap : track.clientWidth * .8;
    }
    function update() {
      var max = track.scrollWidth - track.clientWidth - 2;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max;
    }
    function go(direction) {
      track.scrollBy({ left: direction * step(), behavior: reduced.matches ? 'auto' : 'smooth' });
    }
    prev.addEventListener('click', function () { go(-1); });
    next.addEventListener('click', function () { go(1); });
    track.addEventListener('scroll', function () { window.requestAnimationFrame(update); }, { passive: true });
    window.addEventListener('resize', update);
    update();
  });

  /* Knowledge graph: points fade in once; hovering or focusing a point
     lights its own lines and neighbours. */
  Array.prototype.forEach.call(document.querySelectorAll('[data-graph]'), function (stage) {
    var nodes = Array.prototype.slice.call(stage.querySelectorAll('.kg-node'));
    var edges = Array.prototype.slice.call(stage.querySelectorAll('.kg-edge'));
    nodes.concat(edges).forEach(function (item, i) { item.style.setProperty('--i', String(i)); });
    function show() {
      stage.classList.add('is-in');
      window.setTimeout(function () { stage.classList.add('is-settled'); }, 1600);
    }
    if (reduced.matches || !('IntersectionObserver' in window)) show();
    else {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          show();
          observer.disconnect();
        });
      }, { threshold: .2 });
      observer.observe(stage);
    }
    function light(node) {
      var id = node.getAttribute('data-node');
      var linked = {};
      linked[id] = true;
      edges.forEach(function (edge) {
        var on = edge.getAttribute('data-a') === id || edge.getAttribute('data-b') === id;
        edge.classList.toggle('is-lit', on);
        if (on) { linked[edge.getAttribute('data-a')] = true; linked[edge.getAttribute('data-b')] = true; }
      });
      nodes.forEach(function (other) { other.classList.toggle('is-lit', !!linked[other.getAttribute('data-node')]); });
      stage.classList.add('is-hovering');
    }
    function clear() {
      stage.classList.remove('is-hovering');
      nodes.concat(edges).forEach(function (item) { item.classList.remove('is-lit'); });
    }
    nodes.forEach(function (node) {
      node.addEventListener('pointerenter', function () { light(node); });
      node.addEventListener('pointerleave', clear);
    });
  });
})();
