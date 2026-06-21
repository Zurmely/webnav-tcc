/* ==========================================================================
   shared-nav.js — compact nav scroll detection for all pages
   ========================================================================== */
(function () {
  'use strict';

  var heroNav    = document.getElementById('heroNav');
  var compactNav = document.getElementById('compactNav');

  if (!heroNav || !compactNav) return;

  function setScrolled(yes) {
    document.body.classList.toggle('nav-scrolled', yes);
    compactNav.classList.toggle('is-visible', yes);
    compactNav.setAttribute('aria-hidden', yes ? 'false' : 'true');
  }

  /* IntersectionObserver: when the hero header exits the viewport */
  var observer = new IntersectionObserver(
    function (entries) { setScrolled(!entries[0].isIntersecting); },
    { threshold: 0, rootMargin: '0px 0px 0px 0px' }
  );

  observer.observe(heroNav);
})();
