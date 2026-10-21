(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var finePointer = !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches);
  var isChinese = (root.lang || '').toLowerCase().indexOf('zh') === 0;

  /* ------------------------------------------------------------------------
     Sticky header state
     ------------------------------------------------------------------------ */

  var header = doc.querySelector('.home-site-header');
  if (header) {
    var scrollTicking = false;

    var syncHeader = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
      scrollTicking = false;
    };

    window.addEventListener('scroll', function () {
      if (scrollTicking) return;
      scrollTicking = true;
      window.requestAnimationFrame(syncHeader);
    }, { passive: true });

    syncHeader();
  }

  /* ------------------------------------------------------------------------
     Question composer
     ------------------------------------------------------------------------ */

  var form = doc.querySelector('[data-ask-form]');
  var input = doc.getElementById('askInput');
  var placeholder = doc.querySelector('[data-ask-placeholder]');
  var chips = doc.querySelectorAll('[data-ask-chip]');

  var phrases = isChinese
    ? [
        '为什么重试掩码能让失败的请求最终通过？',
        '解释特征向量——但先问问我已知道什么。',
        '考考我三羧酸循环。',
        '我对贝叶斯定理的理解哪里错了？'
      ]
    : [
        'Why does a retry mask help a failed request get through?',
        'Explain eigenvectors — but ask me what I already know first.',
        'Quiz me on the Krebs cycle.',
        'What did I misunderstand about Bayes\u2019 theorem?'
      ];

  if (form && input) {
    var phraseIndex = 0;
    var phraseTimer = 0;

    var syncComposer = function () {
      var hasValue = input.value.trim().length > 0;
      form.classList.toggle('has-value', hasValue);
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    };

    var showPhrase = function (nextIndex) {
      if (!placeholder || reduceMotion) return;
      phraseIndex = nextIndex % phrases.length;
      placeholder.classList.add('is-fading');
      window.setTimeout(function () {
        placeholder.textContent = phrases[phraseIndex];
        placeholder.classList.remove('is-fading');
      }, 220);
    };

    var startPhraseLoop = function () {
      if (!placeholder || reduceMotion) return;
      phraseTimer = window.setInterval(function () {
        if (doc.activeElement === input || input.value.trim() || doc.hidden) return;
        showPhrase(phraseIndex + 1);
      }, 5200);
    };

    input.addEventListener('input', syncComposer);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (form.requestSubmit) form.requestSubmit();
        else form.submit();
      }
    });

    Array.prototype.forEach.call(chips, function (chip) {
      chip.addEventListener('click', function () {
        var question = chip.getAttribute('data-question') || '';
        input.value = question;
        syncComposer();
        input.focus();
        input.setSelectionRange(question.length, question.length);
        if (placeholder) placeholder.classList.add('is-fading');
        window.clearInterval(phraseTimer);
      });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var target = form.getAttribute('action') || 'https://app.topodrive.top';
      var question = input.value.trim();
      if (question) {
        target += (target.indexOf('?') === -1 ? '?' : '&') + 'q=' + encodeURIComponent(question);
      }
      window.location.href = target;
    });

    syncComposer();
    startPhraseLoop();
  }

  /* ------------------------------------------------------------------------
     Hero particle field
     ------------------------------------------------------------------------ */

  var canvas = doc.querySelector('[data-particles]');
  if (canvas && canvas.getContext && !reduceMotion) {
    var ctx = canvas.getContext('2d');
    var host = canvas.parentNode;
    var width = 0;
    var height = 0;
    var dpr = 1;
    var particles = [];
    var raf = 0;
    var running = false;
    var inView = true;
    var lastTime = 0;
    var resizeTimer = 0;

    var pointer = {
      x: -9999,
      y: -9999,
      tx: -9999,
      ty: -9999,
      active: false
    };

    var palette = [
      [24, 28, 38],
      [86, 102, 240],
      [18, 158, 148],
      [238, 116, 86],
      [150, 88, 228]
    ];

    var randomBetween = function (min, max) {
      return min + Math.random() * (max - min);
    };

    var buildParticles = function () {
      var count = width < 680 ? 42 : Math.min(130, Math.round((width * height) / 9800));
      particles = [];

      for (var i = 0; i < count; i++) {
        var color = palette[Math.random() < 0.78 ? 0 : 1 + Math.floor(Math.random() * (palette.length - 1))];
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: randomBetween(-0.14, 0.14),
          vy: randomBetween(-0.12, 0.12),
          radius: randomBetween(0.5, 1.7),
          alpha: randomBetween(0.07, 0.24),
          color: color,
          phase: Math.random() * Math.PI * 2,
          depth: randomBetween(0.35, 1)
        });
      }
    };

    var resizeCanvas = function () {
      var rect = host.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildParticles();

      if (!running) draw(performance.now());
    };

    var draw = function (time) {
      ctx.clearRect(0, 0, width, height);

      pointer.x += (pointer.tx - pointer.x) * 0.12;
      pointer.y += (pointer.ty - pointer.y) * 0.12;

      if (pointer.active) {
        var halo = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 270);
        halo.addColorStop(0, 'rgba(116, 132, 255, 0.06)');
        halo.addColorStop(0.42, 'rgba(255, 168, 132, 0.03)');
        halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(pointer.x - 270, pointer.y - 270, 540, 540);
      }

      var i;
      var p;
      var dx;
      var dy;
      var distance;
      var force;

      for (i = 0; i < particles.length; i++) {
        p = particles[i];

        p.x += p.vx + Math.sin(time * 0.00034 + p.phase) * 0.055;
        p.y += p.vy + Math.cos(time * 0.00028 + p.phase) * 0.045;

        if (pointer.active) {
          dx = pointer.x - p.x;
          dy = pointer.y - p.y;
          distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 230 && distance > 0.001) {
            force = (1 - distance / 230) * 0.05 * p.depth;
            p.vx += (dx / distance) * force;
            p.vy += (dy / distance) * force;
          }
        }

        p.vx *= 0.988;
        p.vy *= 0.988;

        var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > 0.75) {
          p.vx = (p.vx / speed) * 0.75;
          p.vy = (p.vy / speed) * 0.75;
        }

        if (p.x < -12) p.x = width + 12;
        else if (p.x > width + 12) p.x = -12;
        if (p.y < -12) p.y = height + 12;
        else if (p.y > height + 12) p.y = -12;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + p.color[0] + ',' + p.color[1] + ',' + p.color[2] + ',' + p.alpha + ')';
        ctx.fill();
      }

      ctx.lineWidth = 1;
      for (i = 0; i < particles.length; i += 2) {
        p = particles[i];
        for (var j = i + 2; j < particles.length; j += 2) {
          var other = particles[j];
          dx = p.x - other.x;
          dy = p.y - other.y;
          distance = dx * dx + dy * dy;

          if (distance < 11800) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(other.x, other.y);
            ctx.strokeStyle = 'rgba(42, 46, 72, ' + (0.022 * (1 - distance / 11800)) + ')';
            ctx.stroke();
          }
        }
      }
    };

    var frame = function (time) {
      if (!running) return;
      if (time - lastTime > 12) {
        draw(time);
        lastTime = time;
      }
      raf = window.requestAnimationFrame(frame);
    };

    var start = function () {
      if (running || !inView || doc.hidden) return;
      running = true;
      lastTime = performance.now();
      raf = window.requestAnimationFrame(frame);
    };

    var stop = function () {
      running = false;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    };

    var onPointerMove = function (event) {
      var rect = host.getBoundingClientRect();
      pointer.tx = event.clientX - rect.left;
      pointer.ty = event.clientY - rect.top;
      if (!pointer.active) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
      }
      pointer.active = true;
    };

    var onPointerLeave = function () {
      pointer.active = false;
      pointer.tx = -9999;
      pointer.ty = -9999;
    };

    if (finePointer) {
      host.addEventListener('pointermove', onPointerMove, { passive: true });
      host.addEventListener('pointerleave', onPointerLeave);
    }

    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) stop();
      else start();
    });

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) start();
        else stop();
      }, { rootMargin: '120px 0px' });
      observer.observe(host);
    }

    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resizeCanvas, 160);
    });

    resizeCanvas();
    start();
  }

  /* ------------------------------------------------------------------------
     Aurora art fields

     Layered radial gradients after OpenAI's 2020–2022 artwork: a bright
     saturated base, then several soft elliptical fields with shifted focal
     points and rotated transforms. The palette stays narrow per card so
     overlaps stay luminous instead of turning muddy, and no layer darkens
     toward black. Layers are art-directed rather than randomized so the
     composition is stable.
     ------------------------------------------------------------------------ */

  var ART_PALETTES = {
    recall: {
      base: '#ffd9c2',
      layers: [
        { color: '#ffb59a', opacity: 0.45, cx: 300, cy: 330, rx: 430, ry: 370, rotate: 0, fx: 50, fy: 50 },
        { color: '#ff5a36', opacity: 0.95, cx: 110, cy: 140, rx: 350, ry: 300, rotate: -26, fx: 38, fy: 34 },
        { color: '#ffb703', opacity: 0.88, cx: 480, cy: 170, rx: 350, ry: 290, rotate: 20, fx: 62, fy: 44 },
        { color: '#ff6f9f', opacity: 0.9, cx: 430, cy: 540, rx: 350, ry: 310, rotate: -12, fx: 40, fy: 64 },
        { color: '#ffe0a3', opacity: 0.5, cx: 300, cy: 320, rx: 300, ry: 250, rotate: 0, fx: 50, fy: 50 }
      ]
    },
    map: {
      base: '#c9f5ff',
      layers: [
        { color: '#7dd3fc', opacity: 0.55, cx: 300, cy: 300, rx: 440, ry: 390, rotate: 0, fx: 50, fy: 50 },
        { color: '#3b82f6', opacity: 0.9, cx: 140, cy: 440, rx: 400, ry: 340, rotate: 18, fx: 40, fy: 58 },
        { color: '#22d3ee', opacity: 0.85, cx: 480, cy: 180, rx: 380, ry: 300, rotate: -18, fx: 60, fy: 40 },
        { color: '#8b5cf6', opacity: 0.62, cx: 440, cy: 480, rx: 300, ry: 250, rotate: 8, fx: 45, fy: 55 },
        { color: '#22d3ee', opacity: 0.5, cx: 110, cy: 120, rx: 280, ry: 230, rotate: 0, fx: 50, fy: 50 }
      ]
    },
    practice: {
      base: '#eee3ff',
      layers: [
        { color: '#c9b6ff', opacity: 0.5, cx: 300, cy: 310, rx: 430, ry: 370, rotate: 0, fx: 50, fy: 50 },
        { color: '#7c5cff', opacity: 0.92, cx: 120, cy: 150, rx: 370, ry: 310, rotate: -18, fx: 36, fy: 36 },
        { color: '#38bdf8', opacity: 0.88, cx: 480, cy: 180, rx: 350, ry: 300, rotate: 22, fx: 58, fy: 42 },
        { color: '#ff5fa2', opacity: 0.9, cx: 440, cy: 520, rx: 340, ry: 300, rotate: -10, fx: 42, fy: 60 },
        { color: '#d9c9ff', opacity: 0.5, cx: 120, cy: 520, rx: 260, ry: 220, rotate: 0, fx: 50, fy: 50 }
      ]
    },
    violet: {
      base: '#f3e8ff',
      layers: [
        { color: '#c4b5fd', opacity: 0.55, cx: 300, cy: 300, rx: 440, ry: 390, rotate: 0, fx: 50, fy: 50 },
        { color: '#8b5cf6', opacity: 0.9, cx: 170, cy: 150, rx: 400, ry: 330, rotate: -20, fx: 40, fy: 40 },
        { color: '#ec4899', opacity: 0.85, cx: 470, cy: 430, rx: 390, ry: 330, rotate: 15, fx: 56, fy: 60 },
        { color: '#60a5fa', opacity: 0.55, cx: 470, cy: 90, rx: 220, ry: 180, rotate: 0, fx: 50, fy: 40 },
        { color: '#f0abfc', opacity: 0.55, cx: 110, cy: 520, rx: 300, ry: 250, rotate: 0, fx: 50, fy: 50 }
      ]
    },
    coral: {
      base: '#ffe4d6',
      layers: [
        { color: '#ffb59a', opacity: 0.5, cx: 300, cy: 310, rx: 440, ry: 390, rotate: 0, fx: 50, fy: 50 },
        { color: '#ff4d2e', opacity: 0.95, cx: 140, cy: 160, rx: 390, ry: 330, rotate: -22, fx: 40, fy: 40 },
        { color: '#ff8fa3', opacity: 0.88, cx: 470, cy: 360, rx: 370, ry: 310, rotate: 15, fx: 56, fy: 52 },
        { color: '#ffb703', opacity: 0.55, cx: 430, cy: 160, rx: 220, ry: 190, rotate: 0, fx: 50, fy: 40 },
        { color: '#ffd166', opacity: 0.55, cx: 110, cy: 520, rx: 280, ry: 230, rotate: 0, fx: 50, fy: 50 }
      ]
    }
  };

  var buildArtField = function (palette, seed) {
    var defs = '';
    var shapes = '';
    var i;
    var layer;
    var id;

    for (i = 0; i < palette.layers.length; i++) {
      layer = palette.layers[i];
      id = 'art-g-' + seed + '-' + i;
      defs += '<radialGradient id="' + id + '" cx="50%" cy="50%" r="50%" fx="' + layer.fx + '%" fy="' + layer.fy + '%">' +
        '<stop offset="0%" stop-color="' + layer.color + '"/>' +
        '<stop offset="58%" stop-color="' + layer.color + '" stop-opacity=".62"/>' +
        '<stop offset="100%" stop-color="' + layer.color + '" stop-opacity="0"/>' +
        '</radialGradient>';
      shapes += '<ellipse cx="' + layer.cx + '" cy="' + layer.cy + '" rx="' + layer.rx + '" ry="' + layer.ry +
        '" fill="url(#' + id + ')" opacity="' + layer.opacity +
        '" transform="rotate(' + layer.rotate + ' ' + layer.cx + ' ' + layer.cy + ')"/>';
    }

    return '<svg class="art__field" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
      '<defs>' + defs + '</defs><rect width="600" height="600" fill="' + palette.base + '"/>' + shapes + '</svg>';
  };

  var artPaletteKeys = Object.keys(ART_PALETTES);
  var artItems = doc.querySelectorAll('[data-art]');

  Array.prototype.forEach.call(artItems, function (art, index) {
    if (art.querySelector('.art__field')) return;

    for (var i = 0; i < artPaletteKeys.length; i++) {
      if (art.classList.contains('art--' + artPaletteKeys[i])) {
        art.insertAdjacentHTML('afterbegin', buildArtField(ART_PALETTES[artPaletteKeys[i]], index + 1));
        art.classList.add('has-art-field');
        return;
      }
    }
  });

  /* ------------------------------------------------------------------------
     Aurora art parallax
     ------------------------------------------------------------------------ */

  if (finePointer && !reduceMotion) {
    Array.prototype.forEach.call(artItems, function (art) {
      art.addEventListener('pointermove', function (event) {
        var rect = art.getBoundingClientRect();
        var x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        var y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
        art.style.setProperty('--mx', x.toFixed(3));
        art.style.setProperty('--my', y.toFixed(3));
      });

      art.addEventListener('pointerleave', function () {
        art.style.setProperty('--mx', '0');
        art.style.setProperty('--my', '0');
      });
    });
  }
}());
