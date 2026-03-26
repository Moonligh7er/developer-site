/* ============================================
   MAIN — Navigation, Tabs, Interactions
   ============================================ */

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

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.target;

        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

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

  // Handle hash on load
  const hash = window.location.hash.slice(1);
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
  el.textContent = '';
  el.style.visibility = 'visible';
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

// --- Random dimensional coordinates (decorative) ---
function initCoordinates() {
  document.querySelectorAll('.coord-display').forEach(el => {
    function updateCoord() {
      const dims = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ'];
      const dim = dims[Math.floor(Math.random() * dims.length)];
      const x = (Math.random() * 999).toFixed(1);
      const y = (Math.random() * 999).toFixed(1);
      const z = (Math.random() * 99).toFixed(2);
      el.textContent = `${dim}:${x}.${y}.${z}`;
    }
    updateCoord();
    setInterval(updateCoord, 8000 + Math.random() * 4000);
  });
}

// --- Decrypt Name Animation ---
function initDecryptName() {
  const els = document.querySelectorAll('.decrypt-name');
  if (!els.length) return;

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
