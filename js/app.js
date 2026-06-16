/* global React, ReactDOM, APP_DATA, Lightbox, loadPlatformData */
(function () {
const { useState, useEffect, useRef } = React;

/* ---- Image placeholder (gray, striped, with monospace hint) ------------- */
function ImagePlaceholder(props) {
  const label = props.label || "captura de tela";
  return (
    React.createElement("div", { className: "ph" + (props.big ? " ph--big" : "") },
      React.createElement("div", { className: "ph-stripes" }),
      React.createElement("div", { className: "ph-meta" },
        React.createElement("span", { className: "ph-mono" }, "[ imagem ]"),
        React.createElement("span", { className: "ph-mono ph-dim" }, label)
      )
    )
  );
}
window.ImagePlaceholder = ImagePlaceholder;

/* ---- Ficha de catalogação de padrão deceptivo (inline) ------------------- */
function ChecklistView(props) {
  const cl = props.checklist || {};
  const TAX = window.CHECKLIST_TAXONOMY || {};
  const brById = TAX.brignullById || {};
  const grById = TAX.grayById || {};
  const nById = TAX.nielsenById || {};
  const sevByVal = TAX.severityByValue || {};

  function chip(item) {
    if (!item) return null;
    return React.createElement("span", {
      key: item.id, className: "dp-tag", title: item.pt + " — " + item.def
    }, item.en);
  }

  const tipos = (cl.tipos || []).map(id => brById[id]).filter(Boolean);
  const grays = (cl.gray || []).map(id => grById[id]).filter(Boolean);
  const heurs = (cl.heuristicas || []).filter(h => h && nById[h.id]);

  return (
    React.createElement(React.Fragment, null,
      React.createElement("div", { className: "detail-rule" }),
      React.createElement("h4", { className: "detail-dp-label" }, "Ficha de catalogação de padrão deceptivo"),
      React.createElement("div", { className: "ficha-grid" },

        tipos.length
          ? React.createElement("div", { className: "ficha-field" },
              React.createElement("div", { className: "ficha-label" }, "Tipo de padrão deceptivo"),
              React.createElement("div", { className: "dp-tags" }, tipos.map(chip))
            )
          : null,

        grays.length
          ? React.createElement("div", { className: "ficha-field" },
              React.createElement("div", { className: "ficha-label" }, "Categoria — Gray et al. (2018)"),
              React.createElement("div", { className: "dp-tags" }, grays.map(chip))
            )
          : null,

        heurs.length
          ? React.createElement("div", { className: "ficha-field" },
              React.createElement("div", { className: "ficha-label" }, "Heurísticas de Nielsen violadas"),
              React.createElement("ul", { className: "heur-violations" },
                heurs.map(h => {
                  const meta = nById[h.id];
                  const sev = (typeof h.sev === "number") ? sevByVal[h.sev] : null;
                  return React.createElement("li", { key: h.id, className: "heur-violation" },
                    React.createElement("span", { className: "hv-id", title: meta.def }, h.id.toUpperCase()),
                    React.createElement("span", { className: "hv-name" }, meta.pt),
                    sev
                      ? React.createElement("span", { className: "hv-sev", title: sev.def },
                          React.createElement("span", { className: "hv-sevbox" }, sev.value),
                          React.createElement("span", { className: "hv-sevlabel" }, "Gravidade " + sev.value + " · " + sev.label)
                        )
                      : React.createElement("span", { className: "hv-sev hv-sev--none" }, "gravidade não avaliada")
                  );
                })
              )
            )
          : null,

        (cl.observacoes && String(cl.observacoes).trim())
          ? React.createElement("div", { className: "ficha-field" },
              React.createElement("div", { className: "ficha-label" }, "Observações"),
              React.createElement("p", { className: "ficha-obs" }, cl.observacoes)
            )
          : null
      )
    )
  );
}
window.ChecklistView = ChecklistView;

/* ---- Loading screen ------------------------------------------------------ */
function LoadingScreen() {
  return (
    React.createElement("div", {
      style: {
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", width: "100%",
        fontFamily: '"Merriweather", serif', fontSize: "18px",
        color: "rgba(0,0,0,0.5)", flexDirection: "column", gap: "16px"
      }
    },
      React.createElement("div", {
        style: {
          width: "32px", height: "32px", border: "3px solid #d9d9d9",
          borderTop: "3px solid #000", borderRadius: "50%",
          animation: "spin 0.8s linear infinite"
        }
      }),
      React.createElement("span", null, "Carregando dados…"),
      React.createElement("style", null,
        "@keyframes spin { to { transform: rotate(360deg); } }"
      )
    )
  );
}

/* ---- Sidebar: tab system with optional subtabs --------------------------- */
function Sidebar(props) {
  const { data, activeTabId, activeAppId, onSelectTab, onSelectApp, open, onClose } = props;
  return (
    React.createElement(React.Fragment, null,
      React.createElement("div", {
        className: "scrim" + (open ? " is-open" : ""),
        onClick: onClose
      }),
      React.createElement("aside", { className: "sidebar" + (open ? " is-open" : "") },
        React.createElement("button", { className: "drawer-close", onClick: onClose, "aria-label": "Fechar menu" }, "✕"),

        React.createElement("nav", { className: "side-nav", "aria-label": "Navegação principal" },
          React.createElement("ul", { className: "tab-list" },
            data.nav.map(tab => {
              const isActive = tab.id === activeTabId;
              const hasSubtabs = tab.type === "viewer" && tab.apps && tab.apps.length > 0;
              return React.createElement("li", { key: tab.id, className: "tab" },
                React.createElement("button", {
                  className: "tab-item" + (isActive ? " is-active" : ""),
                  "aria-current": isActive ? "true" : undefined,
                  onClick: () => onSelectTab(tab)
                }, tab.label),
                (isActive && hasSubtabs)
                  ? React.createElement("ul", { className: "subtab-list" },
                      tab.apps.map(app =>
                        React.createElement("li", { key: app.id },
                          React.createElement("button", {
                            className: "subtab-item" + (app.id === activeAppId ? " is-active" : ""),
                            onClick: () => onSelectApp(app)
                          }, app.name)
                        )
                      )
                    )
                  : null
              );
            })
          )
        ),

        React.createElement("div", { className: "side-foot" },
          React.createElement("p", { className: "thesis-title" },
            React.createElement("strong", null, data.thesis.titleBold),
            data.thesis.titleRest
          ),
          React.createElement("div", { className: "foot-rule" }),
          React.createElement("dl", { className: "credits" },
            React.createElement("p", null, React.createElement("strong", null, "Aluno: "), data.thesis.aluno),
            React.createElement("p", null, React.createElement("strong", null, "Orientadora: "), data.thesis.orientadora)
          )
        )
      )
    )
  );
}

/* ---- Page view (type: "page") -------------------------------------------- */
function WorkPage(props) {
  const page = props.page;
  return (
    React.createElement("div", { className: "main-inner" },
      React.createElement("header", { className: "viewer-head" },
        React.createElement("h2", { className: "app-name" }, page.title)
      ),
      page.subtitle
        ? React.createElement("p", { className: "page-subtitle" }, page.subtitle)
        : null,
      React.createElement("div", { className: "head-rule" }),
      React.createElement("div", { className: "page-body" },
        (page.sections || []).map((s, i) =>
          React.createElement("section", { key: i, className: "page-section" },
            React.createElement("h3", { className: "page-section-head" }, s.heading),
            React.createElement("p", { className: "page-section-body" }, s.body)
          )
        )
      )
    )
  );
}

/* ---- Appendix viewer (type: "viewer") ------------------------------------ */
function ViewerPage(props) {
  const { app, flow, steps, stepIdx, onSelectFlow, onSetStep, onPrev, onNext, onOpenLightbox } = props;
  const step = steps[Math.min(stepIdx, steps.length - 1)] || steps[0];

  // Flow with no steps yet (e.g. just created in the editor): render header only.
  if (!step) {
    return (
      React.createElement("div", { className: "main-inner" },
        React.createElement("header", { className: "viewer-head" },
          React.createElement("h2", { className: "app-name" }, app.name),
          React.createElement("nav", { className: "flow-tabs" },
            app.flows.map((f, i) =>
              React.createElement(React.Fragment, { key: f.id },
                i > 0 ? React.createElement("span", { className: "flow-dot" }, "·") : null,
                React.createElement("button", {
                  className: "flow-tab" + (f.id === flow.id ? " is-active" : ""),
                  onClick: () => onSelectFlow(f)
                }, f.name)
              )
            )
          )
        ),
        React.createElement("div", { className: "head-rule" }),
        React.createElement("p", { className: "page-subtitle" }, "Este fluxo ainda não possui imagens.")
      )
    );
  }

  return (
    React.createElement("div", { className: "main-inner" },
      React.createElement("header", { className: "viewer-head" },
        React.createElement("h2", { className: "app-name" }, app.name),
        React.createElement("nav", { className: "flow-tabs" },
          app.flows.map((f, i) =>
            React.createElement(React.Fragment, { key: f.id },
              i > 0 ? React.createElement("span", { className: "flow-dot" }, "·") : null,
              React.createElement("button", {
                className: "flow-tab" + (f.id === flow.id ? " is-active" : ""),
                onClick: () => onSelectFlow(f)
              }, f.name)
            )
          )
        )
      ),
      React.createElement("div", { className: "head-rule" }),

      React.createElement("div", { className: "content" },
        React.createElement("button", {
          className: "image-frame",
          onClick: onOpenLightbox,
          "aria-label": "Abrir imagem em tela cheia"
        },
          step.image
            ? React.createElement("img", { className: "frame-img", src: step.image, alt: step.title })
            : React.createElement(ImagePlaceholder, { label: app.name + " · " + flow.name }),
          React.createElement("span", { className: "zoom-hint" },
            React.createElement("span", { className: "zoom-ico" }, "⤢"),
            "Clique para ampliar"
          )
        ),

        React.createElement("div", { className: "detail" },
          React.createElement("h3", { className: "detail-title" }, step.title),
          React.createElement("p", { className: "detail-desc" }, step.description),
          window.checklistHasContent(step.checklist)
            ? React.createElement(ChecklistView, { checklist: step.checklist })
            : null
        )
      ),

      React.createElement("footer", { className: "viewer-foot" },
        React.createElement("div", { className: "nav-arrows" },
          React.createElement("button", { className: "arrow", onClick: onPrev, "aria-label": "Passo anterior" }, "‹"),
          React.createElement("button", { className: "arrow", onClick: onNext, "aria-label": "Próximo passo" }, "›")
        ),
        React.createElement("div", { className: "steps" },
          React.createElement("span", { className: "steps-label" }, "Passos"),
          React.createElement("div", { className: "steps-list" },
            steps.map((s, i) =>
              React.createElement("button", {
                key: i,
                className: "step-num" + (i === stepIdx ? " is-active" : ""),
                onClick: () => onSetStep(i)
              }, i + 1)
            )
          )
        )
      )
    )
  );
}

/* ---- App ----------------------------------------------------------------- */
function App() {
  const [data, setData] = useState(APP_DATA);
  const [loaded, setLoaded] = useState(false);

  const firstViewer = data.nav.find(t => t.type === "viewer");
  const hasApps = firstViewer && firstViewer.apps && firstViewer.apps.length > 0;

  const [tabId, setTabId] = useState(data.defaultTab || data.nav[0].id);
  const [appId, setAppId] = useState(null);
  const [flowId, setFlowId] = useState(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  // Load platform data on mount
  useEffect(() => {
    loadPlatformData().then(updatedData => {
      setData({ ...updatedData });
      const viewer = updatedData.nav.find(t => t.type === "viewer");
      if (viewer && viewer.apps && viewer.apps.length > 0) {
        setAppId(viewer.apps[0].id);
        setFlowId(viewer.apps[0].flows[0].id);
      }
      setLoaded(true);
    });
  }, []);

  if (!loaded) return React.createElement(LoadingScreen);

  const tab = data.nav.find(t => t.id === tabId) || data.nav[0];
  const isViewer = tab.type === "viewer";

  const app = isViewer ? (tab.apps.find(a => a.id === appId) || tab.apps[0]) : null;
  const flow = app ? (app.flows.find(f => f.id === flowId) || app.flows[0]) : null;
  const steps = flow ? flow.steps : [];
  const total = steps.length;
  const step = total ? (steps[Math.min(stepIdx, total - 1)] || steps[0]) : null;

  function selectTab(t) {
    setTabId(t.id);
    setDrawer(false);
    setStepIdx(0);
    if (t.type === "viewer" && t.apps && t.apps.length) {
      setAppId(t.apps[0].id);
      setFlowId(t.apps[0].flows[0].id);
    }
  }
  function selectApp(a) {
    setAppId(a.id);
    setFlowId(a.flows[0].id);
    setStepIdx(0);
    setDrawer(false);
  }
  function selectFlow(f) { setFlowId(f.id); setStepIdx(0); }
  function prev() { if (total) setStepIdx(i => (i - 1 + total) % total); }
  function next() { if (total) setStepIdx(i => (i + 1) % total); }

  const topbarTitle = isViewer ? (app ? app.name : tab.label) : tab.label;

  return (
    React.createElement("div", { className: "layout" },
      React.createElement(Sidebar, {
        data: data,
        activeTabId: tabId,
        activeAppId: appId,
        onSelectTab: selectTab,
        onSelectApp: selectApp,
        open: drawer,
        onClose: () => setDrawer(false)
      }),

      React.createElement("main", { className: "main" },
        React.createElement("div", { className: "topbar" },
          React.createElement("button", { className: "hamburger", onClick: () => setDrawer(true), "aria-label": "Abrir menu" },
            React.createElement("span", null), React.createElement("span", null), React.createElement("span", null)
          ),
          React.createElement("span", { className: "topbar-title" }, topbarTitle)
        ),

        isViewer
          ? React.createElement(ViewerPage, {
              app: app, flow: flow, steps: steps, stepIdx: stepIdx,
              onSelectFlow: selectFlow, onSetStep: setStepIdx,
              onPrev: prev, onNext: next,
              onOpenLightbox: () => setLightbox(true)
            })
          : React.createElement(WorkPage, { page: tab.page })
      ),

      isViewer
        ? React.createElement(Lightbox, {
            open: lightbox, step: step, appName: app ? app.name : "", flowName: flow ? flow.name : "",
            index: stepIdx, total: total,
            onClose: () => setLightbox(false), onPrev: prev, onNext: next
          })
        : null
    )
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
})();
