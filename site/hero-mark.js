/* Home hero · the dot-matrix question mark.
   Narrative: "Every understanding starts with a question; Socrates helps you
   turn the question mark into a period."
   The hero's dot field (CSS) stands for what the reader already knows. The
   inline SVG in .hero-mark is the finished question mark, written in the
   field's own cells, and is what readers see without scripts or with
   reduced motion. With motion this script writes the same cells on a canvas:
     1. once, ~1s: the cells on the stroke darken one by one, top to bottom,
        as if the question were being written out of the field; the point
        lands last. Then everything is still (no idle loop at all);
     2. while the reader scrolls away, the stroke's cells fade back into the
        field's gray, top first: the question is absorbed into knowledge;
     3. on desktop the black point is not absorbed: it travels down and
        becomes the first node of the question chain ("your question is where
        this conversation starts"). The chain's own node is hidden until the
        point arrives, so there is never a moment with two points.
   On phones and tablets the question fades back the same way, the point
   stays in the hero and the chain's node is simply there.
   The canvas is absolutely positioned on <main> and pointer-transparent.
   Scroll only schedules a frame; all drawing happens in rAF, and nothing is
   drawn while the page is hidden or the scroll position has not changed. */
(function () {
  'use strict';
  var root = document.querySelector('[data-hero-mark]');
  if (!root || !window.requestAnimationFrame) return;
  var hero = root.closest('.home-hero');
  var host = hero && hero.parentElement;
  if (!hero || !host) return;
  var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var wide = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : { matches: true };
  var probe = document.createElement('canvas');
  if (!probe.getContext || !probe.getContext('2d')) return;

  var WRITE = 760;      // the last stroke cell starts darkening at ~0.76s
  var CELL = 300;       // each cell takes 0.3s
  var POINT_AT = 820;   // then the point lands (0.82s -> 1.12s)
  var POINT_DUR = 300;
  var INK = '#111111';
  var POINT = '#0d0d0d';

  function readMark(svg) {
    var box = svg.viewBox.baseVal;
    var cells = Array.prototype.map.call(svg.querySelectorAll('.hm-nodes circle'), function (c, i, all) {
      var op = c.hasAttribute('fill-opacity') ? +c.getAttribute('fill-opacity') : 1;
      // Document order is stroke order, top of the hook to the stem's end.
      return { x: +c.getAttribute('cx'), y: +c.getAttribute('cy'), r: +c.getAttribute('r'), a: op, t: i / Math.max(1, all.length - 1) };
    });
    var dot = svg.querySelector('.hm-dot');
    return { cols: box.width, rows: box.height, cells: cells, dot: { x: +dot.getAttribute('cx'), y: +dot.getAttribute('cy'), r: +dot.getAttribute('r') } };
  }
  function activeMark() {
    var svgs = root.querySelectorAll('.hero-mark-svg');
    for (var i = 0; i < svgs.length; i += 1) if (getComputedStyle(svgs[i]).display !== 'none') return readMark(svgs[i]);
    return null;
  }

  // cubic-bezier(.22, 1, .36, 1), the site-wide curve.
  function bezier(p1x, p1y, p2x, p2y) {
    function a(a1, a2) { return 1 - 3 * a2 + 3 * a1; }
    function b(a1, a2) { return 3 * a2 - 6 * a1; }
    function c(a1) { return 3 * a1; }
    function at(t, a1, a2) { return ((a(a1, a2) * t + b(a1, a2)) * t + c(a1)) * t; }
    function slope(t, a1, a2) { return 3 * a(a1, a2) * t * t + 2 * b(a1, a2) * t + c(a1); }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 8; i += 1) {
        var d = slope(t, p1x, p2x);
        if (Math.abs(d) < 1e-6) break;
        t -= (at(t, p1x, p2x) - x) / d;
      }
      t = Math.min(1, Math.max(0, t));
      return at(t, p1y, p2y);
    };
  }
  var ease = bezier(.22, 1, .36, 1);
  var inOut = bezier(.65, 0, .35, 1);
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function mix(a, b, t) { return a + (b - a) * t; }

  var canvas = null;
  var ctx = null;
  var frame = 0;
  var started = 0;
  var entranceDone = false;
  var lastKey = '';
  var geo = null;
  var mark = null;
  var resizeObserver = null;
  var list = null;
  var chainDot = null;
  // The question box. While the reader is writing, the mark answers: the
  // stroke drops back to a faint trace and darkens again, in writing order,
  // as far as the question has been written; the point turns solid once
  // there is anything to ask. null = not writing (the finished mark).
  var input = document.getElementById('askInputHero');
  var writing = null;
  var FULL = 48;        // a whole question, in Latin-letter widths

  function measure() {
    var hostBox = host.getBoundingClientRect();
    var markBox = root.getBoundingClientRect();
    var s = markBox.width / mark.cols;
    var g = {
      dpr: Math.min(2, window.devicePixelRatio || 1),
      s: s,
      gridR: .75,
      // Mark origin relative to <main>.
      mx: markBox.left - hostBox.left,
      my: markBox.top - hostBox.top,
      hostTop: hostBox.top + window.scrollY,
      fly: false,
    };
    var left = g.mx - s;
    var right = g.mx + markBox.width + s;
    var top = g.my - s;
    var bottom = g.my + markBox.height + s;
    // Phones and tablets: the question is absorbed while the mark itself
    // scrolls from the upper third of the view to off the top.
    var markTop = g.hostTop + g.my;
    g.start = Math.max(0, markTop - window.innerHeight * .35);
    g.end = Math.max(g.start + 160, markTop + markBox.height * .6);
    if (wide.matches && chainDot) {
      var box = chainDot.getBoundingClientRect();
      var stage = chainDot.closest('.qc-stage');
      var stageBox = stage ? stage.getBoundingClientRect() : box;
      var cx = box.left + box.width / 2 - hostBox.left;
      var cy = box.top + box.height / 2 - hostBox.top;
      if (cy > bottom) {
        g.fly = true;
        g.target = { x: cx, y: cy };
        // The lane: the empty column between the chain's intro and its
        // stage, so the point never passes over a line of text.
        var intro = document.querySelector('.home-chain .qc-intro');
        var introRight = intro ? intro.getBoundingClientRect().right - hostBox.left : stageBox.left - hostBox.left - 56;
        var stageLeft = stageBox.left - hostBox.left;
        g.lane = stageLeft - Math.max(12, Math.min(28, (stageLeft - introRight) / 2));
        g.stageTop = stageBox.top - hostBox.top;
        left = Math.min(left, g.lane - 24, cx - 24);
        bottom = Math.max(bottom, cy + 24);
        // The point is home when the chain's first node is at ~45% of the view.
        g.start = 0;
        g.end = Math.max(240, g.hostTop + cy - window.innerHeight * .45);
      }
    }
    g.left = Math.floor(Math.max(0, left));
    g.top = Math.floor(Math.max(0, top));
    g.width = Math.ceil(Math.min(host.clientWidth, right) - g.left);
    g.height = Math.ceil(bottom - g.top);
    return g;
  }

  function size() {
    mark = activeMark();
    if (!mark) return false;
    geo = measure();
    canvas.width = Math.round(geo.width * geo.dpr);
    canvas.height = Math.round(geo.height * geo.dpr);
    canvas.style.width = geo.width + 'px';
    canvas.style.height = geo.height + 'px';
    canvas.style.transform = 'translate(' + geo.left + 'px,' + geo.top + 'px)';
    lastKey = '';
    return true;
  }

  function progress() { return geo ? clamp((window.scrollY - geo.start) / (geo.end - geo.start)) : 0; }

  // The writing state only shapes the mark while it is still the mark,
  // not once the point has left for the chain.
  function f0(p) { return !geo.fly || p < .3; }

  function readWriting() {
    if (!input || (document.activeElement !== input && !input.value)) return null;
    var text = input.value.replace(/\s+/g, ' ').trim();
    // CJK characters count double: they carry about two Latin letters each.
    var width = 0;
    for (var i = 0; i < text.length; i += 1) width += /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(text[i]) ? 2 : 1;
    return { empty: !text, q: text ? Math.min(1, .04 + width / FULL) : 0 };
  }
  function onWrite() {
    var next = readWriting();
    var key = next ? (next.empty ? 'e' : next.q.toFixed(3)) : '';
    var prev = writing ? (writing.empty ? 'e' : writing.q.toFixed(3)) : '';
    writing = next;
    // Mirrored on the mark for styles and tests; the canvas is the picture.
    root.setAttribute('data-writing', !next ? 'idle' : next.empty ? 'empty' : next.q >= 1 ? 'full' : 'partial');
    if (key !== prev) { lastKey = ''; request(); }
  }

  function setPending(on) {
    if (!list) return;
    if (on) list.setAttribute('data-point-pending', '');
    else list.removeAttribute('data-point-pending');
  }

  function draw(now) {
    var g = geo;
    var s = g.s;
    var elapsed = started ? now - started : 0;
    if (!entranceDone && started && elapsed >= POINT_AT + POINT_DUR + 40) entranceDone = true;
    var p = progress();
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    ctx.clearRect(0, 0, g.width, g.height);
    ctx.translate(-g.left, -g.top);

    // 1 + 2. The stroke: written top to bottom, absorbed top to bottom.
    ctx.fillStyle = INK;
    var cells = mark.cells;
    for (var i = 0; i < cells.length; i += 1) {
      var c = cells[i];
      var write = entranceDone ? 1 : ease(clamp((elapsed - c.t * WRITE) / CELL));
      if (writing) write *= writing.q > 0 && c.t <= writing.q ? 1 : .22;
      var absorb = ease(clamp((p - c.t * .4) / .3));
      var amount = write * (1 - absorb);
      if (amount <= .01) continue;
      var r = mix(g.gridR, c.r * s, amount);
      ctx.globalAlpha = mix(.13, c.a, amount);
      ctx.beginPath();
      ctx.arc(g.mx + c.x * s, g.my + c.y * s, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. The point.
    var land = entranceDone ? 1 : ease(clamp((elapsed - POINT_AT) / POINT_DUR));
    var home = g.fly && p >= 1;
    if (land > 0 && !home) {
      var x0 = g.mx + mark.dot.x * s;
      var y0 = g.my + mark.dot.y * s;
      var r0 = mark.dot.r * s;
      var x = x0;
      var y = y0 - (1 - land) * s * .8;
      var r = r0 * mix(.4, 1, land);
      var alpha = land;
      if (g.fly) {
        var f = inOut(clamp((p - .3) / .7));
        if (f > 0) {
          // Measured every frame: the node may be scaled as the chain plays.
          var box = chainDot.getBoundingClientRect();
          var hostBox = host.getBoundingClientRect();
          var tx = box.left + box.width / 2 - hostBox.left;
          var ty = box.top + box.height / 2 - hostBox.top;
          // Two legs. First a cubic out of the hero into the lane, arriving
          // above the stage's top edge; then a rounded corner down the lane
          // and in to the node along its own row. The stage head and the
          // labels all sit right of the node, so neither leg crosses words.
          var sy = Math.min(g.stageTop - 20, ty - 60);
          var split = .62;
          if (f < split) {
            var a = f / split;
            var u = 1 - a;
            var q1y = mix(y0, sy, .45);
            var q2y = mix(y0, sy, .7);
            x = u * u * u * x0 + 3 * u * u * a * x0 + 3 * u * a * a * g.lane + a * a * a * g.lane;
            y = u * u * u * y0 + 3 * u * u * a * q1y + 3 * u * a * a * q2y + a * a * a * sy;
          } else {
            var b = (f - split) / (1 - split);
            var v = 1 - b;
            x = v * v * g.lane + 2 * v * b * g.lane + b * b * tx;
            y = v * v * sy + 2 * v * b * ty + b * b * ty;
          }
          r = mix(r0, box.width / 2, f);
        }
      }
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      if (writing && writing.empty && f0(p)) {
        // Nothing written yet: the point is only an outline, waiting.
        ctx.strokeStyle = POINT;
        ctx.globalAlpha = alpha * .35;
        ctx.lineWidth = 1.25;
        ctx.arc(x, y, r - .625, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = POINT;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    setPending(g.fly && !home);
  }

  function tick(now) {
    frame = 0;
    if (!canvas || document.hidden) return;
    if (!started) started = now;
    var animating = !entranceDone;
    var p = progress();
    var key = p.toFixed(4) + (g2key()) + (writing ? (writing.empty ? 'e' : writing.q.toFixed(3)) : '');
    if (animating || key !== lastKey) draw(now);
    lastKey = key;
    if (animating) request();
  }
  // While the point is in flight its target can move (the chain's node
  // grows when it becomes current), so the key includes the node's size.
  function g2key() { return geo && geo.fly && chainDot ? '|' + chainDot.getBoundingClientRect().width.toFixed(2) : ''; }
  function request() { if (!frame && canvas) frame = window.requestAnimationFrame(tick); }
  function onScroll() { request(); }
  function onVisibility() { if (!document.hidden) request(); }
  var resizeFrame = 0;
  function onResize() {
    if (!canvas || resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(function () {
      resizeFrame = 0;
      if (canvas && size()) request();
    });
  }

  function setup(withEntrance) {
    if (canvas) return;
    list = document.querySelector('.home-chain .qc-list');
    chainDot = list ? list.querySelector('.qc-step[data-qc-step="0"] .qc-dot') : null;
    canvas = document.createElement('canvas');
    canvas.className = 'hero-mark-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    ctx = canvas.getContext('2d');
    host.appendChild(canvas);
    if (!size()) { teardown(); return; }
    entranceDone = !withEntrance;
    started = 0;
    root.classList.add('is-live');
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    if (input) ['focus', 'blur', 'input'].forEach(function (type) { input.addEventListener(type, onWrite); });
    onWrite();
    if (wide.addEventListener) wide.addEventListener('change', onResize);
    if (window.ResizeObserver) {
      // Late fonts or the chain's own layout can move the target node.
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(hero);
      var chain = document.querySelector('.home-chain');
      if (chain) resizeObserver.observe(chain);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);
    request();
  }

  function teardown() {
    if (!canvas) return;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    if (input) ['focus', 'blur', 'input'].forEach(function (type) { input.removeEventListener(type, onWrite); });
    writing = null;
    root.removeAttribute('data-writing');
    if (wide.removeEventListener) wide.removeEventListener('change', onResize);
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    canvas.remove();
    canvas = ctx = null;
    setPending(false);
    root.classList.remove('is-live');
  }

  if (!reduced.matches) setup(true);
  var onMotionChange = function () { if (reduced.matches) teardown(); else setup(false); };
  if (reduced.addEventListener) reduced.addEventListener('change', onMotionChange);
  else if (reduced.addListener) reduced.addListener(onMotionChange);
}());
