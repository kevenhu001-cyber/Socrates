/* ==========================================================================
   Socrates Home — enhanced mascot interactions & animations
   Loaded AFTER editorial.js on the claude-home homepage only.
   ========================================================================== */
(function () {
  'use strict';

  /* Guard: only run on claude-home pages */
  if (!document.body.classList.contains('claude-home')) return;

  /* ──────────────────────────────────────────────────────────────────────
   * 1. HERO ARTWORK — Anthropic-style dynamic stardust & pulse
   * ────────────────────────────────────────────────────────────────────── */
  function enhanceHeroArt() {
    var heroArts = document.querySelectorAll('.claude-hero-art, .claude-mascot');
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !heroArts.length) return;

    heroArts.forEach(function (art) {
      if (art.dataset.darkBound) return;
      art.dataset.darkBound = '1';

      /* --- Stardust particle burst on click ----------------------- */
      function spawnStardust(e) {
        var rect = art.getBoundingClientRect();
        var originX = e ? (e.clientX - rect.left) : (rect.width * 0.5);
        var originY = e ? (e.clientY - rect.top) : (rect.height * 0.4);

        for (var i = 0; i < 8; i++) {
          var p = document.createElement('span');
          p.className = 'art-particle mascot-particle';
          var angle = (Math.PI * 2 / 8) * i + (Math.random() * 0.4 - 0.2);
          var dist = 35 + Math.random() * 45;
          p.style.setProperty('--px', (Math.cos(angle) * dist).toFixed(0) + 'px');
          p.style.setProperty('--py', (Math.sin(angle) * dist - 15).toFixed(0) + 'px');
          p.style.left = originX + 'px';
          p.style.top = originY + 'px';
          p.style.width = (2.5 + Math.random() * 2.5) + 'px';
          p.style.height = p.style.width;
          art.appendChild(p);
          (function (el) {
            setTimeout(function () { el.remove(); }, 900);
          })(p);
        }
      }

      art.addEventListener('click', function (e) {
        art.classList.add('is-pulsing');
        spawnStardust(e);
        setTimeout(function () { art.classList.remove('is-pulsing'); }, 900);
      });
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 2. HERO PARALLAX — subtle background glow follows scroll
   * ────────────────────────────────────────────────────────────────────── */
  function initHeroParallax() {
    var hero = document.querySelector('.claude-hero-section');
    if (!hero) return;
    var before = hero; /* We'll shift the ::before glow via CSS custom prop */
    var ticking = false;

    function update() {
      var y = window.scrollY || window.pageYOffset || 0;
      var shift = Math.min(y * 0.15, 80);
      hero.style.setProperty('--hero-scroll-y', shift + 'px');
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 3. ENHANCED REVEAL — stagger cards individually
   * ────────────────────────────────────────────────────────────────────── */
  function initStaggeredReveal() {
    var grids = document.querySelectorAll('.claude-pillars-grid');
    if (!grids.length || !('IntersectionObserver' in window)) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px' });

    grids.forEach(function (grid) { observer.observe(grid); });
  }

  /* ──────────────────────────────────────────────────────────────────────
   * 4. SMOOTH HOVER GLOW — cards respond to mouse position
   * ────────────────────────────────────────────────────────────────────── */
  function initCardGlow() {
    var cards = document.querySelectorAll('.claude-pillar-card');
    if (!cards.length) return;

    cards.forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var rect = card.getBoundingClientRect();
        var x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
        var y = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
        card.style.setProperty('--glow-x', x + '%');
        card.style.setProperty('--glow-y', y + '%');
      });

      card.addEventListener('pointerleave', function () {
        card.style.removeProperty('--glow-x');
        card.style.removeProperty('--glow-y');
      });
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
   * BOOT
   * ────────────────────────────────────────────────────────────────────── */
  function boot() {
    enhanceHeroArt();
    initHeroParallax();
    initStaggeredReveal();
    initCardGlow();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
