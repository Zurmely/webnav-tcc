/* ============================================================================
   PAINEL DE ANÁLISE DE DADOS — padrões deceptivos em apps de apostas
   ----------------------------------------------------------------------------
   View autônoma e isolada. Lê os mesmos dados do site público
   (../data/{plataforma}/...) e a mesma taxonomia compartilhada
   (../js/checklist-data.js → window.CHECKLIST_TAXONOMY). Não depende de React
   nem altera nada do app principal; é referenciada via <iframe> na aba
   "Análise de dados" do webnav-tcc.

   Os dados analíticos vêm do campo `checklist` de cada passo:
     checklist.tipos        → tipos de Brignull (16)
     checklist.gray         → categorias de Gray et al. (5)
     checklist.heuristicas  → heurísticas de Nielsen violadas + gravidade (0–4)
     checklist.observacoes  → comentário livre
   O campo `darkPatterns` (texto livre) também é tratado como comentário.
   ========================================================================== */
(function () {
  "use strict";

  var BASE = window.DASHBOARD_BASE || "../";
  var PLATFORM_IDS = ["bet365", "betano", "superbet"];

  var TAX = window.CHECKLIST_TAXONOMY || {};
  var brById = TAX.brignullById || {};
  var grById = TAX.grayById || {};
  var nById = TAX.nielsenById || {};
  var sevByVal = TAX.severityByValue || {};
  var BRIGNULL = TAX.brignull || [];
  var GRAY = TAX.gray || [];
  var NIELSEN = TAX.nielsen || [];

  // Descrição neutra de cada plataforma (contexto editorial para a "introdução").
  var PLATFORM_INTRO = {
    bet365:
      "Operadora global de origem britânica, reconhecida pelas apostas esportivas ao vivo e por um cassino online totalmente integrado à plataforma.",
    betano:
      "Marca com forte presença no Brasil, patrocinadora de clubes e competições, que combina apostas esportivas a um cassino completo de slots e jogos ao vivo.",
    superbet:
      "Operadora em rápida expansão no mercado brasileiro, com ampla oferta de apostas esportivas e jogos de cassino, incluindo os populares “crash games” e “slots”."
  };

  var MODEL = null; // { platforms: [{id,name,flows:[{id,name,steps:[...]}]}] }

  var state = {
    platform: "all",
    flow: "all",
    tab: "overview",      // overview | detailed
    heatView: "tipos",    // tipos | gray | heur
    onlyAnnotated: true
  };

  var detailList = []; // passos atualmente exibidos na visão detalhada (para o lightbox)

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
  // Retorna a lista plana de passos conforme o filtro atual, cada um anotado
  // com a plataforma e o fluxo de origem.
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
      tipoTotal: 0
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
      (cl.gray || []).forEach(function (id) { a.gray[id] = (a.gray[id] || 0) + 1; });
      (cl.heuristicas || []).forEach(function (h) {
        if (!h || !h.id) return;
        a.heur[h.id] = (a.heur[h.id] || 0) + 1;
        if (typeof h.sev === "number") {
          a.sevAll.push(h.sev);
          if (h.sev >= 0 && h.sev <= 4) a.sevDist[h.sev]++;
          (a.heurSev[h.id] = a.heurSev[h.id] || []).push(h.sev);
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

  // Fluxo (em todas as plataformas, ou na filtrada) com mais ocorrências de tipos.
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
    function h(x) { return [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)]; }
    var ca = h(a), cb = h(b);
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
    app.innerHTML =
      '<div class="wrap">' +
        (window.DASHBOARD_INLINE ? "" : headerHtml()) +
        (window.DASHBOARD_INLINE ? "" : filterbarHtml()) +
        '<div id="main">' + (state.tab === "overview" ? overviewHtml() : detailedHtml()) + '</div>' +
      '</div>' +
      lightboxHtml();
    if (window.DASHBOARD_INLINE) renderNav();
    bindTooltips();
  }

  function rerenderMain() {
    document.getElementById("main").innerHTML =
      state.tab === "overview" ? overviewHtml() : detailedHtml();
    if (window.DASHBOARD_INLINE) renderNav();
    bindTooltips();
  }

  function renderNav() {
    var el = document.getElementById("dashFilterNav");
    if (!el) return;
    el.innerHTML = navControlsHtml();
  }

  function navControlsHtml() {
    var pills = '<button class="pill' + (state.platform === "all" ? " is-active" : "") +
      '" data-act="platform" data-val="all">Todas</button>';
    MODEL.platforms.forEach(function (p) {
      pills += '<button class="pill' + (state.platform === p.id ? " is-active" : "") +
        '" data-act="platform" data-val="' + p.id + '">' + esc(p.name) + '</button>';
    });
    var flowDisabled = state.platform === "all";
    var flowOpts = '<option value="all">Todos os fluxos</option>';
    if (!flowDisabled) {
      var plat = MODEL.platforms.find(function (p) { return p.id === state.platform; });
      (plat ? plat.flows : []).forEach(function (f) {
        var n = 0;
        f.steps.forEach(function (s) { if (stepAnnotated(s)) n++; });
        var lbl = esc(f.name) + (n ? " (" + n + ")" : "");
        flowOpts += '<option value="' + f.id + '"' + (state.flow === f.id ? " selected" : "") + '>' + lbl + '</option>';
      });
    }
    return '<div class="fgroup"><span class="flabel">Plataforma</span><div class="pills">' + pills + '</div></div>' +
      '<div class="fgroup"><span class="flabel">Fluxo</span>' +
      '<select class="fselect" id="flowSelect"' + (flowDisabled ? " disabled" : "") + '>' + flowOpts + '</select>' +
      '</div>' +
      '<div class="seg" style="margin-left:auto">' +
      '<button data-act="tab" data-val="overview"' + (state.tab === "overview" ? ' class="is-active"' : "") + '>Visão geral</button>' +
      '<button data-act="tab" data-val="detailed"' + (state.tab === "detailed" ? ' class="is-active"' : "") + '>Análise detalhada</button>' +
      '</div>';
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
        'Filtre por plataforma e fluxo e alterne entre a visão geral e a análise detalhada.</p>' +
        '<span class="status"><span class="dot live"></span>' +
        annotated + ' de ' + totalSteps + ' telas anotadas · dados ao vivo de <code>../data</code></span>' +
      '</header>';
  }

  /* ----------------------------- filter bar ----------------------------- */
  function filterbarHtml() {
    var pills = '<button class="pill' + (state.platform === "all" ? " is-active" : "") +
      '" data-act="platform" data-val="all">Todas</button>';
    MODEL.platforms.forEach(function (p) {
      pills += '<button class="pill' + (state.platform === p.id ? " is-active" : "") +
        '" data-act="platform" data-val="' + p.id + '">' + esc(p.name) + '</button>';
    });

    var flowDisabled = state.platform === "all";
    var flowOpts = '<option value="all">Todos os fluxos</option>';
    if (!flowDisabled) {
      var plat = MODEL.platforms.find(function (p) { return p.id === state.platform; });
      (plat ? plat.flows : []).forEach(function (f) {
        var n = 0;
        f.steps.forEach(function (s) { if (stepAnnotated(s)) n++; });
        var lbl = esc(f.name) + (n ? " (" + n + ")" : "");
        flowOpts += '<option value="' + f.id + '"' + (state.flow === f.id ? " selected" : "") + '>' + lbl + '</option>';
      });
    }

    return '' +
      '<div class="filterbar">' +
        '<div class="fgroup"><span class="flabel">Plataforma</span><div class="pills">' + pills + '</div></div>' +
        '<div class="fgroup"><span class="flabel">Fluxo</span>' +
          '<select class="fselect" id="flowSelect"' + (flowDisabled ? " disabled" : "") + '>' + flowOpts + '</select>' +
        '</div>' +
        '<div class="seg">' +
          '<button data-act="tab" data-val="overview"' + (state.tab === "overview" ? ' class="is-active"' : "") + '>Visão geral</button>' +
          '<button data-act="tab" data-val="detailed"' + (state.tab === "detailed" ? ' class="is-active"' : "") + '>Análise detalhada</button>' +
        '</div>' +
      '</div>';
  }

  /* ============================ OVERVIEW ============================ */
  function overviewHtml() {
    var recs = collectSteps();
    var agg = aggregate(recs);
    return statCardsHtml(agg) +
      introSectionHtml() +
      findingsHtml(agg) +
      heatmapSectionHtml() +
      chartsSectionHtml(agg);
  }

  function statCardsHtml(agg) {
    var distinctTipos = Object.keys(agg.tipos).length;
    var avgSev = avg(agg.sevAll);
    return '' +
      '<div class="stat-cards">' +
        card(agg.annotated + '<span class="of"> / ' + agg.steps + '</span>', "Telas anotadas", "no escopo selecionado") +
        card(String(agg.tipoTotal), "Ocorrências de padrões", distinctTipos + " tipos distintos catalogados") +
        card(String(Object.keys(agg.heur).length), "Heurísticas violadas", agg.sevAll.length + " violações registradas") +
        card(agg.sevAll.length ? fnum(avgSev) : "—", "Gravidade média", "escala de Nielsen (0–4)") +
      '</div>';
    function card(num, lbl, sub) {
      return '<div class="stat-card"><div class="num">' + num + '</div>' +
        '<div class="lbl">' + lbl + '</div><div class="sub">' + sub + '</div></div>';
    }
  }

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
      var topTxt = top && brById[top[0]]
        ? '<span class="intro-top">Padrão mais frequente: <b>' + esc(brById[top[0]].pt) + '</b> · ' + top[1] + ' ocorrências</span>'
        : '<span class="intro-top">Sem padrões catalogados neste recorte.</span>';
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

  function findingsHtml(agg) {
    var items = [];
    if (agg.tipoTotal === 0) {
      items.push("Nenhuma ocorrência de padrão deceptivo foi catalogada no recorte selecionado.");
    } else {
      var top = topEntry(agg.tipos);
      if (top && brById[top[0]]) {
        items.push("O tipo mais recorrente é <b>" + esc(brById[top[0]].pt) + "</b> (<i>" +
          esc(brById[top[0]].en) + "</i>), com <b>" + top[1] + "</b> ocorrências de um total de " +
          agg.tipoTotal + ".");
      }
      var tg = topEntry(agg.gray);
      if (tg && grById[tg[0]]) {
        items.push("Na taxonomia de Gray <i>et al.</i>, predomina a categoria <b>" +
          esc(grById[tg[0]].pt) + "</b> (" + tg[1] + " registros).");
      }
      var th = topEntry(agg.heur);
      if (th && nById[th[0]]) {
        var sa = avg(agg.heurSev[th[0]] || []);
        items.push("A heurística de Nielsen mais violada é a <b>" + th[0].toUpperCase() + " — " +
          esc(nById[th[0]].pt) + "</b>, com " + th[1] + " violações" +
          (sa ? " (gravidade média " + fnum(sa) + ")" : "") + ".");
      }
      if (agg.sevAll.length) {
        items.push("A gravidade média das violações de usabilidade é <b>" + fnum(avg(agg.sevAll)) +
          "</b> na escala de Nielsen (0–4), indicando problemas entre <i>menores</i> e <i>maiores</i>.");
      }
      var tf = topFlow(state.platform);
      if (tf) {
        items.push("O fluxo com maior concentração de padrões é <b>" + esc(tf.flow.name) +
          "</b> (" + esc(tf.platform.name) + "), com " + tf.n + " ocorrências.");
      }
    }
    return section("Principais achados", "Síntese gerada a partir dos dados filtrados",
      '<div class="findings"><ul><li>' + items.join("</li><li>") + '</li></ul></div>');
  }

  /* ------------------------------ heatmap ------------------------------- */
  function heatmapSectionHtml() {
    var tools = '<div class="heat-tools">' +
      heatBtn("tipos", "Tipos (Brignull)") +
      heatBtn("gray", "Categorias (Gray)") +
      heatBtn("heur", "Heurísticas (Nielsen)") +
      '</div>';
    return section("Mapa de calor", tools, heatTableHtml());

    function heatBtn(v, lbl) {
      return '<button data-act="heat" data-val="' + v + '"' +
        (state.heatView === v ? ' class="is-active"' : "") + '>' + lbl + '</button>';
    }
  }

  // Linhas = itens da taxonomia escolhida. Colunas = plataformas (quando "Todas")
  // ou os fluxos com anotações da plataforma selecionada.
  function heatTableHtml() {
    var rows, getMeta;
    if (state.heatView === "tipos") { rows = BRIGNULL; getMeta = function (it) { return { id: it.id, pt: it.pt, en: it.en }; }; }
    else if (state.heatView === "gray") { rows = GRAY; getMeta = function (it) { return { id: it.id, pt: it.pt, en: it.en }; }; }
    else { rows = NIELSEN; getMeta = function (it) { return { id: it.id, pt: it.id.toUpperCase() + " · " + it.pt, en: it.en }; }; }

    var key = state.heatView === "tipos" ? "tipos" : state.heatView === "gray" ? "gray" : "heur";

    // colunas
    var cols = [];
    if (state.platform === "all") {
      cols = MODEL.platforms.map(function (p) { return { id: p.id, name: p.name, agg: aggregate(collectSteps({ platform: p.id, flow: "all" })) }; });
    } else {
      var plat = MODEL.platforms.find(function (p) { return p.id === state.platform; });
      (plat ? plat.flows : []).forEach(function (f) {
        var agg = aggregate(collectSteps({ platform: plat.id, flow: f.id }));
        if (agg.tipoTotal > 0 || Object.keys(agg.heur).length > 0 || Object.keys(agg.gray).length > 0) {
          cols.push({ id: f.id, name: f.name, agg: agg });
        }
      });
    }

    if (!cols.length) {
      return '<div class="empty-state">Sem dados para o mapa de calor neste recorte.</div>';
    }

    function val(agg, rowId) {
      return (key === "tipos" ? agg.tipos : key === "gray" ? agg.gray : agg.heur)[rowId] || 0;
    }

    // máximo para normalizar a cor
    var max = 0;
    rows.forEach(function (it) { cols.forEach(function (c) { max = Math.max(max, val(c.agg, it.id)); }); });
    max = max || 1;

    var head = '<thead><tr><th class="rowhead">' +
      (state.heatView === "tipos" ? "Tipo (Brignull)" : state.heatView === "gray" ? "Categoria (Gray)" : "Heurística (Nielsen)") +
      '</th>';
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
        tds += '<td class="cell" style="background:' + heatColor(t) + ';color:' + heatText(t) + '" ' +
          'data-tip="' + esc(meta.pt) + ' · ' + esc(c.name) + ': ' + v + '">' + v + '</td>';
      });
      if (rowTotal === 0 && state.heatView !== "heur") {
        // mantém a linha visível mesmo zerada para Brignull/Gray (referência da taxonomia)
      }
      bodyRows += '<tr><th class="rowhead" data-tip="' + esc(it.def || "") + '">' + esc(meta.pt) +
        '<span class="en">' + esc(meta.en) + '</span></th>' + tds +
        '<td class="total">' + rowTotal + '</td></tr>';
    });

    var grand = colTotals.reduce(function (a, b) { return a + b; }, 0);
    var totalRow = '<tr class="totalrow"><th class="rowhead">Total</th>';
    colTotals.forEach(function (t) { totalRow += '<td>' + t + '</td>'; });
    totalRow += '<td class="total">' + grand + '</td></tr>';

    return '<div class="table-scroll"><table class="heat">' + head + '<tbody>' + bodyRows + totalRow + '</tbody></table></div>' +
      '<div class="legend"><span>Menos frequente</span><span class="bar"></span><span>Mais frequente</span>' +
      '<span style="margin-left:auto">Colunas: ' + (state.platform === "all" ? "plataformas" : "fluxos com anotações") + '</span></div>';
  }

  /* ------------------------------- charts ------------------------------- */
  function chartsSectionHtml(agg) {
    return section("Distribuições", "Frequência por taxonomia e gravidade",
      '<div class="charts-grid">' +
        barChart("Tipos de padrão (Brignull)", "Ocorrências por tipo catalogado", agg.tipos, brById, false) +
        barChart("Categorias de Gray et al.", "Agrupamento de alto nível", agg.gray, grById, false) +
        heurChart(agg) +
        sevChart(agg) +
      '</div>');
  }

  function barChart(title, sub, counts, byId, sev) {
    var entries = Object.keys(counts).map(function (id) { return [id, counts[id]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    if (!entries.length) return chartCard(title, sub, '<div class="empty-state" style="padding:30px">Sem dados.</div>');
    var max = entries[0][1] || 1;
    var bars = entries.map(function (e) {
      var meta = byId[e[0]] || { pt: e[0], en: "" };
      return barRow(meta.pt, meta.en, e[1], e[1] / max, sev);
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
      return barRow(meta.pt, sub, e[1], e[1] / max, true);
    }).join("");
    return chartCard("Heurísticas de Nielsen", "Heurísticas violadas + gravidade média", '<div class="bars">' + bars + '</div>');
  }

  function barRow(name, en, val, frac, sev) {
    return '<div class="bar-row"><div class="bar-label"><span class="name">' + esc(name) +
      (en ? ' <span class="en">' + esc(en) + '</span>' : "") + '</span>' +
      '<span class="val">' + val + '</span></div>' +
      '<div class="bar-track"><div class="bar-fill' + (sev ? " sev" : "") +
      '" style="width:' + Math.max(2, Math.round(frac * 100)) + '%"></div></div></div>';
  }

  function sevChart(agg) {
    var max = Math.max.apply(null, agg.sevDist.concat([1]));
    var cols = agg.sevDist.map(function (cnt, v) {
      var meta = sevByVal[v] || { label: "" };
      var h = Math.round((cnt / max) * 100);
      return '<div class="sevcol">' +
        '<div class="col" style="height:' + h + '%" data-tip="Gravidade ' + v + " — " + esc(meta.label) + ': ' + cnt + ' violações">' +
        (cnt ? '<span class="cnt">' + cnt + '</span>' : "") + '</div>' +
        '<div class="sevn">' + v + '</div><div class="sevl">' + esc(meta.label || "") + '</div></div>';
    }).join("");
    var sub = agg.sevAll.length ? agg.sevAll.length + " violações · escala 0–4" : "Sem violações no recorte";
    return chartCard("Gravidade (Nielsen)", sub, '<div class="sevdist">' + cols + '</div>');
  }

  function chartCard(title, sub, inner) {
    return '<div class="chart-card"><h3>' + esc(title) + '</h3><p class="csub">' + esc(sub) + '</p>' + inner + '</div>';
  }

  /* ============================ DETAILED ============================ */
  function detailedHtml() {
    var recs = collectSteps();
    detailList = recs.filter(function (r) { return state.onlyAnnotated ? stepAnnotated(r.step) : true; });

    var intro = '<div class="detail-intro">' +
      '<p>Comentários e fichas de catalogação registrados em cada tela. Clique na imagem para ampliá-la.</p>' +
      '<label class="toggle"><input type="checkbox" id="onlyAnnotated"' + (state.onlyAnnotated ? " checked" : "") + '>' +
      'Somente telas anotadas</label></div>';

    if (!detailList.length) {
      return intro + '<div class="empty-state">Nenhuma tela ' +
        (state.onlyAnnotated ? "anotada " : "") + 'neste recorte. Ajuste os filtros acima.</div>';
    }

    // agrupa por plataforma › fluxo
    var html = "", lastKey = "";
    detailList.forEach(function (rec, idx) {
      var key = rec.platformId + "/" + rec.flowId;
      if (key !== lastKey) {
        html += '<div class="det-group-head">' + esc(rec.platformName) + ' &rsaquo; ' + esc(rec.flowName) + '</div>';
        lastKey = key;
      }
      html += detailCard(rec, idx);
    });
    return intro + '<div class="det-list">' + html + '</div>';
  }

  function detailCard(rec, idx) {
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
        fichaHtml(s.checklist) +
      '</div></div>';
  }

  function fichaHtml(cl) {
    if (!clHasContent(cl)) return "";
    var fields = "";

    var tipos = (cl.tipos || []).map(function (id) { return brById[id]; }).filter(Boolean);
    if (tipos.length) {
      fields += field("Tipo de padrão deceptivo (Brignull)",
        '<div class="chips">' + tipos.map(function (it) {
          return '<span class="chip" data-tip="' + esc(it.pt + " — " + it.def) + '">' + esc(it.en) + '</span>';
        }).join("") + '</div>');
    }

    var grays = (cl.gray || []).map(function (id) { return grById[id]; }).filter(Boolean);
    if (grays.length) {
      fields += field("Categoria (Gray et al.)",
        '<div class="chips">' + grays.map(function (it) {
          return '<span class="chip gray-chip" data-tip="' + esc(it.pt + " — " + it.def) + '">' + esc(it.en) + '</span>';
        }).join("") + '</div>');
    }

    var heurs = (cl.heuristicas || []).filter(function (h) { return h && nById[h.id]; });
    if (heurs.length) {
      fields += field("Heurísticas de Nielsen violadas",
        '<div class="heurs">' + heurs.map(function (h) {
          var meta = nById[h.id];
          var sev = (typeof h.sev === "number") ? sevByVal[h.sev] : null;
          var sevHtml = sev
            ? '<span class="hsev" data-tip="' + esc(sev.def) + '"><span class="sevbox" style="background:' +
                heatColor(h.sev / 4) + ';color:' + heatText(h.sev / 4) + '">' + sev.value + '</span>' +
                '<span class="sevlab">Gravidade ' + sev.value + " · " + esc(sev.label) + '</span></span>'
            : '<span class="sevlab" style="font-style:italic">gravidade não avaliada</span>';
          return '<div class="heur"><span class="hid" data-tip="' + esc(meta.def) + '">' + h.id.toUpperCase() +
            '</span><span class="hname">' + esc(meta.pt) + '</span>' + sevHtml + '</div>';
        }).join("") + '</div>');
    }

    if (cl.observacoes && String(cl.observacoes).trim()) {
      fields += field("Observações", '<p class="obs">' + esc(cl.observacoes) + '</p>');
    }

    return '<div class="ficha">' + fields + '</div>';

    function field(lab, inner) {
      return '<div class="ficha-field"><span class="ficha-lab">' + esc(lab) + '</span>' + inner + '</div>';
    }
  }

  /* ------------------------------ lightbox ------------------------------ */
  var lbIndex = -1;

  function lightboxHtml() {
    return '<div class="lb" id="lb">' +
      '<div class="lb-top"><div class="lb-meta" id="lbMeta"></div>' +
      '<button class="lb-close" data-act="lb-close" aria-label="Fechar">✕</button></div>' +
      '<div class="lb-stage">' +
        '<button class="lb-nav lb-prev" data-act="lb-prev" aria-label="Anterior">‹</button>' +
        '<img class="lb-img" id="lbImg" alt="">' +
        '<button class="lb-nav lb-next" data-act="lb-next" aria-label="Próxima">›</button>' +
      '</div>' +
      '<div class="lb-cap" id="lbCap"></div>' +
    '</div>';
  }

  function openLightbox(idx) {
    if (!detailList.length) return;
    lbIndex = idx;
    updateLightbox();
    document.getElementById("lb").classList.add("is-open");
  }

  function updateLightbox() {
    var rec = detailList[lbIndex];
    if (!rec) return;
    var s = rec.step;
    document.getElementById("lbImg").src = s.image ? BASE + s.image : "";
    document.getElementById("lbImg").alt = s.title || "";
    document.getElementById("lbMeta").innerHTML =
      '<b>' + esc(rec.platformName) + '</b><span class="sep">·</span><span>' + esc(rec.flowName) +
      '</span><span class="count">' + (lbIndex + 1) + " / " + detailList.length + '</span>';
    document.getElementById("lbCap").textContent = s.title || "";
  }

  function closeLightbox() { document.getElementById("lb").classList.remove("is-open"); }
  function lbStep(d) {
    if (!detailList.length) return;
    lbIndex = (lbIndex + d + detailList.length) % detailList.length;
    updateLightbox();
  }

  /* ----------------------------- section util --------------------------- */
  function section(title, hint, inner) {
    return '<section class="section"><div class="section-head"><h2>' + esc(title) + '</h2>' +
      '<span class="hint">' + (hint || "") + '</span></div>' + inner + '</section>';
  }

  /* ------------------------------ tooltips ------------------------------ */
  var tipEl = null;
  function bindTooltips() {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.style.cssText = "position:fixed;z-index:300;max-width:300px;background:#000;color:#fff;" +
        "font-size:12.5px;line-height:1.45;padding:8px 11px;pointer-events:none;" +
        "opacity:0;transition:opacity .12s ease;font-family:inherit;";
      document.body.appendChild(tipEl);
    }
  }

  function showTip(target, x, y) {
    var txt = target.getAttribute("data-tip");
    if (!txt) return;
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

  /* ------------------------------- events ------------------------------- */
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
    } else if (act === "tab") {
      if (state.tab === val) return;
      state.tab = val;
      render();
    } else if (act === "heat") {
      if (state.heatView === val) return;
      state.heatView = val;
      rerenderMain();
    } else if (act === "zoom") {
      openLightbox(parseInt(t.getAttribute("data-idx"), 10));
    } else if (act === "lb-close") {
      closeLightbox();
    } else if (act === "lb-prev") {
      lbStep(-1);
    } else if (act === "lb-next") {
      lbStep(1);
    }
  }

  function onChange(e) {
    if (e.target.id === "flowSelect") {
      state.flow = e.target.value;
      rerenderMain();
    } else if (e.target.id === "onlyAnnotated") {
      state.onlyAnnotated = e.target.checked;
      rerenderMain();
    }
  }

  function onKey(e) {
    var lb = document.getElementById("lb");
    if (!lb || !lb.classList.contains("is-open")) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") lbStep(-1);
    else if (e.key === "ArrowRight") lbStep(1);
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
    // fecha lightbox ao clicar no fundo do palco
    document.addEventListener("click", function (e) {
      if (e.target.classList && e.target.classList.contains("lb-stage")) closeLightbox();
    });

    load().then(render).catch(function (err) {
      document.getElementById("app").innerHTML =
        '<div class="wrap"><div class="empty-state">Falha ao carregar os dados de análise.<br>' +
        esc(err && err.message ? err.message : err) + '</div></div>';
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
