/* ============================================================================
   APÊNDICES — modelo de conteúdo
   ----------------------------------------------------------------------------
   Dados dinâmicos: os fluxos e passos de cada plataforma são carregados de
   arquivos JSON individuais por fluxo em data/{platform}/{flow_id}.json.

   Para editar conteúdo (títulos, descrições, padrões deceptivos, imagens):
     → Abra o JSON do fluxo desejado em data/{platform}/ e altere os campos.
     → Não é necessário mexer neste arquivo nem em nenhum .js.

   Estrutura por plataforma:
   data/{platform}/manifest.json  → lista dos IDs de fluxo
   data/{platform}/{flow_id}.json → dados do fluxo individual:
   {
     "id": "register",
     "name": "Cadastro",
     "steps": [
       {
         "image": "imagens/bet365/register/register_step1_personal_data_bet365.png",
         "title": "Cadastro — Etapa 1: Dados Pessoais",
         "description": "Formulário completo de dados pessoais...",
         "darkPatterns": ""
       }
     ]
   }
   ========================================================================== */

(function () {
  const thesis = {
    titleBold: "Ética no Design:",
    titleRest:
      " uma análise crítica da exploração de padrões deceptivos no desenho " +
      "de interfaces e da experiência de usuário em aplicações de apostas e " +
      "jogos de azar",
    aluno: "Gabriel Zurmely Gama",
    orientadora: "Profa. Dra. Angélica Beatriz Castro Guimarães"
  };

  // Static nav structure — apps are populated asynchronously from JSON files.
  window.APP_DATA = {
    thesis: thesis,
    defaultTab: "apendices",
    loading: true,
    nav: [
      {
        id: "trabalho",
        label: "Trabalho",
        type: "page",
        page: {
          title: "Ética no Design",
          subtitle:
            "Uma análise crítica da exploração de padrões deceptivos no desenho " +
            "de interfaces e da experiência de usuário em aplicações de apostas " +
            "e jogos de azar.",
          sections: [
            {
              heading: "Resumo",
              body:
                "[ Placeholder ] Inserir aqui o resumo do trabalho. Esta aba é " +
                "uma página de conteúdo livre — o texto, os tópicos e as seções " +
                "podem ser substituídos depois."
            },
            {
              heading: "Sobre os apêndices",
              body:
                "Os apêndices reúnem as capturas de tela dos fluxos analisados em " +
                "cada plataforma. Use a aba 'Apêndices' para navegar entre os " +
                "aplicativos, fluxos e passos."
            }
          ]
        }
      },
      {
        id: "apendices",
        label: "Apêndices",
        type: "viewer",
        apps: [] // Populated by loadPlatformData()
      }
    ]
  };

  // Load JSON data files — per-flow structure via manifest.json
  var PLATFORM_IDS = ["bet365", "betano", "superbet"];

  function loadPlatform(platformId) {
    return fetch("data/" + platformId + "/manifest.json")
      .then(function (r) { return r.json(); })
      .then(function (manifest) {
        return Promise.all(
          manifest.flows.map(function (flowId) {
            return fetch("data/" + platformId + "/" + flowId + ".json")
              .then(function (r) { return r.json(); })
              .then(function (flow) {
                // Hide images flagged as removed (ignore) from the public view.
                flow.steps = (flow.steps || []).filter(function (s) { return !s.ignore; });
                return flow;
              });
          })
        ).then(function (flows) {
          // Hide flows that have no visible steps (empty, or all-ignored) from the public view.
          var visible = flows.filter(function (f) { return f.steps && f.steps.length > 0; });
          return { id: manifest.id, name: manifest.name, flows: visible };
        });
      });
  }

  function loadTags() {
    return fetch("data/tags.json")
      .then(function (r) { return r.ok ? r.json() : { tags: [] }; })
      .then(function (data) { return (data && data.tags) || []; })
      .catch(function () { return []; });
  }

  window.loadPlatformData = function () {
    return Promise.all([Promise.all(PLATFORM_IDS.map(loadPlatform)), loadTags()])
      .then(function (results) {
        var platforms = results[0];
        var tags = results[1];
        var apendices = window.APP_DATA.nav.find(function (t) { return t.id === "apendices"; });
        apendices.apps = platforms;
        // Index tags by id for quick lookup during rendering.
        window.APP_DATA.tags = tags;
        window.APP_DATA.tagsById = tags.reduce(function (acc, t) { acc[t.id] = t; return acc; }, {});
        window.APP_DATA.loading = false;
        return window.APP_DATA;
      });
  };
})();
