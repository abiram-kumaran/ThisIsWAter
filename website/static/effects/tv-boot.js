/**
 * TV turn-on boot effect — runs once per session
 */
(function () {
  function runTvBoot() {
    const overlay = document.createElement('div');
    overlay.className = 'tv-boot';
    overlay.innerHTML =
      '<div class="tv-boot-noise"></div>' +
      '<div class="tv-boot-line"></div>' +
      '<div class="tv-boot-flash"></div>' +
      '<div class="tv-boot-scanlines"></div>';

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    setTimeout(function () {
      overlay.classList.add('tv-boot-done');
      document.body.style.overflow = '';
    }, 1200);

    setTimeout(function () {
      overlay.remove();
    }, 1800);
  }

  // Only run the TV boot effect if it hasn't been shown in the current session
  if (!sessionStorage.getItem('tvBootShown')) {
    sessionStorage.setItem('tvBootShown', 'true');
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runTvBoot);
    } else {
      runTvBoot();
    }
  }
})();
