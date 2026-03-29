// ============================================
// PERSISTENT MUSIC PLAYER
// Navbar toggle, draggable panel, cross-page
// ============================================

(function () {
  const TRACKS = [
    { title: 'Three Moons on the Shore', file: 'music/Three_Moons_on_the_Shore_2026-03-25T065841.mp3' },
    { title: 'Within Arms Reach', file: 'music/Within_Arms_Reach_2026-03-25T070230.mp3' },
    { title: 'C Minor Forever', file: 'music/C_Minor_Forever_2026-03-25T065518.mp3' },
    { title: 'Neon Rain Ascendant', file: 'music/Neon_Rain_Ascendant_2026-03-25T192536.mp3' },
    { title: 'Interdimensional Beach Party', file: 'music/Interdimensional_Beach_Party_2026-03-25T065641.mp3' }
  ];

  const STORAGE_KEY = 'msl_player';
  const isOceanPage = location.pathname.includes('ocean.html');

  function getState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
  }

  function saveState(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  function resolvePath(file) {
    const base = location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1);
    return base + file;
  }

  // --- Inject styles once ---
  const style = document.createElement('style');
  style.textContent = `
    /* Navbar music toggle */
    .nav__music-toggle {
      background: none;
      border: none;
      color: #00ffc8;
      font-size: 1.1rem;
      cursor: pointer;
      padding: 0.25rem;
      line-height: 1;
      position: relative;
      transition: text-shadow 0.3s;
      text-shadow: 0 0 8px rgba(0,255,200,0.4);
    }
    .nav__music-toggle:hover {
      text-shadow: 0 0 16px rgba(0,255,200,0.8), 0 0 32px rgba(0,255,200,0.4);
    }
    .nav__music-toggle.playing {
      animation: music-glow 2s ease-in-out infinite;
    }
    @keyframes music-glow {
      0%, 100% { text-shadow: 0 0 8px rgba(0,255,200,0.4); }
      50% { text-shadow: 0 0 20px rgba(0,255,200,0.9), 0 0 40px rgba(168,85,247,0.4); }
    }

    /* Player panel */
    #msl-player {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      background: rgba(7,7,13,0.95);
      border: 1px solid rgba(0,255,200,0.2);
      backdrop-filter: blur(12px);
      padding: 0;
      min-width: 240px;
      max-width: 300px;
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      font-size: 12px;
      color: #e0e0e0;
      user-select: none;
      opacity: 0;
      transform: translateY(10px) scale(0.95);
      pointer-events: none;
      transition: opacity 0.3s, transform 0.3s;
    }
    #msl-player.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .msl-player__handle {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 0.75rem;
      cursor: grab;
      border-bottom: 1px solid rgba(0,255,200,0.1);
    }
    .msl-player__handle:active { cursor: grabbing; }
    .msl-player__icon { color: #00ffc8; font-size: 14px; }
    .msl-player__title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #999;
      letter-spacing: 0.05em;
      font-size: 12px;
    }
    .msl-player__close {
      background: none; border: none; color: #555;
      font-size: 16px; cursor: pointer; padding: 0 0.25rem;
      line-height: 1;
    }
    .msl-player__close:hover { color: #f43f5e; }
    .msl-player__controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
    }
    .msl-player__btn {
      background: none; border: none; color: #666;
      font-size: 12px; cursor: pointer; padding: 0.25rem;
      letter-spacing: -0.1em;
    }
    .msl-player__btn:hover { color: #00ffc8; }
    .msl-player__play { font-size: 14px; color: #00ffc8; }
    .msl-player__volume {
      flex: 1;
      height: 3px;
      -webkit-appearance: none;
      appearance: none;
      background: #1a1a2e;
      outline: none;
      cursor: pointer;
    }
    .msl-player__volume::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 12px; height: 12px;
      background: #00ffc8;
      border-radius: 50%;
      cursor: pointer;
    }
    .msl-player__volume::-moz-range-thumb {
      width: 12px; height: 12px;
      background: #00ffc8;
      border-radius: 50%;
      border: none;
      cursor: pointer;
    }
    .msl-player__progress {
      height: 3px;
      background: #1a1a2e;
    }
    .msl-player__progress-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #00ffc8, #a855f7);
      transition: width 0.3s linear;
    }
  `;
  document.head.appendChild(style);

  // --- Create the player panel (hidden by default) ---
  let player = null;
  let navToggle = null;

  function createPlayer() {
    const state = getState();
    const audio = new Audio();
    audio.volume = state.volume || 0.3;
    let currentTrack = state.track || 0;
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    const el = document.createElement('div');
    el.id = 'msl-player';
    el.innerHTML = `
      <div class="msl-player__handle" title="Drag to move">
        <span class="msl-player__icon">\u266B</span>
        <span class="msl-player__title"></span>
        <button class="msl-player__close" title="Collapse">\u2212</button>
      </div>
      <div class="msl-player__controls">
        <button class="msl-player__btn" data-action="prev" title="Previous">\u25C0\u25C0</button>
        <button class="msl-player__btn msl-player__play" data-action="play" title="Play">\u25B6</button>
        <button class="msl-player__btn" data-action="next" title="Next">\u25B6\u25B6</button>
        <input type="range" class="msl-player__volume" min="0" max="100" value="${Math.round(audio.volume * 100)}" title="Volume">
      </div>
      <div class="msl-player__progress">
        <div class="msl-player__progress-fill"></div>
      </div>
    `;
    document.body.appendChild(el);

    const titleEl = el.querySelector('.msl-player__title');
    const playBtn = el.querySelector('.msl-player__play');
    const progressFill = el.querySelector('.msl-player__progress-fill');
    const volumeSlider = el.querySelector('.msl-player__volume');
    const handle = el.querySelector('.msl-player__handle');
    const closeBtn = el.querySelector('.msl-player__close');

    function loadTrack(index) {
      currentTrack = ((index % TRACKS.length) + TRACKS.length) % TRACKS.length;
      const track = TRACKS[currentTrack];
      audio.src = resolvePath(track.file);
      titleEl.textContent = track.title;
    }

    function play() {
      audio.play().then(() => {
        playBtn.textContent = '\u23F8';
        if (navToggle) navToggle.classList.add('playing');
        saveState({ playing: true, track: currentTrack, volume: audio.volume, time: audio.currentTime });
      }).catch(() => {});
    }

    function pause() {
      audio.pause();
      playBtn.textContent = '\u25B6';
      if (navToggle) navToggle.classList.remove('playing');
      saveState({ playing: false, track: currentTrack, volume: audio.volume, time: audio.currentTime });
    }

    function toggle() {
      audio.paused ? play() : pause();
    }

    function show() {
      el.classList.add('visible');
    }

    function hide() {
      el.classList.remove('visible');
    }

    function isVisible() {
      return el.classList.contains('visible');
    }

    // Controls
    el.querySelector('[data-action="play"]').addEventListener('click', toggle);
    el.querySelector('[data-action="prev"]').addEventListener('click', () => { loadTrack(currentTrack - 1); play(); });
    el.querySelector('[data-action="next"]').addEventListener('click', () => { loadTrack(currentTrack + 1); play(); });

    volumeSlider.addEventListener('input', () => {
      audio.volume = volumeSlider.value / 100;
      saveState({ playing: !audio.paused, track: currentTrack, volume: audio.volume, time: audio.currentTime });
    });

    audio.addEventListener('timeupdate', () => {
      if (audio.duration) {
        progressFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
      }
    });

    audio.addEventListener('ended', () => {
      loadTrack(currentTrack + 1);
      play();
    });

    // Close button collapses panel (doesn't stop music)
    closeBtn.addEventListener('click', () => {
      hide();
    });

    // Save position periodically
    setInterval(() => {
      if (!audio.paused) {
        saveState({ playing: true, track: currentTrack, volume: audio.volume, time: audio.currentTime });
      }
    }, 3000);

    // Dragging
    handle.addEventListener('mousedown', startDrag);
    handle.addEventListener('touchstart', startDrag, { passive: false });

    function startDrag(e) {
      if (e.target === closeBtn) return;
      isDragging = true;
      const rect = el.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      dragOffset.x = clientX - rect.left;
      dragOffset.y = clientY - rect.top;
      el.style.transition = 'none';
      e.preventDefault();
    }

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });

    function onDrag(e) {
      if (!isDragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const x = clientX - dragOffset.x;
      const y = clientY - dragOffset.y;
      el.style.left = Math.max(0, Math.min(x, window.innerWidth - el.offsetWidth)) + 'px';
      el.style.top = Math.max(0, Math.min(y, window.innerHeight - el.offsetHeight)) + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      e.preventDefault();
    }

    document.addEventListener('mouseup', () => { isDragging = false; el.style.transition = ''; });
    document.addEventListener('touchend', () => { isDragging = false; el.style.transition = ''; });

    // Init track
    loadTrack(currentTrack);
    if (state.time && currentTrack === state.track) {
      audio.currentTime = state.time;
    }

    return { show, hide, isVisible, play, pause, toggle, audio };
  }

  // --- Navbar toggle button ---
  function createNavToggle() {
    const nav = document.querySelector('.nav__links');
    if (!nav) return null;

    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'nav__music-toggle';
    btn.innerHTML = '\u266B';
    btn.title = 'Toggle music player';
    btn.setAttribute('aria-label', 'Toggle music player');
    li.appendChild(btn);
    nav.appendChild(li);

    const state = getState();
    if (state.playing && !state.closed) {
      btn.classList.add('playing');
    }

    btn.addEventListener('click', () => {
      if (!player) {
        player = createPlayer();
        player.show();
        // First click on non-ocean page: start playing
        if (!getState().playing) {
          player.play();
        } else {
          player.play(); // Resume
        }
      } else if (player.isVisible()) {
        player.hide();
      } else {
        player.show();
      }
    });

    return btn;
  }

  // --- Init ---
  navToggle = createNavToggle();
  const state = getState();

  // Auto-resume if music was playing
  if (state.playing && !state.closed) {
    player = createPlayer();
    player.show();
    player.play();
    if (navToggle) navToggle.classList.add('playing');
  }

  // Ocean page: also show trigger button for first-time visitors
  if (isOceanPage && !state.playing) {
    const trigger = document.createElement('button');
    trigger.id = 'msl-play-trigger';
    trigger.innerHTML = '\u266B Play Music';
    trigger.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 9999;
      background: rgba(7,7,13,0.8); border: 1px solid rgba(0,255,200,0.3);
      color: #00ffc8; font-family: 'JetBrains Mono', monospace; font-size: 12px;
      letter-spacing: 0.1em; padding: 0.5rem 1rem; cursor: pointer;
      backdrop-filter: blur(8px); text-transform: uppercase;
      transition: border-color 0.2s;
    `;
    trigger.addEventListener('mouseenter', () => { trigger.style.borderColor = 'rgba(0,255,200,0.6)'; });
    trigger.addEventListener('mouseleave', () => { trigger.style.borderColor = 'rgba(0,255,200,0.3)'; });
    document.body.appendChild(trigger);

    trigger.addEventListener('click', () => {
      trigger.remove();
      if (!player) {
        player = createPlayer();
      }
      player.show();
      player.play();
    });
  }
})();
