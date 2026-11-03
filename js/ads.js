/* ============================================
   AD LAYER — no provider wired in
   The site runs ad-free. The .ad-container slots stay
   in the pages (empty slots collapse via CSS), so a
   provider could be added here later without HTML changes.
   ============================================ */
(function () {
  'use strict';

  const AD_PROVIDER = 'none';

  function renderAd(container) {
    if (!container || container.dataset.adRendered === '1') return;
    container.dataset.adRendered = '1';
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
