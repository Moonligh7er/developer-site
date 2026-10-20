/* ============================================
   MAIN — Navigation, Tabs, Interactions
   ============================================ */

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Mobile Navigation ---
function initNavigation() {
  const toggle = document.querySelector('.nav__toggle');
  const links = document.querySelector('.nav__links');

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('open');
      toggle.textContent = isOpen ? '[x]' : '[=]';
      toggle.setAttribute('aria-expanded', isOpen);
    });

    // Close on link click
    links.querySelectorAll('.nav__link').forEach(link => {
      link.addEventListener('click', () => {
        links.classList.remove('open');
        toggle.textContent = '[=]';
        toggle.setAttribute('aria-expanded', false);
      });
    });
  }

  // Set active nav link based on current page
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
}

// --- Tab System ---
function initTabs() {
  document.querySelectorAll('.tabs').forEach(tabContainer => {
    const tabs = tabContainer.querySelectorAll('.tab');
    const contentId = tabContainer.dataset.tabs;

    tabs.forEach((tab, i) => {
      // Arrow keys move between tabs (WAI-ARIA tabs pattern)
      tab.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = tabs[(i + step + tabs.length) % tabs.length];
        next.focus();
        next.click();
      });

      tab.addEventListener('click', () => {
        const target = tab.dataset.target;

        // Update active tab
        tabs.forEach(t => {
          t.classList.remove('active');
          if (t.hasAttribute('role')) {
            t.setAttribute('aria-selected', 'false');
            t.tabIndex = -1;
          }
        });
        tab.classList.add('active');
        if (tab.hasAttribute('role')) {
          tab.setAttribute('aria-selected', 'true');
          tab.tabIndex = 0;
        }

        // Update active content
        const parent = tabContainer.parentElement;
        parent.querySelectorAll('.tab-content').forEach(content => {
          content.classList.remove('active');
        });
        const targetContent = parent.querySelector(`#${target}`);
        if (targetContent) {
          targetContent.classList.add('active');
        }

        // Update URL hash without scrolling
        history.replaceState(null, '', `#${target}`);
      });
    });
  });

  // Handle hash on load (old Connect tabs were folded into new ones)
  const aliases = { social: 'contact', partner: 'support', invest: 'support' };
  const raw = window.location.hash.slice(1);
  const hash = aliases[raw] || raw;
  if (hash) {
    const targetTab = document.querySelector(`.tab[data-target="${hash}"]`);
    if (targetTab) targetTab.click();
  }
}

// --- Typing effect for hero subtitle ---
function initTypingEffect() {
  const el = document.querySelector('.typing-target');
  if (!el) return;

  const text = el.dataset.text;
  el.style.visibility = 'visible';
  if (REDUCED_MOTION) {
    el.textContent = text;
    return;
  }
  el.textContent = '';
  let i = 0;

  function type() {
    if (i < text.length) {
      el.textContent += text[i];
      i++;
      setTimeout(type, 40 + Math.random() * 30);
    }
  }

  // Delay start slightly
  setTimeout(type, 800);
}

// --- Smooth scroll for anchor links ---
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// --- Lunar readout ---
// The "coordinates" are real: the Moon's ecliptic longitude, phase and sign right now,
// computed here in the browser (truncated lunar theory, good to a few tenths of a degree).
const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

function moonNow(date = new Date()) {
  const rad = Math.PI / 180;
  const norm = deg => ((deg % 360) + 360) % 360;
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days since J2000.0

  const L = norm(218.316 + 13.176396 * d);   // Moon mean longitude
  const M = norm(134.963 + 13.064993 * d);   // Moon mean anomaly
  const D = norm(297.850 + 12.190749 * d);   // mean elongation
  const F = norm(93.272 + 13.229350 * d);    // argument of latitude
  const Ms = norm(357.529 + 0.98560028 * d); // Sun mean anomaly
  const s = x => Math.sin(x * rad);

  const lon = norm(L + 6.289 * s(M) + 1.274 * s(2 * D - M) + 0.658 * s(2 * D) - 0.186 * s(Ms)
    - 0.059 * s(2 * M - 2 * D) - 0.057 * s(M - 2 * D + Ms) + 0.053 * s(M + 2 * D)
    + 0.046 * s(2 * D - Ms) + 0.041 * s(M - Ms) - 0.035 * s(D) - 0.031 * s(M + Ms)
    - 0.015 * s(2 * F - 2 * D) + 0.011 * s(M - 4 * D));
  const sunLon = norm(280.460 + 0.9856474 * d + 1.915 * s(Ms) + 0.020 * s(2 * Ms));

  const elong = norm(lon - sunLon);
  const lit = (1 - Math.cos(elong * rad)) / 2;
  const waxing = elong < 180;
  let phase;
  if (lit < 0.02) phase = 'new';
  else if (lit > 0.98) phase = 'full';
  else if (Math.abs(lit - 0.5) < 0.06) phase = waxing ? 'first quarter' : 'last quarter';
  else phase = (waxing ? 'waxing ' : 'waning ') + (lit < 0.5 ? 'crescent' : 'gibbous');
  const ayanamsa = 23.853 + (d / 36525) * 1.397; // Lahiri, approx.
  return {
    lon, lit, phase,
    sign: SIGNS[Math.floor(lon / 30)],
    siderealSign: SIGNS[Math.floor(norm(lon - ayanamsa) / 30)],
  };
}

function initCoordinates() {
  document.querySelectorAll('.coord-display').forEach(el => {
    function update() {
      const m = moonNow();
      el.textContent = `☾ λ ${m.lon.toFixed(1).padStart(5, '0')}° · ${Math.round(m.lit * 100)}% lit · ${m.sign}`;
      el.title = `The Moon right now: ${m.phase}, ${Math.round(m.lit * 100)}% illuminated, ` +
        `ecliptic longitude ${m.lon.toFixed(1)}° (tropical ${m.sign}; sidereal ${m.siderealSign}). ` +
        'Computed in your browser.';
    }
    update();
    setInterval(update, 60000);
  });
}

// --- Decrypt Name Animation ---
function initDecryptName() {
  const els = document.querySelectorAll('.decrypt-name');
  if (!els.length || REDUCED_MOTION) return;

  els.forEach((el, elIdx) => {
    const names = JSON.parse(el.dataset.names);
    const binary = '01';
    let currentIndex = 0;

    function scrambleTo(target, callback) {
      const len = target.length;
      let resolved = 0;
      const chars = new Array(len).fill(null);
      const intervals = [];

      for (let i = 0; i < len; i++) {
        const delay = i * 40 + Math.random() * 60;
        const resolveTime = delay + 300 + Math.random() * 400;

        intervals[i] = setInterval(() => {
          chars[i] = binary[Math.floor(Math.random() * 2)];
          el.textContent = chars.map((c, j) => c !== null ? c : (j < target.length ? ' ' : '')).join('');
        }, 50);

        setTimeout(() => {
          clearInterval(intervals[i]);
          chars[i] = target[i];
          el.textContent = chars.join('');
          resolved++;
          if (resolved === len && callback) callback();
        }, resolveTime);
      }
    }

    function cycle() {
      const nextIndex = (currentIndex + 1) % names.length;
      scrambleTo(names[nextIndex], () => {
        currentIndex = nextIndex;
        setTimeout(cycle, 4000);
      });
    }

    // Stagger start for multiple elements
    setTimeout(cycle, 3000 + elIdx * 500);
  });
}

// --- Initialize everything ---
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initTabs();
  initTypingEffect();
  initSmoothScroll();
  initCoordinates();
  initDecryptName();
});
