/* ==========================================================================
   platform-tabs.js
   Alterna, dentro de uma página de apêndice (Bet365 / Betano / Superbet),
   entre o "Mapeamento de fluxos" (visualizador React) e a visão de "Dados"
   (painel dashboard.js travado nesta plataforma).

   Requisitos no HTML:
     #viewToggle   — contêiner com <button data-view="mapping"> e data-view="data"
     #flowCards    — portal dos cartões de fluxo (visão de mapeamento)
     #dashFilterNav— controles do painel (visão de dados)
     #mappingView  — wrapper do visualizador
     #dataView     — wrapper do painel (com #app dentro)

   Expõe window.openFlowMapping(flowId) — usado pela gaveta do painel para levar
   o leitor ao mapeamento de um fluxo sem padrões catalogados.
   ========================================================================== */
(function () {
  'use strict';

  var toggle = document.getElementById('viewToggle');
  var flowCards = document.getElementById('flowCards');
  var dashNav = document.getElementById('dashFilterNav');
  var mappingView = document.getElementById('mappingView');
  var dataView = document.getElementById('dataView');
  if (!toggle || !mappingView || !dataView) return;

  var secNav = document.getElementById('secondaryNav');

  function measureSecondaryNav() {
    if (secNav) {
      document.documentElement.style.setProperty(
        '--secondary-h', secNav.offsetHeight + 'px'
      );
    }
  }

  function showView(view) {
    var isData = view === 'data';
    mappingView.style.display = isData ? 'none' : '';
    dataView.style.display = isData ? '' : 'none';
    if (flowCards) flowCards.style.display = isData ? 'none' : 'contents';
    if (dashNav) dashNav.style.display = isData ? '' : 'none';
    var btns = toggle.querySelectorAll('button[data-view]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-active', btns[i].getAttribute('data-view') === view);
    }
    // Toggle body-scroll lock for mapping view.
    document.documentElement.classList.toggle('mapping-active', !isData);
    // Measure secondary nav after layout settles.
    requestAnimationFrame(measureSecondaryNav);
    // Mantém o estado na URL para refresh/compartilhamento.
    try {
      var url = new URL(window.location.href);
      if (isData) url.searchParams.set('view', 'data'); else url.searchParams.delete('view');
      window.history.replaceState(null, '', url);
    } catch (e) { /* noop */ }
  }

  // Re-measure secondary nav height on resize.
  window.addEventListener('resize', measureSecondaryNav, { passive: true });

  toggle.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-view]');
    if (b) showView(b.getAttribute('data-view'));
  });

  // A gaveta de dados leva o leitor ao mapeamento do fluxo (estado vazio).
  window.openFlowMapping = function (flowId) {
    showView('mapping');
    if (flowId) {
      document.dispatchEvent(new CustomEvent('viewer:select-flow', { detail: { flowId: flowId } }));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  // O painel (dashboard.js) chama isto no estado vazio de fluxo.
  window.DASHBOARD_OPEN_MAPPING = window.openFlowMapping;

  // Estado inicial: ?flow= prioriza o mapeamento; ?view=data abre os dados.
  var params = new URLSearchParams(window.location.search);
  if (params.get('view') === 'data' && !params.get('flow')) showView('data');
  else showView('mapping');
})();
