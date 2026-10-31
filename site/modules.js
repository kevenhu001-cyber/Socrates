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
      window.setTimeout(function () { stage.classList.add('is-settled'); }, 2200);
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

/* Round 4: motion layer for the shared modules. Every effect starts from
   content that is already complete in the DOM; reduced motion jumps to the
   finished state, and looping details stop off screen or in a hidden tab. */
(function () {
  'use strict';
  var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener: function () {} };
  var ease = 'cubic-bezier(.22,1,.36,1)';
  var hasIO = 'IntersectionObserver' in window;

  function stagger(items, step, base) {
    if (reduced.matches) return;
    Array.prototype.forEach.call(items, function (item, index) {
      if (!item.animate) return;
      item.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 500, delay: (base || 0) + index * step, easing: ease, fill: 'backwards' });
    });
  }

  /* Live miniatures: the caret blinks only while the miniature is visible
     on screen and the page itself is visible. */
  var liveTargets = new Set();
  var liveObserver = hasIO ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) liveTargets.add(entry.target); else liveTargets.delete(entry.target);
      syncLive(entry.target);
    });
  }, { threshold: .2 }) : null;
  function syncLive(ui) {
    var panel = ui.closest('.m-panel, .m-story-scene');
    var shown = !panel || panel.classList.contains('is-active');
    ui.classList.toggle('is-live', !document.hidden && !reduced.matches && shown && liveTargets.has(ui));
  }
  function syncAllLive() { document.querySelectorAll('.ui').forEach(syncLive); }
  document.addEventListener('visibilitychange', syncAllLive);
  if (reduced.addEventListener) reduced.addEventListener('change', syncAllLive);
  if (liveObserver) document.querySelectorAll('.ui').forEach(function (ui) { if (ui.querySelector('.ui-composer')) liveObserver.observe(ui); });

  /* Play a miniature: its rows arrive in order, chat turns a little slower. */
  function playPanel(panel) {
    if (!panel) return;
    var body = panel.querySelector('.ui-body');
    if (body) stagger(body.children, body.querySelector('.ui-bubble') ? 380 : 90, 120);
    var map = panel.querySelector('.ui-map.is-drawable');
    if (map) {
      map.classList.remove('is-drawn');
      void map.offsetWidth; // restart the draw from an empty path
      map.classList.add('is-drawn');
    }
    var ui = panel.querySelector('.ui');
    if (ui) syncLive(ui);
  }

  /* Tabs: a gliding pill on wide screens and a replay of the miniature. */
  document.querySelectorAll('[data-tabs]').forEach(function (root) {
    var list = root.querySelector('[role="tablist"]');
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    if (!list || !tabs.length) return;
    root.querySelectorAll('.ui-map svg > g:first-child path').forEach(function (path) { path.setAttribute('pathLength', '1'); });
    root.querySelectorAll('.ui-map').forEach(function (map) { map.classList.add('is-drawable'); });
    var wide = window.matchMedia('(min-width: 761px)');
    var glider = document.createElement('span');
    glider.className = 'm-tab-glider';
    glider.setAttribute('aria-hidden', 'true');
    glider.appendChild(document.createElement('i'));
    function current() { return tabs.find(function (tab) { return tab.getAttribute('aria-selected') === 'true'; }) || tabs[0]; }
    function place(animate) {
      if (!wide.matches) {
        if (glider.parentNode) glider.remove();
        list.classList.remove('has-glider');
        return;
      }
      if (!glider.parentNode) list.insertBefore(glider, list.firstChild);
      var tab = current();
      var width = list.scrollWidth;
      var left = tab.offsetLeft;
      var right = width - left - tab.offsetWidth;
      var inner = glider.firstChild;
      if (!animate) inner.style.transition = 'none';
      glider.style.width = width + 'px';
      inner.style.clipPath = 'inset(0 ' + right + 'px 0 ' + left + 'px round 999px)';
      if (!animate) { void inner.offsetWidth; inner.style.transition = ''; }
      list.classList.add('has-glider');
    }
    var seen = false;
    tabs.forEach(function (tab) {
      new MutationObserver(function () {
        if (tab.getAttribute('aria-selected') !== 'true') return;
        place(true);
        if (seen) playPanel(document.getElementById(tab.getAttribute('aria-controls')));
      }).observe(tab, { attributes: true, attributeFilter: ['aria-selected'] });
    });
    place(false);
    window.addEventListener('resize', function () { place(false); }, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { place(false); });
    if (hasIO) {
      var observer = new IntersectionObserver(function (entries) {
        if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
        seen = true;
        observer.disconnect();
        playPanel(document.getElementById(current().getAttribute('aria-controls')));
      }, { threshold: .3 });
      observer.observe(root);
    } else { seen = true; }
  });

  /* Knowledge graph: draw the lines in order, then light the points. */
  document.querySelectorAll('[data-graph]').forEach(function (stage) {
    var edges = stage.querySelectorAll('.kg-edge');
    var nodes = stage.querySelectorAll('.kg-node');
    edges.forEach(function (edge, i) { edge.setAttribute('pathLength', '1'); edge.style.setProperty('--d', (i * 60) + 'ms'); });
    nodes.forEach(function (node, i) { node.style.setProperty('--d', (node.classList.contains('kg-node--core') ? 0 : 260 + i * 70) + 'ms'); });
    stage.classList.add('is-drawable');
  });

  /* Card rail: mouse drag with momentum; touch keeps native scrolling. */
  document.querySelectorAll('[data-rail] .m-rail').forEach(function (track) {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    track.setAttribute('data-draggable', '');
    var startX = 0, startLeft = 0, lastX = 0, lastT = 0, velocity = 0, moved = false, frame = 0, active = false;
    function stop() { if (frame) window.cancelAnimationFrame(frame); frame = 0; }
    function settle() {
      track.classList.remove('is-dragging');
      // Snapping resumes and the browser settles on the nearest card.
      var cards = Array.prototype.slice.call(track.children);
      var origin = track.getBoundingClientRect().left;
      var target = cards.reduce(function (best, card) {
        var d = Math.abs(card.getBoundingClientRect().left - origin);
        return d < best.d ? { d: d, card: card } : best;
      }, { d: Infinity, card: null });
      if (target.card) track.scrollTo({ left: track.scrollLeft + target.card.getBoundingClientRect().left - origin, behavior: reduced.matches ? 'auto' : 'smooth' });
    }
    function glide() {
      velocity *= .94;
      if (Math.abs(velocity) < .05 || reduced.matches) { frame = 0; settle(); return; }
      track.scrollLeft -= velocity * 16;
      frame = window.requestAnimationFrame(glide);
    }
    track.addEventListener('pointerdown', function (event) {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      stop();
      active = true; moved = false;
      startX = lastX = event.clientX; startLeft = track.scrollLeft; lastT = event.timeStamp; velocity = 0;
    });
    window.addEventListener('pointermove', function (event) {
      if (!active) return;
      var dx = event.clientX - startX;
      if (!moved && Math.abs(dx) < 4) return;
      if (!moved) { moved = true; track.classList.add('is-dragging'); }
      track.scrollLeft = startLeft - dx;
      var dt = Math.max(1, event.timeStamp - lastT);
      velocity = (event.clientX - lastX) / dt;
      lastX = event.clientX; lastT = event.timeStamp;
    });
    window.addEventListener('pointerup', function () {
      if (!active) return;
      active = false;
      if (!moved) return;
      frame = window.requestAnimationFrame(glide);
    });
    // A drag never turns into a click on the card under the pointer.
    track.addEventListener('click', function (event) { if (moved) { event.preventDefault(); event.stopPropagation(); moved = false; } }, true);
    track.addEventListener('dragstart', function (event) { event.preventDefault(); });
  });

  /* Scroll story: whichever step crosses the middle band of the viewport
     sets the scene. Keyboard focus on a step does the same. */
  document.querySelectorAll('[data-story]').forEach(function (story) {
    var steps = Array.prototype.slice.call(story.querySelectorAll('[data-story-step]'));
    var scenes = Array.prototype.slice.call(story.querySelectorAll('[data-scene]'));
    story.querySelectorAll('.m-story-edge:not(.m-story-edge--new)').forEach(function (edge) { edge.setAttribute('pathLength', '1'); });
    var index = -1;
    function set(next, quiet) {
      if (next === index || next < 0) return;
      index = next;
      steps.forEach(function (step, i) { step.classList.toggle('is-active', i === next); });
      scenes.forEach(function (scene, i) {
        var on = i === next;
        scene.classList.toggle('is-active', on);
        if (on && !quiet) stagger(scene.children, scene.querySelector('.ui-bubble') ? 260 : 80, 80);
      });
      var ui = story.querySelector('.ui');
      if (ui) syncLive(ui);
    }
    set(0, true);
    if (liveObserver) { var ui = story.querySelector('.ui'); if (ui) liveObserver.observe(ui); }
    steps.forEach(function (step, i) { step.addEventListener('focusin', function () { set(i); }); });
    if (!hasIO) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) set(steps.indexOf(entry.target));
      });
    // On phones the product view sticks at the top, so the reading line
    // sits below it instead of at the middle of the screen.
    }, { rootMargin: window.matchMedia('(max-width: 760px)').matches ? '-60% 0px -32% 0px' : '-45% 0px -45% 0px', threshold: 0 });
    steps.forEach(function (step) { observer.observe(step); });
  });

  /* Question chain: one question at a time, each leading to the next. Every
     step is already in the page; this only reveals them in order, strikes
     the first answer once a question has shown it wrong, and lights the map
     at the end. A single unprompted step plays the first time the section
     is well in view, then the learner drives. */
  Array.prototype.forEach.call(document.querySelectorAll('[data-qc]'), function (root) {
    var steps = Array.prototype.slice.call(root.querySelectorAll('[data-qc-step]'));
    var lines = Array.prototype.slice.call(root.querySelectorAll('[data-qc-line]'));
    var wrongs = Array.prototype.slice.call(root.querySelectorAll('[data-qc-wrong]'));
    var list = root.querySelector('.qc-list');
    var map = root.querySelector('[data-qc-map]');
    var button = root.querySelector('[data-qc-next]');
    var label = root.querySelector('[data-qc-next-label]');
    var count = root.querySelector('[data-qc-count]');
    var live = root.querySelector('[data-qc-live]');
    if (!steps.length || !button || !label) return;
    var last = steps.length - 1;
    var nextText = label.textContent;
    var againText = button.getAttribute('data-qc-again') || nextText;
    var current = 0;
    var touched = false;
    function lineFor(index) { return index === 0 ? 0 : (index === last ? lines.length - 1 : Math.min(1, lines.length - 1)); }
    function text(node, selector) { var el = node.querySelector(selector); return el ? el.textContent : ''; }
    function render(index, announce) {
      current = index;
      steps.forEach(function (step, i) {
        step.classList.toggle('is-future', i > index);
        step.classList.toggle('is-current', i === index);
        step.classList.toggle('is-past', i < index);
      });
      wrongs.forEach(function (answer) {
        var at = Number(answer.closest('[data-qc-step]').getAttribute('data-qc-step'));
        var struck = index > at;
        answer.classList.toggle('is-struck', struck);
        var note = answer.querySelector('[data-qc-revised]');
        if (note) note.hidden = !struck;
      });
      var on = lineFor(index);
      lines.forEach(function (line, i) {
        line.classList.toggle('is-on', i === on);
        line.classList.toggle('is-past', i < on);
      });
      if (list) list.style.setProperty('--qc-progress', String(last ? index / last : 1));
      if (map) map.classList.toggle('is-on', index === last);
      if (count) count.textContent = (index + 1) + ' / ' + steps.length;
      label.textContent = index === last ? againText : nextText;
      button.classList.toggle('is-again', index === last);
      if (announce && live) {
        var step = steps[index];
        live.textContent = text(step, '.qc-label') + ': ' + text(step, '.qc-question') + ' ' + text(step, '.qc-who') + ': ' + text(step, '.qc-answer-text');
      }
    }
    root.setAttribute('data-qc-ready', '');
    // Reduced motion starts on the finished chain: every step, the struck
    // first answer and the map, with the button offering to step through.
    render(reduced.matches ? last : 0, false);
    button.addEventListener('click', function () {
      touched = true;
      render(current === last ? 0 : current + 1, true);
    });
    if (reduced.matches || !('IntersectionObserver' in window)) return;
    var timer = null;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        window.clearTimeout(timer);
        if (!entry.isIntersecting) return;
        timer = window.setTimeout(function () {
          observer.disconnect();
          if (!touched && current === 0 && !document.hidden) render(1, false);
        }, 1400);
      });
    }, { threshold: 0.55 });
    observer.observe(list || root);
  });
})();
