/* ==========================================================================
   shared-nav.js — compact nav + secondary nav scroll behaviour for all pages
   ========================================================================== */

/* ---- Dark mode toggle ---- */
(function () {
  var btn = document.getElementById('darkToggle');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
  });
})();

(function () {
  'use strict';

  /* ---- Secondary nav compact state on scroll ---- */
  var secondaryNav = document.querySelector('.secondary-nav');

  function setSecondaryCompact(scrollTop) {
    if (secondaryNav) secondaryNav.classList.toggle('is-compact', scrollTop > 40);
  }

  /* Window scroll (betano / bet365 / superbet / dados pages) */
  window.addEventListener('scroll', function () {
    setSecondaryCompact(window.scrollY);
  }, { passive: true });

  /* Inner scroll area (trabalho page) */
  var scrollArea = document.getElementById('scrollArea');
  if (scrollArea) {
    scrollArea.addEventListener('scroll', function () {
      setSecondaryCompact(scrollArea.scrollTop);
    }, { passive: true });
  }
})();
