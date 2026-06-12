/* ===========================================================================
 * Teaser 1D flow round-trip -- the "with the dot" animation from
 * MakeFlowReversal_1D_TwoGaussians.ipynb, in a square canvas beside the teaser.
 *
 * A 2-Gaussian data distribution (tall blue left mode, short green right mode)
 * morphs to N(0,1) noise and back. A dot rides the density curve along the
 * round trip a1 (coarse action) -> a0_hat (noise) -> a1_hat (a precise mode).
 * One slider sweeps t = 1 -> 0 -> 1, extended slightly past 1 at both ends so
 * the dot fades out above t=1 for a clean loop (the distribution itself is held
 * at its t=1 shape for t>1). Autoplay lingers ~2s at the three callouts.
 *
 * Three grey triangles under the x-axis mark a1 / a0_hat / a1_hat (KaTeX labels
 * below them). A marker lights up (enlarges + darkens) and shows its textbox
 * when the animation reaches its point OR when the user hovers its triangle, so
 * several textboxes can show at once. Boxes sit in three fixed vertical lanes so
 * they never overlap; an arrow points from each box to its dot on the curve.
 *
 * The dot's Euler polylines are shipped as JSON (exact GT-flow match, with the
 * mismatched noise/denoise step budgets that make it land at the OTHER mode).
 * The density curve and flow-destination colour fill are recomputed in-browser.
 * ======================================================================== */
(function () {
  "use strict";

  var DATA_URL = "./static/data/frs_teaser1d.json";
  var NX = 320;                 // curve / colour-partition resolution
  var TRI_GREY = "#c2c2c2", TRI_DARK = "#3a3a3a";
  var POP_WIN = 0.085;          // slider window over which a callout fades in
  var DOT_FADE = 0.06;          // t-band over which the dot fades in/out past t=1

  function byId(id) { return document.getElementById(id); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, w) { return a + (b - a) * w; }
  function hexRGB(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function mixHex(a, b, w) {
    var A = hexRGB(a), B = hexRGB(b);
    return "rgb(" + Math.round(lerp(A[0], B[0], w)) + "," + Math.round(lerp(A[1], B[1], w)) + "," + Math.round(lerp(A[2], B[2], w)) + ")";
  }

  // ---- 1D mixture math (ports _o2_* from the notebook) ---------------------
  function makeMath(M) {
    var mu = M.means, vv = M.variance, w = M.weights, K = mu.length;
    var SQRT2PI = Math.sqrt(2 * Math.PI);
    var _c = new Float64Array(K);
    function compDens(x, t, out) {
      var omt = 1 - t, omt2 = omt * omt, tot = 0;
      for (var k = 0; k < K; k++) {
        var vt = t * t * vv[k] + omt2, dx = x - t * mu[k];
        out[k] = w[k] * Math.exp(-0.5 * dx * dx / vt) / (SQRT2PI * Math.sqrt(vt));
        tot += out[k];
      }
      return tot;
    }
    function total(x, t) { return compDens(x, t, _c); }
    function postMean(x, t) {
      if (t > 1 - 1e-10) return x;
      var tot = compDens(x, t, _c); if (tot < 1e-300) tot = 1e-300;
      var omt = 1 - t, omt2 = omt * omt, out = 0;
      for (var k = 0; k < K; k++) {
        var pv = 1.0 / (1.0 / vv[k] + t * t / omt2);
        out += (_c[k] / tot) * pv * (mu[k] / vv[k] + t * x / omt2);
      }
      return out;
    }
    function velocity(x, t) { return t > 1 - 1e-6 ? 0 : -(x - postMean(x, t)) / (1 - t); }
    function destMode(x, t, steps) {
      if (t < 1 - 1e-10) {
        var dt = (1 - t) / steps, tt = t, xx = x;
        for (var i = 0; i < steps; i++) { var te = tt < 1 - 1e-5 ? tt : 1 - 1e-5; xx = xx + dt * velocity(xx, te); tt += dt; }
        x = xx;
      }
      var best = 0, bd = Infinity;
      for (var k = 0; k < K; k++) { var d = Math.abs(x - mu[k]); if (d < bd) { bd = d; best = k; } }
      return best;
    }
    return { K: K, total: total, destMode: destMode };
  }

  function interpTraj(ts, xs, t) {
    var n = ts.length, inc = ts[0] < ts[n - 1];
    var a = inc ? ts : ts.slice().reverse(), b = inc ? xs : xs.slice().reverse();
    if (t <= a[0]) return b[0];
    if (t >= a[n - 1]) return b[n - 1];
    for (var i = 1; i < n; i++) if (t <= a[i]) return lerp(b[i - 1], b[i], (t - a[i - 1]) / (a[i] - a[i - 1] || 1));
    return b[n - 1];
  }

  // ---- widget --------------------------------------------------------------
  function init(data) {
    var M = data.meta, mathf = makeMath(M);
    var frame = M.frame, xcm = M.x_curve_max, ylim = M.ylim;
    var blueIdx = M.blue_idx;
    var modeColors = [blueIdx === 0 ? M.blue : M.green, blueIdx === 0 ? M.green : M.blue];
    var nsteps = M.color_flow_steps;
    var bgColor = "rgb(" + M.panel_bg.map(function (c) { return Math.round(c * 255); }).join(",") + ")";
    var xs = new Float64Array(NX);
    for (var i = 0; i < NX; i++) xs[i] = -xcm + (2 * xcm) * i / (NX - 1);

    var stage = byId("frs1d-stage"), canvas = byId("frs1d-canvas"), ctx = canvas.getContext("2d");
    var slider = byId("frs1d-slider"), tval = byId("frs1d-tval"), playBtn = byId("frs1d-play"), ticksEl = byId("frs1d-ticks");
    var SLIDER_MAX = parseInt(slider.max, 10) || 1000;

    var EXT = 0.1, TOTAL = 2 * EXT + 2.0;
    var sA = EXT / TOTAL, sMid = (EXT + 1.0) / TOTAL, sC = (EXT + 2.0) / TOTAL;
    function stateAt(s) {
      var d = s * TOTAL, t, phase;
      if (d <= EXT) { t = (1 + EXT) - d; phase = "noise"; }
      else if (d <= EXT + 1.0) { t = 1 - (d - EXT); phase = "noise"; }
      else if (d <= EXT + 2.0) { t = (d - EXT - 1.0); phase = "denoise"; }
      else { t = 1 + (d - EXT - 2.0); phase = "denoise"; }
      return { t: t, phase: phase, dot: t <= 1.0 + 1e-9 };
    }
    function dotXAt(st) {
      var P = st.phase === "noise" ? data.noise : data.denoise;
      return interpTraj(P.ts, P.xs, clamp(st.t, 0, 1));
    }

    var markers = [
      { pop: byId("frs1d-pop1"), tri: byId("frs1d-tri1"), keyS: sA, dotX: M.a1, lane: 0, hovered: false },
      { pop: byId("frs1d-pop2"), tri: byId("frs1d-tri2"), keyS: sMid, dotX: M.a0_hat, lane: 1, hovered: false },
      { pop: byId("frs1d-pop3"), tri: byId("frs1d-tri3"), keyS: sC, dotX: M.a1_hat, lane: 2, hovered: false },
    ];
    markers.forEach(function (mk) {
      mk.shape = mk.tri.querySelector(".frs1d-tri-shape");
      mk.label = mk.tri.querySelector(".frs1d-tri-label");
      mk.tri.addEventListener("mouseenter", function () { mk.hovered = true; render(current); });
      mk.tri.addEventListener("mouseleave", function () { mk.hovered = false; render(current); });
    });

    function renderMath(tries) {
      if (!window.katex) { if (tries > 0) setTimeout(function () { renderMath(tries - 1); }, 150); return; }
      var spans = stage.querySelectorAll(".frs1d-kx");
      for (var q = 0; q < spans.length; q++) {
        try { window.katex.render(spans[q].getAttribute("data-tex"), spans[q], { throwOnError: false }); } catch (e) {}
      }
      layout();
    }
    setTimeout(function () { renderMath(20); }, 0);

    // slider tick marks at t = 1, 0, 1. The native thumb centre travels from
    // R to (W-R), not 0..W, so offset each tick by R*(1-2s) to sit under the
    // thumb where it actually pauses (R = half the styled thumb width, 16px).
    var THUMB_R = 8;
    [{ s: sA, l: "1" }, { s: sMid, l: "0" }, { s: sC, l: "1" }].forEach(function (tk) {
      var d = document.createElement("span");
      d.className = "frs1d-tick";
      d.style.left = "calc(" + (tk.s * 100) + "% + " + (THUMB_R * (1 - 2 * tk.s)).toFixed(2) + "px)";
      d.innerHTML = '<span class="frs1d-tickline"></span><span class="frs1d-ticklabel">' + tk.l + "</span>";
      ticksEl.appendChild(d);
    });

    var cssW = 0, cssH = 0, dpr = 1;
    function resize() {
      var sw = stage.clientWidth; if (!sw) return false;
      stage.style.borderWidth = Math.max(2.5, sw * 0.011) + "px";
      dpr = window.devicePixelRatio || 1;
      cssW = canvas.clientWidth || sw; cssH = cssW;
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      layout();
      return true;
    }
    function sxp(x) { return (x + frame) / (2 * frame) * cssW; }
    function syp(y) { return (ylim[1] - y) / (ylim[1] - ylim[0]) * cssH; }

    function layout() {
      var axisY = syp(0);
      // measure boxes (smaller text -> shorter); stack in lanes sized by the tallest
      var maxBw = 0, hs = [];
      for (var p = 0; p < markers.length; p++) {
        var el = markers[p].pop;
        el.style.fontSize = (cssW * 0.035) + "px";
        el.style.maxWidth = (cssW * 0.55) + "px";
        el.style.borderWidth = Math.max(1.6, cssW * 0.0085) + "px";
        hs[p] = el.offsetHeight;
        if (el.offsetWidth > maxBw) maxBw = el.offsetWidth;
      }
      var maxH = Math.max(hs[0], hs[1], hs[2]);
      var gap = cssH * 0.018, baseTop = cssH * 0.05;   // lanes never overlap
      var cx = clamp(sxp(M.a0_hat), maxBw / 2 + cssW * 0.04, cssW * 0.94 - maxBw / 2);
      for (var p2 = 0; p2 < markers.length; p2++) {
        var mk = markers[p2], el2 = mk.pop, bw = el2.offsetWidth;
        var top = baseTop + mk.lane * (maxH + gap);
        el2.style.left = Math.round(cx - bw / 2) + "px";
        el2.style.top = Math.round(top) + "px";
        mk._boxBottom = top + hs[p2];
        // vertical-line marker, dropped below the x-axis
        mk.tri.style.left = sxp(mk.dotX) + "px";
        mk.tri.style.top = (axisY + cssH * 0.03) + "px";
        mk.shape.style.width = Math.max(1.6, cssW * 0.006) + "px";
        mk.shape.style.height = Math.max(9, cssW * 0.032) + "px";
        mk.label.style.fontSize = (cssW * 0.038) + "px";
        mk.label.style.marginTop = Math.max(4, cssW * 0.018) + "px";
      }
    }

    function fillByMode(t) {
      var tot = new Float64Array(NX), md = new Int8Array(NX);
      for (var i = 0; i < NX; i++) { tot[i] = mathf.total(xs[i], t); md[i] = mathf.destMode(xs[i], t, nsteps); }
      var y0 = syp(0), seg0 = 0;
      for (var i2 = 1; i2 <= NX; i2++) {
        if (i2 === NX || md[i2] !== md[seg0]) {
          var lx, ly, rx, ry;
          if (seg0 === 0) { lx = xs[0]; ly = tot[0]; } else { lx = 0.5 * (xs[seg0 - 1] + xs[seg0]); ly = 0.5 * (tot[seg0 - 1] + tot[seg0]); }
          if (i2 === NX) { rx = xs[NX - 1]; ry = tot[NX - 1]; } else { rx = 0.5 * (xs[i2 - 1] + xs[i2]); ry = 0.5 * (tot[i2 - 1] + tot[i2]); }
          ctx.beginPath(); ctx.moveTo(sxp(lx), y0); ctx.lineTo(sxp(lx), syp(ly));
          for (var j = seg0; j < i2; j++) ctx.lineTo(sxp(xs[j]), syp(tot[j]));
          ctx.lineTo(sxp(rx), syp(ry)); ctx.lineTo(sxp(rx), y0); ctx.closePath();
          ctx.fillStyle = modeColors[md[seg0]]; ctx.fill();
          seg0 = i2;
        }
      }
    }

    function render(s) {
      var st = stateAt(s), tDist = Math.min(st.t, 1.0);
      ctx.save(); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, cssW, cssH);
      fillByMode(tDist);
      // density curve
      ctx.beginPath();
      for (var i = 0; i < NX; i++) { var px = sxp(xs[i]), py = syp(mathf.total(xs[i], tDist)); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.strokeStyle = M.line_color; ctx.lineWidth = Math.max(2.2, cssW * 0.012); ctx.lineJoin = "round"; ctx.stroke();

      // markers: triangle light-up + textbox opacity (anim proximity or hover)
      var R = Math.max(3.5, cssW * 0.017);
      for (var p = 0; p < markers.length; p++) {
        var mk = markers[p];
        // the autoplay callout only fires while the dot is on the plot (t <= 1);
        // hover can still reveal a box independently.
        var animInt = st.dot ? clamp(1 - Math.abs(s - mk.keyS) / POP_WIN, 0, 1) : 0;
        var lit = Math.max(animInt, mk.hovered ? 1 : 0);
        mk._lit = lit;
        mk.shape.style.transform = "scale(" + (1 + 0.35 * lit) + ")";
        var col = mixHex(TRI_GREY, TRI_DARK, lit);
        mk.shape.style.background = col;
        mk.label.style.color = col;
        mk.pop.style.opacity = lit;
      }
      // arrows: STRAIGHT DOWN at the marker's x. Shaft stops at the head base so
      // the sharp arrowhead tip is clean (no rectangular shaft poking through).
      for (var p2 = 0; p2 < markers.length; p2++) {
        var m2 = markers[p2]; if (m2._lit <= 0.12) continue;
        var ax = sxp(m2.dotX), ay = syp(mathf.total(m2.dotX, tDist));
        var headLen = Math.max(7, cssW * 0.028), headHalf = Math.max(3.2, cssW * 0.012);
        var tipY = ay - R - Math.max(4, cssW * 0.02);          // small gap above the dot
        var y0 = m2._boxBottom + 2;
        if (tipY - headLen > y0) {
          ctx.save(); ctx.globalAlpha = m2._lit;
          ctx.strokeStyle = "#7f7f7f"; ctx.fillStyle = "#7f7f7f";
          ctx.lineWidth = Math.max(1.5, cssW * 0.007); ctx.lineCap = "butt";
          ctx.beginPath(); ctx.moveTo(ax, y0); ctx.lineTo(ax, tipY - headLen + 0.5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ax, tipY); ctx.lineTo(ax - headHalf, tipY - headLen); ctx.lineTo(ax + headHalf, tipY - headLen); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
      // the moving dot fades in/out across the t=1 boundary (graceful loop)
      var dotAlpha = clamp((1.0 + DOT_FADE - st.t) / DOT_FADE, 0, 1);
      if (dotAlpha > 0.01) {
        var dx = dotXAt(st), dpx = sxp(dx), dpy = syp(mathf.total(dx, tDist));
        ctx.save(); ctx.globalAlpha = dotAlpha;
        ctx.beginPath(); ctx.arc(dpx, dpy, R, 0, 2 * Math.PI);
        ctx.fillStyle = M.dot_face; ctx.fill();
        ctx.lineWidth = Math.max(2.0, cssW * 0.011); ctx.strokeStyle = M.dot_edge; ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      tval.textContent = Math.min(st.t, 1).toFixed(2);
    }

    // ---- slider / autoplay ---------------------------------------------------
    var current = 0;
    function renderFromSlider() { current = parseInt(slider.value, 10) / SLIDER_MAX; render(current); }
    function relayout() { if (resize()) render(current); }
    var SNAP = [0, sA, sMid, sC, 1].sort(function (a, b) { return a - b; });
    slider.addEventListener("input", function () { stopPlay(); renderFromSlider(); });
    slider.addEventListener("change", function () {
      var s = parseInt(slider.value, 10) / SLIDER_MAX, best = s, bd = 0.035;
      for (var k = 0; k < SNAP.length; k++) { var d = Math.abs(s - SNAP[k]); if (d < bd) { bd = d; best = SNAP[k]; } }
      if (best !== s) { current = best; slider.value = Math.round(best * SLIDER_MAX); render(current); }
    });

    var SEG = [
      { from: 0, to: sA, move: 0.5, hold: 2.0 },
      { from: sA, to: sMid, move: 2.2, hold: 2.0 },
      { from: sMid, to: sC, move: 2.2, hold: 2.0 },
      { from: sC, to: 1, move: 0.5, hold: 0.0 },
    ];
    var LOOP = SEG.reduce(function (a, g) { return a + g.move + g.hold; }, 0);
    function sAtClock(c) {
      c = c % LOOP; var acc = 0;
      for (var i = 0; i < SEG.length; i++) {
        var g = SEG[i];
        if (c < acc + g.move) return lerp(g.from, g.to, (c - acc) / g.move);
        acc += g.move; if (c < acc + g.hold) return g.to; acc += g.hold;
      }
      return 1;
    }
    function invClock(s) {
      var acc = 0;
      for (var i = 0; i < SEG.length; i++) {
        var g = SEG[i];
        if ((g.from <= g.to && s >= g.from && s <= g.to) || (g.from > g.to && s <= g.from && s >= g.to))
          return acc + g.move * (s - g.from) / ((g.to - g.from) || 1);
        acc += g.move + g.hold;
      }
      return 0;
    }
    var playing = false, clock = 0, lastTs = 0;
    function tick(ts) {
      if (!playing) return;
      if (!lastTs) lastTs = ts;
      clock += (ts - lastTs) / 1000; lastTs = ts;
      current = sAtClock(clock);
      slider.value = Math.round(current * SLIDER_MAX);
      render(current);
      requestAnimationFrame(tick);
    }
    function startPlay() { if (playing) return; playing = true; lastTs = 0; clock = current >= 1 ? 0 : invClock(current); playBtn.textContent = "❚❚ Pause"; requestAnimationFrame(tick); }
    function stopPlay() { if (!playing) return; playing = false; playBtn.textContent = "▶ Play"; }
    playBtn.addEventListener("click", function () { playing ? stopPlay() : startPlay(); });

    window.addEventListener("resize", relayout);
    if (resize()) { render(0); startPlay(); } else { render(0); }
  }

  function boot() {
    var host = byId("frs1d-stage");
    if (!host) return;
    fetch(DATA_URL).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(init).catch(function (e) {
        host.innerHTML = '<p style="color:#a00;font-size:0.8rem;text-align:center;padding:1rem">Could not load teaser animation (' + e.message + ").</p>";
      });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
