/* Home hero · the network question mark.
   The inline SVG in .hero-mark is the finished mark: it is what readers see
   without scripts or with reduced motion, and it is the single source of the
   node positions drawn here. With motion this script draws the same nodes on
   a canvas laid over the hero:
     1. once, ~1.2s: scattered nodes gather into the question mark;
     2. then the nodes breathe by at most 2px (paused when the hero is off
        screen or the page is hidden);
     3. while the reader scrolls away, the mark unwinds into one vertical
        thread and the black point drops along it onto the first dot of the
        question chain below, a hand-off from the hero to the next section.
   The canvas is absolutely positioned and pointer-transparent, so it never
   moves layout or covers the question entry. Scroll only schedules a frame;
   all drawing happens in requestAnimationFrame. */
(function () {
  'use strict';
  var root = document.querySelector('[data-hero-mark]');
  if (!root || !window.requestAnimationFrame) return;
  var svg = root.querySelector('svg');
  var hero = root.closest('.home-hero');
  if (!svg || !hero) return;
  var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var probe = document.createElement('canvas');
  if (!probe.getContext || !probe.getContext('2d')) return;

  var VIEW_W = 400;
  var VIEW_H = 560;
  var ENTRANCE = 1200;

  var nodes = Array.prototype.map.call(svg.querySelectorAll('.hm-nodes circle'), function (circle) {
    return { x: +circle.getAttribute('cx'), y: +circle.getAttribute('cy'), r: +circle.getAttribute('r') };
  });
  var dotNode = svg.querySelector('.hm-dot');
  if (!nodes.length || !dotNode) return;
  var dot = { x: +dotNode.getAttribute('cx'), y: +dotNode.getAttribute('cy'), r: +dotNode.getAttribute('r') };
  var edges = (svg.getAttribute('data-edges') || '').split(/\s+/).map(function (pair) {
    return pair.split('-').map(Number);
  }).filter(function (pair) { return pair.length === 2 && nodes[pair[0]] && nodes[pair[1]]; });

  // Deterministic scatter and breathing phases, so every visit looks alike.
  var seed = 20261101;
  function random() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  nodes.forEach(function (node, i) {
    var angle = random() * Math.PI * 2;
    var distance = 90 + random() * 190;
    node.t = i / Math.max(1, nodes.length - 1); // order along the stroke
    node.sx = VIEW_W / 2 + Math.cos(angle) * distance * 1.15;
    node.sy = VIEW_H / 2 + Math.sin(angle) * distance * 1.1;
    node.phase = random() * Math.PI * 2;
    node.speed = .7 + random() * .6;
  });

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
  function clamp(value) { return value < 0 ? 0 : value > 1 ? 1 : value; }
  function mix(a, b, t) { return a + (b - a) * t; }

  var canvas = null;
  var ctx = null;
  var frame = 0;
  var started = 0;      // entrance start time, 0 until the page is visible
  var entranceDone = false;
  var heroVisible = true;
  var lastDraw = 0;
  var lastProgress = -1;
  var geo = null;
  var observer = null;
  var resizeObserver = null;

  function measure() {
    var heroBox = hero.getBoundingClientRect();
    var markBox = root.getBoundingClientRect();
    var inner = hero.querySelector('.home-hero-inner');
    var innerBottom = inner ? inner.getBoundingClientRect().bottom - heroBox.top : heroBox.height;
    var chainDot = document.querySelector('.home-chain .qc-dot');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var g = {
      dpr: dpr,
      width: hero.clientWidth,
      scale: markBox.height / VIEW_H,
      ox: markBox.left - heroBox.left,
      oy: markBox.top - heroBox.top,
      heroTop: heroBox.top + window.scrollY,
      chain: null,
    };
    g.height = Math.ceil(markBox.bottom - heroBox.top + 8);
    if (chainDot) {
      var box = chainDot.getBoundingClientRect();
      var cx = box.left + box.width / 2 - heroBox.left;
      var cy = box.top + box.height / 2 - heroBox.top;
      // The thread lives in the open space below the question entry and
      // ends on the chain's first dot, so it never crosses the hero's words.
      var top = Math.max(innerBottom, g.oy + markBox.height * .5) + 28;
      if (cy > top + 40) {
        g.chain = { x: cx, y: cy, r: box.width / 2, top: top };
        g.height = Math.ceil(Math.max(g.height, cy + box.height));
      }
    }
    return g;
  }

  function size() {
    geo = measure();
    canvas.width = Math.round(geo.width * geo.dpr);
    canvas.height = Math.round(geo.height * geo.dpr);
    canvas.style.width = geo.width + 'px';
    canvas.style.height = geo.height + 'px';
    lastProgress = -1;
  }

  function scrollProgress() {
    if (!geo || !geo.chain) return 0;
    var dotY = geo.heroTop + geo.chain.y;
    var end = Math.max(240, dotY - window.innerHeight * .45);
    return clamp(window.scrollY / end);
  }

  function draw(now) {
    var g = geo;
    var s = g.scale;
    var elapsed = started ? now - started : 0;
    if (!entranceDone && started && elapsed >= ENTRANCE + 80) entranceDone = true;
    var progress = scrollProgress();
    var breathing = entranceDone && progress < 1;
    var time = now / 1000;
    var line = g.chain;

    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    ctx.clearRect(0, 0, g.width, g.height);

    var points = new Array(nodes.length);
    var alphas = new Array(nodes.length);
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var gather = entranceDone ? 1 : ease(clamp((elapsed - node.t * 250) / 950));
      var x = mix(node.sx, node.x, gather) * s + g.ox;
      var y = mix(node.sy, node.y, gather) * s + g.oy;
      if (breathing) {
        // At most 1.6px: the network is alive, never wobbling.
        var lift = (1 - progress) * gather;
        x += Math.sin(time * node.speed + node.phase) * 1.6 * lift;
        y += Math.cos(time * node.speed * .8 + node.phase) * 1.6 * lift;
      }
      if (line && progress > 0) {
        // The stem end leaves first, the hook's tip last.
        var unwind = ease(clamp(progress * 1.5 - (1 - node.t) * .5));
        x = mix(x, line.x, unwind);
        y = mix(y, mix(line.top, line.y - line.r - 10, node.t), unwind);
      }
      points[i] = [x, y];
      alphas[i] = started || entranceDone ? .15 + .85 * gather : 0;
    }

    // Hairlines first, then nodes, then the point.
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#e2e2e2';
    for (var e = 0; e < edges.length; e += 1) {
      var a = edges[e][0];
      var b = edges[e][1];
      var alpha = Math.min(alphas[a], alphas[b]);
      if (alpha <= .02) continue;
      ctx.globalAlpha = alpha * alpha;
      ctx.beginPath();
      ctx.moveTo(points[a][0], points[a][1]);
      ctx.lineTo(points[b][0], points[b][1]);
      ctx.stroke();
    }
    if (line && progress > 0) {
      ctx.globalAlpha = clamp(progress * 1.4);
      ctx.strokeStyle = '#cdcdcd';
      ctx.beginPath();
      ctx.moveTo(line.x, line.top);
      ctx.lineTo(line.x, line.y);
      ctx.stroke();
    }
    ctx.fillStyle = '#c2c2c2';
    for (var n = 0; n < nodes.length; n += 1) {
      if (alphas[n] <= .02) continue;
      ctx.globalAlpha = alphas[n];
      ctx.beginPath();
      ctx.arc(points[n][0], points[n][1], Math.max(.5, nodes[n].r * Math.max(s, .55) * (line && progress > 0 ? 1 - progress * .7 : 1)), 0, Math.PI * 2);
      ctx.fill();
    }

    var dotIn = entranceDone ? 1 : ease(clamp((elapsed - 650) / 550));
    if (dotIn > 0) {
      var dx = dot.x * s + g.ox;
      var dy = dot.y * s + g.oy - (1 - dotIn) * 28 * s;
      var dr = Math.max(dot.r * s, 4) * dotIn;
      if (line && progress > 0) {
        var fall = ease(clamp(progress * 1.2));
        dx = mix(dx, line.x, fall);
        dy = mix(dy, line.y, fall);
        dr = mix(dr, line.r + .5, fall);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0d0d0d';
      ctx.beginPath();
      ctx.arc(dx, dy, dr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    lastProgress = progress;
    lastDraw = now;
  }

  function wantsBreath() { return entranceDone && heroVisible && !document.hidden && scrollProgress() < 1; }

  function tick(now) {
    frame = 0;
    if (!canvas) return;
    if (!started && !document.hidden) started = now;
    var animating = started && !entranceDone;
    var progress = scrollProgress();
    // Breathing runs at ~30fps; the entrance and scroll at the display rate.
    if (animating || progress !== lastProgress || now - lastDraw > 32) draw(now);
    if (animating || wantsBreath()) request();
  }
  function request() { if (!frame && canvas) frame = window.requestAnimationFrame(tick); }
  function onScroll() { request(); }
  function onVisibility() { if (!document.hidden) request(); }
  function onResize() { if (canvas) { size(); request(); } }

  function setup(withEntrance) {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'hero-mark-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    ctx = canvas.getContext('2d');
    hero.appendChild(canvas);
    size();
    entranceDone = !withEntrance;
    started = withEntrance ? 0 : 1;
    root.classList.add('is-live');
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    if (window.IntersectionObserver) {
      observer = new IntersectionObserver(function (entries) {
        heroVisible = entries[entries.length - 1].isIntersecting;
        if (heroVisible) request();
      });
      observer.observe(hero);
    }
    if (window.ResizeObserver) {
      // Late fonts or the chain's own layout can move the target dot.
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
    if (observer) observer.disconnect();
    if (resizeObserver) resizeObserver.disconnect();
    observer = resizeObserver = null;
    canvas.remove();
    canvas = ctx = null;
    root.classList.remove('is-live');
  }

  if (!reduced.matches) setup(true);
  var onMotionChange = function () { if (reduced.matches) teardown(); else setup(false); };
  if (reduced.addEventListener) reduced.addEventListener('change', onMotionChange);
  else if (reduced.addListener) reduced.addListener(onMotionChange);
}());
