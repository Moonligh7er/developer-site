// ============================================
// PERSISTENT MUSIC PLAYER
// Starts on ocean.html, persists across pages
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

  // Resolve paths relative to site root
  function resolvePath(file) {
    const base = location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1);
    return base + file;
  }

  function createPlayer() {
    const state = getState();
    const audio = new Audio();
    audio.volume = state.volume || 0.3;
    let currentTrack = state.track || 0;
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    // --- Build UI ---
    const el = document.createElement('div');
    el.id = 'msl-player';
    el.innerHTML = `
      <div class="msl-player__handle" title="Drag to move">
        <span class="msl-player__icon">&#9835;</span>
        <span class="msl-player__title"></span>
        <button class="msl-player__close" title="Close player">&times;</button>
      </div>
      <div class="msl-player__controls">
        <button class="msl-player__btn" data-action="prev" title="Previous">&#9664;&#9664;</button>
        <button class="msl-player__btn msl-player__play" data-action="play" title="Play">&#9654;</button>
        <button class="msl-player__btn" data-action="next" title="Next">&#9654;&#9654;</button>
        <input type="range" class="msl-player__volume" min="0" max="100" value="${Math.round(audio.volume * 100)}" title="Volume">
      </div>
      <div class="msl-player__progress">
        <div class="msl-player__progress-fill"></div>
      </div>
    `;

    // --- Styles ---
    const style = document.createElement('style');
    style.textContent = `
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
        font-size: 0.65rem;
        color: #e0e0e0;
        user-select: none;
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.3s, transform 0.3s;
      }
      #msl-player.visible {
        opacity: 1;
        transform: translateY(0);
      }
      .msl-player__handle {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        cursor: grab;
        border-bottom: 1px solid rgba(0,255,200,0.1);
      }
      .msl-player__handle:active { cursor: grabbing; }
      .msl-player__icon { color: #00ffc8; font-size: 0.8rem; }
      .msl-player__title {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #999;
        letter-spacing: 0.05em;
      }
      .msl-player__close {
        background: none; border: none; color: #555;
        font-size: 1rem; cursor: pointer; padding: 0 0.25rem;
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
        font-size: 0.6rem; cursor: pointer; padding: 0.25rem;
        letter-spacing: -0.1em;
      }
      .msl-player__btn:hover { color: #00ffc8; }
      .msl-player__play { font-size: 0.8rem; color: #00ffc8; }
      .msl-player__volume {
        flex: 1;
        height: 2px;
        -webkit-appearance: none;
        appearance: none;
        background: #1a1a2e;
        outline: none;
        cursor: pointer;
      }
      .msl-player__volume::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 10px; height: 10px;
        background: #00ffc8;
        border-radius: 50%;
        cursor: pointer;
      }
      .msl-player__volume::-moz-range-thumb {
        width: 10px; height: 10px;
        background: #00ffc8;
        border-radius: 50%;
        border: none;
        cursor: pointer;
      }
      .msl-player__progress {
        height: 2px;
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
    document.body.appendChild(el);

    // --- Elements ---
    const titleEl = el.querySelector('.msl-player__title');
    const playBtn = el.querySelector('.msl-player__play');
    const progressFill = el.querySelector('.msl-player__progress-fill');
    const volumeSlider = el.querySelector('.msl-player__volume');
    const handle = el.querySelector('.msl-player__handle');
    const closeBtn = el.querySelector('.msl-player__close');

    // --- Functions ---
    function loadTrack(index) {
      currentTrack = ((index % TRACKS.length) + TRACKS.length) % TRACKS.length;
      const track = TRACKS[currentTrack];
      audio.src = resolvePath(track.file);
      titleEl.textContent = track.title;
    }

    function play() {
      audio.play().then(() => {
        playBtn.innerHTML = '&#9646;&#9646;';
        saveState({ playing: true, track: currentTrack, volume: audio.volume, time: audio.currentTime });
      }).catch(() => {});
    }

    function pause() {
      audio.pause();
      playBtn.innerHTML = '&#9654;';
      saveState({ playing: false, track: currentTrack, volume: audio.volume, time: audio.currentTime });
    }

    function toggle() {
      audio.paused ? play() : pause();
    }

    // --- Events ---
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

    closeBtn.addEventListener('click', () => {
      pause();
      el.classList.remove('visible');
      saveState({ playing: false, track: currentTrack, volume: audio.volume, closed: true });
    });

    // Save position periodically
    setInterval(() => {
      if (!audio.paused) {
        saveState({ playing: true, track: currentTrack, volume: audio.volume, time: audio.currentTime });
      }
    }, 3000);

    // --- Dragging ---
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

    // --- Init ---
    function show(autoplay) {
      loadTrack(currentTrack);
      if (state.time && currentTrack === state.track) {
        audio.currentTime = state.time;
      }
      el.classList.add('visible');
      if (autoplay) {
        // Small delay for browsers that need user gesture context
        setTimeout(play, 100);
      }
    }

    return { show, play, pause, el, audio };
  }

  // --- Page Logic ---
  const state = getState();

  if (isOceanPage) {
    // Ocean page: show a subtle play button, create player on click
    const trigger = document.createElement('button');
    trigger.id = 'msl-play-trigger';
    trigger.innerHTML = '&#9835; Play Music';
    trigger.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 9999;
      background: rgba(7,7,13,0.8); border: 1px solid rgba(0,255,200,0.3);
      color: #00ffc8; font-family: 'JetBrains Mono', monospace; font-size: 0.65rem;
      letter-spacing: 0.1em; padding: 0.5rem 1rem; cursor: pointer;
      backdrop-filter: blur(8px); text-transform: uppercase;
      transition: border-color 0.2s;
    `;
    trigger.addEventListener('mouseenter', () => { trigger.style.borderColor = 'rgba(0,255,200,0.6)'; });
    trigger.addEventListener('mouseleave', () => { trigger.style.borderColor = 'rgba(0,255,200,0.3)'; });
    document.body.appendChild(trigger);

    trigger.addEventListener('click', () => {
      trigger.remove();
      const player = createPlayer();
      player.show(true);
    });

    // If music was already playing, skip the trigger and auto-resume
    if (state.playing && !state.closed) {
      trigger.remove();
      const player = createPlayer();
      player.show(true);
    }
  } else {
    // Other pages: auto-resume if music was playing
    if (state.playing && !state.closed) {
      const player = createPlayer();
      player.show(true);
    }
  }
})();
