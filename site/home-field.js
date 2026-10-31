/* Hero artwork: "a question becomes a web of ideas".
   Ink filaments grow out of the question box, branch into concepts, and
   then distant branches are joined one link at a time; the link worth
   keeping is drawn in the vermilion accent. Canvas 2D, no dependencies.

   - Deterministic (seeded) so every visit and the reduced-motion still frame
     show the same composition.
   - Text stays readable: everything under the title, lede, question box and
     starters is drawn at 10% strength, and the edges fade into the paper.
   - Runs only while the hero is on screen and the tab is visible; reduced
     motion draws the finished frame once and never starts a loop.
   - The canvas never takes pointer events and sits under the question box. */
(function () {
  'use strict';
  var field = document.querySelector('[data-hero-field]');
  if (!field) return;
  var canvas = field.querySelector('canvas');
  var section = field.closest('.home-hero');
  if (!canvas || !section || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var INK = '25, 24, 20';
  var ACCENT = '168, 64, 31';

  // The site's one curve, cubic-bezier(.22, 1, .36, 1), solved for y(x).
  function bezier(x1, y1, x2, y2) {
    var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    return function (t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      var u = t;
      for (var i = 0; i < 8; i += 1) {
        var x = ((ax * u + bx) * u + cx) * u - t;
        var d = (3 * ax * u + 2 * bx) * u + cx;
        if (Math.abs(x) < 1e-5 || Math.abs(d) < 1e-6) break;
        u -= x / d;
      }
      u = Math.min(1, Math.max(0, u));
      return ((ay * u + by) * u + cy) * u;
    };
  }
  var ease = bezier(.22, 1, .36, 1);
  function clamp(value) { return value < 0 ? 0 : value > 1 ? 1 : value; }
  function random(seed) {
    return function () {
      seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var width = 0;
  var height = 0;
  var graph = null;
  var holes = [];

  function localRect(element, pad) {
    if (!element) return null;
    var box = element.getBoundingClientRect();
    var base = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    return { x1: box.left - base.left - pad, y1: box.top - base.top - pad, x2: box.right - base.left + pad, y2: box.bottom - base.top + pad };
  }

  // 0.1 inside any text area, rising to 1 over 96px; edges fade to 0.
  function strength(x, y) {
    var nearest = Infinity;
    for (var i = 0; i < holes.length; i += 1) {
      var r = holes[i];
      var dx = Math.max(r.x1 - x, 0, x - r.x2);
      var dy = Math.max(r.y1 - y, 0, y - r.y2);
      nearest = Math.min(nearest, Math.sqrt(dx * dx + dy * dy));
    }
    var text = nearest === Infinity ? 1 : .1 + .9 * smooth(clamp(nearest / (width < 760 ? 40 : 96)));
    var side = width < 760 ? 24 : 96;
    var edge = Math.min(clamp(x / side), clamp((width - x) / side), clamp(y / 48), clamp((height - y) / (width < 760 ? 48 : 96)));
    return text * smooth(edge);
  }
  function smooth(t) { return t * t * (3 - 2 * t); }

  function build() {
    var rand = random(20260607);
    var compact = width < 760;
    var scale = compact ? .82 : 1;
    var source = localRect(section.querySelector('.ask-box'), 0);
    holes = [
      localRect(section.querySelector('h1'), 16),
      localRect(section.querySelector('.home-hero-lede'), 12),
      localRect(section.querySelector('.ask-box'), 8),
      localRect(section.querySelector('.ask-suggestions'), 8)
    ].filter(Boolean);
    var origin = source
      ? { x: (source.x1 + source.x2) / 2, y: (source.y1 + source.y2) / 2, hw: (source.x2 - source.x1) / 2, hh: (source.y2 - source.y1) / 2 }
      : { x: width / 2, y: height * .6, hw: 40, hh: 40 };

    var segments = [];
    var nodes = [];
    var branches = [];
    var grid = {};
    var maxSegments = compact ? 170 : 340;
    // A point may not land within ~16px of a point laid by another path.
    var owner = 0;
    var ownerCount = 0;
    function cell(x, y) { return Math.floor(x / 16) + ':' + Math.floor(y / 16); }
    function mark(x, y) { grid[cell(x, y)] = owner; }
    function crowded(x, y) {
      var cx = Math.floor(x / 16), cy = Math.floor(y / 16);
      for (var i = -1; i <= 1; i += 1) for (var j = -1; j <= 1; j += 1) {
        var taken = grid[(cx + i) + ':' + (cy + j)];
        if (taken !== undefined && taken !== owner) return true;
      }
      return false;
    }
    function addNode(x, y, t0, depth, hub, branch) {
      mark(x, y);
      var node = { x: x, y: y, t0: t0, depth: depth, hub: hub, branch: branch, r: hub ? 3 + rand() * 1.5 : 1.5 + rand() * 1.1, phase: rand() * Math.PI * 2, s: strength(x, y), flash: -1, keep: false, lit: false };
      nodes.push(node);
      return node;
    }

    function grow(x, y, angle, depth, t0, branchId, budget, path) {
      var curl = (rand() - .5) * .12;
      var speed = (compact ? 120 : 160) * (1 - depth * .14);
      for (var step = 0; step < budget && segments.length < maxSegments; step += 1) {
        var length = (24 + rand() * 24) * scale * (1 - depth * .12);
        curl += (rand() - .5) * .08;
        angle += curl + (rand() - .5) * .34;
        var nx = x + Math.cos(angle) * length;
        var ny = y + Math.sin(angle) * length;
        if (nx < -24 || nx > width + 24 || ny < -24 || ny > height + 24) break;
        if (step > 0 && crowded(nx, ny)) break;
        var bend = (rand() - .5) * length * .5;
        var mx = (x + nx) / 2 - Math.sin(angle) * bend;
        var my = (y + ny) / 2 + Math.cos(angle) * bend;
        var duration = length / speed;
        var segment = { x1: x, y1: y, cx: mx, cy: my, x2: nx, y2: ny, t0: t0, d: duration, depth: depth, s: strength(mx, my), w: Math.max(.6, 1.35 - depth * .28) };
        segments.push(segment);
        path.push(segment);
        t0 += duration;
        var last = step === budget - 1;
        var fork = depth < 3 && step > 0 && rand() < (depth === 0 ? .4 : .26);
        if (fork || last || rand() < .3) addNode(nx, ny, t0, depth, fork && depth < 2, branchId);
        else mark(nx, ny);
        if (fork) {
          var side = rand() < .5 ? -1 : 1;
          var child = [];
          var parentOwner = owner;
          owner = ++ownerCount;
          grow(nx, ny, angle + side * (.5 + rand() * .6), depth + 1, t0, branchId, 3 + Math.floor(rand() * (5 - depth)), child);
          owner = parentOwner;
          if (child.length > 2) branches.push(child);
        }
        x = nx; y = ny;
      }
    }

    // Fans that leave the question box mostly sideways, a few up and down.
    var fans = compact
      ? [205, 160, 180, 20, -25, 0, 112, 68, 95]
      : [180, 200, 160, 145, 215, 0, -20, 20, 35, -35, 100, 80, 250, 290];
    fans.forEach(function (degrees, i) {
      var angle = (degrees + (rand() - .5) * 14) * Math.PI / 180;
      var cos = Math.cos(angle), sin = Math.sin(angle);
      var reach = Math.min(Math.abs(cos) > 1e-3 ? origin.hw / Math.abs(cos) : Infinity, Math.abs(sin) > 1e-3 ? origin.hh / Math.abs(sin) : Infinity);
      var sx = origin.x + cos * reach * (.86 + rand() * .1);
      var sy = origin.y + sin * reach * (.86 + rand() * .1);
      var path = [];
      owner = ++ownerCount;
      grow(sx, sy, angle, 0, .2 + i * .09, i, 11 + Math.floor(rand() * 7), path);
      if (path.length > 2) branches.push(path);
    });

    var growthEnd = segments.reduce(function (end, s) { return Math.max(end, s.t0 + s.d); }, 0);

    // Cross links: join visible ideas from different branches.
    var candidates = [];
    var visible = nodes.filter(function (node) { return node.s > .55; });
    for (var i = 0; i < visible.length; i += 1) {
      for (var j = i + 1; j < visible.length; j += 1) {
        var a = visible[i], b = visible[j];
        if (a.branch === b.branch) continue;
        var distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance > 56 * scale && distance < 190 * scale) candidates.push([a, b, distance, rand()]);
      }
    }
    candidates.sort(function (p, q) { return p[3] - q[3]; });
    var links = [];
    var used = new Set();
    var wanted = compact ? 7 : 14;
    candidates.forEach(function (pair) {
      if (links.length >= wanted || used.has(pair[0]) || used.has(pair[1])) return;
      used.add(pair[0]); used.add(pair[1]);
      var a = pair[0], b = pair[1];
      var bend = (rand() < .5 ? -1 : 1) * pair[2] * .18;
      var nx = -(b.y - a.y) / pair[2], ny = (b.x - a.x) / pair[2];
      links.push({ a: a, b: b, cx: (a.x + b.x) / 2 + nx * bend, cy: (a.y + b.y) / 2 + ny * bend, t0: growthEnd * .7 + links.length * .5, d: 1.1, keep: false, length: pair[2] });
    });
    // The connection to keep: the longest link, drawn in the accent.
    var keep = links.reduce(function (best, link) { return !best || link.length > best.length ? link : best; }, null);
    if (keep) { keep.keep = true; keep.a.keep = true; keep.b.keep = true; }
    // After a resize, links that had already formed stay formed, without a replay.
    links.forEach(function (link) { if (clock >= link.t0 + link.d) { link.done = true; link.a.lit = true; link.b.lit = true; } });
    var end = links.reduce(function (latest, link) { return Math.max(latest, link.t0 + link.d); }, growthEnd) + .6;
    return { segments: segments, nodes: nodes, links: links, branches: branches, end: end, pulses: [], nextPulse: end };
  }

  // Pointer parallax and a slow breath; deeper ideas move a little more.
  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  function offset(x, y, depth, time, still) {
    if (still) return [x, y];
    var k = 2 + depth * 2.5;
    var wave = Math.sin(time * .5 + x * .011 + y * .013) * 1.1;
    return [x + pointer.x * k + wave, y + pointer.y * k + Math.cos(time * .42 + x * .009) * 1.1];
  }

  function draw(time, still) {
    ctx.clearRect(0, 0, width, height);
    if (!graph) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var i, s, p;
    for (i = 0; i < graph.segments.length; i += 1) {
      s = graph.segments[i];
      p = clamp((time - s.t0) / s.d);
      if (p <= 0 || s.s < .02) continue;
      var a = offset(s.x1, s.y1, s.depth, time, still);
      var c = offset(s.cx, s.cy, s.depth, time, still);
      var b = offset(s.x2, s.y2, s.depth, time, still);
      // de Casteljau split so a segment grows along its own curve.
      var q1x = a[0] + (c[0] - a[0]) * p, q1y = a[1] + (c[1] - a[1]) * p;
      var q2x = c[0] + (b[0] - c[0]) * p, q2y = c[1] + (b[1] - c[1]) * p;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(q1x, q1y, q1x + (q2x - q1x) * p, q1y + (q2y - q1y) * p);
      ctx.strokeStyle = 'rgba(' + INK + ',' + (.42 * (1 - s.depth * .12) * s.s).toFixed(3) + ')';
      ctx.lineWidth = s.w;
      ctx.stroke();
    }
    for (i = 0; i < graph.links.length; i += 1) {
      var link = graph.links[i];
      p = ease(clamp((time - link.t0) / link.d));
      if (p <= 0) continue;
      var la = offset(link.a.x, link.a.y, link.a.depth, time, still);
      var lb = offset(link.b.x, link.b.y, link.b.depth, time, still);
      var lc = offset(link.cx, link.cy, 1, time, still);
      var m1x = la[0] + (lc[0] - la[0]) * p, m1y = la[1] + (lc[1] - la[1]) * p;
      var m2x = lc[0] + (lb[0] - lc[0]) * p, m2y = lc[1] + (lb[1] - lc[1]) * p;
      ctx.beginPath();
      ctx.moveTo(la[0], la[1]);
      ctx.quadraticCurveTo(m1x, m1y, m1x + (m2x - m1x) * p, m1y + (m2y - m1y) * p);
      if (link.keep) {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(' + ACCENT + ', .85)';
        ctx.lineWidth = 1.4;
      } else {
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = 'rgba(' + INK + ', .34)';
        ctx.lineWidth = .9;
      }
      ctx.stroke();
      if (!still && p >= 1 && !link.done) {
        link.done = true;
        link.a.flash = time; link.b.flash = time;
        link.a.lit = true; link.b.lit = true;
        graph.pulses.push({ link: link, t0: time, d: 1.4 });
      }
    }
    ctx.setLineDash([]);
    for (i = 0; i < graph.nodes.length; i += 1) {
      var node = graph.nodes[i];
      p = ease(clamp((time - node.t0) / .7));
      if (p <= 0 || node.s < .02) continue;
      var n = offset(node.x, node.y, node.depth, time, still);
      var glow = node.flash >= 0 ? 1 - clamp((time - node.flash) / 1.6) : 0;
      var accent = node.keep && (still || node.lit) ? 1 : glow;
      ctx.beginPath();
      ctx.arc(n[0], n[1], node.r * p * (1 + glow * .5), 0, Math.PI * 2);
      ctx.fillStyle = accent > .01
        ? 'rgba(' + ACCENT + ',' + ((.6 + .3 * accent) * node.s).toFixed(3) + ')'
        : 'rgba(' + INK + ',' + (.7 * node.s).toFixed(3) + ')';
      ctx.fill();
      if (node.hub || node.keep) {
        ctx.beginPath();
        ctx.arc(n[0], n[1], node.r * 2.6 * p, 0, Math.PI * 2);
        ctx.strokeStyle = node.keep && accent > .01 ? 'rgba(' + ACCENT + ',' + (.4 * node.s).toFixed(3) + ')' : 'rgba(' + INK + ',' + (.2 * node.s).toFixed(3) + ')';
        ctx.lineWidth = .8;
        ctx.stroke();
      }
    }
    if (still) return;
    // Thoughts travelling: a dot runs along a link or out along a branch.
    if (time > graph.nextPulse && graph.branches.length) {
      var branch = graph.branches[Math.floor((time * 977) % graph.branches.length)];
      graph.pulses.push({ path: branch, t0: time, d: Math.min(3.2, branch.length * .28) });
      graph.nextPulse = time + 1.3;
    }
    graph.pulses = graph.pulses.filter(function (pulse) { return time - pulse.t0 < pulse.d; });
    graph.pulses.forEach(function (pulse) {
      var k = (time - pulse.t0) / pulse.d;
      var fade = Math.sin(Math.PI * k);
      for (var trail = 0; trail < 4; trail += 1) {
        var u = clamp(ease(clamp(k)) - trail * .02);
        var point = pulse.link ? along(pulse.link.a, pulse.link, pulse.link.b, u) : alongPath(pulse.path, u);
        if (!point) continue;
        var depth = pulse.link ? 1 : pulse.path[0].depth;
        var o = offset(point[0], point[1], depth, time, still);
        var st = strength(point[0], point[1]);
        ctx.beginPath();
        ctx.arc(o[0], o[1], 2.2 - trail * .4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + (pulse.link ? ACCENT : INK) + ',' + ((pulse.link ? .9 : .6) * fade * st * (1 - trail * .24)).toFixed(3) + ')';
        ctx.fill();
      }
    });
  }
  function along(a, c, b, u) {
    var x1 = a.x + (c.cx - a.x) * u, y1 = a.y + (c.cy - a.y) * u;
    var x2 = c.cx + (b.x - c.cx) * u, y2 = c.cy + (b.y - c.cy) * u;
    return [x1 + (x2 - x1) * u, y1 + (y2 - y1) * u];
  }
  function alongPath(path, u) {
    var index = Math.min(path.length - 1, Math.floor(u * path.length));
    var local = u * path.length - index;
    var s = path[index];
    return along({ x: s.x1, y: s.y1 }, s, { x: s.x2, y: s.y2 }, local);
  }

  function resize() {
    var box = field.getBoundingClientRect();
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.round(box.width));
    height = Math.max(1, Math.round(box.height));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    graph = build();
    field.setAttribute('data-hero-field-ready', '');
    if (reduced.matches || !running) draw(reduced.matches ? graph.end : clock, reduced.matches);
  }

  var clock = 0;
  var last = 0;
  var frame = 0;
  var running = false;
  var onScreen = true;
  var shift = -1;
  function tick(now) {
    frame = 0;
    if (!running) return;
    var delta = last ? Math.min(.05, (now - last) / 1000) : 0;
    last = now;
    clock += delta;
    pointer.x += (pointer.tx - pointer.x) * .06;
    pointer.y += (pointer.ty - pointer.y) * .06;
    // Scroll: the field drifts up more slowly than the page and fades out.
    var box = section.getBoundingClientRect();
    var progress = clamp(-box.top / Math.max(1, box.height));
    if (Math.abs(progress - shift) > .001) {
      shift = progress;
      field.style.transform = 'translate3d(0,' + (progress * box.height * .2).toFixed(1) + 'px,0)';
      field.style.opacity = String(1 - progress * .8);
    }
    draw(clock, false);
    frame = window.requestAnimationFrame(tick);
  }
  function update() {
    var should = !reduced.matches && onScreen && document.visibilityState !== 'hidden';
    if (should === running) return;
    running = should;
    if (running) {
      last = 0;
      frame = window.requestAnimationFrame(tick);
    } else {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (reduced.matches) {
        field.style.transform = '';
        field.style.opacity = '';
        draw(graph ? graph.end : 0, true);
      }
    }
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[entries.length - 1].isIntersecting;
      update();
    }).observe(section);
  }
  document.addEventListener('visibilitychange', update);
  reduced.addEventListener('change', function () { resize(); update(); });
  section.addEventListener('pointermove', function (event) {
    if (!finePointer.matches) return;
    pointer.tx = (event.clientX / window.innerWidth - .5) * 2;
    pointer.ty = (event.clientY / window.innerHeight - .5) * 2;
  }, { passive: true });
  section.addEventListener('pointerleave', function () { pointer.tx = 0; pointer.ty = 0; });
  if ('ResizeObserver' in window) {
    var pending = 0;
    new ResizeObserver(function () {
      if (pending) return;
      pending = window.requestAnimationFrame(function () { pending = 0; resize(); });
    }).observe(section);
  } else {
    window.addEventListener('resize', resize, { passive: true });
  }
  resize();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
  update();
}());
