/* ============================================================================
   PAINEL DE ANÁLISE DE DADOS — padrões deceptivos em apps de apostas
   ----------------------------------------------------------------------------
   View autônoma e isolada. Lê os mesmos dados do site público
   (../data/{plataforma}/...) e a mesma taxonomia compartilhada
   (../js/checklist-data.js → window.CHECKLIST_TAXONOMY). Estilo em
   ../css/dashboard.css. Não depende de React.

   A premissa editorial: o leitor não quer ver "dado sobre o dado", e sim como
   cada número se relaciona a padrões deceptivos concretos. Por isso TODO
   elemento analítico (cartão, célula do mapa de calor, barra, gravidade) é
   clicável e abre uma GAVETA lateral com as telas relacionadas, cada uma com
   sua ficha de catalogação e comentário.

   Modos de operação (via window.* antes de carregar este arquivo):
     DASHBOARD_INLINE        → controles vão para #dashFilterNav (secondary-nav)
     DASHBOARD_BASE          → prefixo até a raiz do site (default "../")
     DASHBOARD_LOCK_PLATFORM → trava o painel em uma plataforma (páginas de
                               apêndice); esconde os pills de plataforma
     DASHBOARD_OPEN_MAPPING  → callback(flowId) p/ abrir o mapeamento do fluxo
                               na própria página de plataforma (estado vazio)

   Os dados analíticos vêm do campo `checklist` de cada passo:
     checklist.tipos        → tipos de Brignull
     checklist.gray         → categorias de Gray et al.
     checklist.heuristicas  → heurísticas de Nielsen violadas + gravidade (0–4)
     checklist.observacoes  → comentário livre
   O campo `darkPatterns` (texto livre) também é tratado como comentário.
   ========================================================================== */
(function () {
  "use strict";

  var BASE = window.DASHBOARD_BASE || "../";
  var INLINE = !!window.DASHBOARD_INLINE;
  var LOCK = window.DASHBOARD_LOCK_PLATFORM || null;
  var PLATFORM_IDS = ["bet365", "betano", "superbet"];

  var TAX = window.CHECKLIST_TAXONOMY || {};
  var brById = TAX.brignullById || {};
  var grById = TAX.grayById || {};
  var nById = TAX.nielsenById || {};
  var sevByVal = TAX.severityByValue || {};
  var BRIGNULL = TAX.brignull || [];
  var GRAY = TAX.gray || [];
  var NIELSEN = TAX.nielsen || [];

  // Metadados das três taxonomias (a "lente" do mapa de calor e distribuições).
  var LENS = {
    tipos: { short: "Brignull", col: "Tipo (Brignull)", kick: "Tipo de padrão deceptivo (Brignull)", rows: BRIGNULL },
    gray: { short: "Gray et al.", col: "Categoria (Gray)", kick: "Categoria — Gray et al.", rows: GRAY },
    heur: { short: "Nielsen", col: "Heurística (Nielsen)", kick: "Heurística de Nielsen", rows: NIELSEN }
  };

  // Descrição neutra de cada plataforma (contexto editorial para a "introdução").
  var PLATFORM_INTRO = {
    bet365:
      "Operadora global de origem britânica, reconhecida pelas apostas esportivas ao vivo e por um cassino online totalmente integrado à plataforma.",
    betano:
      "Marca com forte presença no Brasil, patrocinadora de clubes e competições, que combina apostas esportivas a um cassino completo de slots e jogos ao vivo.",
    superbet:
      "Operadora em rápida expansão no mercado brasileiro, com ampla oferta de apostas esportivas e jogos de cassino, incluindo os populares “crash games” e “slots”."
  };

  // Categoria de produto de cada fluxo, derivada do id (convenção de nomes):
  // casino_* → cassino; sports_betting* → apostas esportivas; demais → conta.
  function flowCategory(fid) {
    if (/^casino_/.test(fid)) return "cassino";
    if (/^sports_betting/.test(fid)) return "apostas";
    return "conta";
  }

  // Rótulos e cores das categorias de produto e das plataformas (séries dos
  // gráficos comparativos). Luminâncias distintas para legibilidade em P&B.
  var CAT = {
    cassino: { label: "Cassino", color: "#e0b020" },
    apostas: { label: "Apostas esportivas", color: "#2a2a2a" },
    conta: { label: "Cadastro & conta", color: "#c2c2ba" }
  };
  var CATS = ["cassino", "apostas", "conta"];
  var PLAT_COLOR = { bet365: "#2a2a2a", betano: "#c99a21", superbet: "#9aa0a6" };

  var MODEL = null; // { platforms: [{id,name,flows:[{id,name,steps:[...]}]}] }

  var state = {
    platform: LOCK || "all",
    flow: "all"
  };

  var detailList = []; // passos exibidos atualmente na gaveta (para o lightbox)

  /* ----------------------------- utilidades ------------------------------ */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fnum(n) { return (Math.round(n * 10) / 10).toString().replace(".", ","); }

  function clHasContent(cl) {
    if (!cl) return false;
    return !!((cl.tipos && cl.tipos.length) ||
      (cl.gray && cl.gray.length) ||
      (cl.heuristicas && cl.heuristicas.length) ||
      (cl.observacoes && String(cl.observacoes).trim()));
  }

  function stepAnnotated(s) {
    return clHasContent(s.checklist) || !!(s.darkPatterns && String(s.darkPatterns).trim());
  }

  function platName(id) {
    var p = MODEL.platforms.find(function (x) { return x.id === id; });
    return p ? p.name : id;
  }

  function flowName(platformId, flowId) {
    var p = MODEL.platforms.find(function (x) { return x.id === platformId; });
    var f = p && p.flows.find(function (x) { return x.id === flowId; });
    return f ? f.name : flowId;
  }

  /* ----------------------------- carregamento ---------------------------- */
  function loadPlatform(pid) {
    // no-store: estes JSON são editados pela ferramenta de catalogação; o painel
    // deve sempre refletir os dados atuais, sem servir versões em cache.
    return fetch(BASE + "data/" + pid + "/manifest.json", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (man) {
        return Promise.all(man.flows.map(function (fid) {
          return fetch(BASE + "data/" + pid + "/" + fid + ".json", { cache: "no-store" })
            .then(function (r) { return r.json(); })
            .then(function (flow) {
              var steps = (flow.steps || []).filter(function (s) { return !s.ignore; });
              return { id: flow.id || fid, name: flow.name || fid, steps: steps };
            })
            .catch(function () { return { id: fid, name: fid, steps: [] }; });
        })).then(function (flows) {
          return { id: man.id || pid, name: man.name || pid, flows: flows };
        });
      });
  }

  function load() {
    return Promise.all(PLATFORM_IDS.map(loadPlatform)).then(function (platforms) {
      MODEL = { platforms: platforms };
      return MODEL;
    });
  }

  /* --------------------------- coleta / agregação ------------------------ */
  // Lista plana de passos conforme o filtro, anotada com plataforma e fluxo.
  function collectSteps(opts) {
    opts = opts || {};
    var platformId = opts.platform || state.platform;
    var flowId = opts.flow || state.flow;
    var out = [];
    MODEL.platforms.forEach(function (p) {
      if (platformId !== "all" && p.id !== platformId) return;
      p.flows.forEach(function (f) {
        if (platformId !== "all" && flowId !== "all" && f.id !== flowId) return;
        f.steps.forEach(function (s) {
          out.push({
            platformId: p.id, platformName: p.name,
            flowId: f.id, flowName: f.name, step: s
          });
        });
      });
    });
    return out;
  }

  function emptyAgg() {
    return {
      steps: 0, annotated: 0,
      tipos: {}, gray: {}, heur: {},
      heurSev: {}, sevDist: [0, 0, 0, 0, 0], sevAll: [],
      tipoTotal: 0, grayTotal: 0, heurTotal: 0
    };
  }

  function aggregate(records) {
    var a = emptyAgg();
    records.forEach(function (rec) {
      var s = rec.step;
      a.steps++;
      if (stepAnnotated(s)) a.annotated++;
      var cl = s.checklist || {};
      (cl.tipos || []).forEach(function (id) { a.tipos[id] = (a.tipos[id] || 0) + 1; a.tipoTotal++; });
      (cl.gray || []).forEach(function (id) { a.gray[id] = (a.gray[id] || 0) + 1; a.grayTotal++; });
      (cl.heuristicas || []).forEach(function (hh) {
        if (!hh || !hh.id) return;
        a.heur[hh.id] = (a.heur[hh.id] || 0) + 1;
        a.heurTotal++;
        if (typeof hh.sev === "number") {
          a.sevAll.push(hh.sev);
          if (hh.sev >= 0 && hh.sev <= 4) a.sevDist[hh.sev]++;
          (a.heurSev[hh.id] = a.heurSev[hh.id] || []).push(hh.sev);
        }
      });
    });
    return a;
  }

  function avg(arr) { return arr.length ? arr.reduce(function (x, y) { return x + y; }, 0) / arr.length : 0; }

  function topEntry(obj) {
    var best = null;
    Object.keys(obj).forEach(function (k) { if (!best || obj[k] > best[1]) best = [k, obj[k]]; });
    return best; // [id, count] | null
  }

  function topFlow(platformId) {
    var best = null;
    MODEL.platforms.forEach(function (p) {
      if (platformId !== "all" && p.id !== platformId) return;
      p.flows.forEach(function (f) {
        var n = 0;
        f.steps.forEach(function (s) { n += ((s.checklist || {}).tipos || []).length; });
        if (n > 0 && (!best || n > best.n)) best = { n: n, flow: f, platform: p };
      });
    });
    return best;
  }

  /* ------------------------------ cores heatmap -------------------------- */
  function hexLerp(a, b, t) {
    function hx(x) { return [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)]; }
    var ca = hx(a), cb = hx(b);
    var r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
    var g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
    var bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
    return "rgb(" + r + "," + g + "," + bl + ")";
  }

  function heatColor(t) {
    if (t <= 0) return "transparent";
    return t < 0.5 ? hexLerp("#fff7d6", "#f3d250", t / 0.5) : hexLerp("#f3d250", "#b8860b", (t - 0.5) / 0.5);
  }

  function heatText(t) { return t > 0.62 ? "#fff" : "#1a1a1a"; }

  /* =============================== RENDER =============================== */
  function render() {
    var app = document.getElementById("app");
    if (!app) return;
    app.innerHTML =
      '<div class="wrap">' +
        (INLINE ? "" : headerHtml()) +
        (INLINE ? "" : filterbarHtml()) +
        '<div id="main">' + mainHtml() + '</div>' +
      '</div>' +
      drawerHtml() +
      lightboxHtml();
    if (INLINE) renderNav();
    bindTooltips();
  }

  function rerenderMain() {
    closeDrawer();
    var m = document.getElementById("main");
    if (m) m.innerHTML = mainHtml();
    if (INLINE) renderNav();
    bindTooltips();
  }

  function renderNav() {
    var el = document.getElementById("dashFilterNav");
    if (el) el.innerHTML = controlsHtml();
  }

  /* ----------------------------- controles ------------------------------ */
  function pillBtn(val, label) {
    return '<button class="pill' + (state.platform === val ? " is-active" : "") +
      '" data-act="platform" data-val="' + esc(val) + '">' + esc(label) + '</button>';
  }

  function flowSelectHtml() {
    var disabled = !LOCK && state.platform === "all";
    var opts = '<option value="all">Todos os fluxos</option>';
    if (!disabled) {
      var plat = MODEL.platforms.find(function (p) { return p.id === state.platform; });
      (plat ? plat.flows : []).forEach(function (f) {
        if (!f.steps.length) return;
        var n = f.steps.filter(function (s) { return stepAnnotated(s); }).length;
        var lbl = esc(f.name) + (n ? " (" + n + ")" : " (—)");
        opts += '<option value="' + esc(f.id) + '"' + (state.flow === f.id ? " selected" : "") + '>' + lbl + '</option>';
      });
    }
    return '<select class="fselect" id="flowSelect"' + (disabled ? " disabled" : "") + '>' + opts + '</select>';
  }

  function controlsHtml() {
    var out = "";
    if (LOCK) {
      out += '<div class="fgroup"><span class="flabel">Plataforma</span>' +
        '<span class="fixed-platform">' + esc(platName(LOCK)) + '</span></div>';
    } else {
      var pills = pillBtn("all", "Todas");
      MODEL.platforms.forEach(function (p) { pills += pillBtn(p.id, p.name); });
      out += '<div class="fgroup"><span class="flabel">Plataforma</span><div class="pills">' + pills + '</div></div>';
    }
    out += '<div class="fgroup"><span class="flabel">Fluxo</span>' + flowSelectHtml() + '</div>';
    return out;
  }

  function headerHtml() {
    var totalSteps = 0, annotated = 0;
    MODEL.platforms.forEach(function (p) {
      p.flows.forEach(function (f) {
        f.steps.forEach(function (s) { totalSteps++; if (stepAnnotated(s)) annotated++; });
      });
    });
    return '' +
      '<header class="dash-head">' +
        '<p class="kicker">TCC · Ética no design · Painel de dados</p>' +
        '<h1>Padrões deceptivos em plataformas de apostas</h1>' +
        '<p class="lede">Catalogação visual dos padrões deceptivos (<i>deceptive patterns</i>) ' +
        'observados nos fluxos de Bet365, Betano e Superbet, classificados pela taxonomia de ' +
        'Brignull, pelas categorias de Gray <i>et al.</i> e pelas heurísticas de Nielsen. ' +
        'Clique em qualquer número, célula ou barra para ver as telas relacionadas.</p>' +
        '<span class="status"><span class="dot live"></span>' +
        annotated + ' de ' + totalSteps + ' telas anotadas · dados ao vivo de <code>../data</code></span>' +
      '</header>';
  }

  function filterbarHtml() {
    return '<div class="filterbar">' + controlsHtml() + '</div>';
  }

  /* ============================ CONTEÚDO ============================ */
  function mainHtml() {
    // Estado vazio do filtro de fluxo: só mostra dados se existirem.
    if (state.flow !== "all") {
      var aggF = aggregate(collectSteps());
      if (!aggF.annotated) return emptyFlowHtml();
    }
    var agg = aggregate(collectSteps());

    // Monta os blocos em ordem narrativa; alguns só aparecem quando há base de
    // comparação (≥2 grupos). A navegação por âncoras é derivada desta lista.
    var blocks = [];
    blocks.push({ id: "geral", label: "Visão geral",
      html: statCardsHtml(agg) + introSectionHtml() + findingsHtml(agg) });

    var a = catBarsSectionHtml();
    if (a) blocks.push({ id: "cassino-apostas", label: "Cassino × Apostas", html: a });

    var b = comparisonSectionHtml();
    if (b) blocks.push({ id: "comparacao", label: "Comparação", html: b });

    var tf = topFlowsSectionHtml();
    if (tf) blocks.push({ id: "fluxos", label: "Fluxos críticos", html: tf });

    blocks.push({ id: "mapa", label: "Mapa de calor", html: heatmapSectionHtml() });
    blocks.push({ id: "distribuicoes", label: "Distribuições", html: chartsSectionHtml(agg) });

    return jumpNavHtml(blocks) +
      blocks.map(function (bk) {
        return '<div class="sec-anchor" id="sec-' + bk.id + '">' + bk.html + '</div>';
      }).join("");
  }

  function jumpNavHtml(blocks) {
    var links = blocks.map(function (bk) {
      return '<button class="jn-link" data-act="jump" data-target="sec-' + bk.id + '">' + esc(bk.label) + '</button>';
    }).join("");
    return '<nav class="jump-nav" aria-label="Ir para seção"><span class="jn-lab">Seções</span>' + links + '</nav>';
  }

  function emptyFlowHtml() {
    var fname = flowName(state.platform, state.flow);
    var plat = MODEL.platforms.find(function (p) { return p.id === state.platform; });
    var flow = plat && plat.flows.find(function (f) { return f.id === state.flow; });
    var hasSteps = !!(flow && flow.steps.length);
    var link = "";
    if (hasSteps && LOCK && typeof window.DASHBOARD_OPEN_MAPPING === "function") {
      link = '<button class="ef-link" data-act="mapping" data-flow="' + esc(state.flow) + '">' +
        'Ver mapeamento do fluxo ›</button>';
    } else if (hasSteps) {
      link = '<a class="ef-link" href="' + BASE + esc(state.platform) + '/?flow=' +
        encodeURIComponent(state.flow) + '">Ver mapeamento do fluxo no apêndice ›</a>';
    }
    return '<div class="empty-flow">' +
      '<p class="ef-title">Este filtro não possui padrões deceptivos catalogados</p>' +
      '<p class="ef-desc">O fluxo <b>' + esc(fname) + '</b> foi percorrido e suas telas estão ' +
      'registradas, mas nenhum padrão deceptivo foi catalogado neste recorte. ' +
      'Consulte o mapeamento completo das telas deste fluxo no apêndice.</p>' +
      link +
    '</div>';
  }

  /* ------------------------------ big numbers --------------------------- */
  function statCardsHtml(agg) {
    var distinctTipos = Object.keys(agg.tipos).length;
    var avgSev = avg(agg.sevAll);
    return '<div class="stat-cards">' +
      card(agg.annotated + '<span class="of"> / ' + agg.steps + '</span>', "Telas anotadas",
        "no escopo selecionado", agg.annotated ? "annotated" : null) +
      card(String(agg.tipoTotal), "Ocorrências de padrões",
        distinctTipos + " tipos distintos catalogados", agg.tipoTotal ? "tipos" : null) +
      card(String(Object.keys(agg.heur).length), "Heurísticas violadas",
        agg.sevAll.length + " violações registradas", agg.heurTotal ? "heur" : null) +
      card(agg.sevAll.length ? fnum(avgSev) : "—", "Gravidade média",
        "escala de Nielsen (0–4)", agg.sevAll.length ? "sev" : null) +
    '</div>';

    function card(num, lbl, sub, stat) {
      var dr = stat ? ' drill" data-act="drill" data-drill="stat" data-stat="' + stat + '"' : '"';
      return '<button class="stat-card' + dr + '><div class="num">' + num + '</div>' +
        '<div class="lbl">' + lbl + '</div><div class="sub">' + sub + '</div></button>';
    }
  }

  /* ------------------------------ introdução ---------------------------- */
  function introSectionHtml() {
    var ids = state.platform === "all" ? PLATFORM_IDS : [state.platform];
    var cards = ids.map(function (pid) {
      var p = MODEL.platforms.find(function (x) { return x.id === pid; });
      if (!p) return "";
      var flowsAnalyzed = 0, screens = 0, annotated = 0;
      p.flows.forEach(function (f) {
        var hasA = false;
        f.steps.forEach(function (s) { screens++; if (stepAnnotated(s)) { annotated++; hasA = true; } });
        if (hasA) flowsAnalyzed++;
      });
      var agg = aggregate(collectSteps({ platform: pid, flow: "all" }));
      var top = topEntry(agg.tipos);
      var topTxt;
      if (top && brById[top[0]]) {
        topTxt = '<button class="intro-top drill" data-act="drill" data-drill="lens" data-lens="tipos" ' +
          'data-row="' + esc(top[0]) + '" data-platform="' + esc(pid) + '">' +
          'Padrão mais frequente: <b>' + esc(brById[top[0]].pt) + '</b> · ' + top[1] + ' ocorrências' +
          '<span class="drill-cue">ver telas</span></button>';
      } else {
        topTxt = '<span class="intro-top">Sem padrões catalogados neste recorte.</span>';
      }
      return '<div class="intro-card">' +
        '<h3>' + esc(p.name) + '</h3>' +
        '<p class="desc">' + esc(PLATFORM_INTRO[pid] || "") + '</p>' +
        '<div class="intro-stats">' +
          '<span class="chiplet"><b>' + flowsAnalyzed + '</b> fluxos com anotações</span>' +
          '<span class="chiplet"><b>' + annotated + '</b> telas anotadas</span>' +
          '<span class="chiplet"><b>' + agg.tipoTotal + '</b> ocorrências</span>' +
        '</div>' + topTxt +
      '</div>';
    }).join("");
    return section("Introdução às plataformas",
      state.platform === "all" ? "Visão comparativa do escopo catalogado" : "Recorte da plataforma selecionada",
      '<div class="intro-grid">' + cards + '</div>');
  }

  /* --------------------------- principais achados ----------------------- */
  function findingsHtml(agg) {
    var items = [];
    if (agg.tipoTotal === 0 && agg.heurTotal === 0) {
      items.push(plain("Nenhuma ocorrência de padrão deceptivo foi catalogada no recorte selecionado."));
    } else {
      var top = topEntry(agg.tipos);
      if (top && brById[top[0]]) {
        items.push(drillLi("lens", { lens: "tipos", row: top[0] },
          "O tipo mais recorrente é <b>" + esc(brById[top[0]].pt) + "</b> (<i>" +
          esc(brById[top[0]].en) + "</i>), com <b>" + top[1] + "</b> ocorrências de um total de " +
          agg.tipoTotal + "."));
      }
      var tg = topEntry(agg.gray);
      if (tg && grById[tg[0]]) {
        items.push(drillLi("lens", { lens: "gray", row: tg[0] },
          "Na taxonomia de Gray <i>et al.</i>, predomina a categoria <b>" +
          esc(grById[tg[0]].pt) + "</b> (" + tg[1] + " registros)."));
      }
      var th = topEntry(agg.heur);
      if (th && nById[th[0]]) {
        var sa = avg(agg.heurSev[th[0]] || []);
        items.push(drillLi("lens", { lens: "heur", row: th[0] },
          "A heurística de Nielsen mais violada é a <b>" + th[0].toUpperCase() + " — " +
          esc(nById[th[0]].pt) + "</b>, com " + th[1] + " violações" +
          (sa ? " (gravidade média " + fnum(sa) + ")" : "") + "."));
      }
      if (agg.sevAll.length) {
        items.push(drillLi("stat", { stat: "sev" },
          "A gravidade média das violações de usabilidade é <b>" + fnum(avg(agg.sevAll)) +
          "</b> na escala de Nielsen (0–4), indicando problemas entre <i>menores</i> e <i>maiores</i>."));
      }
      var tf = topFlow(state.platform);
      if (tf) {
        items.push(drillLi("stat", { stat: "patterns", platform: tf.platform.id, flow: tf.flow.id },
          "O fluxo com maior concentração de padrões é <b>" + esc(tf.flow.name) +
          "</b> (" + esc(tf.platform.name) + "), com " + tf.n + " ocorrências."));
      }
    }
    return section("Principais achados", "Síntese gerada a partir dos dados filtrados",
      '<div class="findings"><ul>' + items.join("") + '</ul></div>');

    function plain(html) { return '<li>' + html + '</li>'; }
    function drillLi(kind, d, html) {
      var attrs = ' data-act="drill" data-drill="' + kind + '"';
      if (d.lens) attrs += ' data-lens="' + esc(d.lens) + '"';
      if (d.row) attrs += ' data-row="' + esc(d.row) + '"';
      if (d.stat) attrs += ' data-stat="' + esc(d.stat) + '"';
      if (d.platform) attrs += ' data-platform="' + esc(d.platform) + '"';
      if (d.flow) attrs += ' data-flow="' + esc(d.flow) + '"';
      return '<li class="drill"' + attrs + '><span>' + html + '</span>' +
        '<span class="drill-cue">ver telas</span></li>';
    }
  }

  /* ------------------------------ mapa de calor ------------------------- */
  function heatmapSectionHtml() {
    var scope = state.platform === "all" ? "plataformas" : "fluxos com anotações";
    var hint = '<span class="hint">Colunas: ' + scope +
      ' · uma matriz por taxonomia · clique numa célula para ver as telas</span>';
    var blocks = ["tipos", "gray", "heur"].map(function (k) {
      return '<div class="heat-block"><h3 class="block-title">' + esc(LENS[k].col) + '</h3>' +
        heatTableHtml(k) + '</div>';
    }).join("");
    return section("Mapa de calor por taxonomia", hint,
      blocks +
      '<div class="legend"><span>Menos frequente</span><span class="bar"></span><span>Mais frequente</span></div>');
  }

  function heatTableHtml(lens) {
    var rows = LENS[lens].rows;
    var key = lens; // tipos|gray|heur
    function getMeta(it) {
      if (lens === "heur") return { id: it.id, pt: it.id.toUpperCase() + " · " + it.pt, en: it.en, def: it.def };
      return { id: it.id, pt: it.pt, en: it.en, def: it.def };
    }

    // colunas
    var cols = [];
    if (state.platform === "all") {
      cols = MODEL.platforms.map(function (p) {
        return { kind: "platform", id: p.id, name: p.name, agg: aggregate(collectSteps({ platform: p.id, flow: "all" })) };
      });
    } else {
      var plat = MODEL.platforms.find(function (p) { return p.id === state.platform; });
      (plat ? plat.flows : []).forEach(function (f) {
        var agg = aggregate(collectSteps({ platform: plat.id, flow: f.id }));
        if (agg.tipoTotal > 0 || agg.heurTotal > 0 || agg.grayTotal > 0) {
          cols.push({ kind: "flow", id: f.id, name: f.name, agg: agg });
        }
      });
    }

    if (!cols.length) return '<div class="empty-state">Sem dados para o mapa de calor neste recorte.</div>';

    function val(agg, rowId) { return (agg[key] || {})[rowId] || 0; }

    var max = 0;
    rows.forEach(function (it) { cols.forEach(function (c) { max = Math.max(max, val(c.agg, it.id)); }); });
    max = max || 1;

    var head = '<thead><tr><th class="rowhead">' + esc(LENS[lens].col) + '</th>';
    cols.forEach(function (c) { head += '<th>' + esc(c.name) + '</th>'; });
    head += '<th class="total">Total</th></tr></thead>';

    var bodyRows = "";
    var colTotals = cols.map(function () { return 0; });
    rows.forEach(function (it) {
      var meta = getMeta(it);
      var rowTotal = 0;
      var tds = "";
      cols.forEach(function (c, ci) {
        var v = val(c.agg, it.id);
        rowTotal += v; colTotals[ci] += v;
        if (v === 0) { tds += '<td class="zero">·</td>'; return; }
        var t = v / max;
        var ov = c.kind === "platform"
          ? ' data-platform="' + esc(c.id) + '" data-flow="all"'
          : ' data-platform="' + esc(state.platform) + '" data-flow="' + esc(c.id) + '"';
        tds += '<td class="cell drill" style="background:' + heatColor(t) + ';color:' + heatText(t) + '" ' +
          'data-act="drill" data-drill="lens" data-lens="' + esc(key) + '" data-row="' + esc(it.id) + '"' + ov +
          ' data-tip="' + esc(meta.pt) + ' · ' + esc(c.name) + ': ' + v + ' — clique para ver as telas">' + v + '</td>';
      });
      bodyRows += '<tr><th class="rowhead drill" data-act="drill" data-drill="lens" data-lens="' + esc(key) +
        '" data-row="' + esc(it.id) + '" data-tip="' + esc(meta.def || "") + '">' + esc(meta.pt) +
        '<span class="en">' + esc(meta.en) + '</span></th>' + tds +
        '<td class="total">' + rowTotal + '</td></tr>';
    });

    var grand = colTotals.reduce(function (a, b) { return a + b; }, 0);
    var totalRow = '<tr class="totalrow"><th class="rowhead">Total</th>';
    colTotals.forEach(function (t) { totalRow += '<td>' + t + '</td>'; });
    totalRow += '<td class="total">' + grand + '</td></tr>';

    return '<div class="table-scroll"><table class="heat">' + head + '<tbody>' + bodyRows + totalRow + '</tbody></table></div>';
  }

  /* ------------------------------ distribuições ------------------------- */
  function chartsSectionHtml(agg) {
    var cards =
      barChart("Tipos de padrão (Brignull)", "Ocorrências por tipo · clique para ver as telas",
        agg.tipos, brById, "tipos", false) +
      barChart("Categorias de Gray et al.", "Agrupamento de alto nível · clique para ver as telas",
        agg.gray, grById, "gray", false) +
      heurChart(agg) +
      sevChart(agg);
    return section("Distribuições por taxonomia",
      "Frequência segundo cada taxonomia no recorte selecionado",
      '<div class="charts-grid">' + cards + '</div>');
  }

  function barChart(title, sub, counts, byId, lensKey, sev) {
    var entries = Object.keys(counts).map(function (id) { return [id, counts[id]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    if (!entries.length) return chartCard(title, sub, '<div class="empty-state" style="padding:30px">Sem dados.</div>');
    var max = entries[0][1] || 1;
    var bars = entries.map(function (e) {
      var meta = byId[e[0]] || { pt: e[0], en: "" };
      return barRow(meta.pt, meta.en, e[1], e[1] / max, sev, { lens: lensKey, row: e[0] });
    }).join("");
    return chartCard(title, sub, '<div class="bars">' + bars + '</div>');
  }

  function heurChart(agg) {
    var entries = Object.keys(agg.heur).map(function (id) { return [id, agg.heur[id]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    if (!entries.length) return chartCard("Heurísticas de Nielsen", "Heurísticas violadas + gravidade média", '<div class="empty-state" style="padding:30px">Sem dados.</div>');
    var max = entries[0][1] || 1;
    var bars = entries.map(function (e) {
      var meta = nById[e[0]] || { pt: e[0], en: "" };
      var sa = avg(agg.heurSev[e[0]] || []);
      var sub = e[0].toUpperCase() + (sa ? " · gravidade " + fnum(sa) : "");
      return barRow(meta.pt, sub, e[1], e[1] / max, true, { lens: "heur", row: e[0] });
    }).join("");
    return chartCard("Heurísticas de Nielsen", "Heurísticas violadas + gravidade média · clique para ver as telas", '<div class="bars">' + bars + '</div>');
  }

  function barRow(name, en, val, frac, sev, drill) {
    var dr = drill ? ' drill" data-act="drill" data-drill="lens" data-lens="' + esc(drill.lens) +
      '" data-row="' + esc(drill.row) + '"' : '"';
    return '<div class="bar-row' + dr + '><div class="bar-label"><span class="name">' + esc(name) +
      (en ? ' <span class="en">' + esc(en) + '</span>' : "") + '</span>' +
      '<span class="val">' + val + '</span></div>' +
      '<div class="bar-track"><div class="bar-fill' + (sev ? " sev" : "") +
      '" style="width:' + Math.max(2, Math.round(frac * 100)) + '%"></div></div></div>';
  }

  function sevChart(agg) {
    var max = Math.max.apply(null, agg.sevDist.concat([1]));
    var cols = agg.sevDist.map(function (cnt, v) {
      var meta = sevByVal[v] || { label: "" };
      var hgt = Math.round((cnt / max) * 100);
      var dr = cnt ? ' drill" data-act="drill" data-drill="sev" data-sev="' + v + '"' : '"';
      return '<div class="sevcol' + dr + '>' +
        '<div class="col" style="height:' + hgt + '%" data-tip="Gravidade ' + v + " — " + esc(meta.label) + ': ' + cnt + ' violações' + (cnt ? ' — clique para ver as telas' : '') + '">' +
        (cnt ? '<span class="cnt">' + cnt + '</span>' : "") + '</div>' +
        '<div class="sevn">' + v + '</div><div class="sevl">' + esc(meta.label || "") + '</div></div>';
    }).join("");
    var sub = agg.sevAll.length ? agg.sevAll.length + " violações · escala 0–4" : "Sem violações no recorte";
    return chartCard("Gravidade (Nielsen)", sub, '<div class="sevdist">' + cols + '</div>');
  }

  function chartCard(title, sub, inner) {
    return '<div class="chart-card"><h3>' + esc(title) + '</h3><p class="csub">' + esc(sub) + '</p>' + inner + '</div>';
  }

  /* ==================== GRÁFICOS COMPARATIVOS (novos) =================== */
  // Monta a string de data-attrs que o handler de drill lê. `category` aplica
  // um filtro adicional por categoria de produto sobre o recorte resultante.
  function drillAttr(d) {
    var s = 'data-act="drill" data-drill="' + d.drill + '"';
    ["lens", "row", "stat", "platform", "flow", "category"].forEach(function (k) {
      if (d[k] != null && d[k] !== "") s += " data-" + k + '="' + esc(String(d[k])) + '"';
    });
    if (d.sev != null) s += ' data-sev="' + d.sev + '"';
    return s;
  }

  function legendHtml(items) {
    return '<div class="series-legend">' + items.map(function (it) {
      return '<span class="sl-item"><span class="sl-sw" style="background:' + it.color +
        '"></span>' + esc(it.label) + '</span>';
    }).join("") + '</div>';
  }

  function categoryLegendItems() {
    return CATS.map(function (c) { return { label: CAT[c].label, color: CAT[c].color }; });
  }

  // Gráfico de colunas agrupadas. data: [{ xLabel, bars:[{label,color,value,drill,tip}] }]
  function vGroupChart(data) {
    var max = 0;
    data.forEach(function (g) { g.bars.forEach(function (b) { if (b.value > max) max = b.value; }); });
    max = max || 1;
    var groups = data.map(function (g) {
      var bars = g.bars.map(function (b) {
        var h = Math.round((b.value / max) * 100);
        var clickable = b.value > 0 && b.drill;
        var attrs = clickable ? " " + b.drill : "";
        var tip = b.tip ? ' data-tip="' + esc(b.tip) + '"' : "";
        return '<div class="vbar' + (clickable ? " drill" : "") + '"' + attrs + tip + '>' +
          '<span class="vbar-cnt">' + (b.value || "") + '</span>' +
          '<span class="vbar-fill" style="height:' + Math.max(2, h) + '%;background:' + b.color + '"></span></div>';
      }).join("");
      return '<div class="vgroup"><div class="vbars">' + bars + '</div>' +
        '<div class="vglabel">' + esc(g.xLabel) + '</div></div>';
    }).join("");
    return '<div class="vchart">' + groups + '</div>';
  }

  // Barra horizontal colorida (rankings e comparações).
  function hbar(o) {
    var clickable = !!o.drill;
    var attrs = clickable ? " " + o.drill : "";
    var tip = o.tip ? ' data-tip="' + esc(o.tip) + '"' : "";
    return '<div class="hbar' + (clickable ? " drill" : "") + '"' + attrs + tip + '>' +
      '<div class="hbar-top"><span class="hbar-lab">' + esc(o.label) + '</span>' +
      '<span class="hbar-val">' + esc(o.value) + '</span></div>' +
      '<div class="hbar-track"><span class="hbar-fill" style="width:' +
      Math.max(2, Math.round(o.frac * 100)) + '%;background:' + (o.color || "var(--yellow)") + '"></span></div></div>';
  }

  // Estatísticas por categoria de produto (cassino/apostas/conta) num recorte.
  function categoryStats(platformId) {
    var res = {};
    CATS.forEach(function (c) { res[c] = { occ: 0, heur: 0, screens: 0, annot: 0, sev: [] }; });
    MODEL.platforms.forEach(function (p) {
      if (platformId !== "all" && p.id !== platformId) return;
      p.flows.forEach(function (f) {
        var r = res[flowCategory(f.id)];
        f.steps.forEach(function (s) {
          r.screens++;
          if (stepAnnotated(s)) r.annot++;
          var cl = s.checklist || {};
          r.occ += (cl.tipos || []).length;
          (cl.heuristicas || []).forEach(function (hh) {
            r.heur++;
            if (hh && typeof hh.sev === "number") r.sev.push(hh.sev);
          });
        });
      });
    });
    return res;
  }

  /* ---- Padrões por plataforma e tipo (Cassino × Apostas) ---- */
  function catBarsSectionHtml() {
    if (state.flow !== "all") return ""; // sem comparação com um fluxo único

    var data, legend = "";
    if (state.platform === "all") {
      // X = plataforma, séries = categoria de produto
      data = MODEL.platforms.map(function (p) {
        var cs = categoryStats(p.id);
        return {
          xLabel: p.name,
          bars: CATS.map(function (c) {
            return {
              label: CAT[c].label, color: CAT[c].color, value: cs[c].occ,
              drill: drillAttr({ drill: "cat", platform: p.id, category: c }),
              tip: CAT[c].label + " · " + p.name + ": " + cs[c].occ + " ocorrências — clique para ver as telas"
            };
          })
        };
      });
      legend = legendHtml(categoryLegendItems());
    } else {
      // Plataforma única: X = categoria de produto
      var cs1 = categoryStats(state.platform);
      data = CATS.filter(function (c) { return cs1[c].screens > 0; }).map(function (c) {
        return {
          xLabel: CAT[c].label,
          bars: [{
            label: CAT[c].label, color: CAT[c].color, value: cs1[c].occ,
            drill: drillAttr({ drill: "cat", platform: state.platform, category: c }),
            tip: CAT[c].label + ": " + cs1[c].occ + " ocorrências — clique para ver as telas"
          }]
        };
      });
    }

    var totalOcc = data.reduce(function (acc, g) {
      return acc + g.bars.reduce(function (s, b) { return s + b.value; }, 0);
    }, 0);
    if (!totalOcc) return "";

    // Faixa de "intensidade": ocorrências por tela anotada, por categoria.
    var cs = categoryStats(state.platform);
    var dens = CATS.filter(function (c) { return cs[c].annot > 0; }).map(function (c) {
      return '<span class="chiplet"><b>' + esc(CAT[c].label) + ':</b> ' +
        fnum(cs[c].occ / cs[c].annot) + ' padrões/tela</span>';
    }).join("");

    var sub = state.platform === "all"
      ? "Ocorrências de padrões (Brignull) por plataforma e tipo de produto · clique numa coluna para ver as telas"
      : "Ocorrências de padrões (Brignull) por tipo de produto · clique numa coluna para ver as telas";

    return section("Padrões por plataforma e tipo (Cassino × Apostas)", sub,
      '<div class="chart-card">' + vGroupChart(data) + legend +
      (dens ? '<div class="intensity"><span class="intensity-lab">Intensidade — padrões por tela anotada</span>' +
        '<div class="intro-stats">' + dens + '</div></div>' : "") +
      '</div>');
  }

  /* ---- Comparação em profundidade (gravidade, intensidade) ---- */
  // Grupos comparados: plataformas (visão geral) ou categorias de produto
  // (quando uma plataforma está selecionada).
  function comparisonGroups() {
    if (state.platform === "all") {
      return MODEL.platforms.map(function (p) {
        return {
          id: p.id, label: p.name, color: PLAT_COLOR[p.id] || "#888",
          platform: p.id, category: null,
          agg: aggregate(collectSteps({ platform: p.id, flow: "all" }))
        };
      });
    }
    var recs = collectSteps({ platform: state.platform, flow: "all" });
    return CATS.map(function (c) {
      var sub = recs.filter(function (r) { return flowCategory(r.flowId) === c; });
      return {
        id: c, label: CAT[c].label, color: CAT[c].color,
        platform: state.platform, category: c,
        agg: aggregate(sub)
      };
    }).filter(function (g) { return g.agg.heurTotal > 0 || g.agg.tipoTotal > 0; });
  }

  function comparisonSectionHtml() {
    if (state.flow !== "all") return "";
    var groups = comparisonGroups();
    if (groups.length < 2) return "";

    var byPlatform = state.platform === "all";
    var dim = byPlatform ? "plataforma" : "tipo de produto";
    var legend = legendHtml(groups.map(function (g) { return { label: g.label, color: g.color }; }));
    var anySev = groups.some(function (g) { return g.agg.sevAll.length; });

    var cards = "";

    // 1) Histograma de gravidade agrupado (X = 0..4, séries = grupos)
    if (anySev) {
      var sevData = [0, 1, 2, 3, 4].map(function (v) {
        var meta = sevByVal[v] || { label: "" };
        return {
          xLabel: v + " · " + meta.label,
          bars: groups.map(function (g) {
            return {
              label: g.label, color: g.color, value: g.agg.sevDist[v],
              drill: drillAttr({ drill: "sev", sev: v, platform: g.platform, category: g.category }),
              tip: g.label + " · gravidade " + v + " (" + meta.label + "): " +
                g.agg.sevDist[v] + " violações — clique para ver as telas"
            };
          })
        };
      });
      cards += '<div class="chart-card"><h3>Gravidade por ' + esc(dim) + '</h3>' +
        '<p class="csub">Violações de usabilidade por nível de gravidade (Nielsen 0–4) · clique para ver as telas</p>' +
        vGroupChart(sevData) + legend + '</div>';

      // 2) Gravidade média por grupo
      var avgRows = groups.map(function (g) {
        var a = avg(g.agg.sevAll);
        return hbar({
          label: g.label, value: g.agg.sevAll.length ? fnum(a) + " / 4" : "—",
          frac: a / 4, color: g.color,
          drill: drillAttr({ drill: "stat", stat: "sev", platform: g.platform, category: g.category }),
          tip: g.label + ": gravidade média " + (g.agg.sevAll.length ? fnum(a) : "—") +
            " · " + g.agg.sevAll.length + " violações"
        });
      }).join("");
      cards += '<div class="chart-card"><h3>Gravidade média</h3>' +
        '<p class="csub">Média da escala de Nielsen (0–4) por ' + esc(dim) + '</p>' +
        '<div class="hbars">' + avgRows + '</div></div>';
    }

    // 3) Intensidade de padrões por grupo (ocorrências por tela anotada)
    var densVals = groups.map(function (g) {
      return { g: g, d: g.agg.annotated ? g.agg.tipoTotal / g.agg.annotated : 0 };
    });
    var maxD = densVals.reduce(function (m, x) { return Math.max(m, x.d); }, 0) || 1;
    var densRows = densVals.map(function (x) {
      return hbar({
        label: x.g.label, value: fnum(x.d) + " padrões/tela",
        frac: x.d / maxD, color: x.g.color,
        drill: drillAttr({ drill: "stat", stat: "tipos", platform: x.g.platform, category: x.g.category }),
        tip: x.g.label + ": " + x.g.agg.tipoTotal + " ocorrências em " +
          x.g.agg.annotated + " telas anotadas — clique para ver as telas"
      });
    }).join("");
    cards += '<div class="chart-card"><h3>Intensidade de padrões</h3>' +
      '<p class="csub">Ocorrências de padrões (Brignull) por tela anotada · clique para ver as telas</p>' +
      '<div class="hbars">' + densRows + '</div></div>';

    var title = byPlatform ? "Comparação entre plataformas" : "Comparação por tipo de produto";
    var sub = byPlatform
      ? "Distribuição de gravidade e intensidade dos padrões entre Bet365, Betano e Superbet"
      : "Distribuição de gravidade e intensidade entre cassino, apostas e cadastro";
    return section(title, sub, '<div class="charts-grid">' + cards + '</div>');
  }

  /* ---- Ranking dos fluxos mais críticos ---- */
  function topFlowsSectionHtml() {
    if (state.flow !== "all") return "";
    var arr = [];
    MODEL.platforms.forEach(function (p) {
      if (state.platform !== "all" && p.id !== state.platform) return;
      p.flows.forEach(function (f) {
        var occ = 0, heur = 0, sev = [];
        f.steps.forEach(function (s) {
          var cl = s.checklist || {};
          occ += (cl.tipos || []).length;
          (cl.heuristicas || []).forEach(function (hh) {
            heur++;
            if (hh && typeof hh.sev === "number") sev.push(hh.sev);
          });
        });
        if (occ > 0) arr.push({ p: p, f: f, occ: occ, heur: heur, avgSev: avg(sev), cat: flowCategory(f.id) });
      });
    });
    if (arr.length < 2) return "";
    arr.sort(function (a, b) { return b.occ - a.occ; });
    var top = arr.slice(0, 12);
    var max = top[0].occ || 1;
    var rows = top.map(function (it) {
      var label = state.platform === "all" ? (it.f.name + " · " + it.p.name) : it.f.name;
      return hbar({
        label: label, value: it.occ + " ocorr.",
        frac: it.occ / max, color: CAT[it.cat].color,
        drill: drillAttr({ drill: "stat", stat: "tipos", platform: it.p.id, flow: it.f.id }),
        tip: it.f.name + " (" + it.p.name + "): " + it.occ + " ocorrências · " + it.heur +
          " heurísticas" + (it.avgSev ? " · gravidade média " + fnum(it.avgSev) : "") +
          " — clique para ver as telas"
      });
    }).join("");
    return section("Fluxos com mais padrões",
      "Ranking dos fluxos por ocorrências de padrões (Brignull) · a cor indica o tipo de produto",
      '<div class="chart-card"><div class="hbars">' + rows + '</div>' +
      legendHtml(categoryLegendItems()) + '</div>');
  }

  /* =========================== GAVETA (drill) ========================== */
  function drawerHtml() {
    return '<div class="dd-backdrop" id="ddBackdrop" data-act="dd-close"></div>' +
      '<div class="dd" id="dd" role="dialog" aria-modal="true" aria-label="Telas relacionadas">' +
        '<div class="dd-head" id="ddHead"></div>' +
        '<div class="dd-body" id="ddBody"></div>' +
      '</div>';
  }

  // Lê os data-attrs do alvo, monta o recorte e abre a gaveta.
  function drillFromTarget(t) {
    var kind = t.getAttribute("data-drill");
    var pOv = t.getAttribute("data-platform");
    var fOv = t.getAttribute("data-flow");
    var platform = pOv || state.platform;
    var flow = fOv || (pOv ? "all" : state.flow);
    var recs = collectSteps({ platform: platform, flow: flow });

    var meta = { kick: "", title: "", sub: "", def: "", match: null };
    var pred;

    if (kind === "lens") {
      var key = t.getAttribute("data-lens");
      var row = t.getAttribute("data-row");
      meta.match = { key: key, id: row };
      meta.kick = LENS[key] ? LENS[key].kick : "";
      if (key === "tipos") { var it = brById[row] || {}; meta.title = it.pt || row; meta.def = it.def || ""; }
      else if (key === "gray") { var g = grById[row] || {}; meta.title = g.pt || row; meta.def = g.def || ""; }
      else { var nn = nById[row] || {}; meta.title = (row ? row.toUpperCase() : "") + " · " + (nn.pt || ""); meta.def = nn.def || ""; }
      pred = function (s) {
        var cl = s.checklist || {};
        if (key === "heur") return (cl.heuristicas || []).some(function (hh) { return hh && hh.id === row; });
        return (cl[key] || []).indexOf(row) >= 0;
      };
    } else if (kind === "sev") {
      var v = parseInt(t.getAttribute("data-sev"), 10);
      var sv = sevByVal[v] || {};
      meta.kick = "Gravidade (Nielsen)";
      meta.title = "Gravidade " + v + " — " + (sv.label || "");
      meta.def = sv.def || "";
      meta.match = { key: "sev", id: v };
      pred = function (s) { return ((s.checklist || {}).heuristicas || []).some(function (hh) { return hh && hh.sev === v; }); };
    } else if (kind === "cat") {
      var catId = t.getAttribute("data-category");
      var cm = CAT[catId] || { label: catId };
      meta.kick = "Padrões por tipo de produto";
      meta.title = cm.label;
      pred = function (s) { return ((s.checklist || {}).tipos || []).length > 0; };
    } else { // stat
      var stat = t.getAttribute("data-stat");
      var titles = {
        annotated: "Telas anotadas", patterns: "Telas com padrões catalogados",
        tipos: "Telas com padrões (Brignull)", gray: "Telas com categorias (Gray)",
        heur: "Telas com heurísticas violadas", sev: "Telas com gravidade avaliada"
      };
      meta.kick = "Telas relacionadas";
      meta.title = titles[stat] || "Telas";
      pred = function (s) {
        var cl = s.checklist || {};
        switch (stat) {
          case "annotated": return stepAnnotated(s);
          case "patterns": return clHasContent(cl);
          case "tipos": return (cl.tipos || []).length > 0;
          case "gray": return (cl.gray || []).length > 0;
          case "heur": return (cl.heuristicas || []).length > 0;
          case "sev": return (cl.heuristicas || []).some(function (hh) { return typeof hh.sev === "number"; });
          default: return stepAnnotated(s);
        }
      };
    }

    var records = recs.filter(function (r) { return pred(r.step); });
    var catFilter = t.getAttribute("data-category");
    if (catFilter) records = records.filter(function (r) { return flowCategory(r.flowId) === catFilter; });
    meta.sub = scopeLabel(platform, flow) + " · " + records.length + " tela" + (records.length !== 1 ? "s" : "");
    openDrawer(meta, records);
  }

  function scopeLabel(platform, flow) {
    if (platform === "all") return "Todas as plataformas";
    var base = platName(platform);
    if (flow && flow !== "all") base += " › " + flowName(platform, flow);
    return base;
  }

  function openDrawer(meta, records) {
    detailList = records;
    document.getElementById("ddHead").innerHTML =
      '<div><p class="dd-kick">' + esc(meta.kick) + '</p>' +
      '<h2 class="dd-title">' + esc(meta.title) + '</h2>' +
      '<p class="dd-sub">' + esc(meta.sub) + '</p></div>' +
      '<button class="dd-close" data-act="dd-close" aria-label="Fechar">✕</button>';

    var body = meta.def ? '<div class="dd-def">' + esc(meta.def) + '</div>' : "";
    if (!records.length) {
      body += '<div class="empty-state">Nenhuma tela encontrada neste recorte.</div>';
    } else {
      var html = "", lastKey = "";
      records.forEach(function (rec, idx) {
        var k = rec.platformId + "/" + rec.flowId;
        if (k !== lastKey) {
          html += '<div class="det-group-head">' + esc(rec.platformName) + ' › ' + esc(rec.flowName) + '</div>';
          lastKey = k;
        }
        html += detailCard(rec, idx, meta.match);
      });
      body += '<div class="det-list">' + html + '</div>';
    }
    document.getElementById("ddBody").innerHTML = body;
    document.getElementById("ddBody").scrollTop = 0;
    document.getElementById("dd").classList.add("is-open");
    document.getElementById("ddBackdrop").classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    var dd = document.getElementById("dd");
    var bd = document.getElementById("ddBackdrop");
    if (dd) dd.classList.remove("is-open");
    if (bd) bd.classList.remove("is-open");
    if (!isLightboxOpen()) document.body.style.overflow = "";
  }

  function detailCard(rec, idx, match) {
    var s = rec.step;
    var imgSrc = s.image ? BASE + s.image : "";
    var thumb = imgSrc
      ? '<button class="det-thumb" data-act="zoom" data-idx="' + idx + '">' +
          '<img loading="lazy" src="' + esc(imgSrc) + '" alt="' + esc(s.title || "") + '" ' +
          'onerror="this.parentNode.innerHTML=\'<div class=&quot;imgfail&quot;>imagem indisponível</div>\'">' +
          '<span class="zoom">⤢ ampliar</span></button>'
      : '<div class="det-thumb"><div class="imgfail">sem imagem</div></div>';

    var dp = s.darkPatterns && String(s.darkPatterns).trim()
      ? '<div class="commentary"><span class="clab">Comentário do analista</span>' + esc(s.darkPatterns) + '</div>'
      : "";

    return '<div class="det-card">' + thumb +
      '<div class="det-body">' +
        '<div class="det-crumb"><b>' + esc(rec.platformName) + '</b> · ' + esc(rec.flowName) + '</div>' +
        '<h3 class="det-title">' + esc(s.title || "Sem título") + '</h3>' +
        (s.description ? '<p class="det-desc">' + esc(s.description) + '</p>' : "") +
        dp +
        fichaHtml(s.checklist, match) +
      '</div></div>';
  }

  function fichaHtml(cl, match) {
    if (!clHasContent(cl)) return "";
    match = match || {};
    var fields = "";

    var tipos = (cl.tipos || []).map(function (id) { return brById[id]; }).filter(Boolean);
    if (tipos.length) {
      fields += field("Tipo de padrão deceptivo (Brignull)",
        '<div class="chips">' + tipos.map(function (it) {
          var m = match.key === "tipos" && match.id === it.id ? " is-match" : "";
          return '<span class="chip' + m + '" data-tip="' + esc(it.pt + " — " + it.def) + '">' + esc(it.en) + '</span>';
        }).join("") + '</div>');
    }

    var grays = (cl.gray || []).map(function (id) { return grById[id]; }).filter(Boolean);
    if (grays.length) {
      fields += field("Categoria (Gray et al.)",
        '<div class="chips">' + grays.map(function (it) {
          var m = match.key === "gray" && match.id === it.id ? " is-match" : "";
          return '<span class="chip gray-chip' + m + '" data-tip="' + esc(it.pt + " — " + it.def) + '">' + esc(it.en) + '</span>';
        }).join("") + '</div>');
    }

    var heurs = (cl.heuristicas || []).filter(function (hh) { return hh && nById[hh.id]; });
    if (heurs.length) {
      fields += field("Heurísticas de Nielsen violadas",
        '<div class="heurs">' + heurs.map(function (hh) {
          var meta = nById[hh.id];
          var sev = (typeof hh.sev === "number") ? sevByVal[hh.sev] : null;
          var matchHeur = match.key === "heur" && match.id === hh.id;
          var matchSev = match.key === "sev" && hh.sev === match.id;
          var sevHtml = sev
            ? '<span class="hsev' + (matchSev ? " is-match" : "") + '" data-tip="' + esc(sev.def) + '"><span class="sevbox" style="background:' +
                heatColor(hh.sev / 4) + ';color:' + heatText(hh.sev / 4) + '">' + sev.value + '</span>' +
                '<span class="sevlab">Gravidade ' + sev.value + " · " + esc(sev.label) + '</span></span>'
            : '<span class="sevlab" style="font-style:italic">gravidade não avaliada</span>';
          return '<div class="heur"><span class="hid" data-tip="' + esc(meta.def) + '"' +
            (matchHeur ? ' style="outline:2px solid #000;outline-offset:1px"' : '') + '>' + hh.id.toUpperCase() +
            '</span><span class="hname">' + esc(meta.pt) + '</span>' + sevHtml + '</div>';
        }).join("") + '</div>');
    }

    if (cl.observacoes && String(cl.observacoes).trim()) {
      fields += field("Observações", '<p class="obs">' + esc(cl.observacoes) + '</p>');
    }

    return '<div class="ficha">' + fields + '</div>';

    function field(lab, inner) {
      return '<div class="df-field"><span class="df-lab">' + esc(lab) + '</span>' + inner + '</div>';
    }
  }

  /* ------------------------------ lightbox ------------------------------ */
  var lbIndex = -1;

  function lightboxHtml() {
    return '<div class="dlb" id="dlb">' +
      '<div class="dlb-top"><div class="dlb-meta" id="dlbMeta"></div>' +
      '<button class="dlb-close" data-act="dlb-close" aria-label="Fechar">✕</button></div>' +
      '<div class="dlb-stage">' +
        '<button class="dlb-nav dlb-prev" data-act="dlb-prev" aria-label="Anterior">‹</button>' +
        '<img class="dlb-img" id="dlbImg" alt="">' +
        '<button class="dlb-nav dlb-next" data-act="dlb-next" aria-label="Próxima">›</button>' +
      '</div>' +
      '<div class="dlb-cap" id="dlbCap"></div>' +
    '</div>';
  }

  function isLightboxOpen() {
    var lb = document.getElementById("dlb");
    return !!(lb && lb.classList.contains("is-open"));
  }

  function openLightbox(idx) {
    if (!detailList.length) return;
    lbIndex = idx;
    updateLightbox();
    document.getElementById("dlb").classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  function updateLightbox() {
    var rec = detailList[lbIndex];
    if (!rec) return;
    var s = rec.step;
    document.getElementById("dlbImg").src = s.image ? BASE + s.image : "";
    document.getElementById("dlbImg").alt = s.title || "";
    document.getElementById("dlbMeta").innerHTML =
      '<b>' + esc(rec.platformName) + '</b><span class="sep">·</span><span>' + esc(rec.flowName) +
      '</span><span class="count">' + (lbIndex + 1) + " / " + detailList.length + '</span>';
    document.getElementById("dlbCap").textContent = s.title || "";
  }

  function closeLightbox() {
    var lb = document.getElementById("dlb");
    if (lb) lb.classList.remove("is-open");
    // se a gaveta seguir aberta, mantém o scroll travado
    if (!document.getElementById("dd") || !document.getElementById("dd").classList.contains("is-open")) {
      document.body.style.overflow = "";
    }
  }

  function lbStep(d) {
    if (!detailList.length) return;
    lbIndex = (lbIndex + d + detailList.length) % detailList.length;
    updateLightbox();
  }

  /* ----------------------------- section util --------------------------- */
  function section(title, hint, inner) {
    var hintHtml = /^</.test(hint || "") ? hint : '<span class="hint">' + (hint || "") + '</span>';
    return '<section class="section"><div class="section-head"><h2>' + esc(title) + '</h2>' +
      hintHtml + '</div>' + inner + '</section>';
  }

  /* ------------------------------ tooltips ------------------------------ */
  var tipEl = null;
  function bindTooltips() {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "dash-tip";
      document.body.appendChild(tipEl);
    }
  }

  function showTip(target, x, y) {
    var txt = target.getAttribute("data-tip");
    if (!txt) { hideTip(); return; }
    tipEl.textContent = txt;
    tipEl.style.opacity = "1";
    var pad = 14;
    var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var left = Math.min(x + pad, window.innerWidth - w - 8);
    var top = y + pad + h > window.innerHeight ? y - h - pad : y + pad;
    tipEl.style.left = Math.max(8, left) + "px";
    tipEl.style.top = Math.max(8, top) + "px";
  }
  function hideTip() { if (tipEl) tipEl.style.opacity = "0"; }

  /* ------------------------------- eventos ------------------------------ */
  function onClick(e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var act = t.getAttribute("data-act");
    var val = t.getAttribute("data-val");

    if (act === "platform") {
      if (state.platform === val) return;
      state.platform = val;
      state.flow = "all";
      render();
    } else if (act === "jump") {
      var sec = document.getElementById(t.getAttribute("data-target"));
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (act === "drill") {
      drillFromTarget(t);
    } else if (act === "dd-close") {
      closeDrawer();
    } else if (act === "mapping") {
      if (typeof window.DASHBOARD_OPEN_MAPPING === "function") {
        window.DASHBOARD_OPEN_MAPPING(t.getAttribute("data-flow"));
      }
    } else if (act === "zoom") {
      openLightbox(parseInt(t.getAttribute("data-idx"), 10));
    } else if (act === "dlb-close") {
      closeLightbox();
    } else if (act === "dlb-prev") {
      lbStep(-1);
    } else if (act === "dlb-next") {
      lbStep(1);
    }
  }

  function onChange(e) {
    if (e.target.id === "flowSelect") {
      state.flow = e.target.value;
      rerenderMain();
    }
  }

  function onKey(e) {
    if (isLightboxOpen()) {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft") lbStep(-1);
      else if (e.key === "ArrowRight") lbStep(1);
      return;
    }
    var dd = document.getElementById("dd");
    if (dd && dd.classList.contains("is-open") && e.key === "Escape") closeDrawer();
  }

  function onMove(e) {
    var t = e.target.closest("[data-tip]");
    if (t) showTip(t, e.clientX, e.clientY); else hideTip();
  }

  /* -------------------------------- init -------------------------------- */
  function init() {
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousemove", onMove);
    // clicar no fundo do palco do lightbox fecha o lightbox
    document.addEventListener("click", function (e) {
      if (e.target.classList && e.target.classList.contains("dlb-stage")) closeLightbox();
    });

    load().then(render).catch(function (err) {
      var app = document.getElementById("app");
      if (app) app.innerHTML =
        '<div class="wrap"><div class="empty-state">Falha ao carregar os dados de análise.<br>' +
        esc(err && err.message ? err.message : err) + '</div></div>';
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
