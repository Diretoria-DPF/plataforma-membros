/**
 * LAIFT — MOTOR COGNITIVO DO PRECEPTOR VIRTUAL DE BANCADA
 * Perfil: Químico Farmacêutico Sênior & Preceptor de Bancada
 * Arquitetura: Cascata em 3 Camadas com Diálogo Contínuo (Padrão Anamnese Clínica)
 * Escopo: Química, Farmácia, Física, Biologia, Bioquímica, Toxicologia e Bancada.
 */

window.APPS_SCRIPT_GATEWAY = window.APPS_SCRIPT_GATEWAY || 'https://script.google.com/macros/s/AKfycbyXvBYrHBIXNjHYItuq2LXKt1vkmh2m_CME-5aZqkxUJhl7ktJjemuasbvdEweH95k/exec';

const LabPreceptorEngine = {
  // Histórico de conversação contínuo (memória recente para réplicas e tréplicas)
  historicoChatLab: [],

  // =========================================================================
  // 1. ACERVO CURADO DE SÍNTESES FARMACÊUTICAS E INDUSTRIAIS (CAMADA 1)
  // =========================================================================
  ROTAS_SINTESE: {
    "aspirina": {
      nome: "Ácido Acetilsalicílico (Aspirina)",
      reagentes: ["Ácido Salicílico (C7H6O3)", "Anidrido Acético ((CH3CO)2O)"],
      catalisador: "Ácido Sulfúrico Concentrado (H2SO4)",
      solvente: "Ácido Acético Glacial",
      tempMin: 60,
      tempMax: 80,
      tempoReacao: "30 min",
      equacao: "C7H6O3 + (CH3CO)2O -> C9H8O4 + CH3COOH",
      perigos: "Corrosivo, Irritante. Vapores de anidrido acético são lacrimogêneos.",
      tipoReacao: "Acetilação fenólica",
      descricao: "Acetilação do ácido salicílico com anidrido acético catalisada por ácido sulfúrico. O produto precipita como cristais brancos ao resfriar em banho de gelo."
    },
    "paracetamol": {
      nome: "Paracetamol (Acetaminofeno)",
      reagentes: ["p-Aminofenol (C6H7NO)", "Anidrido Acético ((CH3CO)2O)"],
      catalisador: "Ácido Sulfúrico ou Autocatalítico",
      solvente: "Água purificada",
      tempMin: 80,
      tempMax: 100,
      tempoReacao: "45 min",
      equacao: "C6H7NO + (CH3CO)2O -> C8H9NO2 + CH3COOH",
      perigos: "Irritante; risco de oxidação do p-aminofenol a subprodutos quinônicos escurecidos.",
      tipoReacao: "Acetilação quimiosseletiva de amina aromática",
      descricao: "Acetilação seletiva do grupamento amino do p-aminofenol com anidrido acético em meio aquoso. O paracetamol cristaliza após resfriamento lento."
    },
    "dipirona": {
      nome: "Dipirona Sódica (Metamizol)",
      reagentes: ["4-Metilaminoantipirina", "Formaldeído (CH2O)", "Bissulfito de Sódio (NaHSO3)"],
      catalisador: "NaOH aquoso (controle de pH entre 6.5 e 7.5)",
      solvente: "Água purificada",
      tempMin: 70,
      tempMax: 90,
      tempoReacao: "1 h",
      equacao: "C11H13N3O + CH2O + NaHSO3 -> C13H16N3NaO4S",
      perigos: "Formaldeído é tóxico e volátil. Manipular estritamente sob capela de exaustão.",
      tipoReacao: "Sulfometilação nucleofílica seguida de salificação",
      descricao: "Reação da 4-metilaminoantipirina com formaldeído e bissulfito de sódio, seguida de metilação e salificação alcalina."
    },
    "ibuprofeno": {
      nome: "Ibuprofeno",
      reagentes: ["Isobutilbenzeno", "Cloreto de Acetila", "Dióxido de Carbono (CO2)"],
      catalisador: "Cloreto de Alumínio (AlCl3) / Catalisador de Paládio",
      solvente: "Diclorometano (CH2Cl2)",
      tempMin: 0,
      tempMax: 25,
      tempoReacao: "2 h",
      equacao: "C10H14 + CH3COCl + CO2 -> C13H18O2",
      perigos: "Corrosivo e inflamável; liberação vigorosa de gás HCl durante a acilação.",
      tipoReacao: "Acoplamento de Friedel-Crafts + Carboxilação",
      descricao: "Acilação de Friedel-Crafts do isobutilbenzeno, seguida de redução e carboxilação catalisada por paládio (processo verde BHC)."
    },
    "diclofenaco": {
      nome: "Diclofenaco Sódico",
      reagentes: ["2,6-Dicloroanilina", "Ácido 2-clorofenilacético"],
      catalisador: "Cloreto Cuproso (CuCl)",
      solvente: "Dimetilformamida (DMF)",
      tempMin: 120,
      tempMax: 140,
      tempoReacao: "4 h",
      equacao: "C6H5Cl2N + C8H7ClO2 -> C14H10Cl2NNaO2",
      perigos: "Tóxico; DMF apresenta toxicidade reprodutiva.",
      tipoReacao: "Acoplamento de Ullmann + Ciclização",
      descricao: "Acoplamento de Ullmann entre 2,6-dicloroanilina e ácido 2-clorofenilacético, seguido de ciclização a indolinona e abertura alcalina com NaOH."
    },
    "losartana": {
      nome: "Losartana Potássica",
      reagentes: ["2-Butil-4-cloroimidazol", "Brometo de 4'-bromometil-2-bifenilcarbonitrila", "Azida de Sódio (NaN3)"],
      catalisador: "Hidreto de Sódio (NaH)",
      solvente: "Tetraidrofurano (THF)",
      tempMin: 0,
      tempMax: 60,
      tempoReacao: "6 h",
      equacao: "C7H11ClN2 + C14H10Br2N + NaN3 -> C22H23ClN6O",
      perigos: "Azida de sódio é altamente tóxica e explosiva ao contato com metais pesados ou ácidos.",
      tipoReacao: "N-Alquilação + Cicloadição 1,3-dipolar (Tetrazolação)",
      descricao: "Alquilação do anel imidazol, seguida de tetrazolação da nitrila com azida e hidrólise para isolamento da losartana."
    },
    "captopril": {
      nome: "Captopril",
      reagentes: ["L-Prolina", "Ácido 3-acetiltio-2-metilpropanóico"],
      catalisador: "Dicicloexilcarbodiimida (DCC)",
      solvente: "Diclorometano (CH2Cl2)",
      tempMin: 0,
      tempMax: 25,
      tempoReacao: "3 h",
      equacao: "C5H9NO2 + C6H10O3S -> C9H15NO3S",
      perigos: "DCC é potente sensibilizante dérmico; presença de tióis com odor sulfuroso forte.",
      tipoReacao: "Acoplamento peptídico + Desproteção de tiol",
      descricao: "Condensação da L-prolina com ácido 3-acetiltio-2-metilpropanóico com ativação por DCC, seguida de hidrólise básica do grupo tioéster."
    },
    "anlodipino": {
      nome: "Besilato de Anlodipino",
      reagentes: ["2-Clorobenzaldeído", "Acetoacetato de Metila", "3-Aminocrotonato de Metila"],
      catalisador: "Acetato de Amônio (NH4OAc)",
      solvente: "Etanol Absoluto",
      tempMin: 80,
      tempMax: 90,
      tempoReacao: "4 h",
      equacao: "C7H5ClO + C5H8O3 + C5H9NO2 -> C20H25ClN2O5",
      perigos: "Irritante dérmico e respiratório.",
      tipoReacao: "Síntese multicomponente de Hantzsch",
      descricao: "Condensação multicomponente de Hantzsch para formação do anel 1,4-diidropiridínico assimétrico característico."
    },
    "metformina": {
      nome: "Cloridrato de Metformina",
      reagentes: ["Cianoguanidina (Dicandiamida)", "Cloridrato de Dimetilamina"],
      catalisador: "HCl aquoso / Autocatalítico",
      solvente: "Dimetilformamida (DMF) ou Tolueno",
      tempMin: 100,
      tempMax: 120,
      tempoReacao: "5 h",
      equacao: "C2H4N4 + C2H7N -> C4H11N5",
      perigos: "Vapores de amina voláteis e inflamáveis sob refluxo térmico.",
      tipoReacao: "Adição nucleofílica de amina a nitrila",
      descricao: "Reação da cianoguanidina com dimetilamina em solvente polar, gerando o esqueleto de biguanida isolado como sal cloridrato."
    },
    "amoxicilina": {
      nome: "Amoxicilina Tri-hidratada",
      reagentes: ["Ácido 6-Aminopenicilânico (6-APA)", "Cloreto de D-p-hidroxifenilglicina protegido"],
      catalisador: "Trietilamina (Et3N) ou Enzima Penicilina Acilase",
      solvente: "Diclorometano aquoso (CH2Cl2)",
      tempMin: 0,
      tempMax: 25,
      tempoReacao: "2 h",
      equacao: "C8H12N2O3S + C9H9ClNO3 -> C16H19N3O5S",
      perigos: "Antibiótico beta-lactâmico com elevado potencial alergênico e anafilático.",
      tipoReacao: "Acilação enantiosseletiva de amina beta-lactâmica",
      descricao: "Acilação do núcleo 6-APA com cloreto de p-hidroxifenilglicina protegido sob pH controlado (6.0), seguida de desproteção ácida."
    },
    "omeprazol": {
      nome: "Omeprazol",
      reagentes: ["Sulfeto de Omeprazol (tioéter precursor)", "Ácido m-Cloroperbenzóico (MCPBA)"],
      catalisador: "Controle estequiométrico estrito (sem catalisador)",
      solvente: "Diclorometano (CH2Cl2)",
      tempMin: 0,
      tempMax: 25,
      tempoReacao: "2 h",
      equacao: "C17H19N3OS + MCPBA -> C17H19N3O3S",
      perigos: "Perácidos são oxidantes térmicos instáveis com risco de decomposição violenta.",
      tipoReacao: "Oxidação quimiosseletiva de sulfeto a sulfóxido",
      descricao: "Oxidação controlada do tioéter precursor com perácido a temperaturas sub-ambiente para prevenir a superoxidação a sulfona."
    },
    "diazepam": {
      nome: "Diazepam",
      reagentes: ["2-Amino-5-clorobenzofenona", "Cloreto de Cloroacetila", "Amônia (NH3)"],
      catalisador: "NaOH aquoso",
      solvente: "Etanol Absoluto",
      tempMin: 60,
      tempMax: 80,
      tempoReacao: "4 h",
      equacao: "C13H10ClNO + C2H2Cl2O + NH3 -> C16H13ClN2O",
      perigos: "Substância psicotrópica controlada; cloreto de cloroacetila é vesicante severo.",
      tipoReacao: "Acilação seguida de amonólise e ciclização intramolecular",
      descricao: "Formação do anel benzodiazepínico de 7 membros via acilação da aminobenzofenona, amonólise e fechamento térmico de anel."
    },
    "clonazepam": {
      nome: "Clonazepam",
      reagentes: ["2-Amino-5-nitrobenzofenona", "Cloreto de Cloroacetila", "Amônia"],
      catalisador: "NaOH aquoso",
      solvente: "Etanol Absoluto",
      tempMin: 60,
      tempMax: 80,
      tempoReacao: "5 h",
      equacao: "C13H10N2O3 + C2H2Cl2O -> C15H10ClN3O3",
      perigos: "Composto sujeito a controle sanitário estrito; vapores tóxicos e corrosivos.",
      tipoReacao: "Ciclização benzodiazepínica aromática",
      descricao: "Condensação da 2-amino-5-nitrobenzofenona com cloreto de cloroacetila seguida de ciclização induzida por amônia."
    },
    "fluoxetina": {
      nome: "Cloridrato de Fluoxetina",
      reagentes: ["(3-Cloropropil)benzeno", "4-(Trifluorometil)fenol", "Metilamina"],
      catalisador: "NaOH aquoso",
      solvente: "Dimetilformamida (DMF)",
      tempMin: 60,
      tempMax: 80,
      tempoReacao: "4 h",
      equacao: "C9H11Cl + C7H5F3O + CH5N -> C17H18F3NO·HCl",
      perigos: "Fenóis fluorados são cáusticos; metilamina é um gás inflamável e irritante.",
      tipoReacao: "Adição de Michael + Aminação nucleofílica",
      descricao: "Eterificação aromática do fenol fluorado com o haleto, seguida de aminação nucleofílica com metilamina e salificação."
    },
    "sertralina": {
      nome: "Cloridrato de Sertralina",
      reagentes: ["4-(3,4-Diclorofenil)-3,4-diidronaftalen-1(2H)-ona", "3,4-Diclorofenil-lítio", "Metilamina"],
      catalisador: "Pd/C (Hidrogenação catalítica)",
      solvente: "Tetraidrofurano (THF)",
      tempMin: -78,
      tempMax: 25,
      tempoReacao: "3 h",
      equacao: "C10H8O + C6H3Cl2Li -> C17H17Cl2N·HCl",
      perigos: "Reagentes organolíticos são pirofóricos (queimam espontaneamente em contato com o ar).",
      tipoReacao: "Adição nucleofílica de organolítico + Aminação redutiva cis-seletiva",
      descricao: "Adição organometálica à tetralona, seguida de desidratação e hidrogenação catalítica diastereosseletiva para obter o isômero cis."
    },
    "atorvastatina": {
      nome: "Atorvastatina Cálcica",
      reagentes: ["4-Fluorobenzaldeído", "Acetoacetato de Etila", "Isobutirilacetato de Etila"],
      catalisador: "NaOH / Ácido Piválico",
      solvente: "Etanol Absoluto",
      tempMin: 60,
      tempMax: 80,
      tempoReacao: "8 h",
      equacao: "C7H5FO + C6H10O3 + C8H14O3 -> C33H35FN2O5",
      perigos: "Solventes voláteis inflamáveis.",
      tipoReacao: "Síntese convergente de Paal-Knorr para anel pirrólico",
      descricao: "Condensação de Paal-Knorr para construção do anel pirrol central pentassubstituído, seguida de extensão enantiossedletiva da cadeia lateral."
    },
    "sildenafila": {
      nome: "Citrato de Sildenafila",
      reagentes: ["2-Etoxibenzamida", "4-Metilpiperazina", "Cloreto de 5-(2-clorofenil)-1H-pirazol-3-carbonila"],
      catalisador: "Trietilamina (Et3N) e Ácido Cítrico",
      solvente: "Dimetilformamida (DMF)",
      tempMin: 70,
      tempMax: 90,
      tempoReacao: "8 h",
      equacao: "C9H11NO2 + C5H12N2 + C10H6Cl2N2O -> C22H30N6O4S·C6H8O7",
      perigos: "Cloretos de acila e sulfonila liberam fumos densos de HCl.",
      tipoReacao: "Acoplamento e ciclização a pirazolopirimidinona + Sulfonilação",
      descricao: "Acoplamento para fechamento do sistema pirazolopirimidinona, sulfonilação na posição 5' com piperazina e precipitação com ácido cítrico."
    },
    "salicilato de metila": {
      nome: "Salicilato de Metila",
      reagentes: ["AcidoSalicilico_s", "Metanol_l"],
      catalisador: "H2SO4_aq",
      solvente: "Metanol_l",
      tempMin: 65,
      tempMax: 75,
      tempoReacao: "3 h",
      equacao: "C7H6O3 + CH3OH -> C8H8O3 + H2O",
      perigos: "Inflamável, Irritante. Metanol é tóxico por ingestão e inalação.",
      tipoReacao: "Esterificação clássica de Fischer",
      descricao: "Esterificação de Fischer entre ácido salicílico e excesso de metanol catalisada por ácido sulfúrico concentrado sob refluxo térmico."
    },
    "acetato de isopentila": {
      nome: "Acetato de Isopentila (Aroma de Banana)",
      reagentes: ["AcidoAcetico_aq", "AlcoolIsopentilico_l"],
      catalisador: "H2SO4_aq",
      solvente: "AcidoAcetico_aq",
      tempMin: 70,
      tempMax: 90,
      tempoReacao: "2 h",
      equacao: "CH3COOH + C5H12O -> C7H14O2 + H2O",
      perigos: "Vapores inflamáveis.",
      tipoReacao: "Esterificação de Fischer",
      descricao: "Condensação ácida de álcool isopentílico com ácido acético com separação de fase do éster insolúvel em água."
    },
    "chuva de ouro": {
      nome: "Iodeto de Chumbo II (Precipitado Dourado)",
      reagentes: ["PbNO3_aq", "KI_aq"],
      catalisador: "Não requer",
      solvente: "Agua_l",
      tempMin: 20,
      tempMax: 90,
      tempoReacao: "Imediato",
      equacao: "Pb(NO3)2 + 2KI -> PbI2 + 2KNO3",
      perigos: "Tóxico cumulativo (sais solúveis de chumbo são neurotóxicos).",
      tipoReacao: "Dupla troca com precipitação regida por Ksp",
      descricao: "Reação aquosa instantânea que forma um precipitado amarelo intenso de PbI2. Ao aquecer até dissolução e resfriar lentamente, recristalizam lâminas douradas cintilantes."
    }
  },

  carregarBaseSintesesDinamica() {
    if (typeof window.BANCO_SINTESES_LAIFT === 'undefined' || !Array.isArray(window.BANCO_SINTESES_LAIFT)) {
      return;
    }

    window.BANCO_SINTESES_LAIFT.forEach(item => {
      if (!item || !item.nomeComposto) return;
      const chaveId = (item.id || '').replace(/^sintese_/, '').toLowerCase().trim();
      const chaveNome = (item.nomeComposto || '').toLowerCase().trim();
      const chaveNormalizada = chaveNome.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      const dadosFormatados = {
        nome: item.nomeComposto,
        reagentes: Array.isArray(item.reagentesObrigatorios) ? item.reagentesObrigatorios : [],
        catalisador: item.catalisador || 'Sem catalisador específico',
        solvente: item.solvente || 'Meio direto',
        tempMin: item.tempMinima !== undefined ? item.tempMinima : 20,
        tempMax: item.tempMaxima !== undefined ? item.tempMaxima : 100,
        tempoReacao: item.tempoReacao || '--',
        equacao: item.equacaoQuimica || item.equacao || '--',
        perigos: Array.isArray(item.perigos) ? item.perigos.join(', ') : (item.perigos || 'Manipulação padrão'),
        tipoReacao: item.tipoReacao || 'Síntese química',
        descricao: item.descricao || ''
      };

      if (chaveId) this.ROTAS_SINTESE[chaveId] = dadosFormatados;
      if (chaveNome) this.ROTAS_SINTESE[chaveNome] = dadosFormatados;
      if (chaveNormalizada) this.ROTAS_SINTESE[chaveNormalizada] = dadosFormatados;
    });

    console.log(`✅ [Preceptor Farmacêutico] ${Object.keys(this.ROTAS_SINTESE).length} rotas indexadas na Camada 1.`);
  },

  // =========================================================================
  // 2. DISPARO REMOTO AO APPS SCRIPT (CAMADA 3 — PADRÃO CLÍNICO GROQ)
  // =========================================================================
  async consultarGroqRemoto(msgUsuario, sys, calcularpH, agitadorAtivo) {
    const gateway = window.APPS_SCRIPT_GATEWAY;
    if (!gateway || gateway.includes('SEU_GATEWAY')) {
      throw new Error('Endpoint do Apps Script não configurado em window.APPS_SCRIPT_GATEWAY.');
    }

    const especiesVaso = (sys && sys.especies)
      ? Array.from(sys.especies.entries())
          .filter(([_, q]) => q > 0.01)
          .map(([esp, q]) => `${esp.replace(/_s|_g|_l|_aq/g, '')} (${q.toFixed(1)} mmol)`)
          .join(', ') || 'Vidraria limpa / solvente puro'
      : 'Bancada em repouso';

    const phMedido = typeof calcularpH === 'function' ? calcularpH().toFixed(2) : '7.00';
    const tempAtual = sys && typeof sys.temp === 'number' ? sys.temp.toFixed(1) : '25.0';
    const pressaoAtual = sys && typeof sys.pressao === 'number' ? sys.pressao.toFixed(2) : '1.00';
    const volAtual = sys && typeof sys.vol === 'number' ? sys.vol.toFixed(1) : '0.0';
    const maxVol = sys && sys.maxVol ? sys.maxVol : 250;
    const isClosed = sys ? Boolean(sys.isClosed) : false;

    const contextoBancada = `
- Temperatura: ${tempAtual} °C
- Pressão: ${pressaoAtual} atm
- pH Atual: ${phMedido}
- Volume: ${volAtual} mL (Capacidade máxima: ${maxVol} mL)
- Sistema Físico: ${isClosed ? 'Fechado com rolha' : 'Aberto à atmosfera'}
- Agitador Magnético: ${agitadorAtivo ? 'Ativo' : 'Desligado'}
- Espécies presentes no vaso: [${especiesVaso}]
`.trim();

    // Mantém o histórico recente (janela deslizante de 8 turnos)
    this.historicoChatLab.push({ autor: 'estudante', texto: msgUsuario });
    if (this.historicoChatLab.length > 8) this.historicoChatLab.shift();

    const payload = {
      acao: 'consultarPreceptorIA',
      duvida: msgUsuario,
      contexto: contextoBancada,
      historico: this.historicoChatLab
    };

    const res = await fetch(gateway, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.sucesso && data.erro) {
      throw new Error(data.erro);
    }

    const textoResposta = data.resposta || data.conteudo || data.falaPaciente || data.mensagem;
    if (!textoResposta) {
      throw new Error('O backend retornou uma resposta sem conteúdo textual legível.');
    }

    // Registra a fala do preceptor no histórico para contexto imediato da próxima pergunta
    this.historicoChatLab.push({ autor: 'preceptor', texto: textoResposta });
    if (this.historicoChatLab.length > 8) this.historicoChatLab.shift();

    return textoResposta;
  },

  // =========================================================================
  // 3. MOTOR PRINCIPAL DE PROCESSAMENTO EM CASCATA
  // =========================================================================
  async processarMensagem(msgUsuario, sys, calcularpH, agitadorAtivo) {
    const texto = msgUsuario.toLowerCase().trim();
    const textoNorm = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 1. Diagnóstico rápido do vaso atual
    if (textoNorm.includes("o que tem") || textoNorm.includes("acontecendo") || textoNorm.includes("analis") || textoNorm.includes("diagnostico") || textoNorm.includes("status")) {
      const diag = this.gerarDiagnosticoVaso(sys, calcularpH, agitadorAtivo);
      return `
**🔬 Diagnóstico Farmacotécnico da Vidraria Atual:**
${diag.resumo}

${diag.detalhes}

**⚠️ Avaliação de Biossegurança:** ${diag.alerta}
      `.trim();
    }

    // 2. Predição de incompatibilidades e reações imediatas da bancada
    if (textoNorm.includes("acontece se") || textoNorm.includes("misturar") || textoNorm.includes("adicionar") || textoNorm.includes("colocar")) {
      if (typeof LAB_DATABASE !== 'undefined' && LAB_DATABASE.species) {
        for (const [reag, info] of Object.entries(LAB_DATABASE.species)) {
          if (textoNorm.includes(reag.toLowerCase()) || textoNorm.includes((info.label || '').toLowerCase())) {
            return this.predizerMistura(reag, sys);
          }
        }
      }
    }

    // Identifica se a dúvida é expressamente sobre síntese / rota de preparo
    const ehPedidoSintese = /sintese|sintetizar|preparo|preparar|fabricar|produzir|rota|como fazer/i.test(textoNorm);

    // 3. Extração limpa para busca em acervo de síntese
    const termoComposto = textoNorm
      .replace(/como sintetizar|como fazer|rota de sintese de|sintese de|sintetizar|como preparar|preparo de|reacao de|fazer/gi, '')
      .replace(/[?.,!]/g, '')
      .trim();

    // --- CAMADA 1: Acervo Local Curado (0 ms / 0 tokens) ---
    // Só intercepta se o usuário estiver explicitamente perguntando como sintetizar/preparar
    if (ehPedidoSintese) {
      for (const [chave, rota] of Object.entries(this.ROTAS_SINTESE)) {
        const chaveNorm = chave.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const nomeNorm = rota.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        const matchDireto = textoNorm.includes(chaveNorm);
        const matchTermo = termoComposto.length >= 3 && (nomeNorm.includes(termoComposto) || termoComposto.includes(chaveNorm));

        if (matchDireto || matchTermo) {
          return `
**🧪 Rota Farmacotécnica Oficial: ${rota.nome}**

**1. Parâmetros de Bancada:**
* **Precursores:** ${rota.reagentes.join(' + ')}
* **Catalisador:** ${rota.catalisador}
* **Meio / Solvente:** ${rota.solvente || 'Direto'}
* **Condições Térmicas:** ${rota.tempMin}°C a ${rota.tempMax}°C (${rota.tempoReacao})
* **Equação Estequiométrica:** \`${rota.equacao}\`

**2. Mecanismo & Procedimento Prático:**
* **Tipo de Reação:** ${rota.tipoReacao}
* **Diretrizes:** ${rota.descricao}

**3. Biossegurança e Toxicologia:**
* **⚠️ Alerta Operacional:** ${rota.perigos}

*(⚡ Rota consultada instantaneamente do acervo do Químico Farmacêutico)*
          `.trim();
        }
      }
    }

    // --- CAMADA 2: Cache Global Compartilhado na Planilha (0 tokens) ---
    const gateway = window.APPS_SCRIPT_GATEWAY;
    if (ehPedidoSintese && gateway && termoComposto.length >= 3) {
      try {
        const resGlobal = await fetch(gateway, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ acao: 'consultarCacheGlobal', termo: termoComposto })
        });
        if (resGlobal.ok) {
          const dataGlobal = await resGlobal.json();
          if (dataGlobal && dataGlobal.sucesso && dataGlobal.sinteseCurada) {
            const rotaCurada = dataGlobal.sinteseCurada.respostaFormatada || dataGlobal.sinteseCurada;
            return `${rotaCurada}\n\n*(🌐 Rota recuperada do Acervo Coletivo LAIFT)*`;
          }
        }
      } catch (e) {
        console.warn('[Preceptor] Cache global não respondeu:', e);
      }
    }

    // --- CAMADA 3: Disparo Cognitivo Aberto via Cluster Groq ---
    // Encaminha livremente dúvidas sobre química, farmácia, física, biologia, bancada, etc.
    try {
      const respostaIA = await this.consultarGroqRemoto(msgUsuario, sys, calcularpH, agitadorAtivo);

      // Persistência em segundo plano para pedidos de síntese
      if (ehPedidoSintese && termoComposto.length >= 3 && gateway) {
        fetch(gateway, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            acao: 'salvarCacheGlobal',
            termo: termoComposto,
            dados: {
              nome: termoComposto.toUpperCase(),
              sintese: { respostaFormatada: respostaIA }
            }
          })
        }).catch(() => {});
      }

      return `${respostaIA}\n\n*(👨‍🔬 Orientações validadas pelo Químico Farmacêutico)*`;

    } catch (erroGroq) {
      console.error('[Preceptor IA Error]:', erroGroq);

      return `
⚠️ **Instabilidade na conexão com o Preceptor Sênior.**
*Detalhe técnico:* \`${erroGroq.message || erroGroq}\`

**Parâmetros Atuais da Bancada:**
* **Temperatura:** ${sys ? sys.temp.toFixed(1) : '25.0'} °C | **pH:** ${typeof calcularpH === 'function' ? calcularpH().toFixed(2) : '7.00'} | **Volume:** ${sys ? sys.vol.toFixed(1) : '0.0'} mL
* **Agitador:** ${agitadorAtivo ? 'Ligado' : 'Desligado'} | **Sistema:** ${sys && sys.isClosed ? 'Fechado com rolha' : 'Aberto'}

*Sugestão:* A base local está disponível para consultas diretas de rotas: **Dipirona**, **Aspirina**, **Paracetamol**, **Ibuprofeno**, **Diclofenaco**, **Captopril**, **Losartana**, **Amoxicilina** ou **Omeprazol**.
      `.trim();
    }
  },

  gerarDiagnosticoVaso(sys, calcularpH, agitadorAtivo) {
    const ph = typeof calcularpH === 'function' ? calcularpH() : 7.0;
    const temp = sys && typeof sys.temp === 'number' ? sys.temp : 25.0;
    const vol = sys && typeof sys.vol === 'number' ? sys.vol : 0.0;
    const especies = (sys && sys.especies) ? Array.from(sys.especies.entries()).filter(([_, q]) => q > 0.05) : [];

    if (vol === 0 && especies.length === 0) {
      return {
        resumo: "A vidraria está rigorosamente limpa e vazia.",
        detalhes: "Selecione um precursor no catálogo à esquerda para iniciar sua formulação.",
        alerta: "Nenhum risco químico ativo."
      };
    }

    const caracteristicaPH = ph < 3 ? "Fortemente Ácida (Corrosiva)" : ph < 6.5 ? "Levemente Ácida" : ph <= 7.5 ? "Neutra" : ph < 11 ? "Levemente Básica" : "Fortemente Alcalina (Cáustica)";
    const estadoTermico = temp < 10 ? "Resfriada (Banho de Gelo)" : temp <= 35 ? "Temperatura Ambiente" : temp < 70 ? "Aquecimento Moderado" : "Alta Energia Térmica";
    const especiesNomes = especies.map(([esp, q]) => `${esp.replace(/_s|_g|_l|_aq/g, '')} (${q.toFixed(1)} mmol)`).join(', ');

    return {
      resumo: `Vaso reacional contendo **${vol.toFixed(1)} mL** a **${temp.toFixed(1)}°C** (${estadoTermico}). Meio **${caracteristicaPH}** (pH ${ph.toFixed(2)}).`,
      detalhes: `**Espécies em solução:** ${especiesNomes || "Apenas solvente base"}. Agitador magnético: **${agitadorAtivo ? "Ativo" : "Parado"}**.`,
      alerta: (sys && sys.pressao > 2.0) ? `⚠️ Pressão interna elevada (${sys.pressao.toFixed(2)} atm)! Risco de sobrepressão na vidraria.` : "Parâmetros físico-químicos sob controle analítico."
    };
  },

  predizerMistura(reagenteAlvo, sys) {
    if (!sys || !sys.especies) return "Aguardando inicialização da vidraria.";

    const temAcido = (sys.especies.get('H+') || 0) > 0.1 || (sys.especies.get('HCl_aq') || 0) > 0 || (sys.especies.get('H2SO4_aq') || 0) > 0;
    const temAgua = (sys.especies.get('H2O_l') || 0) > 0;

    if (['Na_s', 'Li_s', 'K_s'].includes(reagenteAlvo) && temAgua) {
      return "⚠️ **ALERTA MÁXIMO DE BIOSSEGURANÇA:** Metais alcalinos reagem violentamente com água liberando hidróxido cáustico e gás hidrogênio (H₂), com risco imediato de ignição explosiva.";
    }

    if (reagenteAlvo === 'NaClO_aq' && temAcido) {
      return "⚠️ **ALERTA TOXICOLÓGICO:** A acidificação de hipoclorito libera **Gás Cloro (Cl₂)**, altamente irritante para o trato respiratório e asfixiante.";
    }

    if (['CaCO3_s', 'NaHCO3_s', 'NaHCO3_aq', 'Na2CO3_aq'].includes(reagenteAlvo) && temAcido) {
      return "🧪 **Reação de Efervescência:** Ocorre liberação rápida de **Dióxido de Carbono (CO₂)**. Atenção estrita à sobrepressão caso utilize vidraria fechada com rolha.";
    }

    return "A adição deste reagente modificará a estequiometria e o equilíbrio iônico do meio. Acompanhe a curva de titulação e o pH após o despejo.";
  }
};

// =========================================================================
// 4. EXPORTAÇÃO GLOBAL E UTILITÁRIOS DO CHAT
// =========================================================================
window.LabPreceptorEngine = LabPreceptorEngine;

window.enviarDuvidaRapida = function(pergunta) {
  const input = document.getElementById('labChatInput');
  if (input) {
    input.value = pergunta;
    if (typeof window.enviarDuvidaLab === 'function') {
      window.enviarDuvidaLab();
    }
  }
};

window.limparChatPreceptor = function() {
  const chatBox = document.getElementById('labChatMessages');
  if (!chatBox) return;

  if (window.LabPreceptorEngine) {
    window.LabPreceptorEngine.historicoChatLab = [];
  }

  chatBox.innerHTML = `
    <div class="lab-chat-msg msg-preceptor">
      Bancada sob supervisão do <strong>Químico Farmacêutico & Preceptor LAIFT</strong>. Como posso auxiliar na sua prática, cálculo estequiométrico, rota de síntese ou fundamentos analíticos hoje?
      <div class="chip-container">
        <button class="chat-chip" onclick="enviarDuvidaRapida('Como sintetizar Dipirona?')">💊 Síntese de Dipirona</button>
        <button class="chat-chip" onclick="enviarDuvidaRapida('Como sintetizar Aspirina?')">🧪 Rota da Aspirina</button>
        <button class="chat-chip" onclick="enviarDuvidaRapida('Como sintetizar Ibuprofeno?')">🔬 Rota do Ibuprofeno</button>
        <button class="chat-chip" onclick="enviarDuvidaRapida('O que tem no meu vaso?')">🌡️ Diagnóstico do Vaso</button>
      </div>
    </div>
  `;
  chatBox.scrollTop = 0;
};

if (typeof LabPreceptorEngine !== 'undefined') {
  LabPreceptorEngine.carregarBaseSintesesDinamica();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    window.limparChatPreceptor();
  });
}
