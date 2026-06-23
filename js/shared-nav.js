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

/* ==========================================================================
   Secondary-nav scroll rail — caps the chapter/flow row to the leftover
   width, flanks it with side arrows, and shows a small dismissible balloon
   so first-time readers notice there is more to scroll.
   Desktop-only affordances; on mobile the rail just scrolls as before.
   ========================================================================== */
(function () {
  'use strict';

  var nav = document.getElementById('secondaryNav');
  if (!nav) return;

  /* Only the chapter row (Trabalho) and the flow row (apêndices) get a rail. */
  var holder = document.getElementById('chapterTabs') || document.getElementById('flowCards');
  if (!holder) return;

  /* Wrap the scrollable holder in a real scroll box flanked by arrows. */
  var rail = document.createElement('div');
  rail.className = 'sec-rail';
  nav.insertBefore(rail, holder);
  rail.appendChild(holder);

  function makeArrow(dir) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sec-arrow sec-arrow--' + dir;
    btn.setAttribute('aria-label', dir === 'left' ? 'Rolar para a esquerda' : 'Rolar para a direita');
    var pts = dir === 'left' ? '15 5 8 12 15 19' : '9 5 16 12 9 19';
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" ' +
      'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="' + pts + '"/></svg>';
    return btn;
  }

  var leftArrow = makeArrow('left');
  var rightArrow = makeArrow('right');
  nav.insertBefore(leftArrow, rail);
  if (rail.nextSibling) nav.insertBefore(rightArrow, rail.nextSibling);
  else nav.appendChild(rightArrow);

  /* Small balloon under the right arrow. */
  var tip = document.createElement('div');
  tip.className = 'sec-more-tip';
  tip.innerHTML =
    '<span class="sec-more-tip__txt">Role para ver mais &rarr;</span>' +
    '<button type="button" class="sec-more-tip__close" aria-label="Fechar dica">&#10005;</button>';
  nav.appendChild(tip);

  var TIP_KEY = 'secnav-more-tip-dismissed';
  var tipDismissed = false;
  try { tipDismissed = localStorage.getItem(TIP_KEY) === '1'; } catch (e) { /* noop */ }

  function dismissTip() {
    tipDismissed = true;
    nav.classList.remove('sec-tip-on');
    try { localStorage.setItem(TIP_KEY, '1'); } catch (e) { /* noop */ }
  }

  function isDesktop() { return window.innerWidth > 960; }

  function refresh() {
    var overflow = rail.scrollWidth - rail.clientWidth > 1;
    var desktop = isDesktop();
    nav.classList.toggle('sec-has-overflow', overflow && desktop);

    var atStart = rail.scrollLeft <= 1;
    var atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1;
    leftArrow.disabled = atStart;
    rightArrow.disabled = atEnd;

    nav.classList.toggle('sec-tip-on', overflow && desktop && !atEnd && !tipDismissed);
  }

  var rafId = 0;
  function scheduleRefresh() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () { rafId = 0; refresh(); });
  }

  function step(sign) {
    rail.scrollBy({ left: sign * Math.max(rail.clientWidth * 0.72, 140), behavior: 'smooth' });
  }

  leftArrow.addEventListener('click', function () { step(-1); });
  rightArrow.addEventListener('click', function () { dismissTip(); step(1); });
  tip.querySelector('.sec-more-tip__close').addEventListener('click', dismissTip);

  rail.addEventListener('scroll', scheduleRefresh, { passive: true });
  window.addEventListener('resize', scheduleRefresh, { passive: true });

  /* Tabs/cards are built asynchronously, and the apêndice view-toggle hides the
     flow row via inline display — recalc on both content and style changes. */
  if (window.MutationObserver) {
    new MutationObserver(scheduleRefresh).observe(rail, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style']
    });
  }

  refresh();
  setTimeout(refresh, 400);
  window.addEventListener('load', refresh);
})();
