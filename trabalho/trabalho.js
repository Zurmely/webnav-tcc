/* ============================================================================
   TRABALHO — visualizador do TCC dentro do WebNav
   ----------------------------------------------------------------------------
   Renderiza o markdown vivo do trabalho (projeto-final/<arquivo>.md) com
   navegação por capítulos/subcapítulos e resolução de figuras:
     • figura exportada para PNG  → renderiza a imagem
     • figura sem PNG             → renderiza a marca [FIGURA ...] inline

   Estratégia de fontes (funciona local E serverless no GitHub Pages):
     1) caminho VIVO  (servidor na raiz do TCC, ex.: python -m http.server)
        → edições no .md aparecem em tempo real (polling).
     2) cópia EMBUTIDA (content/ + figuras/) versionada no repo do WebNav
        → usada quando o caminho vivo não existe (tcc.zurmely.com).

   Nada aqui edita o .md de origem.
   ========================================================================== */
(function () {
  "use strict";

  /* ----------------------------- CONFIG ---------------------------------- */
  // Prefix for embedded paths when this script is loaded from outside trabalho/.
  var B = window.TRABALHO_BASE || "";

  // Fontes do markdown, em ordem de preferência. A primeira que responder vence.
  // Para trocar o arquivo dado de trabalho (datado), ajuste a 1ª entrada.
  var MD_SOURCES = [
    "../../../projeto-final/20-06.md", // VIVO (servidor na raiz do TCC)
    B + "content/trabalho.md"          // EMBUTIDO (GitHub Pages)
  ];
  // Bases onde procurar figura_NN.png, na mesma ordem de preferência.
  var PNG_BASES = [
    "../../../projeto-final/figuras/output/png/", // VIVO
    B + "figuras/"                                // EMBUTIDO
  ];
  var POLL_MS = 1500; // intervalo de checagem do markdown vivo

  /* --------------------------- DOM handles ------------------------------- */
  var els = {
    view: document.getElementById("view"),
    sideNav: document.getElementById("sideNav"),
    scrollArea: document.getElementById("scrollArea"),
    sidebar: document.getElementById("sidebar"),
    scrim: document.getElementById("scrim"),
    hamburger: document.getElementById("hamburger"),
    drawerClose: document.getElementById("drawerClose"),
    topbarTitle: document.getElementById("topbarTitle"),
    liveBadge: document.getElementById("liveBadge"),
    liveBadgeText: document.getElementById("liveBadgeText"),
    fnTip: document.getElementById("fnTip"),
    lightbox: document.getElementById("lightbox"),
    lbImg: document.getElementById("lbImg"),
    lbCap: document.getElementById("lbCap"),
    lbClose: document.getElementById("lbClose"),
    chapterTabs: document.getElementById("chapterTabs"),
    secondaryNav: document.getElementById("secondaryNav")
  };

  /* ------------------------------ STATE ---------------------------------- */
  var state = {
    chapters: [],
    activeIndex: 0,
    resolvedMdUrl: null,        // URL que respondeu (para polling)
    pngBases: PNG_BASES.slice(), // bases de PNG efetivas (filtradas conforme a fonte)
    lastText: null,             // último markdown bruto (para detectar mudança)
    notesById: {},              // name -> HTML renderizado (tooltip do capítulo atual)
    figCacheBust: Date.now()
  };

  if (window.marked && typeof marked.use === "function") {
    marked.use({ gfm: true, breaks: false });
  }

  /* ----------------------------- UTILS ----------------------------------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/\n/g, " "); }

  function slug(s) {
    return String(s).toLowerCase()
      .normalize("NFD").replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
  }

  // Remove marcadores de ênfase/links de um título para uso como rótulo.
  function cleanHeading(s) {
    return String(s)
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [txt](url) -> txt
      .replace(/[*_`]+/g, "")                  // **bold** / *italic* / `code`
      .replace(/\s+/g, " ")
      .trim();
  }

  function inlineMd(s) {
    if (window.marked && typeof marked.parseInline === "function") {
      try { return marked.parseInline(String(s)); } catch (e) { /* fallthrough */ }
    }
    return escapeHtml(s);
  }

  function blockMd(s) {
    if (window.marked && typeof marked.parse === "function") {
      try { return marked.parse(String(s)); } catch (e) { /* fallthrough */ }
    }
    return "<p>" + escapeHtml(s) + "</p>";
  }

  /* --------------------- FETCH com cadeia de fallback -------------------- */
  function fetchFirst(urls, bust) {
    var i = 0;
    function attempt() {
      if (i >= urls.length) return Promise.reject(new Error("no-source"));
      var base = urls[i++];
      var url = bust ? base + (base.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now() : base;
      return fetch(url, { cache: "no-store" })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text().then(function (t) { return { base: base, text: t }; });
        })
        .catch(function () { return attempt(); });
    }
    return attempt();
  }

  /* ============================ PARSER ================================== */
  // Divide o markdown em capítulos (H1) e subcapítulos (H2/H3).
  function parseDocument(md) {
    md = String(md).replace(/\r\n?/g, "\n");
    var lines = md.split("\n");
    var headingRe = /^(#{1,6})[ \t]+(.*\S)\s*$/;

    var preLines = [];
    var chapters = [];
    var current = null;
    var started = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = line.match(headingRe);
      if (m && m[1].length === 1) {
        // novo capítulo (H1 não vazio)
        current = { headingRaw: m[2], bodyLines: [] };
        chapters.push(current);
        started = true;
        continue;
      }
      if (started) current.bodyLines.push(line);
      else preLines.push(line);
    }

    var out = [];

    // Capítulo sintético com os elementos pré-textuais (capa, resumo, sumário).
    if (preLines.join("").trim()) {
      out.push(makeChapter("Elementos Pré-Textuais", preLines, true));
    }
    chapters.forEach(function (c) {
      out.push(makeChapter(c.headingRaw, c.bodyLines, false));
    });

    // índice e ids únicos
    var seen = {};
    out.forEach(function (ch, idx) {
      ch.index = idx;
      var base = ch.id;
      while (seen[ch.id]) ch.id = base + "-" + idx;
      seen[ch.id] = true;
    });
    return out;
  }

  function makeChapter(headingRaw, bodyLines, isPre) {
    var title = cleanHeading(headingRaw);
    var numMatch = title.match(/^(\d+(?:\.\d+)*)\s+(.*)$/);
    var num = null, shortLabel = title;
    if (numMatch) { num = numMatch[1]; shortLabel = numMatch[2]; }

    // subcapítulos: H2/H3 dentro do corpo
    var subs = [];
    var headingRe = /^(#{2,3})[ \t]+(.*\S)\s*$/;
    var subSeen = {};
    bodyLines.forEach(function (ln) {
      var m = ln.match(headingRe);
      if (!m) return;
      var t = cleanHeading(m[2]);
      var id = "s-" + slug(t);
      while (subSeen[id]) id += "x";
      subSeen[id] = true;
      subs.push({ level: m[1].length, title: t, id: id });
    });

    return {
      id: isPre ? "pretextual" : slug(title),
      isPre: isPre,
      headingRaw: headingRaw,
      title: title,
      num: num,
      shortLabel: shortLabel,
      bodyLines: bodyLines,
      subs: subs
    };
  }

  /* ====================== RENDER do corpo (md->HTML) ==================== */
  function renderBody(chapter) {
    var body = chapter.bodyLines.join("\n");
    var notes = {};        // name -> raw text
    var order = {};        // name -> número (ordem de referência)
    var counter = 0;

    // 1) extrai definições de nota de rodapé: [^nome]: texto (até fim da linha)
    body = body.replace(/\[\^([^\]\s]+)\]:[ \t]*([^\n]*)/g, function (_, name, text) {
      notes[name] = (text || "").trim();
      return "";
    });

    // 2) referências de nota: [^nome] -> <sup>
    body = body.replace(/\[\^([^\]\s]+)\]/g, function (_, name) {
      if (!order[name]) order[name] = ++counter;
      var n = order[name];
      return '<sup class="fn-ref"><a id="fnref-' + escapeAttr(name) + '" href="#fn-' + escapeAttr(name) +
        '" data-fn="' + escapeAttr(name) + '">' + n + "</a></sup>";
    });

    // 3) figuras numeradas: [FIGURA figura_NN: descrição]
    body = body.replace(/\[FIGURA\s+(figura_\d+)\s*:\s*([^\]]+)\]/g, function (_, id, desc) {
      return figureHtml(id, desc.trim());
    });
    // 4) figuras sem id: [FIGURA: descrição]
    body = body.replace(/\[FIGURA\s*:\s*([^\]]+)\]/g, function (_, desc) {
      return figureHtml(null, desc.trim());
    });

    // 5) notas editoriais: [EXPLICAÇÃO: ...] / [EXPLICACAO: ...]
    body = body.replace(/\[EXPLICA[ÇC][ÃA]O\s*:\s*([^\]]+)\]/g, function (_, t) {
      return '<aside class="ed-note"><span class="ed-note-tag">Explicação</span>' + inlineMd(t.trim()) + "</aside>";
    });

    // 6) (pré-textual) remove linhas do SUMÁRIO com âncoras de Google Docs
    if (chapter.isPre) {
      body = body.replace(/^\s*\[[^\]]*\]\(#(?:_heading|bookmark)=[^)]*\)\s*$/gm, "");
    }

    // 7) markdown -> HTML
    var html = blockMd(body);

    // 8) seção de notas de rodapé do capítulo + mapa para tooltips
    state.notesById = {};
    var refNames = Object.keys(order).sort(function (a, b) { return order[a] - order[b]; });
    if (refNames.length) {
      var items = refNames.map(function (name) {
        var rendered = inlineMd(notes[name] != null ? notes[name] : "");
        state.notesById[name] = rendered;
        return '<li id="fn-' + escapeAttr(name) + '"><a class="fn-back" href="#fnref-' +
          escapeAttr(name) + '" title="Voltar ao texto">↩</a>' + rendered + "</li>";
      }).join("");
      html += '<section class="fn-notes"><p class="fn-notes-title">Notas</p><ol>' + items + "</ol></section>";
    }
    return html;
  }

  // HTML da figura. A resolução PNG-vs-marca é feita depois, no DOM.
  // Sem PNG, o cartão da marca já descreve a figura; a legenda "Figura N — …"
  // só é anexada quando a imagem é resolvida (ver resolveFigures).
  function figureHtml(id, desc) {
    if (!id) {
      // figura sem número: sempre marca inline
      return '<figure class="fig">' + markCardHtml(null, desc) + "</figure>";
    }
    var slot = '<div class="fig-slot is-loading" data-figura="' + escapeAttr(id) +
      '" data-desc="' + escapeAttr(desc) + '">resolvendo figura…</div>';
    return '<figure class="fig">' + slot + "</figure>";
  }

  // Cartão da marca inline (figura ainda não exportada para PNG).
  function markCardHtml(id, desc) {
    var mark = id ? "[FIGURA " + id + ": " + desc + "]" : "[FIGURA: " + desc + "]";
    var idTag = id
      ? '<span class="fig-mark-id">' + escapeHtml(id) + "</span>"
      : '<span class="fig-mark-id">sem número</span>';
    return '<div class="fig-mark">' +
      '<div class="fig-mark-head"><span class="fig-mark-badge">Figura · pendente</span>' + idTag + "</div>" +
      '<p class="fig-mark-desc">' + escapeHtml(mark) + "</p>" +
      "</div>";
  }

  /* ===================== Resolução de figuras (PNG) ==================== */
  function pngCandidates(id) {
    var n = id.replace(/^figura_/, "");
    var padded = "figura_" + (n.length < 2 ? ("0" + n) : n);
    var ids = id === padded ? [id] : [id, padded];
    var urls = [];
    state.pngBases.forEach(function (base) {
      ids.forEach(function (fid) { urls.push(base + fid + ".png"); });
    });
    return urls;
  }

  function probeImage(urls, bust, cb) {
    var i = 0;
    (function next() {
      if (i >= urls.length) return cb(null);
      var url = urls[i++];
      var im = new Image();
      im.onload = function () { (im.naturalWidth > 0) ? cb(url) : next(); };
      im.onerror = next;
      im.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + bust;
    })();
  }

  // Resolve (ou re-tenta) todas as figuras ainda não resolvidas como imagem.
  function resolveFigures(root) {
    var slots = root.querySelectorAll('.fig-slot[data-figura]:not(.is-image)');
    Array.prototype.forEach.call(slots, function (slot) {
      var id = slot.getAttribute("data-figura");
      var desc = slot.getAttribute("data-desc") || "";
      probeImage(pngCandidates(id), state.figCacheBust, function (okUrl) {
        if (okUrl) {
          slot.classList.remove("is-loading");
          slot.classList.add("is-image");
          slot.innerHTML = "";
          var img = document.createElement("img");
          img.className = "fig-img";
          img.src = okUrl;
          img.alt = "Figura " + parseInt(id.replace(/^figura_/, ""), 10);
          img.loading = "lazy";
          slot.appendChild(img);
          var n = parseInt(id.replace(/^figura_/, ""), 10);
          // legenda só para a imagem resolvida (evita duplicar a descrição do cartão)
          var fig = slot.parentNode;
          if (fig && !fig.querySelector(".fig-cap")) {
            var cap = document.createElement("figcaption");
            cap.className = "fig-cap";
            cap.innerHTML = '<span class="fig-label">Figura ' + n + "</span> — " + inlineMd(desc);
            fig.appendChild(cap);
          }
          slot.addEventListener("click", function () { openLightbox(okUrl, "Figura " + n + " — " + desc); });
        } else if (!slot.classList.contains("is-mark")) {
          slot.classList.remove("is-loading");
          slot.classList.add("is-mark");
          slot.innerHTML = markCardHtml(id, desc);
        }
      });
    });
  }

  /* =================== CHAPTER TABS (secondary nav) =================== */
  function buildChapterTabs() {
    if (!els.chapterTabs) return;
    els.chapterTabs.innerHTML = "";
    state.chapters.forEach(function (ch) {
      var btn = document.createElement("button");
      btn.className = "chap-tab" + (ch.index === state.activeIndex ? " is-active" : "");
      btn.setAttribute("data-index", ch.index);
      btn.textContent = ch.shortLabel || ch.title;
      btn.addEventListener("click", function () { selectChapter(ch.index, null); });
      els.chapterTabs.appendChild(btn);
    });
    /* scroll active tab into view */
    var active = els.chapterTabs.querySelector(".chap-tab.is-active");
    if (active && els.secondaryNav) active.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  /* ==================== TOC SIDEBAR (sub-chapters only) ================ */
  function buildSidebar() {
    var ch = state.chapters[state.activeIndex];
    els.sideNav.innerHTML = "";
    if (!ch) return;

    /* Chapter label at top of TOC panel */
    if (ch.title) {
      var label = document.createElement("span");
      label.className = "toc-chap-label";
      label.textContent = ch.num ? ch.num + "." : "Capítulo";
      var title = document.createElement("span");
      title.className = "toc-chap-title";
      title.textContent = ch.shortLabel || ch.title;
      els.sideNav.appendChild(label);
      els.sideNav.appendChild(title);
    }

    if (!ch.subs.length) return;
    var ul = document.createElement("ul");
    ul.className = "sub-list";
    ch.subs.forEach(function (s) {
      var li = document.createElement("li");
      var sbtn = document.createElement("button");
      sbtn.className = "sub-item" + (s.level === 3 ? " sub-item--l3" : "");
      sbtn.setAttribute("data-sub", s.id);
      sbtn.textContent = s.title;
      sbtn.addEventListener("click", function () { scrollToSub(s.id); closeDrawer(); });
      li.appendChild(sbtn);
      ul.appendChild(li);
    });
    els.sideNav.appendChild(ul);
  }

  /* =========== Keep scroll-area height filling viewport below nav ======= */
  function updateScrollAreaHeight() {
    if (window.innerWidth <= 960) {
      /* mobile: let page scroll naturally */
      els.scrollArea.style.height = "";
      if (els.sidebar) els.sidebar.style.height = "";
      return;
    }
    var secNavBottom = els.secondaryNav ? els.secondaryNav.getBoundingClientRect().bottom : 0;
    var remaining = window.innerHeight - secNavBottom;
    els.scrollArea.style.height = Math.max(remaining, 200) + "px";
    if (els.sidebar) els.sidebar.style.height = Math.max(remaining, 200) + "px";
  }

  /* ======================== RENDER do capítulo ========================= */
  function renderChapter(keepScroll) {
    var ch = state.chapters[state.activeIndex];
    if (!ch) return;

    var prevTop = keepScroll ? els.scrollArea.scrollTop : 0;

    var kicker = ch.isPre ? "Capa, resumo & sumário"
      : (ch.num ? "Capítulo " + ch.num : "Seção");
    var titleText = ch.isPre ? "Elementos Pré-Textuais" : (ch.shortLabel || ch.title);

    var doc = document.createElement("div");
    doc.className = "doc";
    doc.innerHTML =
      '<header class="doc-head">' +
        '<p class="doc-kicker">' + escapeHtml(kicker) + "</p>" +
        '<h1 class="doc-title">' + escapeHtml(titleText) + "</h1>" +
        '<div class="doc-head-rule"></div>' +
      "</header>" +
      '<div class="prose">' + renderBody(ch) + "</div>";

    // ids nos H2/H3 (em ordem, casando com a lista de subcapítulos)
    var heads = doc.querySelectorAll(".prose h2, .prose h3");
    for (var i = 0; i < heads.length && i < ch.subs.length; i++) {
      heads[i].id = ch.subs[i].id;
    }

    // rodapé: capítulo anterior / próximo
    doc.appendChild(buildChapterFooter());

    els.view.innerHTML = "";
    els.view.appendChild(doc);

    els.topbarTitle.textContent = titleText;
    resolveFigures(doc);
    wireFootnotes(doc);

    els.scrollArea.scrollTop = keepScroll ? prevTop : 0;
    updateScrollSpy();
  }

  function buildChapterFooter() {
    var foot = document.createElement("div");
    foot.className = "doc-foot";
    var prev = state.chapters[state.activeIndex - 1];
    var next = state.chapters[state.activeIndex + 1];

    var p = document.createElement("button");
    p.className = "foot-btn foot-btn--prev";
    p.disabled = !prev;
    p.innerHTML = '<span class="foot-btn-dir">‹ Anterior</span><span class="foot-btn-title">' +
      (prev ? escapeHtml(prev.shortLabel || prev.title) : "—") + "</span>";
    if (prev) p.addEventListener("click", function () { selectChapter(state.activeIndex - 1, null); });

    var n = document.createElement("button");
    n.className = "foot-btn foot-btn--next";
    n.disabled = !next;
    n.innerHTML = '<span class="foot-btn-dir">Próximo ›</span><span class="foot-btn-title">' +
      (next ? escapeHtml(next.shortLabel || next.title) : "—") + "</span>";
    if (next) n.addEventListener("click", function () { selectChapter(state.activeIndex + 1, null); });

    foot.appendChild(p);
    foot.appendChild(n);
    return foot;
  }

  /* ========================= NAVEGAÇÃO ================================= */
  function selectChapter(index, subId) {
    if (index < 0 || index >= state.chapters.length) return;
    state.activeIndex = index;
    var ch = state.chapters[index];
    if (history.replaceState) history.replaceState(null, "", "#" + ch.id);
    buildSidebar();
    buildChapterTabs();
    renderChapter(false);
    if (subId) scrollToSub(subId);
  }

  function scrollToSub(id) {
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateScrollSpy() {
    var ch = state.chapters[state.activeIndex];
    if (!ch || !ch.subs.length) return;
    var areaTop = els.scrollArea.getBoundingClientRect().top;
    var activeId = ch.subs[0].id;
    for (var i = 0; i < ch.subs.length; i++) {
      var el = document.getElementById(ch.subs[i].id);
      if (!el) continue;
      if (el.getBoundingClientRect().top - areaTop <= 90) activeId = ch.subs[i].id;
      else break;
    }
    var items = els.sideNav.querySelectorAll(".sub-item");
    Array.prototype.forEach.call(items, function (it) {
      it.classList.toggle("is-active", it.getAttribute("data-sub") === activeId);
    });
  }

  /* ===================== Notas de rodapé (tooltip) ===================== */
  function wireFootnotes(root) {
    var refs = root.querySelectorAll("sup.fn-ref a[data-fn]");
    Array.prototype.forEach.call(refs, function (a) {
      a.addEventListener("mouseenter", function () {
        var html = state.notesById[a.getAttribute("data-fn")];
        if (!html) return;
        els.fnTip.innerHTML = html;
        var r = a.getBoundingClientRect();
        els.fnTip.classList.add("is-on");
        var tipW = Math.min(340, window.innerWidth - 24);
        var left = Math.min(Math.max(12, r.left), window.innerWidth - tipW - 12);
        els.fnTip.style.left = left + "px";
        els.fnTip.style.width = tipW + "px";
        var top = r.bottom + 8;
        if (top + els.fnTip.offsetHeight > window.innerHeight - 8) top = r.top - els.fnTip.offsetHeight - 8;
        els.fnTip.style.top = Math.max(8, top) + "px";
      });
      a.addEventListener("mouseleave", function () { els.fnTip.classList.remove("is-on"); });
    });
  }

  /* ============================ Lightbox =============================== */
  function openLightbox(src, cap) {
    els.lbImg.src = src;
    els.lbCap.textContent = cap || "";
    els.lightbox.classList.add("is-open");
  }
  function closeLightbox() { els.lightbox.classList.remove("is-open"); els.lbImg.src = ""; }

  /* ============================ Drawer ================================= */
  function openDrawer() { els.sidebar.classList.add("is-open"); els.scrim.classList.add("is-open"); }
  function closeDrawer() { els.sidebar.classList.remove("is-open"); els.scrim.classList.remove("is-open"); }

  /* ========================= Live reload ============================== */
  var badgeTimer = null;
  function flashBadge(text) {
    els.liveBadgeText.textContent = text || "Atualizado";
    els.liveBadge.classList.add("is-on");
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(function () { els.liveBadge.classList.remove("is-on"); }, 1600);
  }

  function applyMarkdown(text, isReload) {
    state.lastText = text;
    var chapters = parseDocument(text);
    if (!chapters.length) {
      els.view.innerHTML = '<div class="status"><span>O markdown está vazio ou não pôde ser interpretado.</span></div>';
      return;
    }
    state.chapters = chapters;

    if (!isReload) {
      // capítulo inicial: hash -> 1º capítulo numerado -> 0
      var fromHash = null;
      if (location.hash) {
        var h = location.hash.slice(1);
        for (var i = 0; i < chapters.length; i++) if (chapters[i].id === h) { fromHash = i; break; }
      }
      var firstNumbered = chapters.findIndex(function (c) { return c.num === "1" || (!c.isPre && c.num); });
      state.activeIndex = fromHash != null ? fromHash : (firstNumbered >= 0 ? firstNumbered : 0);
    } else {
      state.activeIndex = Math.min(state.activeIndex, chapters.length - 1);
    }

    buildSidebar();
    buildChapterTabs();
    renderChapter(isReload);
    if (isReload) { state.figCacheBust = Date.now(); flashBadge("Trabalho atualizado"); }
  }

  var lastFigProbe = 0;
  function poll() {
    if (document.hidden || !state.resolvedMdUrl) return;
    // Revalidação condicional (If-Modified-Since/ETag): o corpo só trafega quando
    // o arquivo muda; caso contrário o servidor responde 304 e usamos o cache.
    fetch(state.resolvedMdUrl, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (text) {
        if (text !== state.lastText) { applyMarkdown(text, true); return; }
        // markdown igual: re-tenta figuras pendentes (PNG recém-exportado), no máx. a cada 5s
        var now = Date.now();
        if (now - lastFigProbe < 5000) return;
        var pending = els.view.querySelectorAll(".fig-slot.is-mark, .fig-slot.is-loading");
        if (pending.length) { lastFigProbe = now; state.figCacheBust = now; resolveFigures(els.view); }
      })
      .catch(function () { /* fonte viva sumiu; ignora neste tick */ });
  }

  /* ============================== INIT ================================ */
  function showError(detail) {
    els.view.innerHTML =
      '<div class="status">' +
      "<span>Não foi possível carregar o markdown do trabalho.</span>" +
      "<span>Tentativas: <code>" + MD_SOURCES.map(escapeHtml).join("</code> · <code>") + "</code></span>" +
      "<span>Sirva a raiz do TCC (ex.: <code>python3 -m http.server</code>) para edição ao vivo, " +
      "ou gere a cópia embutida com <code>node sync-content.mjs</code>.</span>" +
      "</div>";
  }

  function init() {
    // listeners globais
    els.hamburger.addEventListener("click", openDrawer);
    els.drawerClose.addEventListener("click", closeDrawer);
    els.scrim.addEventListener("click", closeDrawer);
    els.lbClose.addEventListener("click", closeLightbox);
    els.lightbox.addEventListener("click", function (e) { if (e.target === els.lightbox) closeLightbox(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLightbox(); });

    /* Scroll-area height: always fill viewport below secondary nav */
    updateScrollAreaHeight();
    window.addEventListener("resize", updateScrollAreaHeight);
    window.addEventListener("scroll", updateScrollAreaHeight, { passive: true });

    var spyRaf = null;
    els.scrollArea.addEventListener("scroll", function () {
      if (spyRaf) return;
      spyRaf = requestAnimationFrame(function () { spyRaf = null; updateScrollSpy(); });
    });

    window.addEventListener("hashchange", function () {
      var h = location.hash.slice(1);
      if (!h) return;
      for (var i = 0; i < state.chapters.length; i++) {
        if (state.chapters[i].id === h && i !== state.activeIndex) { selectChapter(i, null); break; }
      }
    });

    fetchFirst(MD_SOURCES, true)
      .then(function (res) {
        state.resolvedMdUrl = res.base;
        // Se o markdown veio da cópia embutida (GitHub Pages), o caminho vivo de
        // figuras também não existe — usa só as bases a partir daí (evita 404s).
        var si = MD_SOURCES.indexOf(res.base);
        if (si > 0) state.pngBases = PNG_BASES.slice(si);
        applyMarkdown(res.text, false);
        setInterval(poll, POLL_MS);
      })
      .catch(showError);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
