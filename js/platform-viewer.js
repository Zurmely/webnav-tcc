/* ==========================================================================
   platform-viewer.js
   Self-contained React viewer for a single appendix platform.

   Requires (loaded before this file):
     React 18 (UMD), ReactDOM 18 (UMD),
     js/checklist-data.js  → window.CHECKLIST_TAXONOMY
     js/lightbox.js        → window.Lightbox (needs window.ImagePlaceholder first)

   Callers must set on window BEFORE loading this file:
     window.VIEWER_PLATFORM  — platform ID string, e.g. "betano"
     window.VIEWER_NAME      — human name, e.g. "Betano"
     window.VIEWER_BASE      — path prefix to site root, e.g. "../"
   ========================================================================== */
(function () {
  'use strict';

  var R  = React;
  var RD = ReactDOM;
  var h  = R.createElement;
  var Fragment = R.Fragment;
  var useState   = R.useState;
  var useEffect  = R.useEffect;
  var useRef     = R.useRef;

  var PLATFORM = window.VIEWER_PLATFORM || 'betano';
  var BASE     = window.VIEWER_BASE     || '../';

  /* ------------------------------------------------------------------
     ImagePlaceholder — also consumed by lightbox.js via window
     ------------------------------------------------------------------ */
  function ImagePlaceholder(props) {
    return h('div', { className: 'ph' + (props.big ? ' ph--big' : '') },
      h('div', { className: 'ph-stripes' }),
      h('div', { className: 'ph-meta' },
        h('span', { className: 'ph-mono' }, '[ imagem ]'),
        h('span', { className: 'ph-mono ph-dim' }, props.label || 'captura de tela')
      )
    );
  }
  window.ImagePlaceholder = ImagePlaceholder;

  /* ------------------------------------------------------------------
     ChecklistView
     ------------------------------------------------------------------ */
  function ChecklistView(props) {
    var cl  = props.checklist || {};
    var TAX = window.CHECKLIST_TAXONOMY || {};
    var brById  = TAX.brignullById  || {};
    var grById  = TAX.grayById      || {};
    var nById   = TAX.nielsenById   || {};
    var sevByVal = TAX.severityByValue || {};

    function chip(item) {
      if (!item) return null;
      return h('span', { key: item.id, className: 'dp-tag', title: item.pt + ' — ' + item.def }, item.en);
    }

    var tipos = (cl.tipos       || []).map(function (id) { return brById[id]; }).filter(Boolean);
    var grays = (cl.gray        || []).map(function (id) { return grById[id]; }).filter(Boolean);
    var heurs = (cl.heuristicas || []).filter(function (h) { return h && nById[h.id]; });

    return h(Fragment, null,
      h('div', { className: 'detail-rule' }),
      h('h4',  { className: 'detail-dp-label' }, 'Ficha de catalogação de padrão deceptivo'),
      h('div', { className: 'ficha-grid' },
        tipos.length
          ? h('div', { className: 'ficha-field' },
              h('div', { className: 'ficha-label' }, 'Tipo de padrão deceptivo'),
              h('div', { className: 'dp-tags' }, tipos.map(chip))
            )
          : null,

        grays.length
          ? h('div', { className: 'ficha-field' },
              h('div', { className: 'ficha-label' }, 'Categoria — Gray et al. (2018)'),
              h('div', { className: 'dp-tags' }, grays.map(chip))
            )
          : null,

        heurs.length
          ? h('div', { className: 'ficha-field' },
              h('div', { className: 'ficha-label' }, 'Heurísticas de Nielsen violadas'),
              h('ul', { className: 'heur-violations' },
                heurs.map(function (entry) {
                  var meta = nById[entry.id];
                  var sev  = (typeof entry.sev === 'number') ? sevByVal[entry.sev] : null;
                  return h('li', { key: entry.id, className: 'heur-violation' },
                    h('span', { className: 'hv-id', title: meta.def }, entry.id.toUpperCase()),
                    h('span', { className: 'hv-name' }, meta.pt),
                    sev
                      ? h('span', { className: 'hv-sev', title: sev.def },
                          h('span', { className: 'hv-sevbox' }, sev.value),
                          h('span', { className: 'hv-sevlabel' }, 'Gravidade ' + sev.value + ' · ' + sev.label)
                        )
                      : h('span', { className: 'hv-sev hv-sev--none' }, 'gravidade não avaliada')
                  );
                })
              )
            )
          : null,

        (cl.observacoes && String(cl.observacoes).trim())
          ? h('div', { className: 'ficha-field' },
              h('div', { className: 'ficha-label' }, 'Observações'),
              h('p',   { className: 'ficha-obs' }, cl.observacoes)
            )
          : null
      )
    );
  }
  window.ChecklistView = ChecklistView;

  function checklistHasContent(cl) {
    if (!cl) return false;
    return (cl.tipos && cl.tipos.length) ||
           (cl.gray  && cl.gray.length)  ||
           (cl.heuristicas && cl.heuristicas.length) ||
           (cl.observacoes && String(cl.observacoes).trim());
  }
  window.checklistHasContent = checklistHasContent;

  /* ------------------------------------------------------------------
     Data loading
     ------------------------------------------------------------------ */
  function loadPlatform(platformId) {
    return fetch(BASE + 'data/' + platformId + '/manifest.json')
      .then(function (r) { return r.json(); })
      .then(function (manifest) {
        return Promise.all(
          manifest.flows.map(function (flowId) {
            return fetch(BASE + 'data/' + platformId + '/' + flowId + '.json')
              .then(function (r) { return r.json(); })
              .then(function (flow) {
                flow.steps = (flow.steps || []).filter(function (s) { return !s.ignore; });
                return flow;
              });
          })
        ).then(function (flows) {
          var visible = flows.filter(function (f) { return f.steps && f.steps.length > 0; });
          return { id: manifest.id, name: manifest.name, flows: visible };
        });
      });
  }

  /* ------------------------------------------------------------------
     FlowCards — renders into secondary-nav portal
     ------------------------------------------------------------------ */
  function FlowCards(props) {
    var flows   = props.flows;
    var flowIdx = props.flowIdx;
    var onSelect = props.onSelect;

    return h(Fragment, null,
      flows.map(function (flow, idx) {
        return h('button', {
          key: idx,
          className: 'flow-card' + (idx === flowIdx ? ' is-active' : ''),
          onClick: function () { onSelect(idx); }
        },
          h('span', { className: 'flow-card__name' }, flow.name)
        );
      })
    );
  }

  /* ------------------------------------------------------------------
     Main Viewer App
     ------------------------------------------------------------------ */
  function ViewerApp() {
    var _state0 = useState(null);
    var platform  = _state0[0];
    var setPlatform = _state0[1];

    var _state1 = useState(0);
    var flowIdx = _state1[0];
    var setFlowIdx = _state1[1];

    var _state2 = useState(0);
    var stepIdx = _state2[0];
    var setStepIdx = _state2[1];

    var _state3 = useState(false);
    var lbOpen  = _state3[0];
    var setLbOpen = _state3[1];

    useEffect(function () {
      loadPlatform(PLATFORM).then(function (p) {
        setPlatform(p);
        // Deep-link: ?flow=<id> seleciona o fluxo correspondente ao abrir.
        try {
          var fid = new URLSearchParams(window.location.search).get('flow');
          if (fid) {
            var idx = p.flows.findIndex(function (f) { return f.id === fid; });
            if (idx >= 0) { setFlowIdx(idx); setStepIdx(0); }
          }
        } catch (e) { /* noop */ }
      });
    }, []);

    // Permite que outras partes da página (gaveta de dados) selecionem um fluxo.
    useEffect(function () {
      function onSelectFlow(e) {
        var fid = e.detail && e.detail.flowId;
        if (!fid || !platform) return;
        var idx = platform.flows.findIndex(function (f) { return f.id === fid; });
        if (idx >= 0) { setFlowIdx(idx); setStepIdx(0); }
      }
      document.addEventListener('viewer:select-flow', onSelectFlow);
      return function () { document.removeEventListener('viewer:select-flow', onSelectFlow); };
    }, [platform]);

    var flows = platform ? platform.flows : [];
    var flow  = flows[flowIdx] || null;
    var steps = flow ? flow.steps : [];
    var total = steps.length;
    var step  = total ? steps[Math.min(stepIdx, total - 1)] : null;

    function prev() { if (total) setStepIdx(function (i) { return (i - 1 + total) % total; }); }
    function next() { if (total) setStepIdx(function (i) { return (i + 1) % total; }); }

    function selectFlow(idx) {
      setFlowIdx(idx);
      setStepIdx(0);
    }

    /* Flow cards portal target */
    var flowCardsEl = document.getElementById('flowCards');

    /* Loading */
    if (!platform) {
      return h('div', { className: 'viewer-loading' },
        h('div', { style: { width: 32, height: 32, border: '3px solid #d9d9d9', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.8s linear infinite' } }),
        h('span', null, 'Carregando…'),
        h('style', null, '@keyframes spin { to { transform: rotate(360deg); } }')
      );
    }

    var imgSrc = (step && step.image) ? BASE + step.image : null;

    var flowCardsPortal = flowCardsEl
      ? RD.createPortal(
          h(FlowCards, { flows: flows, flowIdx: flowIdx, onSelect: selectFlow }),
          flowCardsEl
        )
      : null;

    var viewerContent = step ? h(Fragment, null,
      /* Image + Detail */
      h('div', { className: 'viewer-content' },
        h('div', {
          className: 'viewer-image-wrap',
          role: 'button',
          tabIndex: 0,
          onClick: function () { setLbOpen(true); },
          onKeyDown: function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setLbOpen(true);
            }
          },
          'aria-label': 'Abrir imagem em tela cheia'
        },
          imgSrc
            ? h('img', { className: 'frame-img', src: imgSrc, alt: step.title })
            : h(ImagePlaceholder, { label: flow ? flow.name : '' }),
          h('span', { className: 'zoom-hint' },
            h('span', { className: 'zoom-ico' }, '⤢'),
            'Clique para ampliar'
          )
        ),
        h('div', { className: 'viewer-detail' },
          h('h3', { className: 'detail-title' }, step.title),
          h('p',  { className: 'detail-desc'  }, step.description),
          checklistHasContent(step.checklist)
            ? h(ChecklistView, { checklist: step.checklist })
            : null
        )
      ),
      /* Footer */
      h('footer', { className: 'viewer-footer' },
        h('div', { className: 'steps' },
          h('span', { className: 'steps-label' }, 'Passos'),
          h('div',  { className: 'steps-list' },
            steps.map(function (s, i) {
              return h('button', {
                key: i,
                className: 'step-num' + (i === stepIdx ? ' is-active' : ''),
                onClick: function () { setStepIdx(i); }
              }, i + 1);
            })
          )
        ),
        h('div', { className: 'nav-arrows' },
          h('button', { className: 'arrow', onClick: prev, 'aria-label': 'Passo anterior' }, '‹'),
          h('span', { className: 'arrow-indicator' }, (stepIdx + 1) + '/' + total),
          h('button', { className: 'arrow', onClick: next, 'aria-label': 'Próximo passo'  }, '›')
        )
      )
    ) : h('div', { className: 'viewer-empty' },
      flows.length
        ? 'Selecione um fluxo acima para visualizar as capturas de tela.'
        : 'Nenhum fluxo disponível.'
    );

    return h(Fragment, null,
      flowCardsPortal,
      viewerContent,
      h(window.Lightbox, {
        open: lbOpen,
        step: step ? Object.assign({}, step, { image: imgSrc }) : null,
        appName: platform.name || PLATFORM,
        flowName: flow ? flow.name : '',
        index: stepIdx,
        total: total,
        onClose: function () { setLbOpen(false); },
        onPrev: prev,
        onNext: next
      })
    );
  }

  /* ------------------------------------------------------------------
     Mount
     ------------------------------------------------------------------ */
  var rootEl = document.getElementById('viewer-root');
  if (rootEl) {
    RD.createRoot(rootEl).render(h(ViewerApp));
  }
})();
