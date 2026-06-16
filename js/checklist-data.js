/* ============================================================================
   FICHA DE CATALOGAÇÃO DE PADRÃO DECEPTIVO — taxonomias de referência
   ----------------------------------------------------------------------------
   Fonte única de verdade para as taxonomias usadas na ficha de catalogação.
   Carregado tanto pelo site público (webnav-tcc/index.html → js/checklist-data.js)
   quanto pelo editor (editor/public/index.html → /site/js/checklist-data.js),
   de modo que ambos compartilham exatamente os mesmos rótulos e definições.

   - brignull : os 16 tipos catalogados por Brignull (Quadro 1 do TCC).
   - gray     : as 5 categorias de Gray et al. (2018).
   - nielsen  : as 10 heurísticas de Nielsen (passíveis de violação).
   - severity : a escala de gravidade de Nielsen (0–4).

   Estrutura de cada item: { id, en (termo original em inglês), pt (tradução),
   def (definição/descrição usada como tooltip) }.

   A ficha preenchida fica gravada em cada passo do JSON do fluxo como:
     "checklist": {
       "tipos":        ["trick_wording", "hidden_costs"],   // ids de brignull
       "gray":         ["sneaking"],                          // ids de gray
       "heuristicas":  [ { "id": "h1", "sev": 3 } ],          // id + gravidade 0–4
       "observacoes":  "texto livre"
     }
   ========================================================================== */
(function () {
  var brignull = [
    { id: "comparison_prevention", en: "Comparison Prevention", pt: "Prevenção de comparação",
      def: "O usuário tem dificuldade de comparar produtos porque preços e características são combinados de modo complexo ou porque informações essenciais são difíceis de localizar." },
    { id: "confirmshaming", en: "Confirmshaming", pt: "Constrangimento da recusa",
      def: "O usuário é manipulado emocionalmente a fazer algo que, de outro modo, não faria, geralmente por meio de linguagem que envergonha quem recusa uma oferta." },
    { id: "disguised_ads", en: "Disguised Ads", pt: "Anúncios disfarçados",
      def: "O usuário acredita estar clicando em um elemento da interface ou em conteúdo legítimo, quando na verdade interage com um anúncio disfarçado." },
    { id: "fake_scarcity", en: "Fake Scarcity", pt: "Falsa escassez",
      def: "O usuário é pressionado a concluir uma ação porque recebe uma indicação falsa de estoque limitado ou de alta procura." },
    { id: "fake_social_proof", en: "Fake Social Proof", pt: "Falsa prova social",
      def: "O usuário é induzido a crer que um produto é mais popular ou confiável do que de fato é, ao ser exposto a avaliações, depoimentos ou mensagens de atividade forjados." },
    { id: "fake_urgency", en: "Fake Urgency", pt: "Falsa urgência",
      def: "O usuário é pressionado a concluir uma ação porque lhe é apresentada uma limitação de tempo inexistente." },
    { id: "forced_action", en: "Forced Action", pt: "Ação forçada",
      def: "O usuário deseja realizar uma ação, mas é obrigado a executar, em troca, algo indesejado." },
    { id: "hard_to_cancel", en: "Hard to Cancel", pt: "Difícil de cancelar",
      def: "O usuário assina ou se cadastra com facilidade, mas enfrenta grande dificuldade quando deseja cancelar." },
    { id: "hidden_costs", en: "Hidden Costs", pt: "Custos ocultos",
      def: "O usuário é atraído por um preço baixo anunciado e, após investir tempo e esforço, descobre taxas e encargos inesperados ao chegar à etapa de pagamento." },
    { id: "hidden_subscription", en: "Hidden Subscription", pt: "Assinatura oculta",
      def: "O usuário é inscrito, sem saber, em uma assinatura ou plano de pagamento recorrente, sem divulgação clara nem consentimento explícito." },
    { id: "nagging", en: "Nagging", pt: "Insistência",
      def: "O usuário tenta concluir uma tarefa, mas é interrompido de forma persistente por solicitações para fazer outra coisa que pode não atender a seus interesses." },
    { id: "obstruction", en: "Obstruction", pt: "Obstrução",
      def: "O usuário se depara com barreiras ou obstáculos que dificultam a conclusão de uma tarefa ou o acesso a uma informação." },
    { id: "preselection", en: "Preselection", pt: "Pré-seleção",
      def: "O usuário recebe uma opção padrão previamente marcada, com o objetivo de influenciar sua tomada de decisão." },
    { id: "sneaking", en: "Sneaking", pt: "Dissimulação",
      def: "O usuário é conduzido a uma transação sob falsas premissas, porque informações pertinentes são ocultadas ou apresentadas tardiamente." },
    { id: "trick_wording", en: "Trick Wording", pt: "Redação enganosa",
      def: "O usuário é induzido a tomar uma ação em razão do emprego de linguagem confusa ou capciosa." },
    { id: "visual_interference", en: "Visual Interference", pt: "Interferência visual",
      def: "O usuário espera que a informação seja apresentada de modo claro e previsível, mas ela aparece oculta, obscurecida ou disfarçada." }
  ];

  var gray = [
    { id: "nagging", en: "Nagging", pt: "Insistência",
      def: "Interrupções repetitivas que pressionam o usuário a tomar uma decisão favorável à plataforma." },
    { id: "obstruction", en: "Obstruction", pt: "Obstrução",
      def: "Inserção de fricções deliberadas em processos que o usuário deseja completar." },
    { id: "sneaking", en: "Sneaking", pt: "Dissimulação",
      def: "Ocultar ou disfarçar informações relevantes para conduzir o usuário a uma ação." },
    { id: "interface_interference", en: "Interface Interference", pt: "Interferência na interface",
      def: "Manipulação de elementos visuais para direcionar o usuário a uma opção específica." },
    { id: "forced_action", en: "Forced Action", pt: "Ação forçada",
      def: "Condiciona o acesso a um recurso desejado à realização de uma ação não relacionada." }
  ];

  var nielsen = [
    { id: "h1", en: "Visibility of system status", pt: "Visibilidade do status do sistema",
      def: "O sistema deve manter o usuário informado sobre o que está acontecendo, por meio de feedback apropriado em tempo razoável." },
    { id: "h2", en: "Match between system and the real world", pt: "Correspondência entre o sistema e o mundo real",
      def: "O sistema deve falar a linguagem do usuário, com palavras e conceitos familiares, em vez de termos técnicos." },
    { id: "h3", en: "User control and freedom", pt: "Controle e liberdade do usuário",
      def: "O usuário precisa de “saídas de emergência” claras para desfazer e refazer ações sem percorrer diálogos extensos." },
    { id: "h4", en: "Consistency and standards", pt: "Consistência e padrões",
      def: "Palavras, situações e ações devem seguir convenções; o usuário não deve precisar adivinhar se coisas diferentes significam o mesmo." },
    { id: "h5", en: "Error prevention", pt: "Prevenção de erros",
      def: "Melhor que boas mensagens de erro é um design cuidadoso que evite que o problema ocorra em primeiro lugar." },
    { id: "h6", en: "Recognition rather than recall", pt: "Reconhecimento em vez de memorização",
      def: "Minimizar a carga de memória do usuário, tornando objetos, ações e opções visíveis." },
    { id: "h7", en: "Flexibility and efficiency of use", pt: "Flexibilidade e eficiência de uso",
      def: "Aceleradores e personalização permitem atender tanto usuários novatos quanto experientes." },
    { id: "h8", en: "Aesthetic and minimalist design", pt: "Design estético e minimalista",
      def: "As interfaces não devem conter informação irrelevante ou raramente necessária, que compete com o conteúdo relevante." },
    { id: "h9", en: "Help users recognize, diagnose, and recover from errors", pt: "Ajudar a reconhecer, diagnosticar e recuperar-se de erros",
      def: "Mensagens de erro em linguagem clara, indicando o problema e sugerindo uma solução." },
    { id: "h10", en: "Help and documentation", pt: "Ajuda e documentação",
      def: "Quando necessária, a ajuda deve ser fácil de localizar, focada na tarefa do usuário e objetiva." }
  ];

  // Escala de gravidade de Nielsen (0–4), aplicada a cada heurística violada.
  var severity = [
    { value: 0, label: "Sem problema", def: "Não considero que seja um problema de usabilidade." },
    { value: 1, label: "Cosmético", def: "Problema cosmético: só precisa ser corrigido se houver tempo disponível." },
    { value: 2, label: "Menor", def: "Problema menor de usabilidade: correção de baixa prioridade." },
    { value: 3, label: "Maior", def: "Problema maior de usabilidade: importante de corrigir, alta prioridade." },
    { value: 4, label: "Catastrófico", def: "Catástrofe de usabilidade: imperativo corrigir antes do lançamento." }
  ];

  function indexById(arr) {
    return arr.reduce(function (acc, it) { acc[it.id] = it; return acc; }, {});
  }

  window.CHECKLIST_TAXONOMY = {
    brignull: brignull,
    gray: gray,
    nielsen: nielsen,
    severity: severity,
    brignullById: indexById(brignull),
    grayById: indexById(gray),
    nielsenById: indexById(nielsen),
    severityByValue: severity.reduce(function (acc, it) { acc[it.value] = it; return acc; }, {})
  };

  // True if a checklist object carries any filled-in content worth rendering.
  window.checklistHasContent = function (cl) {
    if (!cl) return false;
    return !!(
      (cl.tipos && cl.tipos.length) ||
      (cl.gray && cl.gray.length) ||
      (cl.heuristicas && cl.heuristicas.length) ||
      (cl.observacoes && String(cl.observacoes).trim())
    );
  };
})();
