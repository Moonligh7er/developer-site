/* ============================================
   ATMOSPHERIC EFFECTS
   Subtle dimensional/alien-tech ambience
   ============================================ */

// --- Digital Rain (extremely subtle, canvas-based) ---
class DigitalRain {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.columns = [];
    this.fontSize = 10;
    this.chars = '01アイウエオカキクケコ◇◆△▽○●□■♦♢∞∅∆∇⊕⊗'.split('');
    this.resize();
    this.init();

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    const colCount = Math.floor(this.canvas.width / this.fontSize);
    // Preserve existing columns, add new ones if needed
    while (this.columns.length < colCount) {
      this.columns.push(Math.random() * -100);
    }
    this.columns.length = colCount;
  }

  init() {
    this.draw();
  }

  draw() {
    // Very transparent fade — creates long trails
    this.ctx.fillStyle = 'rgba(7, 7, 13, 0.06)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.font = `${this.fontSize}px monospace`;

    for (let i = 0; i < this.columns.length; i++) {
      // Only render ~8% of columns at any time for subtlety
      if (Math.random() > 0.08) continue;

      const char = this.chars[Math.floor(Math.random() * this.chars.length)];
      const x = i * this.fontSize;
      const y = this.columns[i] * this.fontSize;

      // Alternate between teal and violet, very dim
      const color = Math.random() > 0.7
        ? 'rgba(0, 212, 170, 0.08)'
        : 'rgba(139, 92, 246, 0.05)';

      this.ctx.fillStyle = color;
      this.ctx.fillText(char, x, y);

      if (y > this.canvas.height && Math.random() > 0.98) {
        this.columns[i] = 0;
      }
      this.columns[i]++;
    }

    requestAnimationFrame(() => this.draw());
  }
}

// --- Scroll Reveal Observer ---
function initScrollReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );

  document.querySelectorAll('.reveal, .stagger').forEach(el => {
    observer.observe(el);
  });
}

// --- Glitch effect on hover for .glitch elements ---
function initGlitchEffects() {
  document.querySelectorAll('.glitch').forEach(el => {
    el.addEventListener('mouseenter', () => {
      el.style.animation = 'none';
      void el.offsetHeight; // force reflow
      el.style.animation = 'glitch-text 0.3s ease';
    });
  });
}

// --- Cursor glow (follows mouse, very subtle) ---
function initCursorGlow() {
  const glow = document.createElement('div');
  glow.style.cssText = `
    position: fixed;
    width: 300px;
    height: 300px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(0, 212, 170, 0.03) 0%, transparent 70%);
    pointer-events: none;
    z-index: -1;
    transform: translate(-50%, -50%);
    transition: opacity 0.3s ease;
  `;
  document.body.appendChild(glow);

  let mouseX = 0, mouseY = 0;
  let glowX = 0, glowY = 0;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  function animateGlow() {
    glowX += (mouseX - glowX) * 0.08;
    glowY += (mouseY - glowY) * 0.08;
    glow.style.left = glowX + 'px';
    glow.style.top = glowY + 'px';
    requestAnimationFrame(animateGlow);
  }
  animateGlow();
}

// --- Initialize all effects ---
function initEffects() {
  // Digital rain canvas (only on home page or always, very subtle)
  const rainCanvas = document.getElementById('rain-canvas');
  if (rainCanvas) {
    new DigitalRain(rainCanvas);
  }

  initScrollReveal();
  initGlitchEffects();
  initCursorGlow();
}

document.addEventListener('DOMContentLoaded', initEffects);
