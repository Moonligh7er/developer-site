/* ============================================
   AD LAYER — switchable ad provider
   Active provider controlled by AD_PROVIDER below.
   Swap to 'adsense' once Google approves; no HTML
   changes required (containers stay the same).
   ============================================ */
(function () {
  'use strict';

  // ── SWITCH PROVIDER HERE ──────────────────────────────
  // 'adsterra' (live) | 'adsense' (pending approval) | 'none'
  const AD_PROVIDER = 'adsterra';
  // ──────────────────────────────────────────────────────

  const PROVIDERS = {
    adsterra: {
      // Single 728x90 unit reused across all slots for now.
      // Swap or extend per-slot keys here when separate units exist.
      key: '1d44657ebb97621a5cfe9e542eef3d8b',
      width: 728,
      height: 90,
      script: 'https://www.highperformanceformat.com/1d44657ebb97621a5cfe9e542eef3d8b/invoke.js'
    },
    adsense: {
      client: 'ca-pub-1548397763792213',
      slot: 'XXXXXXXXXX', // replace with real slot ID once approved
      libSrc: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1548397763792213'
    }
  };

  function renderAdsterra(container) {
    const cfg = PROVIDERS.adsterra;
    // Use srcdoc iframe so atOptions doesn't collide between multiple ads on a page
    // and so document.write inside invoke.js stays sandboxed.
    const iframe = document.createElement('iframe');
    iframe.width = cfg.width;
    iframe.height = cfg.height;
    iframe.scrolling = 'no';
    iframe.frameBorder = '0';
    iframe.style.cssText = 'border:0;display:block;margin:0 auto;max-width:100%';
    iframe.setAttribute('aria-label', 'Advertisement');
    iframe.srcdoc =
      '<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style></head><body>' +
      '<scr' + 'ipt>atOptions={key:"' + cfg.key + '",format:"iframe",height:' + cfg.height + ',width:' + cfg.width + ',params:{}};</scr' + 'ipt>' +
      '<scr' + 'ipt src="' + cfg.script + '"></scr' + 'ipt>' +
      '</body></html>';
    container.appendChild(iframe);
  }

  let adsenseLibLoaded = false;
  function ensureAdsenseLib() {
    if (adsenseLibLoaded) return;
    adsenseLibLoaded = true;
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = PROVIDERS.adsense.libSrc;
    document.head.appendChild(s);
  }

  function renderAdsense(container) {
    const cfg = PROVIDERS.adsense;
    ensureAdsenseLib();
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', cfg.client);
    ins.setAttribute('data-ad-slot', cfg.slot);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    container.appendChild(ins);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) { /* noop */ }
  }

  function renderAd(container) {
    if (!container || container.dataset.adRendered === '1') return;
    container.dataset.adRendered = '1';
    if (AD_PROVIDER === 'adsterra') renderAdsterra(container);
    else if (AD_PROVIDER === 'adsense') renderAdsense(container);
    // 'none' → leave empty
  }

  function init() {
    document.querySelectorAll('.ad-container[data-ad-slot]').forEach(renderAd);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MoonlitAds = { renderAd, provider: AD_PROVIDER };
})();
