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
     "bonfire"        — beach bonfire at night under the stars and the moon, waves breaking on the sand
     "bonfire-runners" — the same beach, with two people and two dogs running the shoreline on a loop
     "vines-and-chains" — twin double helixes: flowering vines (left), chains, barbed wire and padlocks (right)
     "jellyfish"      — Code Ocean: jellyfish rising through light shafts (painted scene)
     "mushroom-cloud" — a slow, rolling mushroom cloud (painted scene)

   OPTIONS:
     data-intensity="0.7"  — scene brightness, 0..1 (default 0.7)
     data-cell="7"         — character cell size in px (default 7)
     style="z-index:-2"    — kept if set; otherwise the canvas sits at z-index -1

   Scenes paint light straight into a per-cell colour grid instead of
   reading pixels back from a canvas (getImageData), so browsers that
   randomise read-back (Firefox resistFingerprinting, Brave) render the
   same frames as Chrome. The character layer is drawn once; each frame
   only uploads a small colour+alpha image and stretches it over it.
   Painted scenes (the jellyfish, the mushroom cloud) keep their original
   canvas drawing code; the renderer samples one pixel per character on
   the GPU (drawImage, smoothing off) and applies their brightness curve
   as an SVG filter, so they never read pixels back either.
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
  const THEME = { constellation: '·+*×∘°', mycelium: '/\\|-_.,:;', helix: '∞~=|:·', bonfire: '^~*.,:', 'bonfire-runners': '^~*.,:', 'vines-and-chains': '@&%~§' };
  // painted scenes keep the character mix they were made with: [characters, share]
  const CHARSETS = {
    jellyfish: [['01{}[]<>():;=+-*/|!~アイウエオカキクケコサシスセソ∞∅∆∇⊕◇◆', .6], ['~≈∿-=.:;_|/\\', .4]],
    'mushroom-cloud': [['01{}[]<>():;=+-*/|!~#@_アイウカキ∞◇◆□∆∇⊕⊗', 1]],
  };
  const GLYPHS = [...new Set(BINARY + SYMBOLS + Object.values(THEME).join('') + Object.values(CHARSETS).flat(2).filter(x => typeof x === 'string').join(''))];
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
    // filled dot of radius r, in page pixels (disc works in cells)
    dot(x, y, r, c, a) { this.disc(x / this.cell - .5, y / this.cell - .5, Math.max(.5, r / this.cell), c, a); }
    // darken under a tapered capsule p→q (radii r1→r2, page px): light there is multiplied by 1 − k·coverage
    shade(p, q, r1, r2, k) {
      const s = this.cell, { cols, d } = this;
      capsule(cols, this.rows, p[0] / s - .5, p[1] / s - .5, q[0] / s - .5, q[1] / s - .5, Math.max(.5, r1 / s), Math.max(.5, r2 / s), (i, j, cov) => {
        const m = 1 - k * cov, f = (j * cols + i) * 3; d[f] *= m; d[f + 1] *= m; d[f + 2] *= m;
      });
    }
  }

  // Visit the cells under a tapered capsule (cell units: centre line a→b, radius ra→rb) with an
  // antialiased rim: fn(i, j, coverage 0..1).
  function capsule(cols, rows, ax, ay, bx, by, ra, rb, fn) {
    const E = Math.max(ra, rb) + .5, vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
    const i0 = Math.max(0, Math.ceil(Math.min(ax, bx) - E)), i1 = Math.min(cols - 1, Math.floor(Math.max(ax, bx) + E));
    const j0 = Math.max(0, Math.ceil(Math.min(ay, by) - E)), j1 = Math.min(rows - 1, Math.floor(Math.max(ay, by) + E));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const u = L2 ? Math.min(1, Math.max(0, ((i - ax) * vx + (j - ay) * vy) / L2)) : 0;
      const cov = Math.min(1, ra + (rb - ra) * u + .5 - Math.hypot(i - ax - vx * u, j - ay - vy * u));
      if (cov > 0) fn(i, j, cov);
    }
  }

  // One figure's paint buffer (premultiplied colour + coverage) over a small window of cells.
  // Parts are painted "over" each other, so a near arm hides the body behind it instead of
  // adding up to a brighter blob; the finished figure is then laid over the field, hiding what
  // is behind it (a runner in front of the surf).
  class Layer {
    constructor(cell) { this.cell = cell; this.d = new Float32Array(0); }
    begin(x0, y0, x1, y1) {
      const s = this.cell; this.i0 = Math.floor(x0 / s); this.j0 = Math.floor(y0 / s);
      this.w = Math.floor(x1 / s) - this.i0 + 2; this.h = Math.floor(y1 / s) - this.j0 + 2;
      const n = this.w * this.h * 4; if (this.d.length < n) this.d = new Float32Array(n); else this.d.fill(0, 0, n);
      return this;
    }
    cap(p, q, r1, r2, c, a) {
      const s = this.cell, d = this.d, w = this.w;
      capsule(w, this.h, p[0] / s - .5 - this.i0, p[1] / s - .5 - this.j0, q[0] / s - .5 - this.i0, q[1] / s - .5 - this.j0, Math.max(.5, r1 / s), Math.max(.5, r2 / s), (i, j, cov) => {
        const al = Math.min(1, a * cov), k = (j * w + i) * 4;
        d[k] += (c[0] - d[k]) * al; d[k + 1] += (c[1] - d[k + 1]) * al; d[k + 2] += (c[2] - d[k + 2]) * al; d[k + 3] += (1 - d[k + 3]) * al;
      });
    }
    dot(x, y, r, c, a) { this.cap([x, y], [x, y], r, r, c, a); }
    // lay the finished figure over the field at opacity a
    over(F, a) {
      const { cols, rows, d: fd } = F, d = this.d, w = this.w;
      for (let j = 0; j < this.h; j++) {
        const fj = this.j0 + j; if (fj < 0 || fj >= rows) continue;
        for (let i = 0; i < w; i++) {
          const fi = this.i0 + i, k = (j * w + i) * 4, A = d[k + 3] * a; if (fi < 0 || fi >= cols || A <= 0) continue;
          const f = (fj * cols + fi) * 3;
          fd[f] = fd[f] * (1 - A) + d[k] * a; fd[f + 1] = fd[f + 1] * (1 - A) + d[k + 1] * a; fd[f + 2] = fd[f + 2] * (1 - A) + d[k + 2] * a;
        }
      }
    }
  }

  // Two-bone IK: the joint between root p and target q (bone lengths l1, l2), bent to the +x side
  // of the p→q line when bend = 1 (a knee, a dog's stifle) or the −x side when bend = −1 (a dog's
  // elbow). Returns [joint, end]; end falls short of q when q is out of reach.
  function ik(p, q, l1, l2, bend) {
    const dx = q[0] - p[0], dy = q[1] - p[1], d0 = Math.hypot(dx, dy) || 1e-6, ux = dx / d0, uy = dy / d0;
    const d = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, d0));
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    return [[p[0] + ux * a + uy * h * bend, p[1] + uy * a - ux * h * bend], [p[0] + ux * d, p[1] + uy * d]];
  }
  // Catmull-Rom through keyframes [[s, v1, v2…], …]: s ascending, the first and last rows are lead-in
  // and lead-out (they only shape the curve's ends). Returns [v1, v2…] at s.
  const cr = (a, b, c, d, u) => b + .5 * u * (c - a + u * (2 * a - 5 * b + 4 * c - d + u * (3 * (b - c) + d - a)));
  function keyed(K, s) {
    let i = 1; while (i < K.length - 3 && s > K[i + 1][0]) i++;
    const a = K[i - 1], b = K[i], c = K[i + 1], d = K[i + 2], u = Math.min(1, Math.max(0, (s - b[0]) / (c[0] - b[0])));
    const out = []; for (let j = 1; j < b.length; j++) out.push(cr(a[j], b[j], c[j], d[j], u)); return out;
  }
  const lerp2 = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
  const dim = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  // point `len` px from p at angle `ang`, measured from straight down; positive leans toward +x
  const at = (p, ang, len) => [p[0] + Math.sin(ang) * len, p[1] + Math.cos(ang) * len];
  const seg = (F, p, q, w, c, a) => F.line(p[0], p[1], q[0], q[1], w, c, a);
  // fill every cell of the field with colour c(y) at alpha a(y), one row at a time
  function wash(F, fn) {
    const { cols, rows, d, cell } = F;
    for (let j = 0; j < rows; j++) {
      const [c, a] = fn((j + .5) * cell);
      for (let i = 0; i < cols; i++) { const k = (j * cols + i) * 3; d[k] += c[0] * a; d[k + 1] += c[1] * a; d[k + 2] += c[2] * a; }
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

  // A jogger facing right, from motion-capture-style keyframes: the thigh's swing and the knee's
  // bend over one stride (phase 0 = that foot lands). While a foot is down it is pinned to the sand
  // and the leg is solved with IK, so planted feet never slide; the heel peels up before toe-off,
  // the hips dip at each landing and rise in the flight between steps. Arms swing against the legs
  // with bent elbows, and shoulders and hips counter-rotate. All lengths are fractions of height S.
  const RUN = {
    stride: 1, duty: .34, hip: .5, bob: .015, lean: .14, thigh: .25, shin: .25, ankle: .035, toe: .065, peel: .6,
    // [phase, thigh angle (rad, + forward of vertical), knee bend (rad)]
    leg: [[-.05, .5, .32], [0, .38, .35], [.15, .09, .7], [.34, -.31, .35], [.45, -.26, 1.05], [.55, 0, 1.66], [.65, .44, 1.66],
      [.75, .7, 1.22], [.85, .73, .61], [.95, .5, .32], [1, .38, .35], [1.15, .09, .7]],
    // through the swing: how far the toe points down past square to the shin (rad)
    point: [[-.1, .8], [0, .75], [.3, .8], [.6, .35], [.85, .05], [1, -.12], [1.1, -.12]],
  };
  // where the ankle sits relative to the hip at phase φ, with the leg swung freely (×S)
  function runFK(φ) {
    const [th, kn] = keyed(RUN.leg, φ), k = [Math.sin(th) * RUN.thigh, Math.cos(th) * RUN.thigh];
    return [k[0] + Math.sin(th - kn) * RUN.shin, k[1] + Math.cos(th - kn) * RUN.shin];
  }
  const LAND = runFK(0)[0];   // the foot lands this far ahead of the hip

  // One leg of a runner whose body is at x: the ankle, knee and foot direction for leg phase φ.
  function runLeg(hipJ, x, g, S, φ) {
    // a planted foot: the ankle where it landed, or, once the heel peels up, swung up round the toe
    const R = RUN, peelMax = R.peel, stanceAt = (ph, ψ) => [x + (LAND - ph * R.stride + R.toe * (1 - Math.cos(ψ))) * S, g - (R.ankle + R.toe * Math.sin(ψ)) * S];
    let tgt, ψ, s = -1;
    if (φ < R.duty) {
      // heel strike, flat foot, then the heel peels up around the toe
      ψ = φ < .05 ? -.12 * (1 - φ / .05) : peelMax * smooth(.2, R.duty, φ);
      tgt = stanceAt(φ, Math.max(0, ψ));
    } else {
      s = (φ - R.duty) / (1 - R.duty);
      const fk = runFK(φ), free = [hipJ[0] + fk[0] * S, hipJ[1] + fk[1] * S];
      tgt = lerp2(stanceAt(φ, peelMax), free, smooth(0, .1, s));                        // leaving the ground where it was
      tgt = lerp2(tgt, [x + (LAND + (1 - φ) * R.stride) * S, g - R.ankle * S], smooth(.8, 1, s));   // landing on its mark
    }
    const [knee, ankle] = ik(hipJ, tgt, R.thigh * S, R.shin * S, 1);
    if (s >= 0) {
      // in the air the foot follows the shin, toe pointed, then squares up to land
      const ux = (ankle[0] - knee[0]) / (R.shin * S), uy = (ankle[1] - knee[1]) / (R.shin * S), q = keyed(R.point, s)[0] - Math.PI / 2;
      const free = Math.atan2(ux * Math.sin(q) + uy * Math.cos(q), ux * Math.cos(q) - uy * Math.sin(q));
      ψ = free + (peelMax - free) * (1 - smooth(0, .15, s)) + (-.12 - free) * smooth(.88, 1, s);
    }
    const f = [Math.cos(ψ), Math.sin(ψ)], sole = [ankle[0], ankle[1] + .008 * S];
    return { knee, ankle, heel: [sole[0] - f[0] * .02 * S, sole[1] - f[1] * .02 * S], toe: [sole[0] + f[0] * .075 * S, sole[1] + f[1] * .075 * S] };
  }

  // A runner in a hoodie and shorts, feet on y = g, S tall, near leg at stride phase φ (0..1).
  // col: { hoodie, shorts, skin, shoe, hair }. Drawn into layer Ly, laid over field F at opacity a.
  function person(Ly, F, x, g, S, φ, col, a) {
    const R = RUN, τ = Math.PI * 2, hH = R.hip + R.bob * Math.cos(2 * τ * (φ - .42)), P = [x, g - hH * S];
    const lean = R.lean + .02 * Math.sin(2 * τ * (φ - .1)), up = Math.PI - lean;
    const N = at(P, up, .32 * S), Sh = at(P, up, .27 * S), Hd = at(N, Math.PI - lean * .4, .09 * S);
    Ly.begin(x - .8 * S, g - 1.15 * S, x + .8 * S, g + .06 * S);
    const side = k => {
      const φs = (φ + k * .5) % 1, rot = k ? -1 : 1, c = k ? { hoodie: dim(col.hoodie, .58), shorts: dim(col.shorts, .58), skin: dim(col.skin, .58), shoe: dim(col.shoe, .58) } : col;
      const hipJ = [P[0] + rot * .02 * S * Math.cos(τ * (φ - .82)), P[1]], sh = [Sh[0] + rot * .025 * S * Math.cos(τ * (φ - .38)), Sh[1]];
      const L = runLeg(hipJ, x, g, S, φs);
      // the arm is forward while the leg on the same side is back
      const sw = Math.cos(τ * (φs - .38)), ua = .15 + .5 * sw, fa = ua + 1.3 + .35 * (.5 + .5 * sw);
      const el = at(sh, ua, .165 * S), wr = at(el, fa, .15 * S);
      return {
        leg: () => {
          Ly.cap(hipJ, L.knee, .05 * S, .043 * S, c.skin, 1);
          Ly.cap(L.knee, L.ankle, .043 * S, .027 * S, c.skin, 1);
          Ly.cap(L.heel, L.toe, .028 * S, .024 * S, c.shoe, 1);
          Ly.cap(hipJ, lerp2(hipJ, L.knee, .55), .082 * S, .066 * S, c.shorts, 1);
        },
        arm: () => {
          Ly.cap(sh, el, .04 * S, .036 * S, c.hoodie, 1);
          Ly.cap(el, wr, .036 * S, .03 * S, c.hoodie, 1);
          const hand = at(wr, fa, .02 * S); Ly.dot(hand[0], hand[1], .027 * S, c.skin, 1);
        },
      };
    };
    const near = side(0), far = side(1);
    far.arm(); far.leg();
    Ly.dot(P[0], P[1], .085 * S, col.shorts, 1);                              // seat of the shorts
    Ly.cap(at(P, 0, .03 * S), N, .08 * S, .088 * S, col.hoodie, 1);              // hoodie
    Ly.dot(N[0] - .05 * S, N[1] + .01 * S, .05 * S, dim(col.hoodie, .8), 1);   // hood, bunched behind the neck
    Ly.dot(Hd[0], Hd[1], .07 * S, col.skin, 1);
    Ly.dot(Hd[0] - .022 * S, Hd[1] - .026 * S, .05 * S, col.hair, 1);
    near.leg(); near.arm();
    Ly.over(F, a);
  }

  // A dog in a rotary gallop (near hind, far hind, far fore, near fore, then a gathered
  // suspension with all four tucked under), D tall at the withers, facing right. Paws are pinned
  // while down; the spine flexes as the hind legs reach forward and stretches as the front legs
  // reach out, the body pitches over the front feet and back over the hind, the head stays steadier
  // than the body, the ears bounce and the tail streams out behind. Lengths are fractions of D.
  const GALLOP = {
    stride: 1.9, duty: .3, land: .32,
    legs: [{ off: .08, hind: true, far: true }, { off: .4, hind: false, far: true }, { off: 0, hind: true, far: false }, { off: .48, hind: false, far: false }],
    // swing paths for the paw: [s, x ahead of the shoulder or hip, height] (first and last rows are lead-in/out)
    fore: [[-.12, -.09, 0], [0, -.25, 0], [.2, -.33, .13], [.45, -.08, .24], [.7, .3, .2], [.88, .42, .07], [1, .32, 0], [1.12, .16, 0]],
    hind: [[-.12, -.09, 0], [0, -.25, 0], [.2, -.42, .15], [.45, -.17, .21], [.7, .24, .16], [.88, .38, .06], [1, .32, 0], [1.12, .16, 0]],
    // where the wrist (front) or hock (hind) sits relative to the paw: folded back after lift-off, reaching before landing
    wrist: [[-.1, -.02, -.1], [0, -.02, -.1], [.2, .09, -.05], [.45, .07, -.08], [.75, -.06, -.08], [1, -.02, -.1], [1.1, -.02, -.1]],
    hock: [[-.1, -.07, -.18], [0, -.08, -.17], [.2, .12, -.13], [.45, .03, -.18], [.75, -.1, -.15], [1, -.07, -.18], [1.1, -.07, -.18]],
  };
  function dog(Ly, F, x, g, D, φ, fur, a) {
    const G = GALLOP, τ = Math.PI * 2, bob = .05 * D * Math.cos(τ * (φ - .88)), pitch = .08 * Math.cos(τ * (φ - .05)), flex = Math.cos(τ * (φ - .9));
    const c = [x, g - .72 * D - bob], cs = Math.cos(pitch), sn = Math.sin(pitch), rp = (dx, dy) => [c[0] + dx * cs + dy * sn, c[1] - dx * sn + dy * cs];
    const half = .4 * D * (1 - .07 * flex), shJ = rp(half, 0), hipJ = rp(-half, 0), mid = rp(0, -.06 * D * flex);
    Ly.begin(x - 1.25 * D, g - 1.45 * D, x + 1.15 * D, g + .06 * D);
    const leg = L => {
      const φl = ((φ - L.off) % 1 + 1) % 1, root = L.hind ? hipJ : shJ, base = x + (L.hind ? -.4 : .4) * D, col = L.far ? dim(fur, .58) : fur;
      let paw, off;
      if (φl < G.duty) { paw = [base + (G.land - φl * G.stride) * D, g - .035 * D]; off = L.hind ? [-.07, -.18] : [-.02, -.1]; }
      else {
        const s = (φl - G.duty) / (1 - G.duty), [px, ph] = keyed(L.hind ? G.hind : G.fore, s);
        paw = [base + px * D, g - (.035 + ph) * D]; off = keyed(L.hind ? G.hock : G.wrist, s);
      }
      const tgt = [paw[0] + off[0] * D, paw[1] + off[1] * D];
      if (L.hind) {
        const [stifle, hock] = ik(root, tgt, .32 * D, .32 * D, 1);
        Ly.cap(root, stifle, .12 * D, .075 * D, col, 1); Ly.cap(stifle, hock, .07 * D, .05 * D, col, 1); Ly.cap(hock, paw, .048 * D, .045 * D, col, 1);
      } else {
        const [elbow, wrist] = ik(root, tgt, .33 * D, .38 * D, -1);
        Ly.cap(root, elbow, .09 * D, .065 * D, col, 1); Ly.cap(elbow, wrist, .06 * D, .05 * D, col, 1); Ly.cap(wrist, paw, .05 * D, .048 * D, col, 1);
      }
    };
    for (const L of G.legs) if (L.far) leg(L);
    let tp = rp(-.5 * D, -.1 * D);                                    // tail, from the croup
    for (let k = 0; k < 3; k++) { const q = at(tp, -2.05 + .25 * Math.sin(τ * φ - k * .9) - k * .1, .16 * D); Ly.cap(tp, q, (.055 - .012 * k) * D, (.045 - .012 * k) * D, fur, 1); tp = q; }
    const hq = rp(-.42 * D, -.02 * D), ch = rp(.38 * D, .12 * D);
    Ly.dot(hq[0], hq[1], .19 * D, fur, 1);                            // haunch
    Ly.cap(rp(-.4 * D, 0), mid, .17 * D, .19 * D, fur, 1);            // loin, arching as the spine flexes
    Ly.cap(mid, rp(.32 * D, .04 * D), .19 * D, .21 * D, fur, 1);      // ribs
    Ly.dot(ch[0], ch[1], .19 * D, fur, 1);                            // deep chest
    const nb = rp(.36 * D, -.12 * D), head = [nb[0] + .2 * D, nb[1] - .2 * D + .5 * bob], snout = [head[0] + .21 * D, head[1] + .07 * D];
    Ly.cap(nb, head, .12 * D, .09 * D, fur, 1);
    Ly.dot(head[0], head[1], .13 * D, fur, 1);
    Ly.cap(head, snout, .075 * D, .052 * D, fur, 1);
    Ly.dot(snout[0], snout[1], .03 * D, dim(fur, .35), 1);           // nose
    const flap = .06 * D * Math.cos(τ * (φ - .75));
    Ly.cap([head[0] - .05 * D, head[1] - .08 * D], [head[0] - .13 * D, head[1] + .05 * D - flap], .055 * D, .04 * D, dim(fur, .75), 1);   // ear
    for (const L of G.legs) if (!L.far) leg(L);
    Ly.over(F, a);
  }

  // Two people in hoodies and shorts and their two dogs. off: place in the group (runner
  // heights); dy: depth (negative is farther up the beach, toward the water); sc: size;
  // ph: where in its stride each starts; wob, amp: the dogs ranging ahead and back (kept far
  // enough apart that they never run through each other).
  const RUNNERS = [
    { off: 0, dy: 0, sc: 1, hoodie: 'c1', shorts: 'c2', hair: [72, 50, 42], ph: 0 },
    { off: -1.15, dy: -.018, sc: .94, hoodie: 'c4', shorts: 'c1', hair: [44, 34, 32], ph: .33 },
    { dog: true, off: 1.3, dy: -.008, sc: 1, fur: [214, 168, 96], ph: .11, wob: .7, amp: .35 },
    { dog: true, off: 2.8, dy: .008, sc: .9, fur: [150, 118, 196], ph: .52, wob: 3.3, amp: .25 },
  ];
  const SHOE = [215, 222, 235];
  // star colours by temperature, blue-white to orange, and how common each is
  const STAR_T = [[165, 190, 255], [200, 218, 255], [240, 244, 255], [255, 240, 214], [255, 214, 168], [255, 186, 146]];
  const STAR_W = [.14, .26, .27, .2, .09, .04];
  const starColour = () => { let r = Math.random(); for (let i = 0; i < STAR_T.length; i++) if ((r -= STAR_W[i]) < 0) return STAR_T[i]; return STAR_T[2]; };

  // A bonfire on a beach at night. Above: stars of different colours and brightness that
  // twinkle more near the horizon, the Milky Way with its dark rift, a shooting star now and
  // then, and the moon laying a path on the water. Waves break into foam, wash up the sand and
  // drain back. "bonfire-runners" (BonfireRunners, below) adds two people and two dogs running
  // along the sand, left to right, on a loop, in front of the surf; the firelight warms them
  // and throws their shadows up the beach as they pass.
  class Bonfire {
    get runners() { return false; }
    init(W, H, cell) {
      this.lay = new Layer(cell);
      const n = Math.round(Math.min(380, Math.max(70, W * H / 4200)));
      this.stars = Array.from({ length: n }, () => ({ u: Math.random(), v: Math.random() ** 1.15, m: Math.random() ** 3.2, c: starColour(), ph: rnd(0, 6.28), f1: rnd(1.1, 2.9), f2: rnd(1.7, 4.3) }));
      this.band = Array.from({ length: Math.round(n * 1.6) }, () => ({ s: Math.random(), off: (Math.random() + Math.random() + Math.random() - 1.5) * .1, m: rnd(.1, .42) * Math.random() ** .6, c: starColour() }));
      this.meteor = null; this.nextMeteor = rnd(2, 6);
      this.sparks = []; this.spawn = 0; this.licks = []; this.lickT = 0;
    }
    layout(W, H) {
      const land = W > H;
      return {
        hy: H * .4, sy: H * .565, gy: H * .75,                     // horizon, waterline, where the runners' feet land
        S: Math.min(210, Math.max(70, Math.min(H * .2, W * .27))),    // a runner's height, smaller on narrow screens
        fx: W * (land ? .26 : .5), fy: H * (land ? .88 : .9), fs: Math.min(110, Math.max(38, Math.min(W, H) * .09)),
        mx: W * (land ? .76 : .72), my: H * .13, mr: Math.max(12, Math.min(W, H) * .05),
      };
    }
    // a point on the Milky Way's centre line, s from its lower-left end to its upper-right end
    bandAt(s, W, hy) { return [s * W, hy * (.92 - .86 * s + .12 * Math.sin(Math.PI * s))]; }
    step(dt, t, W, H) {
      const L = this.L = this.layout(W, H);
      this.spawn -= dt;
      while (this.spawn <= 0) {
        this.spawn += .045;
        this.sparks.push({ x: L.fx + rnd(-.3, .3) * L.fs, y: L.fy - L.fs * rnd(.3, .9), vx: rnd(-12, 12), vy: -rnd(40, 95), life: 0, max: rnd(1.4, 3.2), ph: rnd(0, 6.28) });
      }
      for (const s of this.sparks) { s.life += dt; s.x += (s.vx + Math.sin(t * 2.3 + s.ph) * 14) * dt; s.y += s.vy * dt; s.vy *= 1 - .25 * dt; }
      this.sparks = this.sparks.filter(s => s.life < s.max);
      // licks of flame that tear off the tips and vanish as they rise
      this.lickT -= dt;
      if (this.lickT <= 0) { this.lickT = rnd(.08, .22); this.licks.push({ x: L.fx + rnd(-.3, .3) * L.fs, y: L.fy - L.fs * rnd(1, 1.5), vy: -L.fs * rnd(1.6, 2.6), life: 0, max: rnd(.22, .4), ph: rnd(0, 6.28) }); }
      for (const q of this.licks) { q.life += dt; q.y += q.vy * dt; }
      this.licks = this.licks.filter(q => q.life < q.max);
      this.nextMeteor -= dt;
      if (!this.meteor && this.nextMeteor <= 0) {
        const dir = Math.random() < .5 ? 1 : -1, an = rnd(.25, .6);
        this.meteor = { x: rnd(.15, .85) * W, y: rnd(.03, .25) * L.hy, vx: dir * Math.cos(an), vy: Math.sin(an), sp: rnd(520, 900), life: 0, max: rnd(.45, .85) };
        this.nextMeteor = rnd(6, 14);
      }
      const m = this.meteor;
      if (m) { m.life += dt; m.x += m.vx * m.sp * dt; m.y += m.vy * m.sp * dt; if (m.life >= m.max || m.y > L.hy * .95) this.meteor = null; }
    }
    atmosphere(F, p, t, W, H) {
      const { hy, sy } = this.L || this.layout(W, H), sea = mix(p.c1, p.c2, .4), sand = mix(p.c2, p.c4, .55);
      wash(F, y => y < hy ? [mix(p.c2, p.c1, y / hy), .035 + .03 * y / hy]
        : y < sy ? [sea, .06]
        : [sand, .04 + .025 * (y - sy) / (H - sy)]);
    }
    sky(F, W, H, p, t, cell, L) {
      const { hy, mx, my, mr } = L, ext = v => smooth(0, .22, 1 - v), glare = (x, y) => 1 - .9 * Math.exp(-((x - mx) ** 2 + (y - my) ** 2) / (mr * 6) ** 2);
      const snap = v => (Math.floor(v / cell) + .5) * cell;
      // the Milky Way: haze along the band, split by a dark rift, and a dust of faint stars
      const haze = mix(p.c2, [235, 235, 255], .35);
      for (let k = 0; k <= 12; k++) {
        const s = k / 12, [x, y] = this.bandAt(s, W, hy), rift = 1 - .55 * Math.exp(-(((s - .42) / .12) ** 2));
        F.glow(x, y, hy * .3, haze, .055 * rift * ext(y / hy));
      }
      const t0 = this.bandAt(0, W, hy), t1 = this.bandAt(1, W, hy), nl = Math.hypot(t1[0] - t0[0], t1[1] - t0[1]), nx = (t0[1] - t1[1]) / nl, ny = (t1[0] - t0[0]) / nl;
      for (const b of this.band) {
        const [x0, y0] = this.bandAt(b.s, W, hy), x = snap(x0 + nx * b.off * hy * 1.8), y = snap(y0 + ny * b.off * hy * 1.8);
        if (y < 0 || y > hy) continue;
        const rift = 1 - .8 * Math.exp(-((b.off / .03) ** 2)) * Math.exp(-(((b.s - .42) / .14) ** 2));
        F.disc(x / cell - .5, y / cell - .5, .5, b.c, b.m * rift * ext(y / hy) * glare(x, y));
      }
      // stars: most are single faint points; the brightest get a halo and short twinkling spikes
      for (const s of this.stars) {
        const x = snap(s.u * W), y = snap(s.v * hy * .97);
        const tw = 1 + (.15 + .45 * s.v) * Math.sin(t * s.f1 + s.ph) * Math.sin(t * s.f2 + s.ph * 1.7), a = (.1 + .9 * s.m) * tw * ext(s.v) * glare(x, y);
        if (a < .02) continue;
        F.disc(x / cell - .5, y / cell - .5, .5, s.c, s.m < .45 ? a * 1.1 : a);
        if (s.m < .45) continue;
        F.glow(x, y, cell * 1.5, s.c, a * .5);                       // a faint cross of light on the four neighbours
        if (s.m > .9) { const l = cell * (1.6 + 14 * (s.m - .9)), b = a * .3 * tw; F.line(x - l, y, x + l, y, cell * .5, s.c, b); F.line(x, y - l, x, y + l, cell * .5, s.c, b); }
      }
      // a shooting star
      const m = this.meteor;
      if (m) {
        const fade = Math.sin(Math.PI * m.life / m.max), tail = Math.min(m.life, .18) * m.sp;
        for (let k = 0; k < 6; k++) { const a0 = k / 6, a1 = (k + 1) / 6; F.line(m.x - m.vx * tail * a0, m.y - m.vy * tail * a0, m.x - m.vx * tail * a1, m.y - m.vy * tail * a1, cell * .8, [235, 240, 255], .55 * fade * (1 - a0)); }
        F.glow(m.x, m.y, cell * 1.8, [240, 245, 255], .8 * fade);
      }
      // the moon, a little past full, with its seas, hiding the stars behind it
      const moon = mix(p.c1, [235, 240, 255], .55), mare = dim(mix(moon, p.c2, .5), .8);
      F.glow(mx, my, mr * 5.5, moon, .07); F.glow(mx, my, mr * 2.2, moon, .14);
      const Lm = this.lay.begin(mx - mr * 1.2, my - mr * 1.2, mx + mr * 1.2, my + mr * 1.2);
      Lm.dot(mx, my, mr, moon, 1);
      for (const [ox, oy, rr] of [[-.28, -.22, .3], [.2, -.1, .26], [-.02, .3, .2], [.34, .28, .14]]) Lm.dot(mx + ox * mr, my + oy * mr, rr * mr, mare, .55);
      Lm.dot(mx - mr * .62, my, mr * .55, dim(moon, .45), .35);       // the shaded limb
      Lm.over(F, .8);
      return moon;
    }
    draw(F, W, H, p, t, cell) {
      const L = this.L || this.layout(W, H), { hy, sy, gy, S, fx, fy, fs, mx } = L;
      const flick = .82 + .18 * Math.sin(t * 9.1) * Math.sin(t * 5.3 + 1.7);
      const FIRE = p.c3, EMBER = p.c4, foam = mix(p.c1, [235, 245, 255], .35), wet = mix(p.c1, foam, .3);
      const moon = this.sky(F, W, H, p, t, cell, L);

      // sea: dashed swell lines that close up toward the horizon and drift shoreward
      for (let j = 0; j < 9; j++) {
        const v = (j + (t * .06) % 1) / 9, y = hy + (sy - hy) * v * v, c = mix(p.c2, p.c1, v);
        for (let x = 0; x < W; x += 26) {
          const m = Math.sin(x * .013 * (1.6 - v) + j * 1.7 + t * .35);
          if (m > .35) F.line(x, y, x + 22, y, cell * .7, c, (.12 + .2 * v) * (m - .35) / .65);
        }
      }
      // moon path on the water: broken glints on the wave tops that shimmer and slide, widening toward the shore
      for (let k = 0; k < 26; k++) {
        const u = k / 25, y = hy + (sy - hy) * u * u, hw = (4 + 46 * u) * Math.min(1.4, W / 1200), base = (1 - .4 * u) * (1 - .3 * Math.abs(u - .35));
        F.line(mx - hw * .25, y, mx + hw * .25, y, cell * .7, moon, .12 * base);
        for (let d = 0; d < 3; d++) {
          const c = mx + hw * .85 * Math.sin(t * (.9 + .3 * d) + k * 2.3 + d * 2.1), l = hw * (.12 + .1 * (.5 + .5 * Math.sin(t * 1.3 + k + d * 4)));
          F.line(c - l, y, c + l, y, cell * .8, moon, (.15 + .35 * Math.max(0, Math.sin(t * 2.6 + k * 1.9 + d * 2.7))) * base);
        }
      }
      // the shoreline: the tide in and out, and every few seconds a wave that steepens and breaks
      // into foam, washes up the sand, and drains back, leaving the sand wet and shining a moment
      const tide = H * .01 * Math.sin(t * .33), shore = x => sy + tide + H * .005 * Math.sin(x * .011 + t * .5) + H * .003 * Math.sin(x * .027 - t * .8);
      let px = 0, py = shore(0);
      for (let x = 12; x <= W + 12; x += 12) { const y = shore(x); F.line(px, py, x, y, cell * .9, foam, .2 + .12 * (.5 + .5 * Math.sin(x * .045 - t * 1.6))); px = x; py = y; }
      for (const [P, o, run] of [[7.3, 0, .03], [10.1, 4.2, .022]]) {
        const w = ((t + o) / P) % 1, n = x => .55 + .45 * Math.sin(x * .021 + o * 5 + w * 4) * Math.sin(x * .053 + o * 2);
        if (w < .4) {
          const u = w / .4, y0 = sy - (sy - hy) * .16 * (1 - u) ** 1.4, a = .05 + .4 * u * u, wv = x => y0 + H * .003 * Math.sin(x * .02 + o);
          for (let x = 0; x < W; x += 14) F.line(x, wv(x), x + 14, wv(x + 14), cell * (.7 + .5 * u), foam, a * n(x));
        } else {
          const u = (w - .4) / .6, reach = u < .45 ? Math.sin(u / .45 * Math.PI / 2) : 1 - smooth(.45, 1, u), top = run * H, edge = u < .45 ? 1 : 1 - smooth(.6, 1, u);
          const sheet = u < .45 ? .05 : .045 * (1 - smooth(.45, 1, u)), ey = x => shore(x) + top * reach * (.75 + .25 * Math.sin(x * .013 + o * 3));
          for (let x = 0; x <= W; x += 14) {
            const y0 = ey(x), y1 = ey(x + 14), b0 = shore(x), b1 = shore(x + 14);
            F.line(x, y0, x + 14, y1, cell * .9, foam, (.32 - .2 * u) * n(x) * edge);
            F.line(x, (y0 + b0) / 2, x + 14, (y1 + b1) / 2, Math.max(cell, y0 - b0), wet, sheet);
          }
          F.line(mx, shore(mx), mx, ey(mx), cell * 2.2, moon, sheet * 3);    // the moon caught in the wet sand
        }
      }

      // firelight pooled on the sand, then the runners' shadows thrown away from the fire
      F.glow(fx, fy - fs * .2, fs * 5, mix(FIRE, EMBER, .3), .16 * flick);
      if (this.runners) this.drawRunners(F, W, H, p, t, L, flick);
      this.drawFire(F, H, p, t, cell, L, flick);
    }
    drawRunners(F, W, H, p, t, L, flick) {
      const { gy, S, fx, fy } = L, FIRE = p.c3;
      const v = S * 1.45, span = W + S * 6, skin = mix(p.c3, p.c4, .45), group = RUNNERS.map(r => {
        const drift = r.dog ? Math.sin(t * .6 + r.wob) * S * r.amp : 0, dist = t * v + drift;   // the dogs range ahead and drop back
        const x = ((dist + r.off * S) % span + span) % span - S * 3, warm = Math.exp(-(((x - fx) / (W * .22)) ** 2)) * flick;
        return { r, dist, x, warm, g: gy + r.dy * H, sc: S * r.sc };
      });
      for (const q of group) {
        if (q.warm < .04) continue;
        const dx = q.x - fx, dy = q.g - fy, d = Math.hypot(dx, dy) || 1, len = q.sc * (q.r.dog ? .5 : 1.1), ux = dx / d * len, uy = dy / d * len * .6, w = q.sc * (q.r.dog ? .09 : .08);
        for (let k = 0; k < 3; k++) F.shade([q.x + ux * k / 3, q.g + uy * k / 3], [q.x + ux * (k + 1) / 3, q.g + uy * (k + 1) / 3], w * (1 - .25 * k), w * (.75 - .25 * k), .5 * q.warm * (1 - .3 * k));
      }
      // the runners, farthest first, warmed by the firelight as they pass it
      for (const q of group.sort((a, b) => a.r.dy - b.r.dy)) {
        const { r, x, warm, g, sc } = q, tint = c => mix(c, FIRE, .3 * warm), a = Math.min(1, .88 * (1 + .25 * warm)) * (1 + 3 * r.dy);
        if (r.dog) { const D = sc * .4; dog(this.lay, F, x, g, D, ((q.dist / (D * GALLOP.stride) + r.ph) % 1 + 1) % 1, tint(r.fur), a); }
        else person(this.lay, F, x, g, sc, ((q.dist / (sc * RUN.stride) + r.ph) % 1 + 1) % 1, { hoodie: tint(p[r.hoodie]), shorts: tint(p[r.shorts]), skin: tint(skin), shoe: tint(SHOE), hair: tint(r.hair) }, a);
      }
    }
    drawFire(F, H, p, t, cell, L, flick) {
      const { fx, fy, fs } = L, FIRE = p.c3, EMBER = p.c4;
      // the fire, in front of everything: a ring of stones, logs, embers, flame tongues, licks
      // tearing off the tips, the hot core, sparks and smoke
      const stone = mix(EMBER, p.c2, .6), log = mix(EMBER, p.c2, .5);
      for (let k = 0; k < 10; k++) {   // the stones behind the fire face it and catch its light
        const an = k / 10 * 6.283 + .2;
        F.dot(fx + Math.cos(an) * fs * .95, fy + fs * .14 + Math.sin(an) * fs * .26, fs * .12, stone, (.16 + .14 * Math.max(0, -Math.sin(an))) * flick);
      }
      F.line(fx - fs * .75, fy + fs * .12, fx + fs * .65, fy - fs * .1, fs * .16, log, .3);
      F.line(fx - fs * .6, fy - fs * .12, fx + fs * .75, fy + fs * .14, fs * .16, log, .3);
      F.glow(fx, fy, fs * .9, EMBER, .5 * flick);
      for (let k = 0; k < 7; k++) {
        const o = (k - 3) / 3, h = fs * (1.7 - .7 * Math.abs(o)) * (.72 + .28 * Math.sin(t * (6 + k) + k * 1.3)), bx = fx + o * fs * .42;
        let prev = [bx, fy - fs * .05];
        for (let i = 1; i <= 7; i++) {
          const u = i / 7, cur = [bx + Math.sin(t * 5.5 + k * 1.9 + u * 3) * fs * .1 * u - o * fs * .2 * u, fy - fs * .05 - h * u];
          seg(F, prev, cur, fs * .17 * (1 - u) ** .8 + cell * .4, mix(FIRE, EMBER, u ** 1.3), .7 * (1 - .4 * u));
          prev = cur;
        }
      }
      for (const q of this.licks) { const u = q.life / q.max; seg(F, [q.x, q.y], [q.x + Math.sin(t * 7 + q.ph) * fs * .05, q.y - fs * .3 * (1 - u)], fs * .09 * (1 - u) + cell * .4, mix(FIRE, EMBER, .4 + .6 * u), .55 * (1 - u)); }
      F.glow(fx, fy - fs * .25, fs * .55, mix(FIRE, [255, 236, 190], .5), .85 * flick);
      for (const s of this.sparks) { const a = 1 - s.life / s.max; F.glow(s.x, s.y, cell * 1.2, mix(FIRE, EMBER, 1 - a), .9 * a); }
      for (let k = 0; k < 5; k++) {
        const u = (t * .05 + k / 5) % 1;
        F.glow(fx + Math.sin(t * .3 + k) * fs * .5 * u, fy - fs * 1.4 - u * H * .35, fs * (.6 + 1.2 * u), p.c2, .05 * (1 - u));
      }
    }
  }
  class BonfireRunners extends Bonfire { get runners() { return true; } }

  // Two double helixes turning side by side. Left, grown: twisted vines with leaves,
  // opening flowers and twig rungs, petals drifting off. Right, forged: chain-link
  // strands, barbed-wire rungs and swinging padlocks. Warm light on the left, a cold
  // blue beam on the right, a dark seam between them.
  const VINE = { bark: [200, 120, 72], leaf: [104, 172, 98], vein: [176, 212, 128], petal: [255, 196, 178], heart: [232, 168, 60] };
  const IRON = { link: [72, 132, 212], glint: [180, 220, 255], wire: [128, 172, 224], lock: [96, 128, 178] };

  class VinesAndChains {
    init(W, H) {
      const top = -H * .1, bot = H * 1.1;
      // leaves and flowers sit at fixed heights on the vine, so they turn with it
      this.leaves = []; this.flowers = []; this.petals = []; this.spawn = 0;
      for (let k = 0; k < 2; k++) for (let y = top + rnd(0, 20); y < bot; y += rnd(13, 24)) this.leaves.push({ k, y, side: Math.random() < .5 ? -1 : 1, l: rnd(.8, 1.25), ph: rnd(0, 6.28) });
      for (let k = 0; k < 2; k++) for (let y = top + rnd(0, 80); y < bot; y += rnd(90, 170)) this.flowers.push({ k, y, s: rnd(.8, 1.3), ph: rnd(0, 6.28), rot: rnd(0, 6.28) });
    }
    geom(W, H, t) {
      const land = W > H, pitch = Math.max(H * .55, 320);
      return {
        R: Math.min(W * .12, H * .2, 170), xl: W * (land ? .3 : .26), xr: W * (land ? .7 : .74),
        freq: 6.283 / pitch, rung: pitch / 10, top: -H * .1, bot: H * 1.1, spinL: t * .32, spinR: -t * .27,
      };
    }
    // strand k (0 or 1) of the helix standing at x = cx, at height y: [x, y, depth −1 back … 1 front]
    pt(g, cx, spin, k, y) {
      const th = y * g.freq + spin + k * Math.PI, z = Math.cos(th);
      return [cx + Math.sin(th) * g.R, y + z * g.R * .1, z];   // seen a little from above
    }
    step(dt, t, W, H) {
      const g = this.G = this.geom(W, H, t);
      this.spawn -= dt;
      if (this.spawn <= 0 && this.flowers.length) {
        this.spawn = rnd(.25, .6);
        const f = this.flowers[Math.floor(Math.random() * this.flowers.length)], [x, y, z] = this.pt(g, g.xl, g.spinL, f.k, f.y);
        if (z > -.2) this.petals.push({ x, y, vx: rnd(-8, 14), vy: rnd(14, 30), life: 0, max: rnd(4, 7), ph: rnd(0, 6.28) });
      }
      for (const q of this.petals) { q.life += dt; q.x += (q.vx + Math.sin(t * 1.3 + q.ph) * 18) * dt; q.y += q.vy * dt; }
      this.petals = this.petals.filter(q => q.life < q.max && q.y < H + 20);
    }
    atmosphere(F, p, t, W, H) {
      const g = this.G || this.geom(W, H, t), { cols, rows, d, cell } = F, warm = mix(p.c4, p.c3, .45), cold = [36, 104, 206];
      for (let i = 0; i < cols; i++) {
        const u = (i + .5) * cell / W, c = mix(warm, cold, smooth(.38, .62, u)), a = .04 - .018 * Math.exp(-(((u - .5) / .08) ** 2));
        for (let j = 0; j < rows; j++) { const k = (j * cols + i) * 3, aa = a * (.75 + .25 * j / rows); d[k] += c[0] * aa; d[k + 1] += c[1] * aa; d[k + 2] += c[2] * aa; }
      }
      F.glow(g.xl, H * .5, g.R * 3.4, warm, .09);
      for (let k = 0; k <= 6; k++) { const u = k / 6; F.glow(W * (.98 - .22 * u), H * (-.05 + .8 * u), g.R * (1.6 + 1.2 * u), cold, .055); }
    }
    draw(F, W, H, p, t, cell) {
      const g = this.G || this.geom(W, H, t);
      this.vines(F, g, t, cell);
      this.chains(F, g, t, cell);
    }
    vines(F, g, t, cell) {
      const cx = g.xl, spin = g.spinL, dz = z => z * .5 + .5;
      // twig rungs, sagging a little; the half nearer the viewer is brighter
      for (let y = Math.ceil(g.top / g.rung) * g.rung; y < g.bot; y += g.rung) {
        const a = this.pt(g, cx, spin, 0, y), b = this.pt(g, cx, spin, 1, y), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + g.R * .06];
        seg(F, a, m, cell * 1.1, VINE.bark, .14 + .22 * dz(a[2]));
        seg(F, m, b, cell * 1.1, VINE.bark, .14 + .22 * dz(b[2]));
      }
      // the two strands, each with a thinner tendril twisting round it
      for (let k = 0; k < 2; k++) {
        let prev = this.pt(g, cx, spin, k, g.top), tprev = prev;
        for (let y = g.top + 6; y <= g.bot; y += 6) {
          const cur = this.pt(g, cx, spin, k, y), z = dz(cur[2]), tw = [cur[0] + Math.sin(y * .09 + t * .8 + k * 2) * cell * 1.3, cur[1]];
          seg(F, prev, cur, cell * (1.3 + 1.2 * z), VINE.bark, .26 + .42 * z);
          seg(F, tprev, tw, cell * .7, mix(VINE.bark, VINE.leaf, .45), .12 + .25 * z);
          prev = cur; tprev = tw;
        }
      }
      for (const L of this.leaves) {
        const [x, y, zz] = this.pt(g, cx, spin, L.k, L.y), z = dz(zz), len = cell * 4.8 * L.l * (.7 + .3 * z);
        const tip = at([x, y], L.side * 2.1 + .18 * Math.sin(t * 1.2 + L.ph), len);   // up and outward, stirring
        seg(F, [x, y], tip, len * .55, VINE.leaf, .22 + .46 * z);
        seg(F, [x, y], tip, cell * .5, VINE.vein, .1 + .26 * z);
      }
      for (const f of this.flowers) {
        const [x0, y0, zz] = this.pt(g, cx, spin, f.k, f.y), z = dz(zz), out = Math.sign(x0 - cx) || 1, c = [x0 + out * cell * 1.2, y0 - cell * .6];
        const r = cell * 2.2 * f.s * (.78 + .22 * Math.sin(t * .35 + f.ph)) * (.75 + .25 * z), a = .2 + .5 * z;   // flowers slowly open and close
        F.glow(c[0], c[1], r * 4, VINE.petal, .16 * z);
        for (let i = 0; i < 5; i++) { const an = f.rot + t * .05 + i * 1.2566; F.dot(c[0] + Math.cos(an) * r, c[1] + Math.sin(an) * r, r * .72, VINE.petal, a); }
        F.dot(c[0], c[1], r * .45, VINE.heart, a);
      }
      for (const q of this.petals) F.dot(q.x, q.y, cell * .7, VINE.petal, .5 * (1 - q.life / q.max));
    }
    chains(F, g, t, cell) {
      const cx = g.xr, spin = g.spinR, dz = z => z * .5 + .5, link = Math.max(cell * 3.4, g.R * .26), ly = link * .75;
      // barbed-wire rungs: two wires twisted together, a barb every few twists, a padlock on every third
      for (let y = Math.ceil(g.top / g.rung) * g.rung; y < g.bot; y += g.rung) {
        const a = this.pt(g, cx, spin, 0, y), b = this.pt(g, cx, spin, 1, y), len = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.max(4, Math.round(len / 6));
        let p0 = a, p1 = a;
        for (let i = 1; i <= steps; i++) {
          const u = i / steps, z = dz(a[2] + (b[2] - a[2]) * u), x = a[0] + (b[0] - a[0]) * u, yy = a[1] + (b[1] - a[1]) * u;
          const tw = Math.sin(u * len * .25) * cell * .45, q0 = [x, yy + tw], q1 = [x, yy - tw], al = .1 + .26 * z;
          seg(F, p0, q0, cell * .55, IRON.wire, al);
          seg(F, p1, q1, cell * .55, IRON.wire, al);
          if (i % 4 === 2) { const s = cell * .9; seg(F, [x - s, yy - s], [x + s, yy + s], cell * .5, IRON.wire, al * 1.2); seg(F, [x - s, yy + s], [x + s, yy - s], cell * .5, IRON.wire, al * 1.2); }
          p0 = q0; p1 = q1;
        }
        const r = Math.round(y / g.rung);
        if (r % 3 === 0) { const end = a[2] > b[2] ? a : b; this.padlock(F, end, .22 * Math.sin(t * 1.1 + r * 1.7), link * 1.1, dz(end[2]), cell); }
      }
      // the strands: links at fixed heights on the helix so they turn with it, alternating
      // face-on (an oval ring) and edge-on (a bar); a glint runs down each chain
      for (let k = 0; k < 2; k++) for (let i = Math.floor(g.top / ly); i * ly < g.bot; i++) {
        const c0 = this.pt(g, cx, spin, k, i * ly), c1 = this.pt(g, cx, spin, k, (i + 1) * ly);
        const m = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2], sp = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) || 1;
        const dir = [(c1[0] - c0[0]) / sp, (c1[1] - c0[1]) / sp], nrm = [-dir[1], dir[0]], z = dz((c0[2] + c1[2]) / 2);
        const glint = Math.max(0, Math.sin(i * ly * .02 - t * 1.6 + k * 3)) ** 8, col = mix(IRON.link, IRON.glint, .25 * z + .6 * glint), a = .16 + .5 * z, A = sp * .62;
        if (i & 1) {
          const B = link * .3; let q0 = null;
          for (let s = 0; s <= 10; s++) {
            const an = s / 10 * 6.283, q = [m[0] + dir[0] * Math.cos(an) * A + nrm[0] * Math.sin(an) * B, m[1] + dir[1] * Math.cos(an) * A + nrm[1] * Math.sin(an) * B];
            if (q0) seg(F, q0, q, cell * .75, col, a);
            q0 = q;
          }
        } else seg(F, [m[0] - dir[0] * A, m[1] - dir[1] * A], [m[0] + dir[0] * A, m[1] + dir[1] * A], cell * 1.1, col, a);
      }
    }
    // a padlock hanging by its shackle from `top`, swung `sw` rad off vertical; s sets its size
    padlock(F, top, sw, s, z, cell) {
      const a = .25 + .55 * z, w = s * 1.2, h = s, y0 = s * .6;
      const P = (lx, ly) => [top[0] + Math.cos(sw) * lx + Math.sin(sw) * ly, top[1] - Math.sin(sw) * lx + Math.cos(sw) * ly];
      let prev = P(-w * .3, y0);
      for (let i = 1; i <= 8; i++) { const an = Math.PI * i / 8, cur = P(-Math.cos(an) * w * .3, y0 - Math.sin(an) * y0); seg(F, prev, cur, cell * .8, IRON.link, a); prev = cur; }
      const n = Math.max(2, Math.round(h / (cell * .8)));
      for (let i = 0; i <= n; i++) { const ly = y0 + h * i / n; seg(F, P(-w / 2, ly), P(w / 2, ly), cell * .9, IRON.lock, a * .6); }
      seg(F, P(-w / 2, y0), P(-w / 2, y0 + h), cell * .6, IRON.glint, a * .5);   // lit edge
    }
  }

  // ---------- painted scenes ----------
  // The jellyfish (Code Ocean) and the mushroom cloud were first drawn with the canvas API and
  // sampled back with getImageData. Their drawing code is kept as it was; a painted scene draws a
  // page-sized canvas in paint(ctx, W, H) and the renderer samples it on the GPU (renderPainted).
  // Their motion was tuned per frame at 60 fps, so it runs on a fixed 60 Hz tick (t += 0.016).
  // ink: how much lighter their translucent fillText characters were than the engine's opaque
  // glyph mask (measured in Chrome against the originals), so they come out as bright as before.
  class Ticked {
    init(W, H) { this.W = W; this.H = H; this.t = 0; this.acc = 0; this.bg = '#000'; this.setup(); }
    step(dt, t, W, H) { this.W = W; this.H = H; this.acc += dt; while (this.acc >= 1 / 60) { this.acc -= 1 / 60; this.t += .016; this.tick(); } }
  }

  class Jelly {
    constructor(x, y, size, isTeal) {
      this.x = x; this.y = y; this.size = size; this.isTeal = isTeal;   // x, y: 0-1 of the page; size: bell radius, px
      this.speed = 0.0003 + Math.random() * 0.0004;
      this.driftX = (Math.random() - 0.5) * 0.00003;
      this.pulseFreq = 0.12 + Math.random() * 0.08;
      this.pulseOffset = Math.random() * Math.PI * 2;
      this.wobblePhase = Math.random() * Math.PI * 2;
      this.tentacleCount = 7 + Math.floor(Math.random() * 5);
      this.tentacleSeeds = [];
      for (let i = 0; i < this.tentacleCount; i++) {
        this.tentacleSeeds.push({ lengthMul: 0.6 + Math.random() * 0.8, waveMul: 0.8 + Math.random() * 0.6, offset: Math.random() * Math.PI * 2, thickness: 1 + Math.random() * 2 });
      }
      this.bubbles = [];
      this.bubbleTimer = Math.random() * 100;
    }
    update({ t, W, H }) {
      const pulse = Math.sin(t * this.pulseFreq + this.pulseOffset);
      const boost = pulse > 0.4 ? 0.00002 : 0;
      this.y -= this.speed + boost;
      this.wobblePhase += 0.002;
      this.x += this.driftX + Math.sin(this.wobblePhase) * 0.00002;
      // reset when well off screen
      if (this.y < -0.15) { this.y = 1.15 + Math.random() * 0.1; this.x = 0.1 + Math.random() * 0.8; }
      this.bubbleTimer += 1;
      if (this.bubbleTimer > 30 + Math.random() * 60) {
        this.bubbleTimer = 0;
        const bx = this.x * W + (Math.random() - 0.5) * this.size * 1.2, by = this.y * H - this.size * 0.2;
        this.bubbles.push({ x: bx, y: by, vy: -0.3 - Math.random() * 0.5, r: 3 + Math.random() * 6, life: 0 });
      }
      for (let i = this.bubbles.length - 1; i >= 0; i--) {
        const b = this.bubbles[i];
        b.y += b.vy; b.x += Math.sin(t * 0.5 + i) * 0.08; b.life++;
        if (b.life > 500 || b.y < -20) this.bubbles.splice(i, 1);
      }
    }
    draw(sctx, { t, W, H }) {
      const cx = this.x * W, cy = this.y * H;
      const pulse = Math.sin(t * this.pulseFreq + this.pulseOffset);
      const bellW = this.size * (0.9 + pulse * 0.1), bellH = this.size * (0.65 + pulse * -0.08);
      const hue = this.isTeal ? 180 : 300, sat = this.isTeal ? 80 : 70;
      // dissolve into light in the top ~20% of the screen
      let dissolve = 1;
      if (this.y < 0.20) { dissolve = Math.max(0, this.y / 0.20); dissolve = dissolve * dissolve; }
      if (dissolve <= 0) return;
      sctx.save();
      sctx.globalAlpha = dissolve;
      // outer glow (bioluminescence)
      const glow = sctx.createRadialGradient(cx, cy - bellH * 0.2, 0, cx, cy, this.size * 3);
      glow.addColorStop(0, `hsla(${hue}, ${sat}%, 65%, 0.6)`);
      glow.addColorStop(0.3, `hsla(${hue}, ${sat}%, 50%, 0.3)`);
      glow.addColorStop(0.6, `hsla(${hue}, ${sat}%, 35%, 0.1)`);
      glow.addColorStop(1, 'transparent');
      sctx.fillStyle = glow;
      sctx.fillRect(cx - this.size * 3, cy - this.size * 3, this.size * 6, this.size * 6);
      // bell
      sctx.beginPath();
      sctx.moveTo(cx - bellW, cy + 2);
      sctx.quadraticCurveTo(cx - bellW, cy - bellH * 1.4, cx, cy - bellH * 1.5);
      sctx.quadraticCurveTo(cx + bellW, cy - bellH * 1.4, cx + bellW, cy + 2);
      for (let i = 0; i < 8; i++) {
        const progress = i / 8;
        sctx.lineTo(cx + bellW - progress * bellW * 2, cy + 2 + Math.sin(progress * Math.PI * 8 + t * 0.3) * 3);
      }
      sctx.closePath();
      const bellGrad = sctx.createRadialGradient(cx, cy - bellH * 0.5, 0, cx, cy, bellW);
      bellGrad.addColorStop(0, `hsl(${hue}, ${sat}%, 75%)`);
      bellGrad.addColorStop(0.4, `hsl(${hue}, ${sat}%, 60%)`);
      bellGrad.addColorStop(0.8, `hsl(${hue}, ${sat - 10}%, 45%)`);
      bellGrad.addColorStop(1, `hsla(${hue}, ${sat - 15}%, 35%, 0.7)`);
      sctx.fillStyle = bellGrad;
      sctx.fill();
      // bright centre of the bell
      sctx.beginPath();
      sctx.ellipse(cx, cy - bellH * 0.4, bellW * 0.45, bellH * 0.55, 0, 0, Math.PI * 2);
      sctx.fillStyle = `hsla(${hue}, ${sat + 10}%, 85%, 0.5)`;
      sctx.fill();
      // tentacles: three waves at different speeds
      for (let ti = 0; ti < this.tentacleCount; ti++) {
        const seed = this.tentacleSeeds[ti];
        const startX = cx - bellW * 0.7 + (ti / (this.tentacleCount - 1)) * bellW * 1.4, tentLen = this.size * 2.0 * seed.lengthMul;
        sctx.beginPath();
        sctx.moveTo(startX, cy + 4);
        for (let s = 1; s <= 16; s++) {
          const progress = s / 16;
          const wave1 = Math.sin(t * 0.25 * seed.waveMul + ti * 0.7 + progress * 3 + seed.offset) * (10 + progress * 18);
          const wave2 = Math.sin(t * 0.6 + ti * 1.3 + progress * 6 + seed.offset) * (3 + progress * 8);
          const wave3 = Math.sin(t * 0.08 + ti * 0.4 + progress * 1.5) * (4 + progress * 6);
          sctx.lineTo(startX + wave1 + wave2 + wave3 + (ti - this.tentacleCount / 2) * progress * 2.5, cy + 4 + progress * tentLen);
        }
        sctx.strokeStyle = `hsla(${hue}, ${sat}%, 55%, ${0.55 + Math.sin(t * 0.2 + ti) * 0.1})`;
        sctx.lineWidth = seed.thickness + 0.5;
        sctx.stroke();
      }
      // oral arms: thicker central tentacles
      for (let oa = 0; oa < 3; oa++) {
        const oaX = cx + (oa - 1) * bellW * 0.3, oaLen = this.size * 2.5;
        sctx.beginPath();
        sctx.moveTo(oaX, cy + 3);
        for (let s = 1; s <= 18; s++) {
          const p = s / 18;
          const wave = Math.sin(t * 0.18 + oa * 1.2 + p * 4) * (6 + p * 22) + Math.sin(t * 0.4 + oa * 0.8 + p * 7) * (2 + p * 10);
          sctx.lineTo(oaX + wave, cy + 3 + p * oaLen);
        }
        sctx.strokeStyle = `hsla(${hue + 15}, ${sat}%, 60%, 0.55)`;
        sctx.lineWidth = 2.5 + (1 - oa / 3) * 2;
        sctx.stroke();
      }
      // bubbles
      for (const b of this.bubbles) {
        const bAlpha = Math.max(0, 0.7 - b.life * 0.001);
        const bg = sctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2.5);
        bg.addColorStop(0, `hsla(${hue}, 60%, 70%, ${bAlpha * 0.4})`);
        bg.addColorStop(1, 'transparent');
        sctx.fillStyle = bg;
        sctx.fillRect(b.x - b.r * 3, b.y - b.r * 3, b.r * 6, b.r * 6);
        sctx.beginPath();
        sctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        sctx.fillStyle = `hsla(${hue}, 55%, 70%, ${bAlpha * 0.5})`;
        sctx.fill();
        sctx.strokeStyle = `hsla(${hue}, 70%, 80%, ${bAlpha * 0.7})`;
        sctx.lineWidth = 1;
        sctx.stroke();
        sctx.beginPath();
        sctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.3, 0, Math.PI * 2);
        sctx.fillStyle = `hsla(${hue}, 40%, 90%, ${bAlpha * 0.6})`;
        sctx.fill();
      }
      sctx.restore();
    }
  }

  // Code Ocean: six jellyfish rising through the deep, under a rippling surface with light shafts.
  class Ocean extends Ticked {
    get ink() { return .62; }
    setup() { this.jellies = [[.18, .55, 65, true], [.42, .72, 55, true], [.55, .40, 70, false], [.72, .62, 50, false], [.32, .85, 60, true], [.82, .48, 45, true]].map(a => new Jelly(...a)); }
    tick() { for (const jf of this.jellies) jf.update(this); }
    surface(sctx, W, H, t) {
      sctx.save();
      // bright band at the waterline
      const surfaceH = H * 0.06, surfGrad = sctx.createLinearGradient(0, 0, 0, surfaceH);
      surfGrad.addColorStop(0, 'rgba(60, 160, 240, 0.35)');
      surfGrad.addColorStop(0.3, 'rgba(30, 100, 200, 0.20)');
      surfGrad.addColorStop(0.7, 'rgba(15, 60, 140, 0.08)');
      surfGrad.addColorStop(1, 'transparent');
      sctx.fillStyle = surfGrad;
      sctx.fillRect(0, 0, W, surfaceH);
      // rippling caustics along the surface, each flickering on its own
      for (let i = 0; i < 12; i++) {
        const baseX = (i / 12) * W, rippleY = 3 + Math.sin(t * 0.3 + i * 0.8) * 2;
        const cx = baseX + Math.sin(t * 0.05 + i * 1.3) * 40, cy = rippleY + Math.sin(t * 0.08 + i * 0.6) * 3, cw = 30 + Math.sin(t * 0.06 + i) * 15;
        const patchFlicker = Math.max(0, Math.sin(t * 0.8 + i * 1.9) * 0.4 + Math.sin(t * 1.5 + i * 3.2) * 0.2 + 0.5);
        const cGrad = sctx.createRadialGradient(cx, cy, 0, cx, cy, cw);
        cGrad.addColorStop(0, `rgba(100, 200, 255, ${0.30 * patchFlicker})`);
        cGrad.addColorStop(0.5, `rgba(50, 140, 220, ${0.12 * patchFlicker})`);
        cGrad.addColorStop(1, 'transparent');
        sctx.fillStyle = cGrad;
        sctx.fillRect(cx - cw, cy - cw, cw * 2, cw * 2);
      }
      // light shafts from the surface, swaying, widening with depth, flickering like light through ripples
      sctx.globalCompositeOperation = 'lighter';
      const shaftCount = 6;
      for (let i = 0; i < shaftCount; i++) {
        const baseX = W * (0.08 + (i / (shaftCount - 1)) * 0.84);
        const swayX = Math.sin(t * 0.025 + i * 1.1) * 50 + Math.sin(t * 0.04 + i * 0.7) * 25, topX = baseX + swayX;
        const topW = 8 + Math.sin(t * 0.035 + i * 0.9) * 4, botW = 50 + Math.sin(t * 0.02 + i * 1.4) * 25 + i * 8;
        const botX = topX + Math.sin(t * 0.015 + i * 0.5) * 30, depth = H * (0.45 + Math.sin(t * 0.018 + i * 0.8) * 0.15);
        const flickerTotal = Math.max(0, 0.5 + Math.sin(t * 0.7 + i * 2.3) * 0.3 + Math.sin(t * 0.23 + i * 1.7) * 0.2 + Math.sin(t * 0.05 + i * 0.9) * 0.15 + Math.sin(t * 1.3 + i * 3.1) * 0.1);
        const intensity = (0.14 + Math.sin(t * 0.03 + i * 1.2) * 0.04) * flickerTotal;
        const shaftGrad = sctx.createLinearGradient(topX, 0, botX, depth);
        shaftGrad.addColorStop(0, `rgba(60, 160, 240, ${intensity + 0.08})`);
        shaftGrad.addColorStop(0.1, `rgba(45, 130, 210, ${intensity})`);
        shaftGrad.addColorStop(0.4, `rgba(25, 90, 180, ${intensity * 0.5})`);
        shaftGrad.addColorStop(0.7, `rgba(15, 60, 140, ${intensity * 0.2})`);
        shaftGrad.addColorStop(1, 'transparent');
        sctx.fillStyle = shaftGrad;
        sctx.beginPath();
        sctx.moveTo(topX - topW, 0); sctx.lineTo(topX + topW, 0); sctx.lineTo(botX + botW, depth); sctx.lineTo(botX - botW, depth);
        sctx.fill();
        const coreGrad = sctx.createLinearGradient(topX, 0, botX, depth * 0.6);
        coreGrad.addColorStop(0, `rgba(100, 190, 255, ${intensity * 0.6})`);
        coreGrad.addColorStop(0.3, `rgba(60, 140, 220, ${intensity * 0.2})`);
        coreGrad.addColorStop(1, 'transparent');
        sctx.fillStyle = coreGrad;
        sctx.beginPath();
        sctx.moveTo(topX - topW * 0.3, 0); sctx.lineTo(topX + topW * 0.3, 0); sctx.lineTo(botX + botW * 0.3, depth * 0.6); sctx.lineTo(botX - botW * 0.3, depth * 0.6);
        sctx.fill();
      }
      // caustic dapple on the deeper water
      for (let i = 0; i < 20; i++) {
        const cx = Math.sin(t * 0.02 + i * 2.1) * W * 0.4 + W * 0.5 + Math.cos(t * 0.03 + i) * 60;
        const cy = H * 0.05 + Math.sin(t * 0.025 + i * 1.7) * H * 0.2 + i * H * 0.015;
        const cr = 8 + Math.sin(t * 0.04 + i * 0.9) * 5, cAlpha = 0.04 + Math.sin(t * 0.05 + i * 1.3) * 0.02;
        if (cAlpha > 0) {
          const dGrad = sctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
          dGrad.addColorStop(0, `rgba(80, 180, 240, ${cAlpha})`);
          dGrad.addColorStop(1, 'transparent');
          sctx.fillStyle = dGrad;
          sctx.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
        }
      }
      sctx.restore();
    }
    paint(sctx, W, H) {
      const t = this.t, bg = sctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#051530'); bg.addColorStop(0.3, '#030c20'); bg.addColorStop(0.7, '#020816'); bg.addColorStop(1, '#01040c');
      sctx.fillStyle = bg;
      sctx.fillRect(0, 0, W, H);
      this.surface(sctx, W, H, t);
      for (const jf of [...this.jellies].sort((a, b) => a.y - b.y)) jf.draw(sctx, this);
    }
  }

  // Smoke that rises, rolls inward and billows out.
  class Smoke {
    constructor(x, y, r, hue, sat, light, alpha, vx, vy, life) {
      this.x = x; this.y = y; this.r = r; this.hue = hue; this.sat = sat; this.light = light; this.alpha = alpha;
      this.vx = vx; this.vy = vy; this.life = life; this.maxLife = life; this.seed = Math.random() * 100;
    }
    update(t) {
      this.life--;
      this.x += this.vx + Math.sin(t * 0.1 + this.seed) * 0.15;
      this.y += this.vy;
      this.vx *= 0.998; this.vy *= 0.999;
      this.r += 0.08 + (1 - this.life / this.maxLife) * 0.05;
      this.alpha = this.alpha * (this.life / this.maxLife);
    }
  }

  // A mushroom cloud: a ground flash, a roiling stem, a rolling cap with a hot core, smoke, a shockwave ring.
  class MushroomCloud extends Ticked {
    get ink() { return .51; }
    setup() { this.particles = []; }
    tick() {
      const { W, H, t } = this, P = this.particles;
      if (P.length < 200 && Math.random() < 0.3) {   // stem smoke, rising from the base
        P.push(new Smoke(W * 0.5 + (Math.random() - 0.5) * 30, H * 0.82 + (Math.random() - 0.5) * 10, 8 + Math.random() * 12,
          15 + Math.random() * 20, 70 + Math.random() * 20, 40 + Math.random() * 25, 0.25 + Math.random() * 0.15,
          (Math.random() - 0.5) * 0.3, -0.6 - Math.random() * 0.4, 300 + Math.random() * 200));
      }
      if (P.length < 200 && Math.random() < 0.4) {   // cap smoke, billowing out and curling up
        const angle = Math.random() * Math.PI * 2, dist = 20 + Math.random() * W * 0.15, outward = 0.2 + Math.random() * 0.3;
        P.push(new Smoke(W * 0.5 + Math.cos(angle) * dist, H * 0.25 + Math.sin(angle) * dist * 0.5 + (Math.random() - 0.5) * 30, 15 + Math.random() * 25,
          10 + Math.random() * 30, 50 + Math.random() * 30, 30 + Math.random() * 30, 0.12 + Math.random() * 0.12,
          Math.cos(angle) * outward, -0.15 - Math.random() * 0.25 + Math.sin(angle) * 0.1, 250 + Math.random() * 250));
      }
      for (let i = P.length - 1; i >= 0; i--) { P[i].update(t); if (P[i].life <= 0 || P[i].alpha < 0.005) P.splice(i, 1); }
    }
    paint(sctx, W, H) {
      const t = this.t, sky = sctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0a0414'); sky.addColorStop(0.3, '#120820'); sky.addColorStop(0.6, '#1a0c28'); sky.addColorStop(0.85, '#0d0618'); sky.addColorStop(1, '#060310');
      sctx.fillStyle = sky;
      sctx.fillRect(0, 0, W, H);
      sctx.save();
      sctx.globalCompositeOperation = 'lighter';
      // ground flash
      const flashX = W * 0.5, flashY = H * 0.82, flashPulse = 0.85 + Math.sin(t * 0.15) * 0.1;
      const flash = sctx.createRadialGradient(flashX, flashY, 0, flashX, flashY, W * 0.22);
      flash.addColorStop(0, `rgba(255, 220, 180, ${0.65 * flashPulse})`);
      flash.addColorStop(0.1, `rgba(255, 160, 100, ${0.40 * flashPulse})`);
      flash.addColorStop(0.25, `rgba(255, 100, 60, ${0.18 * flashPulse})`);
      flash.addColorStop(0.5, `rgba(200, 50, 30, ${0.05 * flashPulse})`);
      flash.addColorStop(1, 'transparent');
      sctx.fillStyle = flash;
      sctx.fillRect(0, flashY - W * 0.25, W, W * 0.5);
      // the stem: a rising, roiling column
      const stemCX = W * 0.5, stemSway = Math.sin(t * 0.03) * 5;
      for (let i = 0; i < 4; i++) {
        const cx = stemCX + Math.sin(t * 0.07 + i * 1.2) * 6 + stemSway, stemTop = H * 0.30, stemBot = H * 0.82, width = 20 + i * 6;
        sctx.beginPath();
        sctx.moveTo(cx - width * 1.1, stemBot);
        for (let p = 0; p <= 8; p++) {
          const prog = p / 8, py = stemBot - prog * (stemBot - stemTop);
          const turb = Math.sin(t * 0.12 + prog * 5 + i) * (8 + prog * 12) + Math.sin(t * 0.2 + prog * 8 + i * 2) * 4;
          sctx.lineTo(cx - width * (0.7 + Math.sin(prog * Math.PI) * 0.6) + turb, py);
        }
        for (let p = 8; p >= 0; p--) {
          const prog = p / 8, py = stemBot - prog * (stemBot - stemTop);
          const turb = Math.sin(t * 0.12 + prog * 5 + i + 3) * (8 + prog * 12) + Math.sin(t * 0.2 + prog * 8 + i * 2 + 2) * 4;
          sctx.lineTo(cx + width * (0.7 + Math.sin(prog * Math.PI) * 0.6) + turb, py);
        }
        sctx.closePath();
        const stemG = sctx.createLinearGradient(cx, stemBot, cx, stemTop), a = 0.22 - i * 0.03;
        stemG.addColorStop(0, `rgba(255, 140, 60, ${a})`);
        stemG.addColorStop(0.3, `rgba(200, 70, 40, ${a * 0.7})`);
        stemG.addColorStop(0.6, `rgba(140, 40, 40, ${a * 0.4})`);
        stemG.addColorStop(1, `rgba(80, 25, 35, ${a * 0.2})`);
        sctx.fillStyle = stemG;
        sctx.fill();
      }
      // the cap: rolling rings of turbulence
      const capCX = W * 0.5 + stemSway * 0.5, capCY = H * 0.25 + Math.sin(t * 0.04) * 3, capRX = W * 0.27, capRY = H * 0.16;
      for (let ring = 0; ring < 5; ring++) {
        const rScale = 0.5 + ring * 0.2, cx = capCX + Math.sin(t * 0.06 + ring * 1.8) * 12 * rScale, cy = capCY + Math.sin(t * 0.08 + ring * 1.3) * 6 * rScale;
        const rg = sctx.createRadialGradient(cx, cy, capRX * rScale * 0.15, cx, cy, capRX * rScale), a = 0.20 - ring * 0.025;
        rg.addColorStop(0, `rgba(220, 100, 50, ${a})`);
        rg.addColorStop(0.3, `rgba(160, 55, 40, ${a * 0.6})`);
        rg.addColorStop(0.6, `rgba(100, 30, 40, ${a * 0.3})`);
        rg.addColorStop(1, 'transparent');
        sctx.fillStyle = rg;
        sctx.beginPath();
        sctx.ellipse(cx, cy, capRX * rScale, capRY * rScale, 0, 0, Math.PI * 2);
        sctx.fill();
      }
      // hot core, pulsing
      const corePulse = 0.9 + Math.sin(t * 0.1) * 0.1, coreG = sctx.createRadialGradient(capCX, capCY - 8, 0, capCX, capCY, capRX * 0.22);
      coreG.addColorStop(0, `rgba(255, 240, 200, ${0.45 * corePulse})`);
      coreG.addColorStop(0.3, `rgba(255, 180, 120, ${0.25 * corePulse})`);
      coreG.addColorStop(1, 'transparent');
      sctx.fillStyle = coreG;
      sctx.fillRect(capCX - capRX * 0.3, capCY - capRY * 0.4, capRX * 0.6, capRY * 0.6);
      // smoke
      for (const p of this.particles) {
        const pg = sctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        pg.addColorStop(0, `hsla(${p.hue}, ${p.sat}%, ${p.light}%, ${p.alpha})`);
        pg.addColorStop(0.5, `hsla(${p.hue}, ${p.sat - 10}%, ${p.light - 10}%, ${p.alpha * 0.4})`);
        pg.addColorStop(1, 'transparent');
        sctx.fillStyle = pg;
        sctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      // shockwave ring
      const ringR = W * 0.38 + Math.sin(t * 0.02) * W * 0.02;
      sctx.beginPath();
      sctx.ellipse(W * 0.5, H * 0.80, ringR, ringR * 0.1, 0, 0, Math.PI * 2);
      sctx.strokeStyle = 'rgba(200, 100, 60, 0.07)'; sctx.lineWidth = 3; sctx.stroke();
      sctx.strokeStyle = 'rgba(160, 70, 45, 0.03)'; sctx.lineWidth = 12; sctx.stroke();
      // purple haze
      const haze = sctx.createLinearGradient(0, 0, 0, H);
      haze.addColorStop(0, 'rgba(50, 15, 70, 0.05)'); haze.addColorStop(0.5, 'rgba(35, 10, 50, 0.025)'); haze.addColorStop(1, 'rgba(15, 5, 28, 0.06)');
      sctx.fillStyle = haze;
      sctx.fillRect(0, 0, W, H);
      // ground
      const gnd = sctx.createLinearGradient(0, H * 0.88, 0, H);
      gnd.addColorStop(0, 'transparent'); gnd.addColorStop(0.3, 'rgba(12, 5, 20, 0.18)'); gnd.addColorStop(1, 'rgba(8, 3, 14, 0.30)');
      sctx.fillStyle = gnd;
      sctx.fillRect(0, H * 0.88, W, H * 0.12);
      sctx.restore();
    }
  }

  // The brightness curve the jellyfish was made with, as an SVG filter for the GPU to apply: each
  // character's colour is multiplied by a gain picked by its brightness (luma): dim light ×2.5,
  // mid ×1.8, bright ×1.2, faded the dimmer it is, nothing below 1/255. The gain table holds
  // gain/2.5 (filters work in 0..1) and the composite multiplies it back by 2.5. Built once.
  let toneFilterId;
  function toneFilter() {
    if (toneFilterId) return toneFilterId;
    const n = 64, vals = [], lum = '.299 .587 .114 0 0';
    for (let i = 0; i <= n; i++) { const c = 255 * i / n, boost = c < 20 ? 2.5 : c < 60 ? 1.8 : 1.2; vals.push((c < 1 ? 0 : boost * Math.min(.95, .2 + c / 50) / 2.5).toFixed(4)); }
    const cap = Array.from({ length: 21 }, (_, i) => Math.min(.949, i / 20).toFixed(3)).join(' ');   // nothing brighter than 0.95 × 255, as before
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    svg.innerHTML = `<filter id="code-bg-tone" color-interpolation-filters="sRGB">
      <feColorMatrix in="SourceGraphic" type="matrix" values="${lum} ${lum} ${lum} 0 0 0 1 0" result="luma"/>
      <feComponentTransfer in="luma" result="gain">${['R', 'G', 'B'].map(ch => `<feFunc${ch} type="table" tableValues="${vals.join(' ')}"/>`).join('')}</feComponentTransfer>
      <feComposite in="SourceGraphic" in2="gain" operator="arithmetic" k1="2.5" k2="0" k3="0" k4="0"/>
      <feComponentTransfer>${['R', 'G', 'B'].map(ch => `<feFunc${ch} type="table" tableValues="${cap}"/>`).join('')}</feComponentTransfer></filter>`;
    document.body.appendChild(svg);
    return toneFilterId = 'url(#code-bg-tone)';
  }

  const SCENES = { constellation: Constellation, mycelium: Mycelium, helix: Helix, bonfire: Bonfire, 'bonfire-runners': BonfireRunners, 'vines-and-chains': VinesAndChains, jellyfish: Ocean, 'mushroom-cloud': MushroomCloud };

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
      Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: canvas.style.zIndex || '-1', pointerEvents: 'none', display: 'block' });
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
      const cs = CHARSETS[this.name];
      if (cs) { const set = cs.length > 1 && Math.random() >= cs[0][1] ? cs[1][0] : cs[0][0]; return GLYPH_INDEX.get(set[Math.floor(Math.random() * set.length)]); }
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
      // swap characters a trickle at a time (same ~10%/s as the jellyfish, no bursts)
      const swaps = Math.round(this.grid.length * .1 * dt);
      for (let s = 0; s < swaps; s++) { const i = Math.floor(Math.random() * this.grid.length); this.grid[i] = this.pick(); this.drawGlyph(i); }
      if (this.scene.paint) { this.renderPainted(); return; }
      F.clear();
      this.scene.draw(F, W, H, pal, this.t, this.cell);
      if (this.intensity !== 1) for (let k = 0; k < F.d.length; k++) F.d[k] *= this.intensity;
      // a scene may light its own backdrop (sky, sea, sand); the rest share the ocean wash
      if (this.scene.atmosphere) this.scene.atmosphere(F, pal, this.t, W, H); else this.atmosphere(F, pal, this.t);
      this.render();
    }
    // A painted scene draws a page-sized canvas; one pixel per character cell is then taken on the
    // GPU (drawImage with smoothing off picks each cell's centre pixel, as the original sampling
    // did), run through the jellyfish's brightness curve and stretched over the characters.
    // Nothing is read back, so fingerprinting protection has nothing to scramble.
    renderPainted() {
      const { cols, rows, cell, g, gctx } = this, w = cols * cell, h = rows * cell;
      if (!this.paintCanvas) { this.paintCanvas = document.createElement('canvas'); this.pctx = this.paintCanvas.getContext('2d'); }
      const pc = this.paintCanvas;
      if (pc.width !== w || pc.height !== h) { pc.width = w; pc.height = h; }
      this.scene.paint(this.pctx, this.W, this.H);
      const tc = this.tctx;
      tc.globalCompositeOperation = 'copy'; tc.imageSmoothingEnabled = false; tc.filter = toneFilter();
      tc.drawImage(pc, 0, 0, w, h, 0, 0, cols, rows);
      tc.filter = 'none';
      // dim afterwards: alpha set during a filtered draw is applied before the filter, and the
      // filter's multiply step would then count it twice
      const k = this.intensity * (this.scene.ink || 1);
      if (k < 1) { tc.globalCompositeOperation = 'destination-in'; tc.globalAlpha = k; tc.fillRect(0, 0, cols, rows); tc.globalAlpha = 1; }
      tc.globalCompositeOperation = 'source-over';
      gctx.globalCompositeOperation = 'copy'; gctx.drawImage(this.mask, 0, 0);
      gctx.globalCompositeOperation = 'source-in'; gctx.imageSmoothingEnabled = false;
      gctx.drawImage(this.tint, 0, 0, cols * g, rows * g);
      this.present();
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
      this.present();
    }
    present() {
      const { cols, rows, g, ctx } = this;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = this.scene.bg || PALETTE.void; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
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
