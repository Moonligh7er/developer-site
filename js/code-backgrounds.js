/* ============================================================
   CODE BACKGROUNDS — full-page animated code-character backgrounds
   Same look as the jellyfish (a soft scene re-drawn as 0s, 1s and
   code symbols coloured by the scene underneath), built for sitting
   behind page content.

   USAGE in HTML (anywhere in <body>):
     <canvas data-code-bg="constellation"></canvas>
     <script src="js/code-backgrounds.js"></script>

   The canvas is pinned to the viewport behind everything
   (position:fixed, z-index:-1, no pointer events).

   AVAILABLE SCENES (data-code-bg):
     "constellation"  — drifting star map; amber signals hop node to node
     "mycelium"       — networks grow from seeds and flash where they meet
     "helix"          — triple helix turning on a diagonal axis

   OPTIONS:
     data-intensity="0.7"  — scene brightness, 0..1 (default 0.7)
     data-cell="7"         — character cell size in px (default 7)

   Scenes paint light straight into a per-cell colour grid instead of
   reading pixels back from a canvas (getImageData), so browsers that
   randomise read-back (Firefox resistFingerprinting, Brave) render the
   same frames as Chrome. The character layer is drawn once; each frame
   only uploads a small colour+alpha image and stretches it over it.
   Freezes to a still frame under prefers-reduced-motion.
   ============================================================ */
(function () {
  'use strict';

  const PALETTE = {
    void:  '#07070d',
    teal:  [0, 212, 170],
    violet:[139, 92, 246],
    amber: [212, 160, 32],
    rose:  [196, 74, 138],
  };

  const BINARY = '01', SYMBOLS = '{}[]<>():;=+-*/|!~∞∅∆∇⊕◇◆';
  const THEME = { constellation: '·+*×∘°', mycelium: '/\\|-_.,:;', helix: '∞~=|:·' };
  const GLYPHS = [...new Set(BINARY + SYMBOLS + Object.values(THEME).join(''))];
  const GLYPH_INDEX = new Map(GLYPHS.map((g, i) => [g, i]));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // Smooth, saturating brightness curve (a stepped boost makes dim gradients blotchy).
  const tone = br => 255 * (1 - Math.exp(-br / 95));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- light field ----------
  class Field {
    constructor(cols, rows, cell) { this.cols = cols; this.rows = rows; this.cell = cell; this.d = new Float32Array(cols * rows * 3); }
    clear() { this.d.fill(0); }
    // soft radial light, (1-t²)² falloff; additive like canvas 'lighter'
    glow(x, y, r, c, a) {
      const s = this.cell, cx = x / s - .5, cy = y / s - .5, R = Math.max(1.5, r / s), R2 = R * R, { cols, rows, d } = this;
      const i0 = Math.max(0, Math.ceil(cx - R)), i1 = Math.min(cols - 1, Math.floor(cx + R));
      const j0 = Math.max(0, Math.ceil(cy - R)), j1 = Math.min(rows - 1, Math.floor(cy + R));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const q = ((i - cx) ** 2 + (j - cy) ** 2) / R2; if (q >= 1) continue;
        const w = a * (1 - q) * (1 - q), k = (j * cols + i) * 3; d[k] += c[0] * w; d[k + 1] += c[1] * w; d[k + 2] += c[2] * w;
      }
    }
    // disc with an antialiased rim so moving strokes fade cells in/out instead of popping
    disc(cx, cy, R, c, a) {
      const { cols, rows, d } = this, E = R + .5;
      const i0 = Math.max(0, Math.ceil(cx - E)), i1 = Math.min(cols - 1, Math.floor(cx + E));
      const j0 = Math.max(0, Math.ceil(cy - E)), j1 = Math.min(rows - 1, Math.floor(cy + E));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const cov = Math.min(1, E - Math.hypot(i - cx, j - cy)); if (cov <= 0) continue;
        const w = a * cov, k = (j * cols + i) * 3; d[k] += c[0] * w; d[k + 1] += c[1] * w; d[k + 2] += c[2] * w;
      }
    }
    // stroke of width w: a row of discs whose overlap sums to `a` on the centre line
    line(x1, y1, x2, y2, w, c, a) {
      const s = this.cell, r = Math.max(.5, w / 2 / s), len = Math.hypot(x2 - x1, y2 - y1) / s;
      const n = Math.max(1, Math.ceil(len / .5)), aa = a * Math.min(1, (len / n) / (2 * r + 1));
      for (let k = 0; k < n; k++) { const t = (k + .5) / n; this.disc((x1 + (x2 - x1) * t) / s - .5, (y1 + (y2 - y1) * t) / s - .5, r, c, aa); }
    }
  }

  // ---------- scenes ----------
  class Constellation {
    init(W, H) {
      const n = Math.round(Math.min(170, Math.max(40, W * H / 9000)));
      this.nodes = Array.from({ length: n }, () => ({ x0: rnd(0, W), y0: rnd(0, H), ax: rnd(8, 30), ay: rnd(8, 30), f: rnd(.05, .18), ph: rnd(0, 6.28), m: Math.random() < .12 ? 1.8 : rnd(.6, 1.1) }));
      this.pulses = []; this.spawn = 0;
    }
    pos(n, t) { return [n.x0 + Math.sin(t * n.f + n.ph) * n.ax, n.y0 + Math.cos(t * n.f * .8 + n.ph) * n.ay]; }
    step(dt, t, W, H) {
      this.D = Math.min(170, Math.max(W, H) * .2); this.P = this.nodes.map(n => this.pos(n, t));
      this.spawn -= dt;
      if (this.spawn <= 0 && this.pulses.length < 16) { this.spawn = .3; const a = Math.floor(rnd(0, this.nodes.length)), b = this.near(a); if (b >= 0) this.pulses.push({ a, b, p: 0, hops: Math.floor(rnd(3, 7)) }); }
      for (const q of this.pulses) {
        q.p += dt * 1.1;
        if (q.p >= 1) { const nx = this.near(q.b, q.a); if (q.hops-- > 0 && nx >= 0) { q.a = q.b; q.b = nx; q.p = 0; } else q.dead = true; }
      }
      this.pulses = this.pulses.filter(q => !q.dead);
    }
    near(i, not) {
      const c = [], [x, y] = this.P[i];
      this.P.forEach(([px, py], j) => { if (j !== i && j !== not && Math.hypot(px - x, py - y) < this.D) c.push(j); });
      return c.length ? c[Math.floor(Math.random() * c.length)] : -1;
    }
    draw(F, W, H, p, t, cell) {
      const P = this.P, D = this.D;
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const d = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]); if (d > D) continue;
        F.line(P[i][0], P[i][1], P[j][0], P[j][1], cell, p.c2, Math.pow(1 - d / D, 1.2) * .6);
      }
      this.nodes.forEach((n, i) => F.glow(P[i][0], P[i][1], cell * 2 * n.m, p.c1, .6 + .3 * Math.sin(t * .8 + n.ph)));
      for (const q of this.pulses) {
        const [ax, ay] = P[q.a], [bx, by] = P[q.b], x = ax + (bx - ax) * q.p, y = ay + (by - ay) * q.p, b = Math.max(0, q.p - .35);
        F.line(ax + (bx - ax) * b, ay + (by - ay) * b, x, y, cell, p.c3, .5);
        F.glow(x, y, cell * 3.2, p.c3, .9);
      }
    }
  }

  class Mycelium {
    init(W, H, cell, cols, rows) { this.W = W; this.H = H; this.cell = cell; this.cols = cols; this.rows = rows; this.trail = new Field(cols, rows, cell); this.reset(); }
    reset() {
      const { W, H } = this;
      this.trail.clear(); this.occ = new Uint8Array(this.cols * this.rows);
      this.stepLen = Math.min(2.4, Math.max(1, Math.min(W, H) / 170));
      this.tips = []; this.paths = []; this.pulses = []; this.flashes = []; this.phase = 'grow'; this.timer = 0; this.alpha = 1;
      const seeds = Math.max(2, Math.min(6, Math.round(W / 300)));
      for (let k = 0; k < seeds; k++) {
        const sx = W * ((k + .5) / seeds + rnd(-.08, .08)), sy = H * rnd(.2, .8), m = Math.floor(rnd(4, 7));
        for (let j = 0; j < m; j++) this.tips.push({ x: sx, y: sy, a: j / m * 6.28 + rnd(-.3, .3), life: rnd(160, 300), w: 1.1, gen: 0, seed: k + 1, path: [[sx, sy]] });
      }
    }
    step(dt, t, W, H, p) {
      this.timer += dt;
      if (this.phase === 'grow') {
        const born = [];
        for (const tp of this.tips) {
          tp.a += rnd(-.22, .22);
          const nx = tp.x + Math.cos(tp.a) * this.stepLen, ny = tp.y + Math.sin(tp.a) * this.stepLen;
          this.trail.line(tp.x, tp.y, nx, ny, this.cell * tp.w, mix(p.c1, p.c2, Math.min(1, tp.gen / 4)), .5);
          tp.x = nx; tp.y = ny; tp.life--;
          if (tp.life % 4 < 1) tp.path.push([nx, ny]);
          const ci = Math.floor(ny / this.cell) * this.cols + Math.floor(nx / this.cell), cur = this.occ[ci];
          if (cur && cur !== tp.seed) { this.flashes.push({ x: nx, y: ny, a: 1 }); tp.dead = true; }
          else if (ci >= 0 && ci < this.occ.length) this.occ[ci] = tp.seed;
          if (Math.random() < .014 && this.tips.length + born.length < 320 && tp.gen < 6)
            born.push({ x: nx, y: ny, a: tp.a + (Math.random() < .5 ? -1 : 1) * rnd(.4, .9), life: tp.life * .75 + 30, w: Math.max(.55, tp.w * .82), gen: tp.gen + 1, seed: tp.seed, path: [[nx, ny]] });
          if (tp.life <= 0 || nx < -10 || ny < -10 || nx > W + 10 || ny > H + 10) tp.dead = true;
          if (tp.dead) this.paths.push(tp.path);
        }
        this.tips = this.tips.filter(x => !x.dead).concat(born);
        if (!this.tips.length) { this.phase = 'hold'; this.timer = 0; }
      } else if (this.phase === 'hold' && this.timer > 5) { this.phase = 'fade'; this.timer = 0; }
      else if (this.phase === 'fade') { this.alpha = 1 - smooth(0, 3, this.timer); if (this.timer >= 3) this.reset(); }
      const all = this.paths.concat(this.tips.map(x => x.path)).filter(x => x.length > 3);
      if (all.length && this.pulses.length < 22 && Math.random() < dt * 8) { const path = all[Math.floor(Math.random() * all.length)]; this.pulses.push({ path, i: path.length - 1 }); }
      for (const q of this.pulses) { q.i -= dt * 30; if (q.i <= 0) q.dead = true; }
      this.pulses = this.pulses.filter(q => !q.dead);
      for (const f of this.flashes) f.a -= dt * .6;
      this.flashes = this.flashes.filter(f => f.a > 0);
    }
    draw(F, W, H, p, t, cell) {
      const a = this.alpha * .8, src = this.trail.d, dst = F.d;
      for (let k = 0; k < dst.length; k++) dst[k] += Math.min(255, src[k]) * a;
      for (const tp of this.tips) F.glow(tp.x, tp.y, cell * 2.4, p.c1, .8 * this.alpha);
      for (const q of this.pulses) {
        const f = Math.max(0, q.i), i0 = Math.floor(f), i1 = Math.min(q.path.length - 1, i0 + 1), u = f - i0;
        F.glow(q.path[i0][0] + (q.path[i1][0] - q.path[i0][0]) * u, q.path[i0][1] + (q.path[i1][1] - q.path[i0][1]) * u, cell * 2.6, p.c3, .75 * this.alpha);
      }
      for (const f of this.flashes) F.glow(f.x, f.y, cell * 7 * (1.4 - f.a * .4), p.c3, f.a * this.alpha);
    }
  }

  // Three strands 120° apart winding round one axis that runs bottom-left to
  // top-right and slowly turns in 3D. Each strand has its own colour (teal,
  // violet, rose); front strands are brighter and fatter; triangular rungs tie
  // all three together at intervals.
  class Helix {
    init() { this.pulses = Array.from({ length: 7 }, (_, i) => ({ k: i % 3, u: Math.random(), sp: rnd(.03, .055) })); }
    geom(W, H, t) {
      const ang = -.5 + .06 * Math.sin(t * .05), len = Math.hypot(W, H) * 1.15;
      return {
        cx: W * (.5 + .04 * Math.sin(t * .07)), cy: H * (.5 + .04 * Math.sin(t * .09)),
        dx: Math.cos(ang), dy: Math.sin(ang), len,
        R: Math.min(Math.min(W, H) * .17, 170), freq: (Math.PI * 2) / Math.min(len * .32, 560), spin: t * .5,
      };
    }
    pt(g, u, k, t) {
      const s = (u - .5) * g.len, th = s * g.freq + g.spin + k * Math.PI * 2 / 3;
      const off = Math.cos(th) * g.R + Math.sin(u * 2.4 + t * .21) * g.R * .3;
      // viewed slightly off-axis: depth slides points along the axis, so the
      // cross-section is an ellipse and all three strands stay apart
      const z = Math.sin(th), sa = s + z * g.R * .18;
      return [g.cx + g.dx * sa - g.dy * off, g.cy + g.dy * sa + g.dx * off, z];
    }
    step(dt) { for (const q of this.pulses) q.u = (q.u + q.sp * dt) % 1; }
    draw(F, W, H, p, t, cell) {
      const g = this.geom(W, H, t), cols = [p.c1, p.c2, p.c4], N = Math.ceil(g.len / 6);
      for (let i = 0; i <= N; i += 8) {
        const P = [0, 1, 2].map(k => this.pt(g, i / N, k, t));
        for (let k = 0; k < 3; k++) { const a = P[k], b = P[(k + 1) % 3], depth = (a[2] + b[2]) * .25 + .5; F.line(a[0], a[1], b[0], b[1], cell * .8, mix(cols[k], cols[(k + 1) % 3], .5), .14 + .2 * depth); }
      }
      for (let k = 0; k < 3; k++) {
        let prev = this.pt(g, 0, k, t);
        for (let i = 1; i <= N; i++) {
          const cur = this.pt(g, i / N, k, t), depth = cur[2] * .5 + .5;
          F.line(prev[0], prev[1], cur[0], cur[1], cell * (1 + .8 * depth), cols[k], .38 + .45 * depth);
          if (depth > .6) F.glow(cur[0], cur[1], cell * 2.6, cols[k], .025 * depth);
          prev = cur;
        }
      }
      for (const q of this.pulses) { const [x, y, z] = this.pt(g, q.u, q.k, t); F.glow(x, y, cell * (2.5 + 1.5 * (z * .5 + .5)), p.c3, .45 + .45 * (z * .5 + .5)); }
    }
  }

  const SCENES = { constellation: Constellation, mycelium: Mycelium, helix: Helix };

  // ---------- renderer ----------
  class CodeBackground {
    constructor(canvas, opts = {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.name = SCENES[opts.scene] ? opts.scene : 'constellation';
      this.cell = opts.cell || 7;
      this.intensity = opts.intensity != null ? opts.intensity : .7;
      this.pal = { c1: PALETTE.teal, c2: PALETTE.violet, c3: PALETTE.amber, c4: PALETTE.rose, faint: mix(hex(PALETTE.void), PALETTE.violet, .2) };
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.t = 0; this.running = false;
      this.atlas = document.createElement('canvas');
      this.mask = document.createElement('canvas'); this.mctx = this.mask.getContext('2d');
      this.glyphs = document.createElement('canvas'); this.gctx = this.glyphs.getContext('2d');
      this.tint = document.createElement('canvas'); this.tctx = this.tint.getContext('2d');
      Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '-1', pointerEvents: 'none', display: 'block' });
      canvas.setAttribute('aria-hidden', 'true');
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
      this.resize();
      document.addEventListener('visibilitychange', () => document.hidden ? this.stop() : this.start());
      reduceMotion.addEventListener?.('change', () => reduceMotion.matches ? this.stop() : this.start());
      document.fonts?.ready.then(() => { if (!this.W) return; this.buildAtlas(); this.drawMask(); this.still(); });
      this.start();
    }
    buildAtlas() {
      const g = Math.round(this.cell * this.dpr), a = this.atlas, c = a.getContext('2d');
      a.width = g * GLYPHS.length; a.height = g; this.g = g;
      c.clearRect(0, 0, a.width, a.height);
      c.font = `${(this.cell - 1) * this.dpr}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
      GLYPHS.forEach((ch, i) => c.fillText(ch, i * g + g / 2, g / 2));
    }
    resize() {
      const r = this.canvas.getBoundingClientRect(); if (!r.width || !r.height) return;
      // ignore the small height jitter from mobile toolbars showing/hiding
      if (this.W === r.width && Math.abs(this.H - r.height) < 120 && this.F) return;
      this.W = r.width; this.H = r.height; this.cols = Math.ceil(this.W / this.cell); this.rows = Math.ceil(this.H / this.cell);
      this.canvas.width = Math.floor(r.width * this.dpr); this.canvas.height = Math.floor(r.height * this.dpr);
      this.buildAtlas();
      this.mask.width = this.glyphs.width = this.cols * this.g; this.mask.height = this.glyphs.height = this.rows * this.g;
      this.tint.width = this.cols; this.tint.height = this.rows; this.img = this.tctx.createImageData(this.cols, this.rows);
      this.F = new Field(this.cols, this.rows, this.cell);
      this.scene = new SCENES[this.name]();
      this.scene.init(this.W, this.H, this.cell, this.cols, this.rows);
      for (let i = 0; i < 90; i++) { this.t += 1 / 60; this.scene.step(1 / 60, this.t, this.W, this.H, this.pal); }
      const n = this.cols * this.rows; this.grid = new Uint8Array(n); this.faint = new Uint8Array(n);
      for (let i = 0; i < n; i++) { this.grid[i] = this.pick(); this.faint[i] = Math.random() < .12 ? 1 : 0; }
      this.drawMask(); this.still();
    }
    pick() {
      const r = Math.random();
      if (r < .5) return GLYPH_INDEX.get(r < .25 ? '0' : '1');
      if (r < .75) return GLYPH_INDEX.get(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
      const th = THEME[this.name]; return GLYPH_INDEX.get(th[Math.floor(Math.random() * th.length)]);
    }
    drawMask() { this.mctx.clearRect(0, 0, this.mask.width, this.mask.height); for (let i = 0; i < this.grid.length; i++) this.drawGlyph(i); }
    drawGlyph(i) {
      const g = this.g, c = i % this.cols, r = (i / this.cols) | 0;
      this.mctx.clearRect(c * g, r * g, g, g);
      this.mctx.drawImage(this.atlas, this.grid[i] * g, 0, g, g, c * g, r * g, g, g);
    }
    start() {
      if (this.running || reduceMotion.matches || document.hidden) return;
      this.running = true; this.last = performance.now();
      const loop = now => { if (!this.running) return; this.frame(Math.min(.05, (now - this.last) / 1000)); this.last = now; this.raf = requestAnimationFrame(loop); };
      this.raf = requestAnimationFrame(loop);
    }
    stop() { this.running = false; cancelAnimationFrame(this.raf); }
    still() { if (!this.running && this.W) this.frame(0); }
    // dim ocean-like ambience: a vertical wash plus a few huge, slow light pools
    atmosphere(F, p, t) {
      const { cols, rows, d } = F;
      for (let j = 0; j < rows; j++) {
        const v = j / rows, c = mix(p.c2, p.c1, v), a = .06 - .035 * v;
        for (let i = 0; i < cols; i++) { const k = (j * cols + i) * 3; d[k] += c[0] * a; d[k + 1] += c[1] * a; d[k + 2] += c[2] * a; }
      }
      const { W, H } = this, R = Math.max(W, H) * .5;
      F.glow(W * (.3 + .2 * Math.sin(t * .031)), H * (.1 + .1 * Math.sin(t * .047)), R, p.c1, .07);
      F.glow(W * (.75 + .15 * Math.sin(t * .023 + 2)), H * (.35 + .15 * Math.sin(t * .037 + 1)), R * .8, p.c2, .06);
      F.glow(W * (.5 + .3 * Math.sin(t * .017 + 4)), H * (.95 + .05 * Math.sin(t * .029)), R * .9, p.c2, .05);
    }
    frame(dt) {
      if (!this.scene) return; // canvas had no size yet; resize() builds the scene once it does
      this.t += dt;
      const { F, W, H, pal } = this;
      this.scene.step(dt, this.t, W, H, pal);
      F.clear();
      this.scene.draw(F, W, H, pal, this.t, this.cell);
      if (this.intensity !== 1) for (let k = 0; k < F.d.length; k++) F.d[k] *= this.intensity;
      this.atmosphere(F, pal, this.t);
      // swap characters a trickle at a time (same ~10%/s as the jellyfish, no bursts)
      const swaps = Math.round(this.grid.length * .1 * dt);
      for (let s = 0; s < swaps; s++) { const i = Math.floor(Math.random() * this.grid.length); this.grid[i] = this.pick(); this.drawGlyph(i); }
      this.render();
    }
    render() {
      const { cols, rows, pal, g, gctx, img } = this, d = this.F.d, px = img.data, fr = pal.faint;
      for (let i = 0, n = cols * rows; i < n; i++) {
        const k = i * 3, o = i * 4, R = d[k], G = d[k + 1], B = d[k + 2], br = R * .299 + G * .587 + B * .114;
        if (br < 1) { px[o] = fr[0]; px[o + 1] = fr[1]; px[o + 2] = fr[2]; px[o + 3] = this.faint[i] ? 200 * (1 - br) : 0; continue; }
        const s = tone(br) / br;
        px[o] = R * s; px[o + 1] = G * s; px[o + 2] = B * s;
        px[o + 3] = 255 * Math.min(.95, .2 + br / 50) * smooth(0, 3, br);
      }
      this.tctx.putImageData(img, 0, 0);
      gctx.globalCompositeOperation = 'copy'; gctx.drawImage(this.mask, 0, 0);
      gctx.globalCompositeOperation = 'source-in'; gctx.imageSmoothingEnabled = true; gctx.imageSmoothingQuality = 'high';
      gctx.drawImage(this.tint, 0, 0, cols * g, rows * g);
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = PALETTE.void; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.drawImage(this.glyphs, 0, 0, cols * g, rows * g, 0, 0, cols * this.cell * this.dpr, rows * this.cell * this.dpr);
    }
  }

  function hex(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }

  // ---------- auto-init ----------
  function init() {
    document.querySelectorAll('canvas[data-code-bg]').forEach(c => {
      if (c._codeBg) return;
      c._codeBg = new CodeBackground(c, {
        scene: c.dataset.codeBg,
        cell: c.dataset.cell ? +c.dataset.cell : undefined,
        intensity: c.dataset.intensity ? +c.dataset.intensity : undefined,
      });
    });
  }

  window.CodeBackgrounds = { init, CodeBackground, scenes: SCENES };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
