/* ===========================================================================
 * Flow Reversal vs. Forward Diffusion Noising -- interactive round-trip widget.
 *
 * Two side-by-side canvases share one slider that sweeps a round trip
 *   t = 1 (data)  ->  0 (noise)  ->  1 (reconstruction).
 * Left  ("Forward Diffusion"): noise by x_t = t*x0 + (1-t)*eps, then GT-flow
 *   denoise -- the t=0 noise is independent of the start, so points re-route
 *   across quadrants and DON'T return home.
 * Right ("Flow Reversal"): noise by integrating the GT flow ODE backward, then
 *   forward -- the deterministic flow round-trips every point back to t=1.
 *
 * The point trajectories are precomputed (static/data/frs_roundtrip.json,
 * exact match to MakeFlowReversal_2D_FourGaussians.ipynb). The backgrounds and
 * contour rings are recomputed analytically in-browser each frame (no image
 * frames). The two panels use DIFFERENT backgrounds, matching the notebook:
 *   - Forward Diffusion -> responsibility background: the diffusion marginal
 *     p_t(x) coloured by component responsibility (a smooth blend of the four
 *     mode colours).
 *   - Flow Reversal -> flow-basin background: every point integrated forward
 *     along the GT flow ODE to t=1 and coloured by the mode it lands in -- SHARP
 *     basins (which Gaussian each bit of noise flows to), not a colour blend.
 * The contour rings (density isolines) are shared. Backgrounds snap to the
 * nearest of nf distinct t-values; the flow-basin one is cached per t-index.
 * ======================================================================== */
(function () {
  "use strict";

  var DATA_URL = "./static/data/frs_roundtrip.json";
  var BG_GRID = 132;          // diffusion (responsibility) background + contour grid
  var FLOW_GRID = 104;        // flow-basin background grid (coarser; an ODE per cell)
  var FLOW_DT = 0.02;         // GT-flow Euler step for the basin map (figure uses 0.01; basins are step-robust)
  var DOT_RADIUS = 2.6;       // point radius (css px)
  var TRACE_LW = 1.0;         // trajectory trace width (css px)
  var TRACE_ALPHA = 0.32;
  var BORDER_COLOR = "#a4a6a6";

  function lerp(a, b, w) { return a + (b - a) * w; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // ---- one-time precompute of static per-cell geometry (grid coords) -------
  function makeGrid(maxAbs, G) {
    var xs = new Float64Array(G);
    for (var i = 0; i < G; i++) xs[i] = -maxAbs + (2 * maxAbs) * i / (G - 1);
    return xs;
  }

  // Compute the shared background image + contour segments for a given t.
  // Returns {img: ImageData(G,G), segs: [[x0,y0,x1,y1,levelIdx],...] world coords}.
  function computeShared(t, M, xs, G, scratch) {
    var means = M.means, variance = M.variance, crgb = M.component_rgb;
    var flat = M.flat_bg_rgb, boost = M.color_boost, darken = M.max_density_darken;
    var gamma = M.density_gamma, lighten = M.bg_lighten;
    var K = means.length;
    var LOG_PI = Math.log(1.0 / K);
    var TWO_PI = 2 * Math.PI;

    // per-component marginal var + mean at this t
    var vt = new Float64Array(K), mtx = new Float64Array(K), mty = new Float64Array(K);
    var logNorm = new Float64Array(K);
    for (var k = 0; k < K; k++) {
      vt[k] = t * t * variance[k] + (1 - t) * (1 - t);
      mtx[k] = t * means[k][0];
      mty[k] = t * means[k][1];
      logNorm[k] = LOG_PI - Math.log(TWO_PI * vt[k]);
    }

    var density = scratch.density;   // Float64 G*G, row-major (iy*G+ix), iy along +y
    var hueR = scratch.hueR, hueG = scratch.hueG, hueB = scratch.hueB;
    var peak = 0.0;
    var lc = new Float64Array(K);
    for (var iy = 0; iy < G; iy++) {
      var y = xs[iy];
      var rowoff = iy * G;
      for (var ix = 0; ix < G; ix++) {
        var x = xs[ix];
        // log component densities + logsumexp
        var mx = -Infinity;
        for (var k2 = 0; k2 < K; k2++) {
          var dx = x - mtx[k2], dy = y - mty[k2];
          var l = logNorm[k2] - 0.5 * (dx * dx + dy * dy) / vt[k2];
          lc[k2] = l;
          if (l > mx) mx = l;
        }
        var ssum = 0.0;
        for (var k3 = 0; k3 < K; k3++) ssum += Math.exp(lc[k3] - mx);
        var logDen = mx + Math.log(ssum);
        var den = Math.exp(logDen);
        // responsibility-weighted hue
        var hr = 0, hg = 0, hb = 0;
        for (var k4 = 0; k4 < K; k4++) {
          var r = Math.exp(lc[k4] - logDen);
          hr += r * crgb[k4][0]; hg += r * crgb[k4][1]; hb += r * crgb[k4][2];
        }
        // boost_hue: clip((flat + boost*(hue-flat))*darken, 0,1)
        hr = (flat[0] + boost * (hr - flat[0])) * darken;
        hg = (flat[1] + boost * (hg - flat[1])) * darken;
        hb = (flat[2] + boost * (hb - flat[2])) * darken;
        hueR[rowoff + ix] = hr < 0 ? 0 : (hr > 1 ? 1 : hr);
        hueG[rowoff + ix] = hg < 0 ? 0 : (hg > 1 ? 1 : hg);
        hueB[rowoff + ix] = hb < 0 ? 0 : (hb > 1 ? 1 : hb);
        density[rowoff + ix] = den;
        if (den > peak) peak = den;
      }
    }

    // second pass -> ImageData (row 0 = top = +y, so flip iy)
    var img = scratch.img;
    var px = img.data;
    var invPeak = peak > 0 ? 1.0 / peak : 0.0;
    var omL = 1.0 - lighten;
    for (var ry = 0; ry < G; ry++) {
      var srcIy = G - 1 - ry;           // top row shows largest y
      var so = srcIy * G, dstOff = ry * G * 4;
      for (var rx = 0; rx < G; rx++) {
        var a = Math.pow(density[so + rx] * invPeak, gamma);
        // lighten_density_layers
        var hR = omL * hueR[so + rx] + lighten * flat[0];
        var hG = omL * hueG[so + rx] + lighten * flat[1];
        var hB = omL * hueB[so + rx] + lighten * flat[2];
        a = omL * a;
        var oa = 1.0 - a;
        var cr = oa * flat[0] + a * hR;
        var cg = oa * flat[1] + a * hG;
        var cb = oa * flat[2] + a * hB;
        var d4 = dstOff + rx * 4;
        px[d4] = (cr * 255) | 0;
        px[d4 + 1] = (cg * 255) | 0;
        px[d4 + 2] = (cb * 255) | 0;
        px[d4 + 3] = 255;
      }
    }

    // contour ring levels (matches density_contour_line_levels)
    var segs = [];
    if (peak > 0) {
      var floorLevel = peak * M.contour_min_peak_fraction;
      if (floorLevel < peak) {
        var rMax = Math.sqrt(-2.0 * Math.log(floorLevel / peak));
        var nRings = Math.floor(rMax / M.contour_r_spacing);
        for (var ri = 1; ri <= nRings; ri++) {
          var rr = M.contour_r_spacing * ri;
          var level = peak * Math.exp(-0.5 * rr * rr);
          if (level >= floorLevel && level < peak) {
            marchingSquares(density, G, xs, level, segs);
          }
        }
      }
    }
    return { img: img, segs: segs };
  }

  // Marching squares -> push line segments [x0,y0,x1,y1] (world coords) into out.
  function marchingSquares(field, G, xs, level, out) {
    function interp(xa, ya, va, xb, yb, vb) {
      var w = (level - va) / (vb - va);
      return [xa + (xb - xa) * w, ya + (yb - ya) * w];
    }
    for (var iy = 0; iy < G - 1; iy++) {
      for (var ix = 0; ix < G - 1; ix++) {
        var x0 = xs[ix], x1 = xs[ix + 1], y0 = xs[iy], y1 = xs[iy + 1];
        var tl = field[iy * G + ix], tr = field[iy * G + ix + 1];
        var bl = field[(iy + 1) * G + ix], br = field[(iy + 1) * G + ix + 1];
        var code = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) |
                   (br > level ? 2 : 0) | (bl > level ? 1 : 0);
        if (code === 0 || code === 15) continue;
        // edge crossings: top(tl-tr), right(tr-br), bottom(bl-br), left(tl-bl)
        var top = null, right = null, bottom = null, left = null;
        if ((tl > level) !== (tr > level)) top = interp(x0, y0, tl, x1, y0, tr);
        if ((tr > level) !== (br > level)) right = interp(x1, y0, tr, x1, y1, br);
        if ((bl > level) !== (br > level)) bottom = interp(x0, y1, bl, x1, y1, br);
        if ((tl > level) !== (bl > level)) left = interp(x0, y0, tl, x0, y1, bl);
        function push(a, b) { if (a && b) out.push([a[0], a[1], b[0], b[1]]); }
        switch (code) {
          case 1: case 14: push(left, bottom); break;
          case 2: case 13: push(bottom, right); break;
          case 3: case 12: push(left, right); break;
          case 4: case 11: push(top, right); break;
          case 6: case 9:  push(top, bottom); break;
          case 7: case 8:  push(left, top); break;
          case 5:  push(left, top); push(bottom, right); break;   // ambiguous
          case 10: push(left, bottom); push(top, right); break;   // ambiguous
        }
      }
    }
  }

  // Flow-basin background for time t: integrate every grid point FORWARD along
  // the GT probability-flow ODE to t=1, then colour it by the data Gaussian it
  // lands nearest. This yields SHARP basins (which mode each noise sample flows
  // to) -- matching flow_grid_layers / the notebook's "Flow Integration" row --
  // not the smooth responsibility blend. Opacity follows the marginal density at
  // t. Expensive (an ODE per cell), so the caller caches it per t. Writes outImg.
  function computeFlowImg(t, M, xs, G, scratch, FLOW_DT, outImg) {
    var means = M.means, variance = M.variance, crgb = M.component_rgb;
    var flat = M.flat_bg_rgb, boost = M.color_boost, darken = M.max_density_darken;
    var gamma = M.grid_opacity_gamma, lighten = M.bg_lighten;
    var K = means.length, TWO_PI = 2 * Math.PI;
    var mux = new Float64Array(K), muy = new Float64Array(K), invVarData = new Float64Array(K);
    for (var k = 0; k < K; k++) { mux[k] = means[k][0]; muy[k] = means[k][1]; invVarData[k] = 1.0 / variance[k]; }

    // Integration t-schedule t -> 1 (shared by every cell), with the per-step,
    // x-INDEPENDENT posterior-mean constants precomputed once.
    var n = Math.max(0, Math.round((1.0 - t) / FLOW_DT));
    var sTmx = [], sTmy = [], sIvt = [], sAx = [], sAy = [], sB = [], sVel = [], sSkip = [];
    for (var i = 0; i < n; i++) {
      var ti = t + i * FLOW_DT;
      sSkip.push(ti > 1.0 - 1e-6);
      var omt = 1.0 - ti, omt2 = omt * omt;
      var tmx = new Float64Array(K), tmy = new Float64Array(K), ivt = new Float64Array(K),
          ax = new Float64Array(K), ay = new Float64Array(K), b = new Float64Array(K);
      for (var k2 = 0; k2 < K; k2++) {
        ivt[k2] = 1.0 / (ti * ti * variance[k2] + omt2);
        tmx[k2] = ti * mux[k2]; tmy[k2] = ti * muy[k2];
        var postVar = 1.0 / (invVarData[k2] + ti * ti / omt2);
        ax[k2] = postVar * mux[k2] * invVarData[k2];
        ay[k2] = postVar * muy[k2] * invVarData[k2];
        b[k2] = postVar * ti / omt2;
      }
      sTmx.push(tmx); sTmy.push(tmy); sIvt.push(ivt); sAx.push(ax); sAy.push(ay); sB.push(b);
      sVel.push(omt > 1e-9 ? 1.0 / omt : 0.0);
    }

    // marginal-density constants at t (for opacity)
    var dTmx = new Float64Array(K), dTmy = new Float64Array(K), dIvt = new Float64Array(K), dNorm = new Float64Array(K);
    var omt0 = 1.0 - t, omt02 = omt0 * omt0;
    for (var k3 = 0; k3 < K; k3++) {
      var vt0 = t * t * variance[k3] + omt02;
      dIvt[k3] = 1.0 / vt0; dTmx[k3] = t * mux[k3]; dTmy[k3] = t * muy[k3];
      dNorm[k3] = (1.0 / K) / (TWO_PI * vt0);
    }

    var labels = scratch.labels, density = scratch.density, lc = new Float64Array(K);
    var peak = 0.0;
    for (var iy = 0; iy < G; iy++) {
      var y0 = xs[iy], rowoff = iy * G;
      for (var ix = 0; ix < G; ix++) {
        var x0 = xs[ix];
        var den = 0.0;
        for (var kd = 0; kd < K; kd++) {
          var ddx = x0 - dTmx[kd], ddy = y0 - dTmy[kd];
          den += dNorm[kd] * Math.exp(-0.5 * (ddx * ddx + ddy * ddy) * dIvt[kd]);
        }
        density[rowoff + ix] = den; if (den > peak) peak = den;
        // integrate this point forward to t=1
        var x = x0, y = y0;
        for (var st = 0; st < n; st++) {
          if (sSkip[st]) continue;
          var tmx2 = sTmx[st], tmy2 = sTmy[st], ivt2 = sIvt[st],
              ax2 = sAx[st], ay2 = sAy[st], b2 = sB[st], vel = sVel[st];
          var mx = -Infinity;
          for (var kk = 0; kk < K; kk++) { var ex = x - tmx2[kk], ey = y - tmy2[kk]; var l = -0.5 * (ex * ex + ey * ey) * ivt2[kk]; lc[kk] = l; if (l > mx) mx = l; }
          var ssum = 0.0;
          for (var kk2 = 0; kk2 < K; kk2++) { lc[kk2] = Math.exp(lc[kk2] - mx); ssum += lc[kk2]; }
          var inv = 1.0 / ssum, pmx = 0.0, pmy = 0.0;
          for (var kk3 = 0; kk3 < K; kk3++) { var r = lc[kk3] * inv; pmx += r * (ax2[kk3] + b2[kk3] * x); pmy += r * (ay2[kk3] + b2[kk3] * y); }
          x += FLOW_DT * (-(x - pmx) * vel); y += FLOW_DT * (-(y - pmy) * vel);
        }
        // assign nearest data Gaussian (equal weights+var => nearest mean)
        var best = 0, bestVal = -Infinity;
        for (var ka = 0; ka < K; ka++) { var bx = x - mux[ka], by = y - muy[ka]; var v = -(bx * bx + by * by) * invVarData[ka]; if (v > bestVal) { bestVal = v; best = ka; } }
        labels[rowoff + ix] = best;
      }
    }

    var px = outImg.data, invPeak = peak > 0 ? 1.0 / peak : 0.0, omL = 1.0 - lighten;
    for (var ry = 0; ry < G; ry++) {
      var srcIy = G - 1 - ry, so = srcIy * G, dstOff = ry * G * 4;
      for (var rx = 0; rx < G; rx++) {
        var lab = labels[so + rx];
        var hr = (flat[0] + boost * (crgb[lab][0] - flat[0])) * darken;
        var hg = (flat[1] + boost * (crgb[lab][1] - flat[1])) * darken;
        var hb = (flat[2] + boost * (crgb[lab][2] - flat[2])) * darken;
        hr = hr < 0 ? 0 : (hr > 1 ? 1 : hr); hg = hg < 0 ? 0 : (hg > 1 ? 1 : hg); hb = hb < 0 ? 0 : (hb > 1 ? 1 : hb);
        var a = Math.pow(density[so + rx] * invPeak, gamma);
        hr = omL * hr + lighten * flat[0]; hg = omL * hg + lighten * flat[1]; hb = omL * hb + lighten * flat[2]; a = omL * a;
        var oa = 1.0 - a, d4 = dstOff + rx * 4;
        px[d4] = ((oa * flat[0] + a * hr) * 255) | 0;
        px[d4 + 1] = ((oa * flat[1] + a * hg) * 255) | 0;
        px[d4 + 2] = ((oa * flat[2] + a * hb) * 255) | 0;
        px[d4 + 3] = 255;
      }
    }
    return outImg;
  }

  // ---- a single panel (canvas) --------------------------------------------
  function Panel(canvas, scheme, data) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.scheme = scheme;
    this.positions = data.schemes[scheme];   // [F][N][2]
    this.labels = data.labels;
    this.meta = data.meta;
    this.cssSize = 0;
    this.dpr = 1;
  }

  Panel.prototype.resize = function () {
    var size = this.canvas.clientWidth;
    if (!size) return false;
    this.dpr = window.devicePixelRatio || 1;
    this.cssSize = size;
    this.canvas.width = Math.round(size * this.dpr);
    this.canvas.height = Math.round(size * this.dpr);
    return true;
  };

  Panel.prototype.draw = function (fc, shared, bgCanvas, pointAlpha) {
    var ctx = this.ctx, S = this.cssSize, dpr = this.dpr, m = this.meta;
    var maxAbs = m.max_abs, F = this.positions.length, N = this.labels.length;
    if (!S) return;
    if (pointAlpha == null) pointAlpha = 1;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, S, S);
    var sx = function (x) { return (x + maxAbs) / (2 * maxAbs) * S; };
    var sy = function (y) { return (maxAbs - y) / (2 * maxAbs) * S; };

    // 1) shared analytic background (scaled up smoothly, ~ imshow bilinear)
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bgCanvas, 0, 0, S, S);

    var nf = m.nf, pos = this.positions, labels = this.labels, sat = m.sat_rgb;
    var i0 = Math.min(Math.floor(fc), F - 1);
    var i1 = Math.min(i0 + 1, F - 1);
    var frac = fc - i0;
    var noising = fc <= (nf - 1);
    var P0 = pos[i0], P1 = pos[i1];
    function col(c) { return "rgb(" + (c[0] * 255 | 0) + "," + (c[1] * 255 | 0) + "," + (c[2] * 255 | 0) + ")"; }
    ctx.lineWidth = TRACE_LW; ctx.lineJoin = "round"; ctx.lineCap = "round";

    // 2a) OLD noising trace -- once denoising starts it fades out over a short
    // window (and also fades with the points during the post-roll), instead of
    // vanishing abruptly at the noising->denoising hand-off.
    if (!noising) {
      var oldFade = clamp(1 - (fc - (nf - 1)) / (nf * 0.3), 0, 1) * pointAlpha;
      if (oldFade > 0.01) {
        ctx.globalAlpha = TRACE_ALPHA * oldFade;
        for (var p = 0; p < N; p++) {
          ctx.strokeStyle = col(sat[labels[p]]);
          ctx.beginPath();
          ctx.moveTo(sx(pos[0][p][0]), sy(pos[0][p][1]));
          for (var f = 1; f < nf; f++) ctx.lineTo(sx(pos[f][p][0]), sy(pos[f][p][1]));
          ctx.stroke();
        }
      }
    }

    // 2b) current-phase trace (path travelled so far this phase), fades with points
    var traceStart = noising ? 0 : nf;
    ctx.globalAlpha = TRACE_ALPHA * pointAlpha;
    for (var q = 0; q < N; q++) {
      if (i0 <= traceStart) break;
      ctx.strokeStyle = col(sat[labels[q]]);
      ctx.beginPath();
      ctx.moveTo(sx(pos[traceStart][q][0]), sy(pos[traceStart][q][1]));
      for (var g = traceStart + 1; g <= i0; g++) ctx.lineTo(sx(pos[g][q][0]), sy(pos[g][q][1]));
      ctx.lineTo(sx(lerp(P0[q][0], P1[q][0], frac)), sy(lerp(P0[q][1], P1[q][1], frac)));
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // 3) contour rings (shared, part of the distribution -- not faded)
    ctx.strokeStyle = "#000000"; ctx.globalAlpha = m.contour_alpha; ctx.lineWidth = 1.0;
    ctx.beginPath();
    var segs = shared.segs;
    for (var s2 = 0; s2 < segs.length; s2++) { var sg = segs[s2]; ctx.moveTo(sx(sg[0]), sy(sg[1])); ctx.lineTo(sx(sg[2]), sy(sg[3])); }
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // 4) points (interpolated), faded in/out across the t=1 boundary
    if (pointAlpha > 0.01) {
      ctx.globalAlpha = pointAlpha;
      for (var r = 0; r < N; r++) {
        ctx.fillStyle = col(sat[labels[r]]);
        ctx.beginPath();
        ctx.arc(sx(lerp(P0[r][0], P1[r][0], frac)), sy(lerp(P0[r][1], P1[r][1], frac)), DOT_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    }
    ctx.restore();
  };

  // ---- widget controller ---------------------------------------------------
  function init(data) {
    var meta = data.meta;
    var G = BG_GRID;
    var xs = makeGrid(meta.max_abs, G);
    var scratch = {
      density: new Float64Array(G * G),
      hueR: new Float64Array(G * G),
      hueG: new Float64Array(G * G),
      hueB: new Float64Array(G * G),
      img: null,
    };
    // diffusion (responsibility) background -- cheap, recomputed every frame.
    var bgRespCanvas = document.createElement("canvas");
    bgRespCanvas.width = G; bgRespCanvas.height = G;
    var bgRespCtx = bgRespCanvas.getContext("2d");
    scratch.img = bgRespCtx.createImageData(G, G);

    // flow-basin background -- expensive (an ODE per cell), so computed on its
    // own (coarser) grid and cached per snapped t-index.
    var FG = FLOW_GRID, fxs = makeGrid(meta.max_abs, FG);
    var flowScratch = { density: new Float64Array(FG * FG), labels: new Int32Array(FG * FG) };
    var bgFlowCanvas = document.createElement("canvas");
    bgFlowCanvas.width = FG; bgFlowCanvas.height = FG;
    var bgFlowCtx = bgFlowCanvas.getContext("2d");
    var flowCache = [];   // ImageData per snapped t-index (0..nf-1)
    var respCache = [];   // {img, segs} per snapped t-index -- diffusion bg + contour rings

    var panels = [
      new Panel(document.getElementById("frs-rt-forward"), "forward", data),
      new Panel(document.getElementById("frs-rt-reversal"), "reversal", data),
    ];
    var slider = document.getElementById("frs-rt-slider");
    var tval = document.getElementById("frs-rt-tval");
    var playBtn = document.getElementById("frs-rt-play");

    var nf = meta.nf, F = 2 * nf;
    var SLIDER_MAX = parseInt(slider.max, 10) || 1000;
    var RT_EXT = 0.1, RT_TOTAL = 2 * RT_EXT + 2.0;   // 1.1 pre/post-roll padding

    // slider tick marks at t = 1, 0, 1 (offset for the styled 16px thumb travel)
    var ticksEl = document.getElementById("frs-rt-ticks");
    if (ticksEl) {
      var THUMB_R = 8;
      [{ s: RT_EXT / RT_TOTAL, l: "1" }, { s: (RT_EXT + 1) / RT_TOTAL, l: "0" }, { s: (RT_EXT + 2) / RT_TOTAL, l: "1" }].forEach(function (tk) {
        var d = document.createElement("span");
        d.className = "frs-rt-tick";
        d.style.left = "calc(" + (tk.s * 100) + "% + " + (THUMB_R * (1 - 2 * tk.s)).toFixed(2) + "px)";
        d.innerHTML = '<span class="frs-rt-tickline"></span><span class="frs-rt-ticklabel">' + tk.l + "</span>";
        ticksEl.appendChild(d);
      });
    }

    // per-frame t schedule (length F): noising 1->0 then denoising 0->1
    var tArr = new Float64Array(F);
    for (var i = 0; i < nf; i++) tArr[i] = 1 - i / (nf - 1);
    for (var j = 0; j < nf; j++) tArr[nf + j] = j / (nf - 1);

    // Both backgrounds are functions of t only, so they're cached per snapped
    // t-index and reused -- after the first sweep, render() does no heavy math
    // (just two putImageData + the point/trace draw), so playback stays smooth.
    function respImgFor(tIdx, tBg) {
      var c = respCache[tIdx];
      if (!c) {
        var shared = computeShared(tBg, meta, xs, G, scratch);   // writes scratch.img
        var img = bgRespCtx.createImageData(G, G);
        img.data.set(shared.img.data);
        c = { img: img, segs: shared.segs };
        respCache[tIdx] = c;
      }
      return c;
    }
    function flowImgFor(tIdx, tBg) {
      var img = flowCache[tIdx];
      if (!img) {
        img = bgFlowCtx.createImageData(FG, FG);
        computeFlowImg(tBg, meta, fxs, FG, flowScratch, FLOW_DT, img);
        flowCache[tIdx] = img;
      }
      return img;
    }

    function render(s) {
      // Extended timeline: a 1.1 pre-roll where points fade in at the data, the
      // round trip (fc 0 -> F-1), then a 1.1 post-roll where points fade out --
      // so the loop closes gracefully (points absent at both ends).
      var d = s * RT_TOTAL, fc, pointAlpha;
      if (d <= RT_EXT) { fc = 0; pointAlpha = d / RT_EXT; }
      else if (d <= RT_EXT + 2.0) { fc = (d - RT_EXT) / 2.0 * (F - 1); pointAlpha = 1; }
      else { fc = F - 1; pointAlpha = clamp(1 - (d - RT_EXT - 2.0) / RT_EXT, 0, 1); }
      var i0 = Math.min(Math.floor(fc), F - 1);
      var i1 = Math.min(i0 + 1, F - 1);
      var t = lerp(tArr[i0], tArr[i1], fc - i0);   // held at 1 during pre/post-roll
      // Backgrounds snap to the nearest of nf distinct t-values (matches the
      // notebook's per-frame precompute); the points stay continuous.
      var tIdx = Math.max(0, Math.min(nf - 1, Math.round(t * (nf - 1))));
      var tBg = tIdx / (nf - 1);
      var resp = respImgFor(tIdx, tBg);                         // diffusion bg + contours (cached)
      bgRespCtx.putImageData(resp.img, 0, 0);
      bgFlowCtx.putImageData(flowImgFor(tIdx, tBg), 0, 0);      // flow-basin bg (cached)
      for (var pi = 0; pi < panels.length; pi++) {
        var p = panels[pi];
        p.draw(fc, resp, p.scheme === "reversal" ? bgFlowCanvas : bgRespCanvas, pointAlpha);
      }
      tval.textContent = t.toFixed(2);
    }

    var current = 0;
    function renderFromSlider() {
      current = parseInt(slider.value, 10) / SLIDER_MAX;
      render(current);
    }

    function relayout() {
      var ok = false;
      for (var pi = 0; pi < panels.length; pi++) ok = panels[pi].resize() || ok;
      if (ok) render(current);
      return ok;
    }

    slider.addEventListener("input", function () { stopPlay(); renderFromSlider(); });

    // ---- play / pause loop --------------------------------------------------
    var playing = false, lastTs = 0;
    var PERIOD_S = 8.0;   // seconds for a full round trip
    function frame(ts) {
      if (!playing) return;
      if (!lastTs) lastTs = ts;
      var dt = (ts - lastTs) / 1000.0; lastTs = ts;
      current += dt / PERIOD_S;
      if (current >= 1.0) current -= 1.0;     // loop
      slider.value = Math.round(current * SLIDER_MAX);
      render(current);
      requestAnimationFrame(frame);
    }
    function startPlay() {
      if (playing) return;
      playing = true; lastTs = 0; playBtn.textContent = "❚❚ Pause";
      requestAnimationFrame(frame);
    }
    function stopPlay() {
      if (!playing) return;
      playing = false; playBtn.textContent = "▶ Play";
    }
    playBtn.addEventListener("click", function () { playing ? stopPlay() : startPlay(); });

    // size + draw once visible (the widget lives in a collapsed <details>)
    var details = document.getElementById("frs-rt-details");
    if (details) {
      details.addEventListener("toggle", function () { if (details.open) relayout(); });
    }
    window.addEventListener("resize", relayout);
    // initial attempt (in case it's already open)
    if (!relayout()) {
      // collapsed: draw t=1 frame anyway so first open is instant-ish
      render(0);
    }
  }

  function boot() {
    var host = document.getElementById("frs-rt-widget");
    if (!host) return;
    fetch(DATA_URL).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(init).catch(function (e) {
      host.innerHTML = '<p style="color:#a00;text-align:center">' +
        "Could not load round-trip data (" + e.message + "). " +
        "This widget needs the page served over http(s).</p>";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
