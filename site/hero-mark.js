/* Home hero · the halftone question mark (round 10, "A1").
   Narrative: "Every understanding starts with a question; Socrates helps you
   turn the question mark into a period."
   The hero's dot field (CSS) stands for what the reader already knows. The
   inline SVG in .hero-mark is Geist's "?" sampled on that field: every cell
   carries its glyph coverage (data-k); the more of the glyph a cell holds,
   the larger and darker its dot. The point is a square block of the same
   dots (.hm-point). That SVG is what readers see without scripts or with
   reduced motion. With motion this script writes the same cells on a canvas:
     1. once, ~1s: cells grow out of the field's gray to their size and ink
        in stroke order (top of the hook to the end of the stem), then the
        point's block. Then everything is still (no idle loop at all);
     2. while the reader writes in the question box, the stroke is written
        as far as the question is, and the point's block is pale until there
        is something to ask;
     3. while the reader scrolls away, the stroke fades back into the field,
        top first, and the point's block gathers into one black dot the size
        of a question-chain node: the question condensed into where the
        conversation starts;
     4. on desktop that dot travels down (around the text) and becomes the
        first node of the question chain. The chain's own node is hidden
        until it arrives, so there is only ever one black dot. On phones and
        tablets the dot stays in the hero and the chain's node is simply there.
   The canvas (the mark) and the black dot (.hero-mark-dot) are absolutely
   positioned on <main> and pointer-transparent.
   Scroll only schedules a frame; drawing happens in rAF, only when the
   picture changed, and only the area drawn last time and this time is
   cleared (no full-canvas repaint). */
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

  var WRITE = 640;      // the last stroke cell starts growing at ~0.64s
  var CELL = 300;       // each cell takes 0.3s
  var POINT_AT = 760;   // then the point's block, row by row
  var POINT_ROW = 50;
  var POINT_DUR = 260;
  var INK = '#ffffff';
  var FIELD_R = .75;    // the CSS field's dot radius (px) and ink
  var FIELD_A = .13;
  var MAX_R = .36;      // largest halftone dot, in cells
  var GATHER = [.06, .26];   // scroll progress over which the point gathers
  var FLY_FROM = .3;

  function readCells(nodes, order) {
    return Array.prototype.map.call(nodes, function (c, i, all) {
      return { x: +c.getAttribute('cx'), y: +c.getAttribute('cy'), k: +c.getAttribute('data-k'), t: order ? i / Math.max(1, all.length - 1) : 0 };
    });
  }
  function readMark(svg) {
    var box = svg.viewBox.baseVal;
    var cells = readCells(svg.querySelectorAll('.hm-nodes circle'), true);
    var point = readCells(svg.querySelectorAll('.hm-point circle'), false);
    var top = Infinity;
    var bottom = -Infinity;
    var cx = 0;
    var cy = 0;
    var w = 0;
    point.forEach(function (c) { top = Math.min(top, c.y); bottom = Math.max(bottom, c.y); cx += c.x * c.k; cy += c.y * c.k; w += c.k; });
    point.forEach(function (c) { c.row = c.y - top; });
    return { cols: box.width, rows: box.height, cells: cells, point: point, rows0: bottom - top, pc: { x: cx / w, y: cy / w } };
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
  // A cell's finished look: radius in px and ink, from its glyph coverage.
  function radiusOf(k, s) { return mix(FIELD_R, MAX_R * s, Math.min(1, k * 1.15)); }
  function inkOf(k) { return mix(FIELD_A, 1, Math.min(1, k * 1.3)); }

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
  var dirty = null;     // the area painted last frame, in canvas CSS px
  var pointEl = null;
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
      mx: markBox.left - hostBox.left,
      my: markBox.top - hostBox.top,
      hostTop: hostBox.top + window.scrollY,
      fly: false,
      nodeR: chainDot ? chainDot.offsetWidth / 2 : 4.5,
    };
    g.cells = mark.cells.map(function (c) { return { x: g.mx + c.x * s, y: g.my + c.y * s, r: radiusOf(c.k, s), a: inkOf(c.k), t: c.t }; });
    g.point = mark.point.map(function (c) { return { x: g.mx + c.x * s, y: g.my + c.y * s, r: radiusOf(c.k, s), a: inkOf(c.k), row: c.row }; });
    g.pc = { x: g.mx + mark.pc.x * s, y: g.my + mark.pc.y * s };
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
        // The lane: the empty column between the chain's intro and its
        // stage, so the dot never passes over a line of text.
        var intro = document.querySelector('.home-chain .qc-intro');
        var introRight = intro ? intro.getBoundingClientRect().right - hostBox.left : stageBox.left - hostBox.left - 56;
        var stageLeft = stageBox.left - hostBox.left;
        g.lane = stageLeft - Math.max(12, Math.min(28, (stageLeft - introRight) / 2));
        g.stageTop = stageBox.top - hostBox.top;
        // The dot is home when the chain's first node is at ~45% of the view.
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
    dirty = null;
    return true;
  }

  function progress() { return geo ? clamp((window.scrollY - geo.start) / (geo.end - geo.start)) : 0; }

  function readWriting() {
    if (!input || (document.activeElement !== input && !input.value)) return null;
    var text = input.value.replace(/\s+/g, ' ').trim();
    // CJK characters count double: they carry about two Latin letters each.
    var width = 0;
    for (var i = 0; i < text.length; i += 1) width += /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(text[i]) ? 2 : 1;
    return { empty: !text, q: text ? Math.min(1, .04 + width / FULL) : 0 };
  }
  function writeKey(w) { return w ? (w.empty ? 'e' : w.q.toFixed(3)) : ''; }
  function onWrite() {
    var next = readWriting();
    var prev = writeKey(writing);
    writing = next;
    // Mirrored on the mark for styles and tests; the canvas is the picture.
    root.setAttribute('data-writing', !next ? 'idle' : next.empty ? 'empty' : next.q >= 1 ? 'full' : 'partial');
    if (writeKey(next) !== prev) { lastKey = ''; request(); }
  }

  function setPending(on) {
    if (!list) return;
    if (on) list.setAttribute('data-point-pending', '');
    else list.removeAttribute('data-point-pending');
  }

  // Bounds of what this frame paints, so the next frame clears only that.
  var bx0, by0, bx1, by1;
  function dot(x, y, r, alpha) {
    if (r <= 0 || alpha <= .004) return;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (x - r < bx0) bx0 = x - r;
    if (y - r < by0) by0 = y - r;
    if (x + r > bx1) bx1 = x + r;
    if (y + r > by1) by1 = y + r;
  }

  // The one black dot is a DOM element, moved with a transform: the canvas
  // then only has to cover the mark itself, not the whole way down to the
  // chain (a large, mostly empty canvas costs the compositor every frame).
  var DOT = 12;
  var lastDot = '';
  function placeDot(x, y, r, alpha) {
    var key = alpha > .004 ? x.toFixed(2) + ',' + y.toFixed(2) + ',' + r.toFixed(3) + ',' + alpha.toFixed(3) : '';
    if (key === lastDot) return;
    lastDot = key;
    if (!key) { pointEl.style.opacity = '0'; return; }
    pointEl.style.opacity = alpha >= .999 ? '1' : alpha.toFixed(3);
    pointEl.style.transform = 'translate(' + (x - DOT / 2).toFixed(2) + 'px,' + (y - DOT / 2).toFixed(2) + 'px) scale(' + (2 * r / DOT).toFixed(4) + ')';
  }

  function draw(now) {
    var g = geo;
    var elapsed = started ? now - started : 0;
    if (!entranceDone && started && elapsed >= POINT_AT + mark.rows0 * POINT_ROW + POINT_DUR + 40) entranceDone = true;
    var p = progress();
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    if (dirty) ctx.clearRect(dirty[0] - g.left - 2, dirty[1] - g.top - 2, dirty[2] - dirty[0] + 4, dirty[3] - dirty[1] + 4);
    else ctx.clearRect(0, 0, g.width, g.height);
    ctx.translate(-g.left, -g.top);
    bx0 = by0 = Infinity; bx1 = by1 = -Infinity;

    // 1-3. The stroke: written in stroke order, absorbed top first.
    ctx.fillStyle = INK;
    var cells = g.cells;
    for (var i = 0; i < cells.length; i += 1) {
      var c = cells[i];
      var m = entranceDone ? 1 : ease(clamp((elapsed - c.t * WRITE) / CELL));
      if (writing) m *= writing.q > 0 && c.t <= writing.q ? 1 : .22;
      m *= 1 - ease(clamp((p - c.t * .4) / .3));
      if (m <= .01) continue;
      dot(c.x, c.y, mix(FIELD_R, c.r, m), mix(FIELD_A, c.a, m));
    }

    // The point's block, then the one black dot it gathers into.
    var gather = inOut(clamp((p - GATHER[0]) / (GATHER[1] - GATHER[0])));
    var home = g.fly && p >= 1;
    var nodeR = g.nodeR;
    // Before the gather: the point's block is pale while the box is empty.
    var pale = writing && writing.empty && gather <= 0 ? .3 : 1;
    var merge = clamp((gather - .75) / .25);   // the block hands over to one dot
    if (merge < 1) {
      for (var j = 0; j < g.point.length; j += 1) {
        var q = g.point[j];
        var land = entranceDone ? 1 : ease(clamp((elapsed - POINT_AT - q.row * POINT_ROW) / POINT_DUR));
        if (land <= .01) continue;
        var mm = land * pale;
        var r = mix(FIELD_R, q.r, mm);
        var a = mix(FIELD_A, q.a, mm);
        dot(mix(q.x, g.pc.x, gather), mix(q.y, g.pc.y, gather), mix(r, nodeR * .7, gather), mix(a, 1, gather) * (1 - merge));
      }
    }
    if (merge > 0 && !home) {
      var x = g.pc.x;
      var y = g.pc.y;
      var rr = mix(nodeR * .7, nodeR, merge);
      if (g.fly) {
        var f = inOut(clamp((p - FLY_FROM) / (1 - FLY_FROM)));
        if (f > 0) {
          // Measured every frame: the node may be scaled as the chain plays.
          var box = chainDot.getBoundingClientRect();
          var hostBox = host.getBoundingClientRect();
          var tx = box.left + box.width / 2 - hostBox.left;
          var ty = box.top + box.height / 2 - hostBox.top;
          var x0 = g.pc.x;
          var y0 = g.pc.y;
          // Two legs. First a cubic out of the hero into the lane, arriving
          // above the stage's top edge; then a rounded corner down the lane
          // and in to the node along its own row. The stage head and the
          // labels all sit right of the node, so neither leg crosses words.
          var sy = Math.min(g.stageTop - 20, ty - 60);
          var split = .62;
          if (f < split) {
            var u = f / split;
            var v = 1 - u;
            var q1y = mix(y0, sy, .45);
            var q2y = mix(y0, sy, .7);
            x = v * v * v * x0 + 3 * v * v * u * x0 + 3 * v * u * u * g.lane + u * u * u * g.lane;
            y = v * v * v * y0 + 3 * v * v * u * q1y + 3 * v * u * u * q2y + u * u * u * sy;
          } else {
            var b = (f - split) / (1 - split);
            var w = 1 - b;
            x = w * w * g.lane + 2 * w * b * g.lane + b * b * tx;
            y = w * w * sy + 2 * w * b * ty + b * b * ty;
          }
          rr = mix(nodeR, box.width / 2, f);
        }
      }
      placeDot(x, y, rr, merge);
    } else placeDot(0, 0, 0, 0);
    ctx.globalAlpha = 1;
    dirty = bx1 > bx0 ? [bx0, by0, bx1, by1] : null;
    if (!dirty) dirty = [0, 0, 0, 0];
    setPending(g.fly && !home);
  }

  function tick(now) {
    frame = 0;
    if (!canvas || document.hidden) return;
    if (!started) started = now;
    var animating = !entranceDone;
    var p = progress();
    var key = p.toFixed(4) + g2key(p) + writeKey(writing);
    if (animating || key !== lastKey) draw(now);
    lastKey = key;
    if (animating) request();
  }
  // While the dot is in flight its target can move (the chain's node grows
  // when it becomes current), so the key includes the node's size then.
  function g2key(p) { return geo && geo.fly && chainDot && p > FLY_FROM && p < 1 ? '|' + chainDot.getBoundingClientRect().width.toFixed(2) : ''; }
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
    pointEl = document.createElement('span');
    pointEl.className = 'hero-mark-dot';
    pointEl.setAttribute('aria-hidden', 'true');
    host.appendChild(pointEl);
    lastDot = '';
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
    pointEl.remove();
    canvas = ctx = pointEl = null;
    setPending(false);
    root.classList.remove('is-live');
  }

  if (!reduced.matches) setup(true);
  var onMotionChange = function () { if (reduced.matches) teardown(); else setup(false); };
  if (reduced.addEventListener) reduced.addEventListener('change', onMotionChange);
  else if (reduced.addListener) reduced.addListener(onMotionChange);
}());
