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
    function formTorus(u, v, t, out) {
      // (p,q) torus knot — (2,3) trefoil, traveling-wave breathing
      var a = u * Math.PI * 2;
      var s2 = Math.sin(2 * a), c2 = Math.cos(2 * a);
      var s3 = Math.sin(3 * a), c3 = Math.cos(3 * a);
      var wave = 0.34 * Math.sin(2 * a + t * 1.35)
               + 0.18 * Math.sin(5 * a - t * 0.8);
      var r = 2 + c3 + wave;
      out[0] = r * c2;
      out[1] = r * s2;
      out[2] = s3 * (1 + 0.4 * Math.sin(a + t))
             + 0.3 * Math.sin(4 * a - t * 1.6);
    }

    function formKnot(u, v, t, out) {
      // (3,2) torus knot — visually distinct from the trefoil
      var a = u * Math.PI * 2;
      var s2 = Math.sin(2 * a), c2 = Math.cos(2 * a);
      var s3 = Math.sin(3 * a), c3 = Math.cos(3 * a);
      var pulse = 0.25 * Math.sin(a * 4 + t * 0.9);
      var r = 2.1 + c2 + pulse;
      out[0] = r * c3;
      out[1] = r * s3;
      out[2] = s2 * (1.15 + 0.25 * Math.sin(a * 2 - t))
             + 0.35 * Math.cos(5 * a + t * 0.6);
    }

    function formSphere(u, v, t, out) {
      // wireframe sphere — latitude ring at v, longitude sweep at u
      var lon = u * Math.PI * 2;
      var lat = (v - 0.5) * Math.PI;
      var breathe = 1 + 0.08 * Math.sin(t * 0.7 + v * 3.0);
      out[0] = 2.2 * Math.cos(lat) * Math.cos(lon) * breathe;
      out[1] = 2.2 * Math.cos(lat) * Math.sin(lon) * breathe;
      out[2] = 2.2 * Math.sin(lat) * breathe;
    }

    function formSpiral(u, v, t, out) {
      // logarithmic spiral sheet — u = turn, v = vertical band
      var turns = 3.5;
      var a = u * turns * Math.PI * 2;
      var r = Math.exp(0.34 * (u - 0.5) * turns) * (1.6 + 0.4 * Math.sin(t));
      var band = (v - 0.5) * 1.4;
      out[0] = r * Math.cos(a);
      out[1] = band + 0.25 * Math.sin(a * 2 + t);
      out[2] = r * Math.sin(a);
    }

    function formSurface(u, v, t, out) {
      // rippled paraboloid / saddle surface — feels architectural
      var a = u * Math.PI * 2;
      var h = (v - 0.5) * 2.4;
      var r = 2.1 * Math.sqrt(Math.max(0, 1.6 - h * h * 0.6));
      var ripple = 0.35 * Math.sin(a * 3 + t * 1.2)
                 + 0.18 * Math.cos(v * 6 - t * 0.9);
      out[0] = r * Math.cos(a) * (1 + ripple * 0.18);
      out[1] = h;
      out[2] = r * Math.sin(a) * (1 + ripple * 0.18);
    }

    function formHelix(u, v, t, out) {
      // DNA double helix — two intertwined strands phase-offset by π,
      // climbing along Y. v picks which strand (0 vs 1) and v<0.5
      // animates the rungs slightly so the helix feels alive.
      var a = u * Math.PI * 6;                 // 3 full turns
      var strand = v < 0.5 ? 0 : 1;            // strand index
      var phase = strand * Math.PI;            // 180° offset
      var climb = (u - 0.5) * 4.4;             // vertical span
      var r = 1.55 + 0.18 * Math.sin(a * 2 - t * 0.9);
      out[0] = r * Math.cos(a + phase);
      out[1] = climb + 0.12 * Math.sin(t * 0.6 + strand);
      out[2] = r * Math.sin(a + phase);
    }

    function formMobius(u, v, t, out) {
      // Möbius strip — single non-orientable surface.
      // u sweeps around the loop, v slides across the band.
      var a = u * Math.PI * 2;
      var b = (v - 0.5) * 1.4;                 // half-width of the band
      // half-twist: the band rotates by u*π as it goes around
      var twist = a * 0.5;
      var R = 2.0 + 0.16 * Math.sin(t * 0.7);
      out[0] = (R + b * Math.cos(twist)) * Math.cos(a);
      out[1] = b * Math.sin(twist);
      out[2] = (R + b * Math.cos(twist)) * Math.sin(a);
    }

    function formRibbon(u, v, t, out) {
      // twisted ribbon — like a Möbius cousin but with a free
      // vertical climb and a softer, more dancer-like profile.
      var a = u * Math.PI * 2;
      var h = (v - 0.5) * 1.6;
      var twist = a * 1.5 + t * 0.4;
      var R = 1.9 + 0.22 * Math.sin(a * 2 + t * 0.8);
      out[0] = (R + h * Math.cos(twist)) * Math.cos(a);
      out[1] = (u - 0.5) * 3.6 + 0.25 * Math.sin(t * 0.5);
      out[2] = (R + h * Math.cos(twist)) * Math.sin(a);
    }

    function formLattice(u, v, t, out) {
      // braiding / lattice — two weft strands weaving through
      // each other along Y, with periodic crossings. Feels
      // structured and architectural (think graphene lattice).
      var y = (v - 0.5) * 4.0;
      var a = u * Math.PI * 4;               // 2 full turns per cycle
      var r = 1.55 + 0.22 * Math.sin(t * 0.9);
      // two strands: one along Y, one weaving in/out
      var strand = v < 0.5 ? 0 : 1;
      var weave = Math.sin(y * 1.6 + t * 0.7 + strand * Math.PI);
      out[0] = r * Math.cos(a) * (1 + 0.15 * weave);
      out[1] = y + 0.18 * Math.sin(t * 0.5 + strand);
      out[2] = r * Math.sin(a) * (1 + 0.15 * weave);
    }

    function formRose(u, v, t, out) {
      // rose-curve surface — a flower petal pattern in the
      // (x, z) plane, with v spreading the surface vertically.
      var k = 5;                              // 5 petals
      var a = u * Math.PI * 2;
      var r = Math.abs(Math.cos(k * a * 0.5)) * 2.1;
      var h = (v - 0.5) * 1.8;
      r *= 1 + 0.15 * Math.sin(t * 0.9);
      out[0] = r * Math.cos(a);
      out[1] = h + 0.18 * Math.sin(a * 2 + t * 0.6);
      out[2] = r * Math.sin(a);
    }

    function formHyperbolic(u, v, t, out) {
      // hyperbolic paraboloid — a classical saddle with a
      // gentle undulation along the diagonal. v spreads the
      // surface from −1 to +1 along the wind axis.
      var a = u * Math.PI * 2;
      var h = (v - 0.5) * 2.4;
      var r = 1.9 + 0.4 * Math.sin(a * 2 - t * 0.8);
      // the saddle: outer edges flare, middle dips
      var lift = 0.45 * Math.cos(a) * h;
      out[0] = r * Math.cos(a);
      out[1] = h + lift;
      out[2] = r * Math.sin(a);
    }

    function formWave(u, v, t, out) {
      // wave surface — concentric ripples flowing outward
      // from a centre, with a slight vertical tilt so the
      // surface reads as a pond, not a flat target.
      var a = u * Math.PI * 2;
      var rad = 0.35 + v * 1.85;             // 0.35..2.20
      var ring = 6;
      var amp = 0.32 * Math.sin(rad * ring - t * 1.6) * (1 - v * 0.6);
      var slope = 0.18 * Math.sin(a * 2 + t * 0.5);
      out[0] = (rad + amp * 0.6) * Math.cos(a);
      out[1] = amp + slope;
      out[2] = (rad + amp * 0.6) * Math.sin(a);
    }

    /* The form sequence — the morph clock walks through this
       list in order, crossfading between neighbours. Each form
       has a distinct silhouette so the rotation never reads as
       the same pose: a knot, a sphere, a ribbon, a saddle, a
       lattice, a rose, a helix, a wave… */
    var FORMS = [
      formTorus,        // 1.  (2,3) trefoil torus knot
      formKnot,         // 2.  (3,2) torus knot
      formSphere,       // 3.  wireframe sphere
      formSpiral,       // 4.  logarithmic spiral sheet
      formSurface,      // 5.  rippled paraboloid / saddle
      formHelix,        // 6.  DNA double helix
      formMobius,       // 7.  Möbius strip
      formRibbon,       // 8.  twisted dancer ribbon
      formLattice,      // 9.  weft lattice / graphene-style weave
      formRose,         // 10. 5-petal rose curve
      formHyperbolic,   // 11. hyperbolic paraboloid (saddle)
      formWave          // 12. concentric ripple wave
    ];

    /* sample a form with smooth crossfade to its neighbour */
    function sampleForm(u, v, t, blend, out) {
      var i = Math.floor(blend) % FORMS.length;
      var j = (i + 1) % FORMS.length;
      var k = blend - Math.floor(blend); // 0..1 within pair
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
