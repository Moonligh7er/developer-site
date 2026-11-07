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
     "bonfire"        — beach bonfire at night; two people and two dogs run the shoreline on a loop
     "vines-and-chains" — twin double helixes: flowering vines (left), chains, barbed wire and padlocks (right)

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
  const THEME = { constellation: '·+*×∘°', mycelium: '/\\|-_.,:;', helix: '∞~=|:·', bonfire: '^~*.,:', 'vines-and-chains': '@&%~§' };
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
    // filled dot of radius r, in page pixels (disc works in cells)
    dot(x, y, r, c, a) { this.disc(x / this.cell - .5, y / this.cell - .5, Math.max(.5, r / this.cell), c, a); }
  }

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

  // A runner facing right, feet on y = g, S tall; φ is the stride phase (one full
  // cycle = two steps). Far-side limbs are drawn dimmer so the body reads in depth.
  function person(F, x, g, S, φ, hoodie, shorts, skin, a) {
    const hip = [x, g - .5 * S + .03 * S * Math.cos(2 * φ)], sh = at(hip, Math.PI - .2, .3 * S), head = [sh[0] + .06 * S, sh[1] - .1 * S];
    for (const side of [1, 0]) {
      const k = side ? .55 : 1, ph = φ + side * Math.PI;
      // thigh swings ±0.62 rad; the knee folds hardest as the leg swings through
      const th = .62 * Math.sin(ph), flex = .2 + 1.25 * Math.max(0, Math.cos(ph)) ** 2;
      const knee = at(hip, th, .25 * S), foot = at(knee, th - flex, .26 * S);
      const hem = [hip[0] + (knee[0] - hip[0]) * .6, hip[1] + (knee[1] - hip[1]) * .6];
      seg(F, hip, hem, .13 * S, shorts, a * k);
      seg(F, hem, knee, .075 * S, skin, a * k * .8);
      seg(F, knee, foot, .065 * S, skin, a * k * .8);
      seg(F, foot, [foot[0] + .07 * S, foot[1] + .01 * S], .05 * S, [220, 225, 235], a * k * .7);
      // arms swing against the leg on the same side, elbows bent
      const ua = -.8 * Math.sin(ph), elbow = at(sh, ua, .16 * S), hand = at(elbow, ua + 1.5, .14 * S);
      seg(F, sh, elbow, .085 * S, hoodie, a * k);
      seg(F, elbow, hand, .075 * S, hoodie, a * k);
      F.dot(hand[0], hand[1], .03 * S, skin, a * k * .8);
    }
    seg(F, hip, sh, .19 * S, hoodie, a);
    seg(F, [sh[0] - .05 * S, sh[1] + .01 * S], [head[0] - .06 * S, head[1] - .02 * S], .1 * S, hoodie, a * .9); // hood
    F.dot(head[0], head[1], .065 * S, skin, a * .85);
  }

  // A dog at a gallop facing right, feet on y = g, D tall at the shoulder.
  function dog(F, x, g, D, φ, fur, a) {
    const bob = .06 * D * Math.sin(2 * φ);
    const rear = [x - .55 * D, g - .95 * D + bob + .05 * D * Math.sin(φ + 1.4)], front = [x + .45 * D, g - D + bob + .05 * D * Math.sin(φ)];
    const head = [front[0] + .38 * D, front[1] - .32 * D + .04 * D * Math.sin(2 * φ + 1)];
    // front pair and hind pair are out of phase; each pair is staggered a little (rotary gallop)
    for (const [hip, off, fore] of [[front, 0, true], [rear, 2.7, false]]) for (const s of [0, 1]) {
      const ph = φ + off + s * .55, k = s ? .55 : 1, up = .75 * Math.sin(ph), top = [hip[0], hip[1] + .12 * D];
      const knee = at(top, up, .44 * D), paw = at(knee, up + .7 * Math.max(0, Math.cos(ph)) * (fore ? -1 : 1), .44 * D);
      seg(F, top, knee, .13 * D, fur, a * k);
      seg(F, knee, paw, .1 * D, fur, a * k);
    }
    seg(F, rear, front, .42 * D, fur, a);
    F.dot(front[0], front[1] + .05 * D, .25 * D, fur, a * .7);
    seg(F, front, head, .24 * D, fur, a);
    F.dot(head[0], head[1], .17 * D, fur, a);
    seg(F, head, [head[0] + .26 * D, head[1] + .07 * D], .12 * D, fur, a);                          // muzzle
    seg(F, [head[0] - .04 * D, head[1] - .1 * D], [head[0] - .16 * D, head[1] - .22 * D], .08 * D, fur, a * .9); // ear
    seg(F, rear, at(rear, Math.PI + .75 + .3 * Math.sin(1.5 * φ), .45 * D), .08 * D, fur, a * .9);    // tail, wagging
  }

  // Two people in hoodies and shorts and their two dogs. off: place in the group (runner
  // heights); dy: depth (negative is farther up the beach, toward the water); sc: size.
  const RUNNERS = [
    { off: 0, dy: 0, sc: 1, hoodie: 'c1', shorts: 'c2', ph: 0 },
    { off: -1.15, dy: -.018, sc: .93, hoodie: 'c4', shorts: 'c1', ph: 2.1 },
    { dog: true, off: 1.3, dy: -.008, sc: 1, fur: [214, 168, 96], ph: .7 },
    { dog: true, off: 2.55, dy: .008, sc: .9, fur: [150, 118, 196], ph: 3.3 },
  ];

  // A bonfire on a beach at night. Two people and two dogs run along the wet sand,
  // left to right, on a loop. Sparks lift off the fire and the firelight warms whoever
  // passes it; the tide washes in and out and the moon lays a path on the water.
  class Bonfire {
    init(W, H) {
      this.stars = Array.from({ length: Math.round(Math.min(160, Math.max(40, W * H / 12000))) }, () => ({ u: Math.random(), v: Math.random() ** 1.4, m: rnd(.5, 1.2), ph: rnd(0, 6.28), f: rnd(.5, 1.5) }));
      this.sparks = []; this.spawn = 0;
    }
    layout(W, H) {
      const land = W > H;
      return {
        hy: H * .4, sy: H * .565, gy: H * .75,                     // horizon, waterline, where the runners' feet land
        S: Math.min(190, Math.max(70, Math.min(H * .17, W * .26))),   // a runner's height, smaller on narrow screens
        fx: W * (land ? .26 : .5), fy: H * (land ? .88 : .9), fs: Math.min(110, Math.max(38, Math.min(W, H) * .09)),
        mx: W * (land ? .76 : .72), my: H * .13, mr: Math.max(10, Math.min(W, H) * .04),
      };
    }
    step(dt, t, W, H) {
      const L = this.L = this.layout(W, H);
      this.spawn -= dt;
      while (this.spawn <= 0) {
        this.spawn += .045;
        this.sparks.push({ x: L.fx + rnd(-.3, .3) * L.fs, y: L.fy - L.fs * rnd(.3, .9), vx: rnd(-12, 12), vy: -rnd(40, 95), life: 0, max: rnd(1.4, 3.2), ph: rnd(0, 6.28) });
      }
      for (const s of this.sparks) { s.life += dt; s.x += (s.vx + Math.sin(t * 2.3 + s.ph) * 14) * dt; s.y += s.vy * dt; s.vy *= 1 - .25 * dt; }
      this.sparks = this.sparks.filter(s => s.life < s.max);
    }
    atmosphere(F, p, t, W, H) {
      const { hy, sy } = this.L || this.layout(W, H), sea = mix(p.c1, p.c2, .4), sand = mix(p.c2, p.c4, .55);
      wash(F, y => y < hy ? [mix(p.c2, p.c1, y / hy), .035 + .03 * y / hy]
        : y < sy ? [sea, .06]
        : [sand, .04 + .025 * (y - sy) / (H - sy)]);
    }
    draw(F, W, H, p, t, cell) {
      const { hy, sy, gy, S, fx, fy, fs, mx, my, mr } = this.L || this.layout(W, H);
      const flick = .82 + .18 * Math.sin(t * 9.1) * Math.sin(t * 5.3 + 1.7);
      const FIRE = p.c3, EMBER = p.c4, moon = mix(p.c1, [235, 240, 255], .55), foam = mix(p.c1, [235, 245, 255], .35);

      // sky and moon
      for (const s of this.stars) F.glow(s.u * W, s.v * hy * .95, cell * 1.3 * s.m, mix(p.c1, [255, 255, 255], .4), .35 + .3 * Math.sin(t * s.f + s.ph));
      F.glow(mx, my, mr * 4, moon, .12);
      F.dot(mx, my, mr, moon, .75);

      // sea: dashed swell lines that close up toward the horizon and drift shoreward
      for (let j = 0; j < 9; j++) {
        const v = (j + (t * .06) % 1) / 9, y = hy + (sy - hy) * v * v, c = mix(p.c2, p.c1, v);
        for (let x = 0; x < W; x += 26) {
          const m = Math.sin(x * .013 * (1.6 - v) + j * 1.7 + t * .35);
          if (m > .35) F.line(x, y, x + 22, y, cell * .7, c, (.12 + .2 * v) * (m - .35) / .65);
        }
      }
      // moon path on the water
      for (let k = 0; k < 26; k++) {
        const u = k / 25, y = hy + (sy - hy) * u * u, hw = (4 + 46 * u) * Math.min(1.4, W / 1200), x = mx + Math.sin(t * 1.4 + k * 2.1) * 6 * u;
        F.line(x - hw, y, x + hw, y, cell * .8, moon, (.2 + .3 * (.5 + .5 * Math.sin(t * 2.2 + k * 1.9))) * (1 - .4 * u));
      }
      // the waterline: tide in and out, foam that sparkles, a thin sheet running up the sand
      const tide = H * .012 * Math.sin(t * .33), shore = x => sy + tide + H * .006 * Math.sin(x * .011 + t * .5) + H * .004 * Math.sin(x * .027 - t * .8);
      let px = 0, py = shore(0);
      for (let x = 12; x <= W + 12; x += 12) {
        const y = shore(x);
        F.line(px, py, x, y, cell * 1.1, foam, .28 + .2 * (.5 + .5 * Math.sin(x * .045 - t * 1.6)));
        F.line(px, py + H * .014, x, y + H * .014, cell * .7, foam, .07 + .05 * Math.sin(t * .33 + 1));
        px = x; py = y;
      }

      // the fire: light pool on the sand, logs, embers, flame tongues, hot core, sparks, smoke
      F.glow(fx, fy - fs * .2, fs * 5, mix(FIRE, EMBER, .3), .16 * flick);
      const log = mix(EMBER, p.c2, .5);
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
      F.glow(fx, fy - fs * .25, fs * .55, mix(FIRE, [255, 236, 190], .5), .85 * flick);
      for (const s of this.sparks) { const a = 1 - s.life / s.max; F.glow(s.x, s.y, cell * 1.2, mix(FIRE, EMBER, 1 - a), .9 * a); }
      for (let k = 0; k < 5; k++) {
        const u = (t * .05 + k / 5) % 1;
        F.glow(fx + Math.sin(t * .3 + k) * fs * .5 * u, fy - fs * 1.4 - u * H * .35, fs * (.6 + 1.2 * u), p.c2, .05 * (1 - u));
      }

      // the runners, warmed by the firelight as they pass it
      const v = S * 1.45, span = W + S * 6, skin = mix(p.c3, p.c4, .45);
      for (const r of RUNNERS) {
        const drift = r.dog ? Math.sin(t * .6 + r.ph) * S * .35 : 0;   // the dogs range ahead and drop back
        const x = ((t * v + r.off * S + drift) % span + span) % span - S * 3;
        const warm = Math.exp(-(((x - fx) / (W * .22)) ** 2)) * flick, tint = c => mix(c, FIRE, .35 * warm);
        const g = gy + r.dy * H, sc = S * r.sc, a = .9 * (1 + .4 * warm) * (1 + 4 * r.dy);
        if (r.dog) dog(F, x, g, sc * .4, t * v / (sc * .4 * 2.3) * 6.283 + r.ph, tint(r.fur), a);
        else person(F, x, g, sc, t * v / (sc * 1.3) * 6.283 + r.ph, tint(p[r.hoodie]), tint(p[r.shorts]), tint(skin), a);
      }
    }
  }

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

  const SCENES = { constellation: Constellation, mycelium: Mycelium, helix: Helix, bonfire: Bonfire, 'vines-and-chains': VinesAndChains };

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
      // a scene may light its own backdrop (sky, sea, sand); the rest share the ocean wash
      if (this.scene.atmosphere) this.scene.atmosphere(F, pal, this.t, W, H); else this.atmosphere(F, pal, this.t);
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
