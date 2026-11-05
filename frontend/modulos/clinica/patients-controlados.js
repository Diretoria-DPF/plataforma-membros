/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * CASOS CLÍNICOS DE MEDICAMENTOS CONTROLADOS (O6, Laboratório v2 + Clínica)
 * Titulação de opioide, rotação de opioides, intoxicação por benzodiazepínico e overdose de opioide com naloxona.
 *
 * Mesmo formato dos casos de patients.js (caseSource "builtin"), carregado logo depois dele. Ficam atrás
 * de uma flag LOCAL, desligada por padrão: só entram na lista com ?flags=clinControlados
 * (ou window.__labFlags = { clinControlados: true }). Não liga nenhuma flag do servidor.
 * O gabarito trata de princípios e de conduta, sem doses numéricas: doses, razões de equianalgesia e
 * tempos seguem o protocolo do serviço e a literatura vigente.
 */
(function () {
  'use strict';
  if (typeof clinicalCases === 'undefined' || typeof clinicalJourneys === 'undefined') return;

  function ligada() {
    var ligado = false;
    var ov = typeof window !== 'undefined' && window.__labFlags;
    if (ov && typeof ov === 'object' && 'clinControlados' in ov) ligado = !!ov.clinControlados;
    var m = /[?&]flags=([^&]*)/.exec(typeof location !== 'undefined' && location.search ? location.search : '');
    if (m) {
      var bruto = '';
      try { bruto = decodeURIComponent(m[1]); } catch (e) { bruto = ''; }
      bruto.split(',').forEach(function (p) {
        var t = p.trim();
        if (t.replace(/^[-+]/, '') === 'clinControlados') ligado = t.charAt(0) !== '-';
      });
    }
    return ligado;
  }
  if (!ligada()) return;

  var jornada = {
    id: 'jornada_controlados',
    nome: 'Controlados na Prática Clínica',
    descricao: 'Titulação e rotação de opioides, intoxicação por benzodiazepínico e overdose de opioide com naloxona, ligados à escrituração do balcão.',
    casos: ['caso_ctrl_titulacao', 'caso_ctrl_rotacao', 'caso_ctrl_intoxicacao', 'caso_ctrl_naloxona']
  };

  var casos = [
    {
      id: 'caso_ctrl_titulacao',
      caseSource: 'builtin',
      toxindrome: 'Outra',
      agentePrincipal: 'Opioide forte (lista A1) em titulação',
      jornadaId: 'jornada_controlados',
      ordemTrilha: 1,
      titulo: 'Dor oncológica e início de opioide forte',
      tipo: 'ambulatorio',
      dificuldade: 'Intermediário',
      vitalidadeInicial: 90,
      pacienciaInicial: 80,
      taxaDecaimento: { vitalidadePorMinuto: 1, pacienciaPorMinuto: 4 },
      paciente: { nome: 'Raimundo Teixeira', idade: 63, peso: '70 kg', genero: 'Masculino', profissao: 'Motorista aposentado', alergias: 'Nega alergias medicamentosas conhecidas', imagem: '👴' },
      queixaPrincipal: 'A dor nas costelas não passa com o remédio que eu tomo, não consigo dormir.',
      historicoAdmissao: 'Acompanhado da filha, em seguimento oncológico por doença avançada com dor óssea e hepática. Usa analgésico comum e um opioide fraco em horário fixo, sem alívio suficiente. Nunca usou opioide forte. A equipe pretende iniciar um opioide forte de liberação imediata e ajustar a dose.',
      sinaisVitais: { pa: '125/78 mmHg', fc: '88 bpm', fr: '18 irpm', temp: '36.7 °C', spo2: '96% em ar ambiente', glasgow: '15 (Alerta, orientado, com dor)' },
      contextoOculto: {
        nome: 'Raimundo', idade: 63, pacienteProfissao: 'Motorista aposentado',
        exposicaoReal: 'Dor oncológica moderada a intensa, mal controlada com analgesia da escada inferior. Sem uso prévio de opioide forte, função renal levemente reduzida e intestino preso há dias.',
        sintomas: 'dor constante nas costelas que piora ao respirar fundo, sono picado, intestino preso e medo de "ficar viciado"',
        comportamento: 'Colaborativo, cansado, receoso com a morfina por ter ouvido que "é a última fase".',
        regrasFala: 'Fale em tom simples. Se perguntarem sobre o intestino, diga que está sem evacuar bem há quatro dias. Pergunte se vai ficar dependente.'
      },
      perguntasSugeridas: [
        'Como é a dor (intensidade, o que piora, o que alivia)?',
        'Já usou algum opioide forte antes? Como foi?',
        'Como estão o intestino, o sono e a sonolência durante o dia?',
        'Quem vai guardar o medicamento em casa e como?'
      ],
      examesDisponiveis: [
        { id: 'escala_dor', nome: 'Escala numérica de dor (0 a 10)', custoTempoMin: 3, impactoVitalidade: 0, impactoPaciencia: 2, essencial: true, resultado: 'Dor referida como intensa em repouso e pior com a respiração profunda. Sem sedação no momento.' },
        { id: 'funcao_renal', nome: 'Função renal (creatinina e depuração estimada)', custoTempoMin: 20, impactoVitalidade: 0, impactoPaciencia: -1, essencial: true, resultado: 'Depuração estimada discretamente reduzida, relevante para a escolha e o ajuste do opioide.' },
        { id: 'habito_intestinal', nome: 'Avaliação do hábito intestinal', custoTempoMin: 5, impactoVitalidade: 0, impactoPaciencia: 1, essencial: true, resultado: 'Constipação instalada, sem sinais de obstrução. Nenhum laxante em uso.' },
        { id: 'rx_torax', nome: 'Radiografia de tórax', custoTempoMin: 25, impactoVitalidade: -2, impactoPaciencia: -8, essencial: false, resultado: 'Sem achado novo que mude a conduta analgésica neste momento.' }
      ],
      gabaritoPreceptor: {
        diagnostico: 'Dor oncológica não controlada com analgesia de degrau inferior, com indicação de opioide forte em paciente sem exposição prévia (virgem de opioide forte).',
        conduta: 'Iniciar opioide forte de liberação imediata em dose baixa, com intervalos regulares e dose de resgate prevista, conforme o protocolo do serviço; reavaliar dor, sedação e frequência respiratória em intervalos curtos e ajustar de forma gradual pela resposta; iniciar laxante desde a primeira dose e considerar antiemético no começo; considerar a função renal na escolha do fármaco; prescrever em notificação de receita A, com quantidade compatível com o tempo de tratamento; orientar a pessoa e a família sobre sinais de sedação excessiva, guarda segura em casa e descarte das sobras; esclarecer o medo de dependência, distinguindo dependência física esperada de transtorno por uso.',
        palavrasChave: ['titulacao', 'liberacao imediata', 'resgate', 'laxante', 'sedacao', 'notificacao de receita a', 'reavaliacao']
      }
    },
    {
      id: 'caso_ctrl_rotacao',
      caseSource: 'builtin',
      toxindrome: 'Outra',
      agentePrincipal: 'Rotação de opioides (neurotoxicidade por opioide)',
      jornadaId: 'jornada_controlados',
      ordemTrilha: 2,
      titulo: 'Sonolência e mioclonias em uso de opioide: trocar de fármaco',
      tipo: 'ambulatorio',
      dificuldade: 'Avançado',
      vitalidadeInicial: 85,
      pacienciaInicial: 75,
      taxaDecaimento: { vitalidadePorMinuto: 1, pacienciaPorMinuto: 4 },
      paciente: { nome: 'Odete Camargo', idade: 71, peso: '58 kg', genero: 'Feminino', profissao: 'Costureira aposentada', alergias: 'Nega alergias medicamentosas conhecidas', imagem: '👵' },
      queixaPrincipal: 'A dor melhorou, mas eu vivo sonolenta, vejo coisas no canto do quarto e meu corpo dá uns tranco.',
      historicoAdmissao: 'Em uso contínuo de opioide forte oral com dor controlada, mas há alguns dias com sonolência diurna, alucinações breves e abalos musculares involuntários. A função renal piorou após um quadro de desidratação recente. A equipe discute a troca do opioide.',
      sinaisVitais: { pa: '110/70 mmHg', fc: '92 bpm', fr: '14 irpm', temp: '36.5 °C', spo2: '95% em ar ambiente', glasgow: '14 (Sonolenta, desperta ao chamado)' },
      contextoOculto: {
        nome: 'Odete', idade: 71, pacienteProfissao: 'Costureira aposentada',
        exposicaoReal: 'Dose do opioide mantida e função renal reduzida, com acúmulo de metabólitos ativos do fármaco em uso. Quadro compatível com neurotoxicidade induzida por opioide, e não com piora da dor.',
        sintomas: 'sonolência, alucinações curtas, mioclonias e pouca urina nos últimos dias, com a dor ainda sob controle',
        comportamento: 'Educada, lenta ao responder, preocupada em "estar enlouquecendo".',
        regrasFala: 'Responda devagar. Se perguntarem sobre a dor, diga que está tolerável. Se perguntarem sobre urina, diga que tem urinado pouco e escuro.'
      },
      perguntasSugeridas: [
        'Desde quando a sonolência e os abalos começaram e houve mudança de dose?',
        'Houve vômito, diarreia ou pouca ingestão de líquido nos últimos dias?',
        'A dor está controlada? Há crises de dor entre as doses?',
        'Usa outros remédios que causam sonolência (como calmantes)?'
      ],
      examesDisponiveis: [
        { id: 'funcao_renal_rot', nome: 'Função renal e eletrólitos', custoTempoMin: 20, impactoVitalidade: 0, impactoPaciencia: -1, essencial: true, resultado: 'Piora da função renal em relação ao exame anterior, com sinais de desidratação.' },
        { id: 'avaliacao_neuro', nome: 'Exame neurológico à beira do leito', custoTempoMin: 8, impactoVitalidade: 0, impactoPaciencia: 1, essencial: true, resultado: 'Mioclonias multifocais, sonolência sem déficit focal, sem rigidez de nuca.' },
        { id: 'revisao_medicacoes', nome: 'Revisão de todas as medicações em uso', custoTempoMin: 10, impactoVitalidade: 0, impactoPaciencia: 2, essencial: true, resultado: 'Sem outro sedativo associado. Opioide em dose estável, sem ajuste recente, laxante em uso regular.' },
        { id: 'tc_cranio_rot', nome: 'Tomografia de crânio', custoTempoMin: 30, impactoVitalidade: -3, impactoPaciencia: -12, essencial: false, resultado: 'Sem lesão aguda. Exame sem impacto na conduta neste momento.' }
      ],
      gabaritoPreceptor: {
        diagnostico: 'Neurotoxicidade induzida por opioide (sonolência, alucinações e mioclonias) em paciente idosa com função renal reduzida e dor controlada.',
        conduta: 'Reconhecer que a dor está controlada e que o problema é o efeito adverso: hidratar e corrigir fatores contribuintes; trocar de opioide (rotação) por um fármaco de menor acúmulo de metabólitos ativos na insuficiência renal, escolhido conforme o protocolo do serviço; calcular a dose do novo opioide pela tabela de equianalgesia adotada pelo serviço e reduzir a dose calculada, porque a tolerância cruzada entre opioides é incompleta; manter dose de resgate e reavaliar dor e efeitos com frequência nos primeiros dias; evitar associar outros depressores do sistema nervoso central; reconhecer que fármacos como a metadona exigem manejo por equipe com experiência; escriturar a troca de prescrição e orientar a família sobre o descarte do opioide anterior.',
        palavrasChave: ['rotacao', 'equianalgesia', 'tolerancia cruzada', 'neurotoxicidade', 'funcao renal', 'mioclonia', 'resgate']
      }
    },
    {
      id: 'caso_ctrl_intoxicacao',
      caseSource: 'builtin',
      toxindrome: 'Sedativo-hipnótica',
      agentePrincipal: 'Benzodiazepínico (lista B1) com álcool',
      jornadaId: 'jornada_controlados',
      ordemTrilha: 3,
      titulo: 'Sonolência profunda após ingestão voluntária de calmante',
      tipo: 'emergencia',
      dificuldade: 'Avançado',
      vitalidadeInicial: 80,
      pacienciaInicial: 85,
      taxaDecaimento: { vitalidadePorMinuto: 2, pacienciaPorMinuto: 1 },
      paciente: { nome: 'Camila Duarte', idade: 34, peso: '62 kg', genero: 'Feminino', profissao: 'Atendente de loja', alergias: 'Nega alergias medicamentosas conhecidas', imagem: '👩' },
      queixaPrincipal: '(Fala arrastada e difícil de entender) Eu só queria dormir...',
      historicoAdmissao: 'Trazida por uma amiga, encontrada sonolenta em casa, com cartela vazia de calmante da lista B1 e garrafa de bebida alcoólica ao lado. A amiga relata que a paciente estava muito triste nos últimos dias. Admitida com rebaixamento do nível de consciência e fala arrastada.',
      sinaisVitais: { pa: '95/60 mmHg', fc: '72 bpm', fr: '10 irpm (superficial)', temp: '35.9 °C', spo2: '92% em ar ambiente', glasgow: '11 (Sonolenta, abre os olhos à voz)' },
      contextoOculto: {
        nome: 'Camila', idade: 34, pacienteProfissao: 'Atendente de loja',
        exposicaoReal: 'Ingestão voluntária de benzodiazepínico em quantidade grande, associada a álcool. A mistura potencializa a depressão do sistema nervoso central e da respiração. Sem outras substâncias conhecidas.',
        sintomas: 'sonolência intensa, fala arrastada, falta de coordenação e respiração lenta, com pupilas sem grande alteração',
        comportamento: 'Sonolenta, responde com poucas palavras e demora; chorosa quando desperta.',
        regrasFala: 'Fale pouco e devagar. Se perguntarem o que tomou, diga que foram "os comprimidos de dormir" e que bebeu um pouco. Evite detalhar quantidades.'
      },
      perguntasSugeridas: [
        'Que medicamentos e quantos comprimidos, aproximadamente, e a que horas?',
        'Tomou também álcool ou outra substância?',
        'Usa o calmante todos os dias há muito tempo?',
        'Neste momento, há ideias de se machucar?'
      ],
      examesDisponiveis: [
        { id: 'monitorizacao_resp', nome: 'Monitorização respiratória e oximetria contínua', custoTempoMin: 2, impactoVitalidade: 3, impactoPaciencia: 0, essencial: true, resultado: 'Respiração superficial e lenta com dessaturação leve em ar ambiente, melhorando com oxigênio suplementar.' },
        { id: 'glicemia_capilar', nome: 'Glicemia capilar', custoTempoMin: 2, impactoVitalidade: 0, impactoPaciencia: 0, essencial: true, resultado: 'Dentro da faixa de referência. Afasta hipoglicemia como causa da sonolência.' },
        { id: 'triagem_coingestao', nome: 'Pesquisa de coingestões (paracetamol, álcool e outros)', custoTempoMin: 30, impactoVitalidade: 0, impactoPaciencia: -2, essencial: true, resultado: 'Presença de álcool; sem evidência de outra substância relevante nos exames disponíveis.' },
        { id: 'ecg_intox', nome: 'Eletrocardiograma', custoTempoMin: 5, impactoVitalidade: 0, impactoPaciencia: 0, essencial: true, resultado: 'Ritmo sinusal, sem alargamento de QRS nem alteração de QT.' },
        { id: 'tc_cranio_intox', nome: 'Tomografia de crânio', custoTempoMin: 30, impactoVitalidade: -4, impactoPaciencia: -10, essencial: false, resultado: 'Sem lesão. Exame dispensável diante do quadro tóxico claro.' }
      ],
      gabaritoPreceptor: {
        diagnostico: 'Intoxicação exógena aguda por benzodiazepínico associado a álcool, com depressão do sistema nervoso central e hipoventilação, em contexto de ingestão voluntária.',
        conduta: 'Priorizar via aérea, oxigenação e ventilação, com monitorização contínua e acesso venoso; tratar o quadro com suporte, pois a maioria dos casos de benzodiazepínico isolado evolui bem com suporte; avaliar descontaminação gastrointestinal somente se a janela de tempo e o nível de consciência permitirem, evitando carvão ativado quando houver rebaixamento e risco de aspiração; reservar o antagonista flumazenil para casos selecionados, e não de rotina, porque pode precipitar convulsões em quem usa o fármaco de forma crônica e em coingestão de substâncias que reduzem o limiar convulsivo; pesquisar coingestões; contatar o CIATox para orientação; manter observação até a recuperação do nível de consciência; avaliar o risco de nova tentativa, manter vigilância contínua e solicitar avaliação psiquiátrica e psicossocial; notificar o caso.',
        palavrasChave: ['benzodiazepinico', 'flumazenil', 'suporte ventilatorio', 'coingestao', 'carvao ativado', 'ciatox', 'risco de suicidio']
      }
    },
    {
      id: 'caso_ctrl_naloxona',
      caseSource: 'builtin',
      toxindrome: 'Opioide',
      agentePrincipal: 'Opioide de prescrição (overdose)',
      jornadaId: 'jornada_controlados',
      ordemTrilha: 4,
      titulo: 'Respiração lenta e pupilas puntiformes: uso de naloxona',
      tipo: 'emergencia',
      dificuldade: 'Intermediário',
      vitalidadeInicial: 65,
      pacienciaInicial: 90,
      taxaDecaimento: { vitalidadePorMinuto: 4, pacienciaPorMinuto: 1 },
      paciente: { nome: 'Leandro Prado', idade: 41, peso: '75 kg', genero: 'Masculino', profissao: 'Pedreiro', alergias: 'Não informado', imagem: '👨' },
      queixaPrincipal: '(Não responde; o acompanhante conta que ele tomou comprimidos para a dor forte do pai)',
      historicoAdmissao: 'Trazido por familiar, encontrado quase sem responder, com lábios arroxeados. O familiar relata que ele pegou comprimidos de opioide prescritos a outra pessoa da casa, para aliviar uma dor lombar, e tomou vários de uma vez.',
      sinaisVitais: { pa: '100/62 mmHg', fc: '58 bpm', fr: '5 irpm', temp: '36.0 °C', spo2: '78% em ar ambiente', glasgow: '6 (Responde apenas à dor)' },
      contextoOculto: {
        nome: 'Leandro', idade: 41, pacienteProfissao: 'Pedreiro',
        exposicaoReal: 'Ingestão de grande quantidade de opioide de prescrição alheia, sem tolerância prévia. Quadro típico: depressão respiratória, miose acentuada e rebaixamento da consciência.',
        sintomas: 'respiração muito lenta, pupilas puntiformes, cianose de lábios e ausência de resposta verbal',
        comportamento: 'Inconsciente; responde apenas a estímulo doloroso.',
        regrasFala: 'O paciente não fala. O familiar responde: foi há cerca de uma hora e ele "pegou os comprimidos do pai". Não sabe a quantidade.'
      },
      perguntasSugeridas: [
        'Qual medicamento e quantos comprimidos ele tomou, e há quanto tempo?',
        'Ele tomou outras substâncias ou bebida junto?',
        'Ele usa algum opioide de forma regular?',
        'Qual era a respiração dele quando foi encontrado?'
      ],
      examesDisponiveis: [
        { id: 'oximetria_nalox', nome: 'Oximetria e capnografia', custoTempoMin: 2, impactoVitalidade: 3, impactoPaciencia: 0, essencial: true, resultado: 'Dessaturação grave em ar ambiente, com retenção de gás carbônico compatível com hipoventilação.' },
        { id: 'pupilas', nome: 'Exame das pupilas', custoTempoMin: 1, impactoVitalidade: 0, impactoPaciencia: 0, essencial: true, resultado: 'Pupilas puntiformes e simétricas, pouco reativas.' },
        { id: 'glicemia_nalox', nome: 'Glicemia capilar', custoTempoMin: 2, impactoVitalidade: 0, impactoPaciencia: 0, essencial: true, resultado: 'Dentro da faixa de referência.' },
        { id: 'coingestao_nalox', nome: 'Pesquisa de coingestões (incluindo paracetamol)', custoTempoMin: 30, impactoVitalidade: 0, impactoPaciencia: -2, essencial: true, resultado: 'Sem outra substância relevante evidente; segue a dúvida sobre associações do medicamento ingerido, que devem ser pesquisadas.' },
        { id: 'tc_cranio_nalox', nome: 'Tomografia de crânio', custoTempoMin: 30, impactoVitalidade: -8, impactoPaciencia: -10, essencial: false, resultado: 'Sem lesão. Atrasar o tratamento da hipoventilação para fazer este exame não se justifica.' }
      ],
      gabaritoPreceptor: {
        diagnostico: 'Intoxicação exógena aguda por opioide, com depressão respiratória e rebaixamento da consciência (síndrome opioide).',
        conduta: 'Abrir a via aérea e ventilar com bolsa-válvula-máscara e oxigênio, porque a hipoxemia é o risco imediato; administrar naloxona em doses tituladas, repetidas até restabelecer a ventilação adequada, sem a meta de acordar a pessoa por completo, para evitar abstinência abrupta em quem tem dependência física; lembrar que a naloxona tem ação mais curta do que muitos opioides, com risco de nova depressão respiratória (ressedação), e por isso manter observação prolongada, com novas doses ou infusão conforme o protocolo do serviço; pesquisar coingestões e associações com outros fármacos; contatar o CIATox; notificar o caso, orientar a família sobre guarda segura de medicamentos controlados e sobre o acesso à naloxona.',
        palavrasChave: ['naloxona', 'depressao respiratoria', 'miose', 'ressedacao', 'ventilacao', 'titulacao', 'observacao']
      }
    }
  ];

  casos.forEach(function (c) { clinicalCases.push(c); });
  clinicalJourneys.push(jornada);
})();
