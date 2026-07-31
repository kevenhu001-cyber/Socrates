/* ═══════════════════════════════════════════════════════════════════
   HOME — "The Examined Mind" interactive layer
   1. Starfield        — drifting stars that lean toward the cursor
   2. The Moon         — perpetually waxing and waning (core visual)
   3. Dialogue         — a Socratic exchange that types itself, forever
   4. Frontier         — an interactive constellation of disciplines
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* ─────────────────────────────────────────────
     1. STARFIELD
     ───────────────────────────────────────────── */
  var starsCv = document.getElementById("stars");
  if (starsCv) {
    var sctx = starsCv.getContext("2d");
    var stars = [];
    var mouse = { x: -9999, y: -9999 };
    var W = 0, H = 0;

    function sizeStars() {
      W = starsCv.width = innerWidth * DPR;
      H = starsCv.height = innerHeight * DPR;
      starsCv.style.width = innerWidth + "px";
      starsCv.style.height = innerHeight + "px";
      var count = Math.min(110, Math.floor(innerWidth * innerHeight / 18000));
      stars = [];
      for (var i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: (Math.random() * 1.1 + 0.3) * DPR,
          tw: Math.random() * Math.PI * 2,      // twinkle phase
          ts: 0.4 + Math.random() * 1.2,        // twinkle speed
          vx: (Math.random() - 0.5) * 0.05 * DPR,
          vy: (Math.random() - 0.5) * 0.05 * DPR,
          gold: Math.random() < 0.08            // a few stars burn gold
        });
      }
    }
    sizeStars();
    addEventListener("resize", sizeStars);
    addEventListener("pointermove", function (e) {
      mouse.x = e.clientX * DPR;
      mouse.y = e.clientY * DPR;
    });

    var stT = 0;
    (function starLoop() {
      requestAnimationFrame(starLoop);
      stT += 0.016;
      sctx.clearRect(0, 0, W, H);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        if (!reduceMotion) {
          s.x += s.vx; s.y += s.vy;
          // gentle pull toward the cursor
          var dx = mouse.x - s.x, dy = mouse.y - s.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 160 * 160 * DPR * DPR && d2 > 1) {
            var d = Math.sqrt(d2);
            s.x += dx / d * 0.25 * DPR;
            s.y += dy / d * 0.25 * DPR;
          }
          if (s.x < 0) s.x += W; if (s.x > W) s.x -= W;
          if (s.y < 0) s.y += H; if (s.y > H) s.y -= H;
        }
        var a = 0.10 + 0.28 * Math.abs(Math.sin(s.tw + stT * s.ts));
        sctx.beginPath();
        sctx.arc(s.x, s.y, s.r, 0, 6.2832);
        sctx.fillStyle = s.gold
          ? "hsla(45,90%,62%," + a + ")"
          : "hsla(44,30%,92%," + a * 0.85 + ")";
        sctx.fill();
      }
    })();
  }

  /* ─────────────────────────────────────────────
     2. THE TOPOLOGY — a living form that never settles.
     The current flows along an unbreakable loop whose
     SHAPE itself keeps changing: a torus, a (2,3) knot,
     a wireframe sphere, a logarithmic spiral, a rippled
     surface — all crossfaded through a single parameter
     `morph`. Rotation, twist, hue and breath are driven
     by incommensurate clocks so the pose never repeats.
     ───────────────────────────────────────────── */
  var tpCv = document.getElementById("topo");
  if (tpCv) {
    var tctx = tpCv.getContext("2d");
    var TS = 0;

    function sizeTopo() {
      var rect = tpCv.parentElement.getBoundingClientRect();
      var s = Math.floor(rect.width * DPR);
      if (!s) return;                    // zero-size window: retry next frame
      TS = s;
      tpCv.width = TS; tpCv.height = TS;
    }
    sizeTopo();
    addEventListener("resize", sizeTopo);

    /* ─── form library ──────────────────────────────────────
       Each form takes (u, v, t, out) where u, v ∈ [0, 1] are
       the parametric coordinates along the surface. v is
       unused by 1-D loops but lets spherical/spiral forms
       populate the second dimension.
       Outputs a 3D point on a roughly unit-radius shape.
       ─────────────────────────────────────────────────────── */
    /* Shared helper — draws ONE of the two dialogue strands at
       parametric position `u` on a circle of radius `R` lying
       in the (x, z) plane, climbing along Y by `climb`, with a
       per-u radial perturbation `ripple(u, t)` and a vertical
       shimmer `bob(u, t)`. Strand 0 = "the Question"
       (slightly ahead, brighter), strand 1 = "the Answer"
       (slightly behind, calmer). v ∈ [0, 0.5) → strand 0,
       v ∈ [0.5, 1] → strand 1; near v=0.5 we crossfade so the
       strands visually meet. */
    function strandPoint(u, v, t, opts, out) {
      var a = u * Math.PI * 2 * opts.turns + opts.phase;
      var r = opts.R + (opts.ripple ? opts.ripple(u, t) : 0);
      var climb = opts.climbBase + (opts.climbAmp ? opts.climbAmp * (u - 0.5) : 0);
      var bob   = opts.bobAmp   ? opts.bobAmp   * Math.sin(opts.bobFreq * a + t * opts.bobSpd) : 0;
      out[0] = r * Math.cos(a);
      out[1] = climb + bob;
      out[2] = r * Math.sin(a);
    }

    /* 1. APORIA — the impasse, the closed loop you cannot break.
       A figure-eight / lemniscate: the path crosses itself and
       returns to where it began, no exit. v spreads two ribbons
       that twist around the crossing so the eye reads "trapped".
       Reads as: "I cannot get out." */
    function formAporia(u, v, t, out) {
      // lemniscate of Bernoulli in (x, z), ribbon along v
      var a = u * Math.PI * 2;
      var denom = 1 + Math.sin(a) * Math.sin(a);
      var r = 1.8 / denom;
      var ribbon = (v - 0.5) * 1.1;
      // perpendicular to the loop direction (radial), with a tilt
      out[0] = r * Math.cos(a);
      out[1] = ribbon + 0.20 * Math.sin(a * 2 + t * 0.5);
      out[2] = r * Math.sin(a) * Math.cos(a) + ribbon * 0.45 * Math.sin(a);
    }

    /* 2. ELE̓LENCHOS — the inquiry, a question curling upward.
       The shape of a literal "?" laid in 3-D: a sweep that arcs
       from the lower-left, curls over the top, and tapers down
       toward the centre; plus a separate dot at the base that
       pulses gently so it reads as "the question that has just
       been asked." v picks between the curl (v>=0.18) and the
       dot (v<0.18). */
    function formElenchus(u, v, t, out) {
      if (v < 0.18) {
        // the dot at the base, a small disc that breathes
        var rDot = 0.18 + 0.05 * Math.sin(t * 0.7);
        var aDot = u * Math.PI * 2;
        out[0] = rDot * Math.cos(aDot) * 0.4;
        out[1] = -1.55 + rDot * Math.sin(aDot) * 0.6;
        out[2] = rDot * Math.sin(aDot) * 0.2 + 0.4;
      } else {
        // the hook: shift v from [0.18, 1] → [0, 1] for the sweep
        var vv = (v - 0.18) / 0.82;     // 0..1 along the hook
        var a = vv * Math.PI * 2 - Math.PI * 0.3;
        var hookR = 0.95;
        var taper = 1 - 0.55 * Math.pow(vv, 2);
        var r = hookR * taper;
        var cy = 1.4 * Math.sin(vv * Math.PI) - 1.5 + 0.10 * Math.cos(t * 0.6);
        var depth = 0.35 * Math.sin(vv * Math.PI * 2);
        out[0] = r * Math.cos(a);
        out[1] = cy + r * Math.sin(a);
        out[2] = depth * r * 0.5 + r * 0.15 * Math.sin(a * 2);
        // u gives the sweep a slight thickness across the ribbon
        var ribbon = (u - 0.5) * 0.45;
        out[0] += -Math.sin(a) * ribbon;
        out[2] += Math.cos(a) * ribbon;
      }
    }

    /* 3. MÍMESIS — the listening mirror, a bowl that catches sound.
       An open paraboloid, mouth up — like a satellite dish or
       cupped hands held to the ear. The breath modulates the
       focal length so the dish "inhales" and "exhales".
       Reads as: "I am listening." */
    function formSphere(u, v, t, out) {
      var a = u * Math.PI * 2;
      // radius shrinks with height: wide at the rim, narrow at the bottom
      var h = (v - 0.5) * 2.2;            // -1.1 .. 1.1
      var rim = 1 - Math.abs(h) / 1.6;    // 0.31 .. 1
      rim = Math.max(0.18, rim);
      var breath = 1 + 0.10 * Math.sin(t * 0.7 + v * 2.4);
      var r = rim * 2.0 * breath;
      out[0] = r * Math.cos(a);
      out[1] = h;
      out[2] = r * Math.sin(a);
    }

    /* 4. ANÁMNESIS — the spiral of remembering, a corkscrew inward.
       A clear three-turn Archimedean spiral lying flat, like
       grooves on a vinyl record. The eye follows the inward
       journey. Reads as: "you have always known." */
    function formSpiral(u, v, t, out) {
      var turns = 3;
      var a = u * turns * Math.PI * 2;
      // Archimedean: r = a * θ, with constant pitch
      var r = (1 - u) * 1.9 + 0.25;       // outer → inner
      // give the spiral a slight vertical lift per turn so it spirals in 3-D
      var lift = (u - 0.5) * 0.9;
      // ribbon perpendicular to the spiral arm
      var ribbon = (v - 0.5) * 0.5;
      var nx = -Math.sin(a), nz = Math.cos(a);
      out[0] = r * Math.cos(a) + nx * ribbon;
      out[1] = lift + 0.18 * Math.sin(t * 0.5);
      out[2] = r * Math.sin(a) + nz * ribbon;
    }

    /* 5. SÝNTHESIS — two lines crossing at the centre, an X.
       Two straight beams meeting at the origin, one with a
       negative slope (going down as x grows), one with a
       positive slope (going up as x grows). The eye reads
       "two become one" at the crossing. v picks which beam.
       Reads as: "two truths meet." */
    function formSurface(u, v, t, out) {
      // u runs from one end of a beam to the other
      // v picks beam 0 (negative slope) or beam 1 (positive slope)
      var beam = v < 0.5 ? 0 : 1;
      var s = (u - 0.5) * 2.4;            // -1.2 .. 1.2 along x
      // beam 0 goes down as x grows, beam 1 goes up as x grows
      var slope = beam ? 1.4 : -1.4;
      out[0] = s;
      out[1] = s * slope;                 // y rises or falls along x
      out[2] = beam * 0.35 - 0.175;       // beam 1 sits behind beam 0
      // add a tiny ripple so it doesn't read as a hard ruler
      var wobble = 0.05 * Math.sin(t * 0.7 + u * 4);
      out[1] += wobble;
      out[2] += wobble * 0.4;
    }

    /* 6. MAI̓EUTIKE̓ — the birth of the idea, the double helix.
       The classic DNA: two strands, phase-shifted by π, climbing
       together. v picks the strand; near v=0.5 the two strands
       physically cross so the eye reads "intertwined".
       Reads as: "the answer is born within the question." */
    function formHelix(u, v, t, out) {
      var a = u * Math.PI * 6;
      var strand = v < 0.5 ? 0 : 1;
      var phase = strand * Math.PI;
      var climb = (u - 0.5) * 4.4;
      var r = 1.55 + 0.18 * Math.sin(a * 2 - t * 0.9);
      out[0] = r * Math.cos(a + phase);
      out[1] = climb + 0.12 * Math.sin(t * 0.6 + strand);
      out[2] = r * Math.sin(a + phase);
    }

    /* 7. HÊ STROPHÊ̓ — the turn, the Möbius strip.
       A single non-orientable band with a half-twist. The
       inside becomes the outside. Reads as: "the question
       answers itself." */
    function formMobius(u, v, t, out) {
      var a = u * Math.PI * 2;
      var b = (v - 0.5) * 1.4;
      var twist = a * 0.5;
      var R = 2.0 + 0.16 * Math.sin(t * 0.7);
      out[0] = (R + b * Math.cos(twist)) * Math.cos(a);
      out[1] = b * Math.sin(twist);
      out[2] = (R + b * Math.cos(twist)) * Math.sin(a);
    }

    /* 8. CHORÓS — the dance, two voices spiralling in counterpoint.
       Two helical arms that wind around each other like intertwined
       dancers — the yin-yang of two bodies in motion. Each strand
       has its own climb rate so they meet, separate, and meet again.
       Reads as: "the dialogue dances." */
    function formRibbon(u, v, t, out) {
      var strand = v < 0.5 ? 0 : 1;
      var a = u * Math.PI * 4;
      var phase = strand * Math.PI;
      var climbRate = strand ? 1.0 : -1.0;
      // vertical climb modulated by a sway
      var climb = (u - 0.5) * 3.6 + 0.35 * Math.sin(a + t * 0.6);
      // radial sway: the dancer's body shifts in and out
      var sway = 0.55 * Math.sin(a * 0.5 + t * 0.4 + phase);
      var r = 1.7 + sway;
      out[0] = r * Math.cos(a + phase);
      out[1] = climb + strand * 0.45 * Math.sin(t * 0.5);
      out[2] = r * Math.sin(a + phase) * 0.9 + climbRate * 0.25;
    }

    /* 9. SYLLOGISMÓS — the woven lattice, a basket of crossing threads.
       Two families of parallel curves (warp running along x,
       weft running along z) cross at right angles, the way
       cloth is woven. Each thread is a smooth curve with a
       gentle sinusoidal lift, so the eye reads "two threads
       over, two under" as the families intersect. Reads as:
       "structure from many threads." */
    function formLattice(u, v, t, out) {
      // Woven lattice: 5 warp threads (running along x) and 5 weft
      // threads (running along z). Each particle belongs to one of
      // the 10 threads, and we use `along` (from u) to place it
      // along that thread's length.
      //
      // The signature reading cue for a weave is OVER/UNDER crossings:
      // at each warp/weft intersection, one thread passes over the
      // other. We model this by giving every thread a continuous y
      // curve that oscillates with a period of 2 * pitch along its
      // length — so the warp "rides up over" one weft, "down under"
      // the next, etc. The weft does the inverse: where the warp is
      // up, the weft is down, and vice versa.
      //
      // Net effect from above: a clean checkerboard pattern that
      // reads unmistakably as woven cloth.
      var family = v < 0.5 ? 0 : 1;             // 0 = warp (along x), 1 = weft (along z)
      var slot = u * 5;                         // 0..5
      var which = Math.min(4, Math.floor(slot));// 0..4 (which thread in family)
      var along = (slot - which - 0.5) * 2.0;   // -1..1 along this thread

      var pitch = 0.95;
      var halfRange = 5.0;                      // length parameter units (each unit ≈ 0.5 world unit)
      var halfLen = halfRange * 0.5;
      // position along the thread axis (in pitch units, not world units)
      var s = along * halfRange;                // -2.5..2.5

      // the OTHER axis position (which slot is this thread on?)
      var threadIdx = which - 2;                // -2..2

      // OVER/UNDER: y oscillates with period 2*pitch along the thread.
      // Warp and weft use opposite phase so the crossings interlock.
      // Plus, each thread has a tiny static offset so they don't
      // collapse onto a single plane at the camera angle.
      var oscBase = s / pitch;                  // ~ -2.6..2.6
      var phase = family === 0 ? 0 : Math.PI;   // weft is inverse of warp
      var weave = Math.cos(oscBase * Math.PI + phase) * 0.32;
      // small per-thread vertical offset so 10 threads read as 10
      // distinct threads from any angle (and so the weave doesn't
      // collapse to a flat checkerboard when viewed head-on)
      var threadOffset = (threadIdx * 0.07);
      var y = weave + threadOffset;

      if (family === 0) {
        // warp runs along x; sits at threadIdx's z lane
        out[0] = along * halfLen * 0.45;
        out[1] = y;
        out[2] = threadIdx * pitch;
      } else {
        // weft runs along z; sits at threadIdx's x lane
        out[0] = threadIdx * pitch;
        out[1] = y;
        out[2] = along * halfLen * 0.45;
      }
    }

    /* 10. THÁMBOS — awe, a flower unfolding.
       A five-petal rose that opens and breathes — the inner
       tip pulls inward as the outer petals flare, like the
       instant before a flower blooms. v is the petal depth:
       the base sits tight, the tip flares wide. Reads as:
       "the moment of wonder." */
    function formRose(u, v, t, out) {
      var k = 5;
      var a = u * Math.PI * 2;
      // petal radius: zero at the centre, big at the rim
      var rim = (v < 0.5) ? 0.4 + v * 1.6 : 1.6 + (v - 0.5) * 1.4;
      var r = Math.abs(Math.cos(k * a * 0.5)) * rim;
      // breathing: gentle open/close
      r *= 1 + 0.20 * Math.sin(t * 0.9);
      // the cup: lift edges upward like a chalice
      var cup = Math.abs(v - 0.5) * 2;      // 0 at the middle, 1 at the rim
      var lift = cup * cup * 0.45;
      // base of the flower: a tighter ring near v = 0.5
      out[0] = r * Math.cos(a);
      out[1] = lift + 0.10 * Math.sin(a * 2 + t * 0.6);
      out[2] = r * Math.sin(a);
    }

    /* 11. APOTHÉOSIS — arrival at the centre.
       A vortex: many streams of particles converge to a
       single bright point at the origin, then spiral out.
       The eye is pulled to the centre and held there. Reads
       as: "you have arrived." */
    function formHyperbolic(u, v, t, out) {
      var a = u * Math.PI * 2;
      // radial position: 0 (centre) to 1 (rim)
      var r = v * 2.0;
      // pull inward toward the centre with a logarithmic spiral
      var pull = 0.45 * (1 - v);        // strongest near centre
      var spiral = a + t * 0.4;
      // the centre is a bright tight knot; the rim spreads and lifts
      var lift = (1 - v) * 1.2 * Math.sin(spiral * 0.5) - v * 0.6;
      out[0] = r * Math.cos(a + pull * Math.sin(a + t * 0.3));
      out[1] = lift;
      out[2] = r * Math.sin(a + pull * Math.sin(a + t * 0.3));
    }

    /* 12. HÉCHO — the echo, ripples carrying the question outward.
       Concentric rings expanding from a single source at the
       centre; each ring is brighter near its crest and fades
       toward the edge, the way a stone's ripple dies. Reads as:
       "and so it continues." */
    function formWave(u, v, t, out) {
      var a = u * Math.PI * 2;
      // radius walks outward as v increases (0..1)
      var rad = 0.25 + v * 1.95;
      // the ripple: a tall crest that sweeps outward
      var ring = 5;
      var amp = 0.55 * Math.sin(rad * ring - t * 1.6) * Math.exp(-v * 1.4);
      // the crest height gives the wave vertical relief
      out[0] = rad * Math.cos(a);
      out[1] = amp + 0.05 * Math.sin(a * 3 + t * 0.4);
      out[2] = rad * Math.sin(a);
    }

    /* The form sequence — twelve acts of one Socratic dialogue.
       The morph clock walks through this list in order, crossfading
       between neighbours. Every form here was chosen to share its
       silhouette with its predecessor and successor, so the rotation
       never reads as a hard cut: an impasse becomes an inquiry
       becomes a held silence becomes a spiral of remembering, and so
       on around the wheel — until the wave that began as a question
       returns as an echo. */
    var FORMS = [
      formAporia,       // 1.  ἀπορία   — the impasse
      formElenchus,     // 2.  ἔλεγχος — the inquiry
      formSphere,       // 3.  μίμησις  — the listening mirror
      formSpiral,       // 4.  ἀνάμνησις — remembering
      formSurface,      // 5.  σύνθεσις  — two thoughts meet
      formHelix,        // 6.  μαιευτική — the birth
      formMobius,       // 7.  ἡ στροφή  — the turn
      formRibbon,       // 8.  χορός    — the dance
      formLattice,      // 9.  συλλογισμός — the woven lattice
      formRose,         // 10. θάμβος    — awe
      formHyperbolic,   // 11. ἀποθέωσις  — arrival at the centre
      formWave          // 12. ἠχώ       — the echo
    ];

    /* Visible labels for each form. Shown in a tiny HUD that
       fades between cells as the morph clock crosses each
       integer boundary. The .form-label element lives in the
       HTML — we just toggle the [data-active] attribute and
       the CSS transitions handle the visual. */
    var FORM_LABELS = [
      { roman: "Ⅰ",  zh: "困境",  en: "the impasse",        greek: "ἀπορία" },
      { roman: "Ⅱ",  zh: "探询",  en: "the inquiry",        greek: "ἔλεγχος" },
      { roman: "Ⅲ",  zh: "倾听",  en: "the listening mirror", greek: "μίμησις" },
      { roman: "Ⅳ",  zh: "回忆",  en: "remembering",        greek: "ἀνάμνησις" },
      { roman: "Ⅴ",  zh: "交汇",  en: "two thoughts meet",  greek: "σύνθεσις" },
      { roman: "Ⅵ",  zh: "诞生",  en: "the birth",          greek: "μαιευτική" },
      { roman: "Ⅶ",  zh: "转折",  en: "the turn",           greek: "ἡ στροφή" },
      { roman: "Ⅷ",  zh: "舞蹈",  en: "the dance",          greek: "χορός" },
      { roman: "Ⅸ",  zh: "编织",  en: "the woven lattice",  greek: "συλλογισμός" },
      { roman: "Ⅹ",  zh: "敬畏",  en: "awe",                greek: "θάμβος" },
      { roman: "Ⅺ",  zh: "抵达",  en: "arrival at the centre", greek: "ἀποθέωσις" },
      { roman: "Ⅻ", zh: "回响",  en: "the echo",           greek: "ἠχώ" }
    ];

    /* HUD wiring — single cached lookup, no work per frame
       unless the dominant form index actually changes. */
    var formLabelEl = document.querySelector(".form-label");
    var formLabelCells = formLabelEl
      ? Array.from(formLabelEl.querySelectorAll(".form-label-cell"))
      : [];
    var lastFormIdx = -1;
    function setActiveForm(idx) {
      if (idx === lastFormIdx) return;
      lastFormIdx = idx;
      if (!formLabelEl) return;
      formLabelEl.setAttribute("data-active", String(idx));
      for (var ci = 0; ci < formLabelCells.length; ci++) {
        var on = ci === idx;
        formLabelCells[ci].setAttribute("data-on", on ? "1" : "0");
      }
    }

    /* sample a form with smooth crossfade to its neighbour */
    function sampleForm(u, v, t, blend, out) {
      // `blend` comes from `((t / CYCLE) * FORMS.length) % FORMS.length`
      // — but JavaScript's % can return a tiny negative on floats
      // (e.g. -4e-16), which would index FORMS[-1]. Clamp first.
      var bl = blend - Math.floor(blend / FORMS.length) * FORMS.length;
      if (bl < 0) bl += FORMS.length;
      if (bl >= FORMS.length) bl -= FORMS.length;
      var i = Math.floor(bl) % FORMS.length;
      var j = (i + 1) % FORMS.length;
      var k = bl - Math.floor(bl); // 0..1 within pair
      // smoothstep for a silky transition
      var kk = k * k * (3 - 2 * k);
      var a = [0, 0, 0], b = [0, 0, 0];
      FORMS[i](u, v, t, a);
      FORMS[j](u, v, t, b);
      out[0] = a[0] * (1 - kk) + b[0] * kk;
      out[1] = a[1] * (1 - kk) + b[1] * kk;
      out[2] = a[2] * (1 - kk) + b[2] * kk;
    }

    /* flowing light points — each has a (u, v) on the
       parameter surface plus a personal drift speed */
    var FLOW_N = 800;
    var flow = [];
    for (var fi = 0; fi < FLOW_N; fi++) {
      flow.push({
        u: Math.random(),                         // along loop
        v: Math.random(),                         // across bands (sphere/spiral/surface)
        vu: 0.0012 + Math.random() * 0.0022,       // along-loop drift (≈½ of before)
        vv: (Math.random() - 0.5) * 0.00045,       // cross-band drift
        j: (Math.random() - 0.5) * 0.035,          // radial jitter (gentler)
        s: 0.55 + Math.random() * 1.35,           // base size
        ph: Math.random() * Math.PI * 2,           // breath phase
        lane: Math.random()                        // 0..1, how gold vs moonlight
      });
    }

    /* a second, denser layer of "dust" — these are the tiny
       twinkling specks that fill the negative space between the
       main light points. They ride the same surface but are much
       smaller and far more numerous, so the eye constantly
       catches movement even when the main flow is at a slow
       section of its cycle. */
    var DUST_N = 500;
    var dust = [];
    for (var di = 0; di < DUST_N; di++) {
      dust.push({
        u: Math.random(),
        v: Math.random(),
        vu: (Math.random() - 0.5) * 0.0018,         // bidirectional drift
        vv: (Math.random() - 0.5) * 0.0009,
        j: (Math.random() - 0.5) * 0.04,
        s: 0.18 + Math.random() * 0.42,            // very small base size
        ph: Math.random() * Math.PI * 2,
        tw: 0.8 + Math.random() * 2.4,             // twinkle speed
        lane: Math.random()
      });
    }

    var P = [0, 0, 0], tpT0 = performance.now();
    var mx3 = 0, my3 = 0;                            // pointer tilt, eased
    addEventListener("pointermove", function (e) {
      mx3 = (e.clientX / innerWidth - 0.5);
      my3 = (e.clientY / innerHeight - 0.5);
    });
    var tiltX = 0, tiltY = 0;

    /* one full morph cycle takes CYCLE seconds.
       Independent of rotation so the form keeps shifting
       while the shape itself spins. Lengthened for a
       contemplative, silk-slow pace. */
    var CYCLE = 36.0;

    function drawTopo(now) {
      requestAnimationFrame(drawTopo);
      if (!TS) { sizeTopo(); return; }
      var t = (now - tpT0) / 1000;
      var cx = TS / 2, cy = TS / 2;
      var SC = TS * 0.135;

      // slow, incommensurate tumble — every clock is roughly ⅓ of
      // its previous speed so the form turns like a planet, not a
      // fidget spinner. Twist stays well under 1 rad for elegance.
      var rotZ = reduceMotion ? 0.3  : t * 0.07;
      var rotY = reduceMotion ? 0.25 : t * 0.052;
      var rotX = reduceMotion ? 0.2  : 0.25 + 0.32 * Math.sin(t * 0.11);
      var twist = reduceMotion ? 0   : 0.28 * Math.sin(t * 0.14)
                                     + 0.12 * Math.cos(t * 0.21);
      // pointer influence also tamed
      tiltY += ((reduceMotion ? 0 : mx3 * 0.22) - tiltY) * 0.025;
      tiltX += ((reduceMotion ? 0 : my3 * 0.15) - tiltX) * 0.025;

      var czR = Math.cos(rotZ), szR = Math.sin(rotZ);
      var cyR = Math.cos(rotY + tiltY), syR = Math.sin(rotY + tiltY);
      var cxR = Math.cos(rotX + tiltX), sxR = Math.sin(rotX + tiltX);

      // morph blend — walks through FORMS, looping forever
      var blend = ((t / CYCLE) * FORMS.length) % FORMS.length;
      // Safe-clamp for floats (cheap mirror of sampleForm's logic)
      var blSafe = blend - Math.floor(blend / FORMS.length) * FORMS.length;
      if (blSafe < 0) blSafe += FORMS.length;
      if (blSafe >= FORMS.length) blSafe -= FORMS.length;
      var dominantForm = Math.floor(blSafe) % FORMS.length;
      setActiveForm(dominantForm);

      // THEME-ONLY color: drift purely within the warm band
      // (gold 45° → soft gold 42° → moonlight 44°), 30° total swing.
      // No blue, no violet, no green.
      var hueShift = reduceMotion ? 0
                   : 13.5 + 13.5 * Math.sin(t * 0.06);     // 0°..27° swing
      var laneShift = reduceMotion ? 0.5
                    : 0.5 + 0.5 * Math.sin(t * 0.045);     // 0..1: gold ↔ moonlight
      // alpha breath — slower, deeper, smoother
      var breath = reduceMotion ? 0.85
                  : 0.74 + 0.26 * Math.sin(t * 0.22);

      tctx.clearRect(0, 0, TS, TS);

      // soft halo behind the form — THEME ONLY (gold + moonlight).
      // Three warm stops, no blue/violet, slightly softer than before.
      var hb = (0.028 + 0.014 * Math.sin(t * 0.18)) * breath;
      var halo = tctx.createRadialGradient(cx, cy, 0, cx, cy, TS * 0.46);
      halo.addColorStop(0,
        "hsla(" + (44 + hueShift * 0.3) + ",85%,72%," + hb + ")");
      halo.addColorStop(0.55,
        "hsla(44,55%,80%," + (hb * 0.45) + ")");
      halo.addColorStop(1,
        "hsla(44,55%,80%,0)");
      tctx.fillStyle = halo;
      tctx.fillRect(0, 0, TS, TS);

      /* project (u, v, jitter) onto screen — applies the twist
         as a deformation of the (x, y) plane, so the whole form
         shimmers like a slow ribbon */
      function project(u, v, jitter) {
        sampleForm(u, v, t, blend, P);
        var x = P[0] * (1 + (jitter || 0));
        var y = P[1] * (1 + (jitter || 0));
        var z = P[2];
        // in-plane spin
        var x0 = x * czR - y * szR, y0 = x * szR + y * czR;
        // Y wobble + twist along Y
        var x1 = x0 * cyR + z * syR;
        var z1 = -x0 * syR + z * cyR;
        // apply twist as a shear that depends on Y
        var shear = Math.sin(y0 * 1.2 + twist) * 0.18;
        x1 += shear * Math.cos(twist * 0.7);
        // X wobble
        var y1 = y0 * cxR - z1 * sxR;
        var z2 = y0 * sxR + z1 * cxR;
        var persp = 1 / (1 + z2 * 0.12);
        return [
          cx + x1 * SC * persp,
          cy + y1 * SC * persp,
          (z2 + 3.6) / 7.2,
          u        // keep u for color cycling along the loop
        ];
      }

      // ── 1) the wire: a whisper of the form, always visible ──
      tctx.save();
      tctx.lineWidth = 1 * DPR;
      // two passes — one along u, one along v — so spherical /
      // spiral / surface forms actually show their second dimension
      var STEPS_U = 220;
      tctx.beginPath();
      for (var i = 0; i <= STEPS_U; i++) {
        var q = project(i / STEPS_U, 0.5, 0);
        if (i === 0) tctx.moveTo(q[0], q[1]); else tctx.lineTo(q[0], q[1]);
      }
      tctx.strokeStyle = "hsla(44,30%,90%,0.08)";
      tctx.stroke();

      var STEPS_V = 10;
      for (var vv = 1; vv < STEPS_V; vv++) {
        tctx.beginPath();
        var vParam = vv / STEPS_V;
        for (var i2 = 0; i2 <= STEPS_U; i2++) {
          var q2 = project(i2 / STEPS_U, vParam, 0);
          if (i2 === 0) tctx.moveTo(q2[0], q2[1]); else tctx.lineTo(q2[0], q2[1]);
        }
        // fade the cross-bands so they don't dominate (warm moonlight)
        tctx.strokeStyle = "hsla(44,35%,88%,0.022)";
        tctx.stroke();
      }
      tctx.restore();

      // ── 2) the current: light points flowing on the surface ──
      // Each point is drawn as two passes that together read as a
      // single emissive pixel (think of a soft CRT phosphor):
      //   (a) outer halo — wide radial gradient with a long, soft falloff
      //   (b) inner core — tiny, almost-white hot centre
      // Both passes share the same colour family (gold ↔ moonlight)
      // and the same breath, so the point feels alive rather than
      // stamped. We also use two scaled `globalAlpha` multipliers so
      // depth still pulls back far-side pixels naturally.
      tctx.save();
      tctx.globalCompositeOperation = "lighter";

      // ── 2a) DUST layer — dense, tiny, twinkling specks ──
      // This fills the negative space between the main light
      // points so the form feels populated by countless tiny
      // stars. Drawn before the main flow so the larger points
      // sit on top.
      for (var dk = 0; dk < DUST_N; dk++) {
        var d = dust[dk];
        if (!reduceMotion) {
          d.u += d.vu;
          d.v += d.vv;
          if (d.u > 1) d.u -= 1; else if (d.u < 0) d.u += 1;
          if (d.v > 1) d.v -= 1; else if (d.v < 0) d.v += 1;
        }
        var dp = project(d.u, d.v, d.j);
        var dDepth = dp[2];

        // twinkle: fast cosine envelope so individual specks
        // blink in and out, giving the eye constant motion to
        // latch onto.
        var tw = 0.5 + 0.5 * Math.sin(d.ph + t * d.tw);
        // keep most specks faint; only the bright top slice reads
        var dA = Math.pow(tw, 1.6) * (0.10 + dDepth * 0.18) * breath;
        if (dA < 0.02) continue;

        var dHueA = 44 + hueShift * 0.35;
        var dLerp = Math.min(1, Math.max(0,
          d.lane * 0.85 + (1 - dDepth) * 0.15 + laneShift * 0.1));
        var dHue = dLerp < 0.5 ? dHueA : 44;
        var dSat = dLerp < 0.5 ? 92 - dLerp * 60 : 30;
        var dLit = dLerp < 0.5 ? 68 + dLerp * 22 : 88;

        // SINGLE-PASS dust: one radial gradient that already has
        // a hot core (stop 0) and a long soft falloff (stop 1).
        // Replaces the previous two-pass halo+core which cost
        // ~2x the gradient + arc work per speck.
        var dR = (d.s + dDepth * 0.6) * (DPR > 1.5 ? 1.5 : DPR);
        var dCoreA = dA * 0.95;
        var dg = tctx.createRadialGradient(dp[0], dp[1], 0, dp[0], dp[1], dR * 3.2);
        dg.addColorStop(0,
          "hsla(" + dHue.toFixed(1) + ",100%," + (dLit + 6).toFixed(0)
          + "%," + dCoreA.toFixed(3) + ")");
        dg.addColorStop(0.45,
          "hsla(" + dHue.toFixed(1) + "," + dSat.toFixed(0)
          + "%," + dLit.toFixed(0) + "%,"
          + (dA * 0.5).toFixed(3) + ")");
        dg.addColorStop(1,
          "hsla(" + dHue.toFixed(1) + "," + (dSat - 24).toFixed(0)
          + "%," + dLit.toFixed(0) + "%,0)");
        tctx.fillStyle = dg;
        tctx.beginPath();
        tctx.arc(dp[0], dp[1], dR * 3.2, 0, 6.2832);
        tctx.fill();
      }

      // build colour ramps once per frame (they don't depend on
      // per-point fields, only on global clocks)
      var haloHue = (44 + hueShift * 0.35).toFixed(1);
      var haloSat = 92, haloLit = 62;
      var coreHue = 45;
      var coreLit = 96;

      // (a) outer halos — drawn first so cores sit on top
      for (var k = 0; k < FLOW_N; k++) {
        var f = flow[k];
        if (!reduceMotion) {
          f.u += f.vu;
          f.v += f.vv;
          if (f.u > 1) f.u -= 1;
          if (f.v < 0) f.v += 1; else if (f.v > 1) f.v -= 1;
        }
        var p = project(f.u, f.v, f.j);
        var depth = p[2];

        // personal breath: 0..1 with deep troughs, slow oscillation
        var breath01 = 0.5 + 0.5 * Math.sin(f.ph + t * 0.55);
        var aHalo = (0.035 + depth * depth * 0.22)
                  * (0.45 + 0.55 * breath01)
                  * breath;

        // THEME-ONLY colour: gold (warm, near) ↔ moonlight (cool, far)
        var hueA = 44 + hueShift * 0.35;
        var lerp = Math.min(1, Math.max(0,
          f.lane * 0.85 + (1 - depth) * 0.15 + laneShift * 0.1));
        var colHue = lerp < 0.5 ? hueA : 44;
        var colSat = lerp < 0.5 ? 92 - lerp * 64 : 30;
        var colLit = lerp < 0.5 ? 64 + lerp * 22 : 86;

        // halo: radius scales with breath01 → points literally breathe.
        // The DPR factor is capped at 1.5 so high-DPR displays
        // (e.g. 3x Retina) don't pay 3x the gradient cost.
        var haloR = (f.s * 3.4 + depth * 5.5 + breath01 * 1.6)
                  * (DPR > 1.5 ? 1.5 : DPR);
        var g = tctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], haloR);
        // long, phosphor-style falloff (quadratic-ish, 3 stops)
        g.addColorStop(0,
          "hsla(" + colHue.toFixed(1) + "," + colSat.toFixed(0)
          + "%," + colLit.toFixed(0) + "%,"
          + (aHalo * 0.85).toFixed(3) + ")");
        g.addColorStop(0.35,
          "hsla(" + colHue.toFixed(1) + "," + (colSat - 12).toFixed(0)
          + "%," + colLit.toFixed(0) + "%,"
          + (aHalo * 0.32).toFixed(3) + ")");
        g.addColorStop(1,
          "hsla(" + colHue.toFixed(1) + "," + (colSat - 30).toFixed(0)
          + "%," + colLit.toFixed(0) + "%,0)");
        tctx.fillStyle = g;
        tctx.beginPath();
        tctx.arc(p[0], p[1], haloR, 0, 6.2832);
        tctx.fill();

        // store for the inner-core pass so we don't re-project
        f._p = p;
        f._depth = depth;
        f._breath01 = breath01;
        f._aCore = aHalo;
        f._colHue = colHue; f._colSat = colSat; f._colLit = colLit;
      }

      // (b) tiny bright cores — small radii, near-white centre
      for (var k2 = 0; k2 < FLOW_N; k2++) {
        var g2 = flow[k2];
        var p2 = g2._p;
        if (!p2) continue;
        var depth2 = g2._depth;
        var br2 = g2._breath01;
        var aCore = (0.55 + depth2 * depth2 * 0.7)
                  * (0.5 + 0.5 * br2)
                  * breath;
        var coreR = (g2.s * 0.85 + depth2 * 1.1 + br2 * 0.4)
                  * (DPR > 1.5 ? 1.5 : DPR);
        // hot near-white core, fading into the warm hue
        var gCore = tctx.createRadialGradient(p2[0], p2[1], 0, p2[0], p2[1], coreR);
        gCore.addColorStop(0,
          "hsla(" + g2._colHue.toFixed(1) + ",100%,"
          + (94 + depth2 * 4).toFixed(0) + "%,"
          + Math.min(1, aCore).toFixed(3) + ")");
        gCore.addColorStop(0.55,
          "hsla(" + g2._colHue.toFixed(1) + "," + g2._colSat.toFixed(0)
          + "%," + (g2._colLit + 6).toFixed(0) + "%,"
          + (aCore * 0.55).toFixed(3) + ")");
        gCore.addColorStop(1,
          "hsla(" + g2._colHue.toFixed(1) + "," + g2._colSat.toFixed(0)
          + "%," + g2._colLit.toFixed(0) + "%,0)");
        tctx.fillStyle = gCore;
        tctx.beginPath();
        tctx.arc(p2[0], p2[1], coreR, 0, 6.2832);
        tctx.fill();
        g2._p = null;
      }

      // ── 3) the head of the current: removed ──
      // (Three wandering head pulses were removed per design —
      //  the form now relies on the dust twinkle + flow breath
      //  alone, which keeps the visual quieter.)
      tctx.restore();
    }
    requestAnimationFrame(drawTopo);
  }

  /* ─────────────────────────────────────────────
     3. DIALOGUE — types itself, loops forever
     ───────────────────────────────────────────── */
  var frame = document.getElementById("dialogue");
  if (frame) {
    var SCRIPT = [
      { s: "you", t: "Explain quantum entanglement to me." },
      { s: "socrates", t: "Gladly. But first — when two coins are flipped together, are their outcomes connected?" },
      { s: "you", t: "No… each flip is independent." },
      { s: "socrates", t: "Good. So what would it take for two things to never be independent, no matter the distance?" },
      { s: "you", t: "They'd have to share… a single state?" },
      { s: "socrates", t: "Now you have discovered it yourself. Let us build on that." }
    ];
    var started = false;

    function typeLine(el, text, done) {
      var txt = el.querySelector(".dlg-text");
      var caret = document.createElement("span");
      caret.className = "dlg-caret";
      var i = 0;
      txt.textContent = "";
      txt.appendChild(caret);
      (function step() {
        if (i < text.length) {
          caret.before(text.charAt(i++));
          setTimeout(step, 18 + Math.random() * 30);
        } else {
          setTimeout(function () { caret.remove(); done(); }, 350);
        }
      })();
    }

    function playDialogue() {
      while (frame.firstChild) frame.removeChild(frame.firstChild);
      var idx = 0;
      (function next() {
        if (idx >= SCRIPT.length) {
          // hold, fade, restart
          setTimeout(function () {
            Array.prototype.forEach.call(frame.children, function (ch) {
              ch.classList.add("off");
            });
            setTimeout(playDialogue, 900);
          }, 4200);
          return;
        }
        var item = SCRIPT[idx++];
        var line = document.createElement("div");
        line.className = "dlg-line";
        line.setAttribute("data-s", item.s);
        var sp = document.createElement("div");
        sp.className = "dlg-speaker";
        sp.textContent = item.s === "you" ? "You" : "Socrates";
        var tx = document.createElement("div");
        tx.className = "dlg-text";
        line.appendChild(sp);
        line.appendChild(tx);
        frame.appendChild(line);
        // keep at most 4 lines visible
        while (frame.children.length > 4) frame.removeChild(frame.firstChild);
        requestAnimationFrame(function () { line.classList.add("on"); });
        if (reduceMotion) {
          line.querySelector(".dlg-text").textContent = item.t;
          setTimeout(next, 900);
        } else {
          typeLine(line, item.t, function () { setTimeout(next, 650); });
        }
      })();
    }

    new IntersectionObserver(function (entries, obs) {
      if (entries[0].isIntersecting && !started) {
        started = true;
        playDialogue();
        obs.disconnect();
      }
    }, { threshold: 0.35 }).observe(frame);
  }

  /* ─────────────────────────────────────────────
     4. FRONTIER — constellation of disciplines
     Nodes drift; edges appear between neighbours;
     the cursor becomes a wandering star that links in.
     ───────────────────────────────────────────── */
  var fCv = document.getElementById("frontier");
  if (fCv) {
    var fctx = fCv.getContext("2d");
    var FIELDS = [
      "Philosophy", "Mathematics", "Physics", "Poetry", "Biology", "Music",
      "History", "Logic", "Astronomy", "Ethics", "Code", "Rhetoric",
      "Economics", "Medicine", "Art"
    ];
    var nodes = [], FW = 0, FH = 0;
    var fm = { x: -9999, y: -9999, on: false };

    function sizeFrontier() {
      var r = fCv.getBoundingClientRect();
      FW = fCv.width = r.width * DPR;
      FH = fCv.height = r.height * DPR;
      nodes = FIELDS.map(function (name, i) {
        return {
          name: name,
          x: (0.08 + 0.84 * ((i * 0.618) % 1)) * FW,
          y: (0.14 + 0.72 * (((i * 0.377) + 0.21) % 1)) * FH,
          vx: (Math.random() - 0.5) * 0.18 * DPR,
          vy: (Math.random() - 0.5) * 0.18 * DPR,
          r: (2.2 + Math.random() * 1.6) * DPR
        };
      });
    }
    sizeFrontier();
    addEventListener("resize", sizeFrontier);
    fCv.addEventListener("pointermove", function (e) {
      var r = fCv.getBoundingClientRect();
      fm.x = (e.clientX - r.left) * DPR;
      fm.y = (e.clientY - r.top) * DPR;
      fm.on = true;
    });
    fCv.addEventListener("pointerleave", function () { fm.on = false; });

    var LINK = 170;
    (function frontierLoop() {
      requestAnimationFrame(frontierLoop);
      fctx.clearRect(0, 0, FW, FH);
      var linkD = LINK * DPR;
      var i, j, n, m, dx, dy, d;

      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        if (!reduceMotion) {
          n.x += n.vx; n.y += n.vy;
          if (n.x < 30 * DPR || n.x > FW - 30 * DPR) n.vx *= -1;
          if (n.y < 40 * DPR || n.y > FH - 30 * DPR) n.vy *= -1;
        }
      }
      // edges between nodes
      for (i = 0; i < nodes.length; i++) {
        for (j = i + 1; j < nodes.length; j++) {
          n = nodes[i]; m = nodes[j];
          dx = n.x - m.x; dy = n.y - m.y;
          d = Math.sqrt(dx * dx + dy * dy);
          if (d < linkD) {
            fctx.beginPath();
            fctx.moveTo(n.x, n.y); fctx.lineTo(m.x, m.y);
            fctx.strokeStyle = "hsla(44,30%,88%," + (1 - d / linkD) * 0.14 + ")";
            fctx.lineWidth = 1;
            fctx.stroke();
          }
        }
      }
      // cursor links — gold threads to nearby disciplines
      if (fm.on) {
        for (i = 0; i < nodes.length; i++) {
          n = nodes[i];
          dx = n.x - fm.x; dy = n.y - fm.y;
          d = Math.sqrt(dx * dx + dy * dy);
          if (d < linkD * 1.25) {
            fctx.beginPath();
            fctx.moveTo(n.x, n.y); fctx.lineTo(fm.x, fm.y);
            fctx.strokeStyle = "hsla(45,90%,60%," + (1 - d / (linkD * 1.25)) * 0.5 + ")";
            fctx.lineWidth = 1;
            fctx.stroke();
          }
        }
        fctx.beginPath();
        fctx.arc(fm.x, fm.y, 3 * DPR, 0, 6.2832);
        fctx.fillStyle = "hsl(45,90%,62%)";
        fctx.fill();
      }
      // nodes + labels
      fctx.font = 600 + " " + 10 * DPR + "px Inter, sans-serif";
      fctx.textAlign = "center";
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        var near = fm.on &&
          Math.abs(n.x - fm.x) < linkD && Math.abs(n.y - fm.y) < linkD;
        fctx.beginPath();
        fctx.arc(n.x, n.y, n.r, 0, 6.2832);
        fctx.fillStyle = near ? "hsl(45,90%,62%)" : "hsla(44,30%,92%,0.8)";
        fctx.fill();
        fctx.fillStyle = near ? "hsla(45,90%,66%,0.95)" : "hsla(44,20%,85%,0.45)";
        fctx.fillText(n.name.toUpperCase(), n.x, n.y - 12 * DPR);
      }
    })();
  }
})();
