/* Shared marketing modules: the mode deck, card rail arrows and the
   knowledge-graph highlight. Every module is readable without this script:
   the deck's cards stack as a list, the rail scrolls natively and the graph
   is fully drawn. */
(function () {
  'use strict';
  var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

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
    // One sentence under the map says why the lit point belongs where it
    // is. Points take keyboard focus too, so the map can be read without a
    // pointer; the sentence sits in a polite live region.
    var why = stage.querySelector('[data-graph-why-text]');
    var whyIdle = why ? why.textContent : '';
    function say(text) {
      if (!why || why.textContent === text) return;
      why.textContent = text;
      if (!reduced.matches && why.animate) why.animate([{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
    function clear() {
      stage.classList.remove('is-hovering');
      nodes.concat(edges).forEach(function (item) { item.classList.remove('is-lit'); });
      say(whyIdle);
    }
    var svg = stage.querySelector('svg');
    if (why && svg) svg.setAttribute('role', 'group');
    nodes.forEach(function (node) {
      var label = node.querySelector('text');
      function show() { light(node); if (node.hasAttribute('data-why')) say(node.getAttribute('data-why')); }
      node.addEventListener('pointerenter', show);
      node.addEventListener('pointerleave', clear);
      if (!why || !node.hasAttribute('data-why')) return;
      node.setAttribute('tabindex', '0');
      node.setAttribute('role', 'img');
      if (label) node.setAttribute('aria-label', label.textContent);
      node.addEventListener('focus', show);
      node.addEventListener('blur', clear);
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
    var panel = ui.closest('.deck-card');
    var shown = !panel || !panel.hasAttribute('data-k') || panel.getAttribute('data-k') === '0';
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

  /* Round 7: the mode deck. Without motion (or without this script) the
     five cards are a list and the pills are anchor links. With motion the
     pills become a WAI-ARIA tab list over a stacked deck: only the front
     card is reachable (the others are inert), arrows, Home/End, the round
     buttons and a horizontal swipe turn the cards. On wide, tall screens the
     stage is sticky (CSS) and the scroll position inside the 280vh track
     picks the front card (one step per card, then a closing step that
     folds the deck into its end row); choosing a mode there scrolls to its place so the
     two never disagree. Scroll only schedules a frame. */
  document.querySelectorAll('[data-deck]').forEach(function (deck) {
    var nav = deck.querySelector('[data-deck-nav]');
    var pills = Array.prototype.slice.call(deck.querySelectorAll('[data-deck-pill]'));
    var cards = Array.prototype.slice.call(deck.querySelectorAll('[data-deck-card]'));
    var list = deck.querySelector('[data-deck-cards]');
    var controls = deck.querySelector('[data-deck-controls]');
    var prev = deck.querySelector('[data-deck-prev]');
    var next = deck.querySelector('[data-deck-next]');
    var indexLabel = deck.querySelector('[data-deck-index]');
    var live = deck.querySelector('[data-deck-live]');
    var endDots = Array.prototype.slice.call(deck.querySelectorAll('.deck-end-dots i'));
    if (!nav || !list || !controls || !prev || !next || pills.length !== cards.length || !cards.length) return;
    var pinned = window.matchMedia('(prefers-reduced-motion: no-preference) and (min-width: 1024px) and (min-height: 700px)');
    var active = 0;
    var enabled = false;
    var seen = false;
    var frame = 0;
    var swipe = null;
    var done = false;
    var steer = null;
    var met = [];
    // Pinned, the track has one step per card plus the closing step.
    function steps() { return cards.length + 1; }

    function setDone(on) {
      if (on === done) return;
      done = on;
      if (on) deck.setAttribute('data-done', ''); else deck.removeAttribute('data-done');
      // Folded away, the fifth card is not reachable; the end link is.
      cards[active].inert = on;
      if (on && cards[active].contains(document.activeElement)) pills[active].focus();
    }

    function clampIndex(i) { return Math.max(0, Math.min(cards.length - 1, i)); }

    function setActive(i, announce) {
      i = clampIndex(i);
      var changed = i !== active;
      active = i;
      cards.forEach(function (card, k) {
        var d = Math.max(-1, Math.min(4, k - i));
        card.setAttribute('data-k', String(d));
        card.inert = d !== 0 || done;
        var ui = card.querySelector('.ui');
        if (ui) syncLive(ui);
      });
      pills.forEach(function (pill, k) {
        pill.setAttribute('aria-selected', k === i ? 'true' : 'false');
        pill.tabIndex = k === i ? 0 : -1;
      });
      if (indexLabel) indexLabel.textContent = String(i + 1);
      met[i] = true;
      endDots.forEach(function (dot, k) { dot.classList.toggle('is-on', !!met[k]); });
      prev.disabled = i === 0;
      next.disabled = i === cards.length - 1;
      // Never leave focus inside a card that just went inert.
      if (cards.some(function (card, k) { return k !== i && card.contains(document.activeElement); })) pills[i].focus();
      if (changed && seen) playPanel(cards[i]);
      if (announce && live) live.textContent = pills[i].textContent + ' · ' + (i + 1) + ' / ' + cards.length;
    }

    function track() {
      var box = deck.getBoundingClientRect();
      return { top: box.top + window.scrollY, span: deck.offsetHeight - window.innerHeight };
    }

    function go(i, announce) {
      i = clampIndex(i);
      if (pinned.matches) {
        var t = track();
        if (t.span > 0) window.scrollTo({ top: Math.round(t.top + t.span * (i + .5) / steps()), behavior: 'smooth' });
        setDone(false);
        // The smooth scroll passes through other steps; they must not
        // override the mode just chosen.
        steer = { i: i, until: Date.now() + 1200 };
        window.setTimeout(onScroll, 1250);
      }
      setActive(i, announce);
    }

    function fromScroll() {
      frame = 0;
      if (!enabled) return;
      if (!pinned.matches) { setDone(false); return; }
      var box = deck.getBoundingClientRect();
      var span = deck.offsetHeight - window.innerHeight;
      if (span <= 0) return;
      var progress = Math.max(0, Math.min(1, -box.top / span));
      var step = Math.min(cards.length, Math.floor(progress * steps()));
      var i = Math.min(cards.length - 1, step);
      if (steer) {
        if (Date.now() < steer.until && step !== steer.i) return;
        steer = null;
      }
      if (i !== active) setActive(i, false);
      setDone(step === cards.length);
    }
    // Round 10 (performance): the deck reads its box only while it is near
    // the view, not on every scrolled frame of the whole page.
    var near = !('IntersectionObserver' in window);
    if (!near) new IntersectionObserver(function (entries) {
      near = entries[entries.length - 1].isIntersecting;
      // One last read on the way out, so a jump past the deck still settles it.
      if (!frame) frame = window.requestAnimationFrame(fromScroll);
    }, { rootMargin: '100% 0px 100% 0px' }).observe(deck);
    function onScroll() { if (near && !frame) frame = window.requestAnimationFrame(fromScroll); }

    function onPillClick(event) {
      if (!enabled) return;
      event.preventDefault();
      go(pills.indexOf(event.currentTarget), false);
    }
    function onPillKey(event) {
      if (!enabled) return;
      var i = pills.indexOf(event.currentTarget);
      var target = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = (i + 1) % pills.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = (i - 1 + pills.length) % pills.length;
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = pills.length - 1;
      if (target === null) return;
      event.preventDefault();
      go(target, false);
      pills[target].focus();
      if (pills[target].scrollIntoView && nav.scrollWidth > nav.clientWidth) pills[target].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    function onPrev() { go(active - 1, true); }
    function onNext() { go(active + 1, true); }
    function onDown(event) { if (event.isPrimary) swipe = { x: event.clientX, y: event.clientY }; }
    function onUp(event) {
      if (!swipe || !event.isPrimary) return;
      var dx = event.clientX - swipe.x;
      var dy = event.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) go(active + (dx < 0 ? 1 : -1), true);
    }

    pills.forEach(function (pill) {
      pill.addEventListener('click', onPillClick);
      pill.addEventListener('keydown', onPillKey);
    });
    prev.addEventListener('click', onPrev);
    next.addEventListener('click', onNext);
    list.addEventListener('pointerdown', onDown);
    list.addEventListener('pointerup', onUp);
    list.addEventListener('pointercancel', function () { swipe = null; });

    function enable() {
      if (enabled) return;
      enabled = true;
      nav.setAttribute('role', 'tablist');
      pills.forEach(function (pill, k) {
        pill.setAttribute('role', 'tab');
        pill.id = pill.id || 'mode-tab-' + cards[k].id.replace(/^mode-/, '');
        pill.setAttribute('aria-controls', cards[k].id);
      });
      cards.forEach(function (card, k) {
        card.setAttribute('role', 'tabpanel');
        card.setAttribute('aria-labelledby', pills[k].id);
        card.querySelectorAll('.ui-map svg > g:first-child path').forEach(function (path) { path.setAttribute('pathLength', '1'); });
        card.querySelectorAll('.ui-map').forEach(function (map) { map.classList.add('is-drawable'); });
      });
      controls.hidden = false;
      setActive(active, false);
      fromScroll();
    }
    function disable() {
      if (!enabled) return;
      enabled = false;
      nav.removeAttribute('role');
      pills.forEach(function (pill) {
        ['role', 'aria-controls', 'aria-selected', 'tabindex'].forEach(function (name) { pill.removeAttribute(name); });
      });
      cards.forEach(function (card) {
        ['role', 'aria-labelledby', 'data-k'].forEach(function (name) { card.removeAttribute(name); });
        card.inert = false;
        card.querySelectorAll('.ui-map').forEach(function (map) { map.classList.remove('is-drawable', 'is-drawn'); });
      });
      controls.hidden = true;
      setDone(false);
      met = [];
      endDots.forEach(function (dot) { dot.classList.remove('is-on'); });
      syncAllLive();
    }
    function sync() { if (reduced.matches) disable(); else enable(); }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    if (pinned.addEventListener) pinned.addEventListener('change', onScroll);
    if (reduced.addEventListener) reduced.addEventListener('change', sync);
    sync();
    if (hasIO) {
      var observer = new IntersectionObserver(function (entries) {
        if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
        seen = true;
        observer.disconnect();
        if (enabled) playPanel(cards[active]);
      }, { threshold: .2 });
      observer.observe(list);
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

  /* Steps: one hairline threads the three numbered points. As each step
     reaches the middle of the screen its point turns black and the black
     line grows to it. The line is measured from the points themselves, so
     it follows the row on desktop and the column on phones. */
  document.querySelectorAll('.m-steps').forEach(function (list) {
    var steps = Array.prototype.slice.call(list.querySelectorAll('.m-step'));
    if (steps.length < 2) return;
    var thread = document.createElement('span');
    thread.className = 'm-thread';
    thread.setAttribute('aria-hidden', 'true');
    list.insertBefore(thread, list.firstChild);
    list.setAttribute('data-thread', '');
    var reached = -1;
    function point(step) {
      var box = step.getBoundingClientRect();
      var badge = window.getComputedStyle(step, '::before');
      var padTop = parseFloat(window.getComputedStyle(step).paddingTop) || 0;
      var padLeft = parseFloat(window.getComputedStyle(step).paddingLeft) || 0;
      var size = parseFloat(badge.width) || 36;
      return { x: box.left + padLeft + size / 2, y: box.top + padTop + size / 2 };
    }
    function measure() {
      var origin = list.getBoundingClientRect();
      var a = point(steps[0]);
      var b = point(steps[steps.length - 1]);
      var vertical = Math.abs(b.x - a.x) < 2;
      list.classList.toggle('is-vertical', vertical);
      thread.style.left = (a.x - origin.left) + 'px';
      thread.style.top = (a.y - origin.top) + 'px';
      thread.style.width = vertical ? '1px' : (b.x - a.x) + 'px';
      thread.style.height = vertical ? (b.y - a.y) + 'px' : '1px';
    }
    function reach(index) {
      if (index <= reached) return;
      reached = index;
      steps.forEach(function (step, i) { step.classList.toggle('is-reached', i <= reached); });
      thread.style.setProperty('--thread', String(reached / (steps.length - 1)));
    }
    measure();
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(list);
    else window.addEventListener('resize', measure);
    if (reduced.matches || !hasIO) { reach(steps.length - 1); return; }
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        reach(steps.indexOf(entry.target));
        if (reached === steps.length - 1) seen.disconnect();
      });
    }, { rootMargin: '0px 0px -38% 0px', threshold: 0 });
    steps.forEach(function (step) { seen.observe(step); });
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
      // Every step turns its own points of the field into nodes.
      grown.forEach(function (item) { item.classList.toggle('is-grid', Number(item.getAttribute('data-at')) > index); });
      if (count) count.textContent = (index + 1) + ' / ' + steps.length;
      label.textContent = index === last ? againText : nextText;
      button.classList.toggle('is-again', index === last);
      if (announce && live) {
        var step = steps[index];
        live.textContent = text(step, '.qc-label') + ': ' + text(step, '.qc-question') + ' ' + text(step, '.qc-who') + ': ' + text(step, '.qc-answer-text');
      }
    }
    var stage = root.querySelector('.qc-stage');
    var mapSvg = map ? map.querySelector('svg') : null;
    var grown = map ? Array.prototype.slice.call(map.querySelectorAll('[data-at]')) : [];
    var UNIT = 16; // one step of the field, in map units; nodes sit on multiples
    // Size the map so a field step is a whole number of pixels (no blurry,
    // drifting tiles), then shift the field so it passes through (0, 0) of
    // the map: every node lands exactly on a point.
    function alignField() {
      if (!stage || !mapSvg || !mapSvg.viewBox || !mapSvg.getScreenCTM) return;
      var box = mapSvg.viewBox.baseVal;
      var room = Math.min(560, map.clientWidth);
      var step = Math.max(8, Math.min(20, Math.floor(room / (box.width / UNIT))));
      mapSvg.style.width = (step * box.width / UNIT) + 'px';
      var m = mapSvg.getScreenCTM();
      if (!m) return;
      var at = stage.getBoundingClientRect();
      var g = UNIT * m.a;
      function wrap(v) { return ((v - g / 2) % g + g) % g; }
      stage.style.setProperty('--qc-g', g + 'px');
      stage.style.setProperty('--qc-gx', wrap(m.e - at.left) + 'px');
      stage.style.setProperty('--qc-gy', wrap(m.f - at.top) + 'px');
      stage.setAttribute('data-qc-grid', '');
    }
    var alignFrame = 0;
    function scheduleAlign() { if (!alignFrame) alignFrame = window.requestAnimationFrame(function () { alignFrame = 0; alignField(); }); }
    alignField();
    if ('ResizeObserver' in window && stage) new ResizeObserver(scheduleAlign).observe(stage);
    else window.addEventListener('resize', scheduleAlign, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleAlign);
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
