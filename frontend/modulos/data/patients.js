/**
 * BANCO DE DADOS DE CASOS CLÍNICOS E AMBULATORIAIS (OSCE VIRTUAL)
 * Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia (LAIFT)
 */

const clinicalJourneys = [
  {
    id: "jornada_emergencia_tox",
    nome: "Plantão de Emergência Toxicológica",
    descricao: "Manejo de intoxicações agudas, defensivos agrícolas, acidentes com animais peçonhentos e antídotos.",
    casos: ["caso_tox_01", "caso_tox_03", "caso_tox_04"]
  },
  {
    id: "jornada_farmacia_clinica",
    nome: "Ambulatório de Farmacoterapia & Interações",
    descricao: "Avaliação de reações adversas graves, iatrogenias medicamentosas, interações de citocromos e nefrotoxicidade.",
    casos: ["caso_clin_02"]
  }
];

const clinicalCases = [
  // =========================================================
  // CASO 1: EMERGÊNCIA TOXICOLÓGICA (Defensivos Agrícolas)
  // =========================================================
  {
    id: "caso_tox_01",
    jornadaId: "jornada_emergencia_tox",
    ordemTrilha: 1,
    titulo: "Insuficiência Respiratória Aguda na Lavoura",
    tipo: "emergencia",
    dificuldade: "Intermediário",
    vitalidadeInicial: 85,
    pacienciaInicial: 90,
    taxaDecaimento: {
      vitalidadePorMinuto: 3,
      pacienciaPorMinuto: 1
    },
    paciente: {
      nome: "Agenor Silveira",
      idade: 52,
      peso: "74 kg",
      genero: "Masculino",
      profissao: "Trabalhador Rural / Diarista",
      alergias: "Nega alergias medicamentosas conhecidas",
      imagem: "👨‍🌾"
    },
    queixaPrincipal: "Tô sufocando... minhas vistas tão fechando... muita baba saindo... fraqueza nas pernas...",
    historicoAdmissao: "Trazido em caçamba de caminhonete por colegas de trabalho da lavoura de milho. Encontrado caído e desorientado ao lado de uma bomba costal de pulverização de defensivo agrícola com vazamento. Relatam início súbito de vômitos, tosse com secreção abundante, suor frio e tremores musculares.",
    sinaisVitais: {
      pa: "85/50 mmHg",
      fc: "42 bpm (Bradicardia severa)",
      fr: "34 irpm (Taquipneico com esforço respiratório)",
      temp: "35.8 °C",
      spo2: "81% em ar ambiente",
      glasgow: "11 (Sonolento / Torporoso)"
    },
    contextoOculto: {
      nome: "Agenor Silveira",
      idade: 52,
      pacienteProfissao: "Trabalhador rural na roça de milho",
      exposicaoReal: "Pulverização de inseticida organofosforado (Metamidofós/Paration) sem EPI adequado há cerca de 2 horas. A mangueira da bomba costal furou, molhando as costas e encharcando a camisa de algodão por tempo prolongado.",
      sintomas: "muita falta de ar como se estivesse afogando, peito apertado parecendo um nó, boca cheia de baba grossa, visão escura, dor de cabeça, cólica na barriga e músculos pulando sozinhos",
      comportamento: "Muito assustado, voz trêmula e embargada por secreções, confuso devido à falta de oxigênio, com medo de morrer.",
      regrasFala: "Fale em tom leigo e desesperado. Descreva a salivação como 'baba que não para', o peito como 'chiando parecendo chaleira' e os espasmos como 'carne pulando parecendo bicho andando por baixo'."
    },
    perguntasSugeridas: [
      "Qual produto químico ou veneno o senhor estava aplicando?",
      "O senhor usava máscara, luvas e macacão impermeável?",
      "Há quanto tempo os sintomas começaram?",
      "O produto entrou em contato direto com sua pele ou roupas?"
    ],
    examesDisponiveis: [
      {
        id: "colinesterase",
        nome: "Atividade da Colinesterase Plasmática e Eritrocitária",
        custoTempoMin: 10,
        impactoVitalidade: 0,
        impactoPaciencia: -2,
        essencial: true,
        resultado: "Colinesterase Plasmática: 980 U/L (Referência: 4.650 a 10.440 U/L). Inibição severa (>80%) compatível com síndrome colinérgica aguda."
      },
      {
        id: "gasometria",
        nome: "Gasometria Arterial",
        custoTempoMin: 5,
        impactoVitalidade: 0,
        impactoPaciencia: -2,
        essencial: true,
        resultado: "pH: 7.21 | PaCO2: 56 mmHg | PaO2: 54 mmHg | HCO3-: 22 mEq/L | SatO2: 83%. Acidose respiratória descompensada com hipoxemia grave."
      },
      {
        id: "ecg",
        nome: "Eletrocardiograma (ECG)",
        custoTempoMin: 3,
        impactoVitalidade: 0,
        impactoPaciencia: -1,
        essencial: true,
        resultado: "Bradicardia sinusal acentuada (40 bpm), intervalo PR limítrofe, sem supradesnível de segmento ST ou extrassístoles ventriculares."
      },
      {
        id: "hemograma",
        nome: "Hemograma Completo",
        custoTempoMin: 15,
        impactoVitalidade: -2,
        impactoPaciencia: -5,
        essencial: false,
        resultado: "Hemoglobina: 14.2 g/dL | Hematócrito: 43% | Leucócitos: 9.100/mm³ (Sem desvio) | Plaquetas: 220.000/mm³."
      },
      {
        id: "tomografia",
        nome: "Tomografia Computadorizada de Crânio",
        custoTempoMin: 25,
        impactoVitalidade: -10,
        impactoPaciencia: -15,
        essencial: false,
        resultado: "Ausência de hemorragias agudas, desvios de linha média ou lesões expansivas. Exame sem relevância diagnóstica imediata que atrasou conduta crítica."
      }
    ],
    gabaritoPreceptor: {
      diagnostico: "Intoxicação exógena aguda grave por inseticida inibidor da acetilcolinesterase (Organofosforado) manifestando Síndrome Colinérgica (efeitos muscarínicos e nicotínicos preponderantes).",
      conduta: "Desobstrução imediata de vias aéreas com aspiração de secreções e oxigenoterapia de alto fluxo; Administração endovenosa imediata de ATROPINA (1 a 2 mg a cada 5-10 minutos) titulada até a cessação da broncorreia e roncos pulmonares (atropinização); Remoção imediata de roupas contaminadas e lavagem dérmica vigorosa com água corrente e sabão; Avaliação precoce do uso de PRALIDOXIMA (reativador de colinesterase) antes do envelhecimento enzimático.",
      palavrasChave: ["atropina", "organofosforado", "colinergica", "descontaminacao", "oxigenio", "pralidoxima", "broncorreia"]
    }
  },

  // =========================================================
  // CASO 2: CLÍNICA MÉDICA & INTERAÇÕES (Farmacocinética / CYP3A4)
  // =========================================================
  {
    id: "caso_clin_02",
    jornadaId: "jornada_farmacia_clinica",
    ordemTrilha: 1,
    titulo: "Fadiga Muscular Incapacitante e Urina Escura",
    tipo: "ambulatorio",
    dificuldade: "Avançado",
    vitalidadeInicial: 90,
    pacienciaInicial: 80,
    taxaDecaimento: {
      vitalidadePorMinuto: 1,
      pacienciaPorMinuto: 5
    },
    paciente: {
      nome: "Marilene Fontes",
      idade: 61,
      peso: "68 kg",
      genero: "Feminino",
      profissao: "Professora Aposentada",
      alergias: "Dipirona",
      imagem: "👵"
    },
    queixaPrincipal: "Doutor(a), mal consigo levantar os braços para pentear o cabelo... e hoje cedo minha urina saiu escura igual borra de café.",
    historicoAdmissao: "Comparece ao ambulatório caminhando com passos curtos e auxílio da filha. Relata dores musculares intensas e difusas com perda de força nos braços e coxas há 3 dias. Refere ter tratado uma infecção no peito recentemente com remédio passado no posto de saúde.",
    sinaisVitais: {
      pa: "135/85 mmHg",
      fc: "76 bpm",
      fr: "16 irpm",
      temp: "36.6 °C",
      spo2: "97% em ar ambiente",
      glasgow: "15 (Lúcida, orientada, astenia intensa)"
    },
    contextoOculto: {
      nome: "Marilene",
      idade: 61,
      pacienteProfissao: "Professora aposentada",
      exposicaoReal: "Usa Sinvastatina 40 mg à noite há 3 anos para colesterol alto. Há 6 dias, recebeu prescrição de Claritromicina 500 mg de 12/12h para infecção respiratória. A Claritromicina inibiu fortemente o citocromo CYP3A4, bloqueando a metabolização da Sinvastatina e deflagrando rabdomiólise aguda.",
      sintomas: "dores profundas e queimação insuportável nos braços, coxas e costas, cansaço extremo, xixi escuro cor de café preto e que sai em pouca quantidade",
      comportamento: "Educada, com tom de voz cansado, queixosa de dor, preocupada com a possibilidade de ficar paralítica.",
      regrasFala: "Explique suas dores musculares. Se perguntarem sobre remédios, diga que toma 'um comprimido pro colesterol toda noite há anos' e 'um antibiótico novo de 12 em 12 horas que começou semana passada pro peito'."
    },
    perguntasSugeridas: [
      "Quais remédios a senhora toma todos os dias de forma contínua?",
      "Iniciou algum antibiótico ou medicamento novo nos últimos 7 a 10 dias?",
      "A senhora praticou exercícios pesados ou sofreu alguma queda recente?",
      "Além da urina escura, notou diminuição na quantidade de urina?"
    ],
    examesDisponiveis: [
      {
        id: "cpk",
        nome: "Creatina Fosfoquinase (CPK Total)",
        custoTempoMin: 15,
        impactoVitalidade: 0,
        impactoPaciencia: 2,
        essencial: true,
        resultado: "CPK Total: 16.450 U/L (Referência feminina: 26 a 192 U/L). Elevação maciça compatível com necrose de fibras musculares esqueléticas (Rabdomiólise)."
      },
      {
        id: "eas",
        nome: "Urina Tipo I (EAS / Fita Reativa)",
        custoTempoMin: 10,
        impactoVitalidade: 0,
        impactoPaciencia: 1,
        essencial: true,
        resultado: "Cor: Castanho escuro | Reação para Hemoglobina/Mioglobina: ++++ (Fortemente Positivo) | Hemácias no Sedimento: 1 por campo. Dissociação entre fita reagente e microscopia confirmando Mioglobinúria."
      },
      {
        id: "funcao_renal",
        nome: "Ureia, Creatinina e Eletrólitos",
        custoTempoMin: 15,
        impactoVitalidade: 0,
        impactoPaciencia: 0,
        essencial: true,
        resultado: "Creatinina Sérica: 2.4 mg/dL (Basal: 0.8 mg/dL) | Ureia: 82 mg/dL | Potássio Sérico: 5.6 mEq/L (Hipercalemia leve). Configura Lesão Renal Aguda KDIGO 2."
      },
      {
        id: "transaminases",
        nome: "TGO (AST) e TGP (ALT)",
        custoTempoMin: 15,
        impactoVitalidade: 0,
        impactoPaciencia: -2,
        essencial: false,
        resultado: "TGO (AST): 420 U/L (Elevada por liberação muscular) | TGP (ALT): 95 U/L | Bilirrubinas normais."
      },
      {
        id: "raiox",
        nome: "Radiografia Simples de Membros Inferiores",
        custoTempoMin: 20,
        impactoVitalidade: 0,
        impactoPaciencia: -12,
        essencial: false,
        resultado: "Estruturas ósseas íntegras, sem fraturas ou derrames articulares. Exame inútil para avaliação muscular que desgastou a paciente."
      }
    ],
    gabaritoPreceptor: {
      diagnostico: "Rabdomiólise grave induzida por interação farmacocinética (inibição enzimática do CYP3A4 pela Claritromicina elevando os níveis séricos de Sinvastatina), complicada com Lesão Renal Aguda nefrotóxica por Mioglobinúria e Hipercalemia.",
      conduta: "Suspensão imediata da Sinvastatina e da Claritromicina; Internação hospitalar para hidratação venosa vigorosa com Cristaloides (Solução Salina 0,9%) visando débito urinário > 200 mL/h; Alcalinização urinária com bicarbonato de sódio; Monitoramento eletrocardiográfico e dosagem seriada de Potássio; Substituição do antibiótico por opção sem interação com CYP3A4 (ex: Amoxicilina com Clavulanato ou Azitromicina).",
      palavrasChave: ["sinvastatina", "claritromicina", "cyp3a4", "rabdomiolise", "mioglobina", "hidratacao", "suspensao"]
    }
  },

  // =========================================================
  // CASO 3: TOXICOLOGIA CLÍNICA (Acidente Ofídico / Bothrops)
  // =========================================================
  {
    id: "caso_tox_03",
    jornadaId: "jornada_emergencia_tox",
    ordemTrilha: 2,
    titulo: "Acidente Ofídico com Dor Local e Sangramento Gengival",
    tipo: "emergencia",
    dificuldade: "Intermediário",
    vitalidadeInicial: 90,
    pacienciaInicial: 85,
    taxaDecaimento: {
      vitalidadePorMinuto: 2,
      pacienciaPorMinuto: 2
    },
    paciente: {
      nome: "Cleberton Ramos",
      idade: 34,
      peso: "80 kg",
      genero: "Masculino",
      profissao: "Trabalhador da Construção Civil / Eletricista",
      alergias: "Nega alergias conhecidas",
      imagem: "👷"
    },
    queixaPrincipal: "Doutor, uma cobra me picou na perna perto do entulho... meu pé tá parecendo uma bola e minha gengiva começou a sangrar.",
    historicoAdmissao: "Admitido na emergência 3 horas após acidente ofídico em terreno baldio. Traz foto no celular de uma serpente marrom com desenhos triangulares em forma de 'V' invertido ('jararaca'). Queixa-se de dor intensa no membro inferior direito e equimose ascendente.",
    sinaisVitais: {
      pa: "100/60 mmHg",
      fc: "104 bpm (Taquicardia sinusal)",
      fr: "20 irpm",
      temp: "37.0 °C",
      spo2: "98% em ar ambiente",
      glasgow: "15"
    },
    contextoOculto: {
      nome: "Cleberton",
      idade: 34,
      pacienteProfissao: "Eletricista de obras",
      exposicaoReal: "Picada por serpente do gênero Bothrops (Jararaca). O veneno possui atividades proteolítica (edema e dor intensa), coagulante (consumo de fibrinogênio) e hemorrágica (lesão vascular por metaloproteinases).",
      sintomas: "dor muito forte no tornozelo que queima e repuxa, perna inchada e roxa subindo até o joelho, sangramento vermelho vivo na gengiva ao cuspir",
      comportamento: "Inquieto de dor, assustado com o sangramento na boca, quer saber se vai perder a perna.",
      regrasFala: "Descreva a dor intensa na picada. Mostre preocupação com o sangramento na boca e informe que tirou foto da cobra no mato."
    },
    perguntasSugeridas: [
      "O senhor conseguiu ver a cobra ou tem fotos da serpente?",
      "Há quanto tempo ocorreu a picada?",
      "Fizeram torniquete, cortes ou colocaram produtos caseiros no local?",
      "Notou sangramento na urina, fezes ou vômitos?"
    ],
    examesDisponiveis: [
      {
        id: "tempo_coagulacao",
        nome: "Tempo de Coagulação (TC - Teste do Tubo de Ensaio)",
        custoTempoMin: 20,
        impactoVitalidade: 0,
        impactoPaciencia: -1,
        essencial: true,
        resultado: "Sangue incoagulável após 30 minutos de observação (TC incoagulável). Confirmação de consumo severo de fibrinogênio por ação trombina-símile."
      },
      {
        id: "coagulograma",
        nome: "Coagulograma Completo (TP, TTPa e Fibrinogênio)",
        custoTempoMin: 25,
        impactoVitalidade: 0,
        impactoPaciencia: -2,
        essencial: true,
        resultado: "Fibrinogênio: Indetectável (< 50 mg/dL) | Tempo de Protrombina (TP): Incoagulável | TTPa: Incoagulável."
      },
      {
        id: "funcao_renal_ofidico",
        nome: "Ureia e Creatinina Séricas",
        custoTempoMin: 15,
        impactoVitalidade: 0,
        impactoPaciencia: -1,
        essencial: true,
        resultado: "Creatinina: 1.1 mg/dL | Ureia: 38 mg/dL. Função renal preservada no momento."
      },
      {
        id: "raiox_tornozelo",
        nome: "Radiografia Simples do Tornozelo Picado",
        custoTempoMin: 20,
        impactoVitalidade: -2,
        impactoPaciencia: -6,
        essencial: false,
        resultado: "Edema difuso de partes moles periarticular. Ausência de fraturas ou dentes de serpente retidos."
      }
    ],
    gabaritoPreceptor: {
      diagnostico: "Acidente Ofídico Botrópico Moderado a Grave (envenenamento por Bothrops - Jararaca) com Síndrome Hemorrágica e Coagulopatia de Consumo (sangue incoagulável).",
      conduta: "Administração intravenosa imediata de SORO ANTIBOTRÓPICO (SAB) - 8 a 12 ampolas diluídas em soro fisiológico em dose única; Hidratação venosa vigorosa para prevenção de lesão renal aguda; Analgesia com analgésicos comuns ou opioides (evitar estritamente AINEs devido à coagulopatia); Elevação do membro acometido; Profilaxia antitetânica; Monitoramento de síndrome compartimental.",
      palavrasChave: ["antibotropico", "bothrops", "jararaca", "incoagulavel", "hidratacao", "fibrinogenio", "antialgicos"]
    }
  },

  // =========================================================
  // CASO 4: INTOXICAÇÃO MEDICAMENTOSA AGUDA (Paracetamol)
  // =========================================================
  {
    id: "caso_tox_04",
    jornadaId: "jornada_emergencia_tox",
    ordemTrilha: 3,
    titulo: "Ingestão Voluntária Maciça de Analgésicos",
    tipo: "emergencia",
    dificuldade: "Avançado",
    vitalidadeInicial: 95,
    pacienciaInicial: 70,
    taxaDecaimento: {
      vitalidadePorMinuto: 1,
      pacienciaPorMinuto: 3
    },
    paciente: {
      nome: "Lucas Albuquerque",
      idade: 22,
      peso: "62 kg",
      genero: "Masculino",
      profissao: "Estudante Universitário",
      alergias: "Nega alergias conhecidas",
      imagem: "🧑"
    },
    queixaPrincipal: "Tomei três caixas daquele remédio pra dor de cabeça faz umas 4 horas... tô enjoado, vomitando e com medo do que vai acontecer.",
    historicoAdmissao: "Trazido por amigos da faculdade após encontrar cartelas vazias no quarto. Confessa ingestão voluntária de aproximadamente 30 comprimidos de Paracetamol 750 mg (total de 22,5 g) há cerca de 4 horas em contexto de desespero emocional.",
    sinaisVitais: {
      pa: "115/75 mmHg",
      fc: "82 bpm",
      fr: "16 irpm",
      temp: "36.4 °C",
      spo2: "99% em ar ambiente",
      glasgow: "15 (Orientado, choroso, sudorese fria e náuseas)"
    },
    contextoOculto: {
      nome: "Lucas",
      idade: 22,
      pacienteProfissao: "Estudante de engenharia",
      exposicaoReal: "Ingestão aguda maciça de 22,5 g de Paracetamol (362 mg/kg). A dose satura as vias de sulfatação e glicuronidação, gerando acúmulo de NAPQI mediado pelo CYP2E1 que depletará toda a glutationa hepática em 8 a 12 horas.",
      sintomas: "enjoo forte na boca do estômago, sensação de estômago embrulhado, suor frio e tremedeira nas mãos",
      comportamento: "Choroso, arrependido, com vergonha do ato, colaborativo com as respostas médicas.",
      regrasFala: "Diga que tomou muitos comprimidos de paracetamol de 750mg há cerca de 4 horas. Relate náuseas e vômitos claros, mas negue dor forte por enquanto."
    },
    perguntasSugeridas: [
      "Quantos comprimidos e de qual dosagem exatamente você ingeriu?",
      "A que horas ocorreu a ingestão dos medicamentos?",
      "Houve ingestão concomitante de bebidas alcoólicas ou outros remédios?",
      "Você chegou a vomitar comprimidos inteiros em casa?"
    ],
    examesDisponiveis: [
      {
        id: "paracetamolemia",
        nome: "Dosagem Sérica de Paracetamol (Nível Plasmático)",
        custoTempoMin: 30,
        impactoVitalidade: 0,
        impactoPaciencia: 1,
        essencial: true,
        resultado: "Concentração sérica de Paracetamol (4 horas pós-ingestão): 220 µg/mL. Acima da linha de tratamento no Nomograma de Rumack-Matthew, indicando risco iminente de hepatotoxicidade fulminante."
      },
      {
        id: "transaminases_hepatites",
        nome: "TGO (AST), TGP (ALT) e Bilirrubinas",
        custoTempoMin: 20,
        impactoVitalidade: 0,
        impactoPaciencia: -1,
        essencial: true,
        resultado: "TGO: 38 U/L | TGP: 32 U/L | Bilirrubina Total: 0.8 mg/dL. Enzimas normais no momento (esperado para as primeiras 12 horas antes da necrose centrolobular)."
      },
      {
        id: "coagulograma_figado",
        nome: "Tempo de Protrombina (TP / INR)",
        custoTempoMin: 20,
        impactoVitalidade: 0,
        impactoPaciencia: -1,
        essencial: true,
        resultado: "INR: 1.05 | Atividade de Protrombina: 95%. Síntese hepática ainda preservada na fase inicial."
      },
      {
        id: "endoscopia_digestiva",
        nome: "Endoscopia Digestiva Alta (EDA)",
        custoTempoMin: 40,
        impactoVitalidade: -5,
        impactoPaciencia: -15,
        essencial: false,
        resultado: "Mucosa gástrica com discreto eritema antral. Ausência de bezoares ou sangramentos. Procedimento invasivo desnecessário que atrasou a infusão do antídoto."
      }
    ],
    gabaritoPreceptor: {
      diagnostico: "Intoxicação Exógena Aguda Grave por Paracetamol (Acetaminofeno) em dose tóxica (> 150 mg/kg), com risco crítico de Hepatite Tóxica Fulminante e necrose centrolobular.",
      conduta: "Início imediato do antídoto específico N-ACETILCISTEÍNA (NAC) por via intravenosa (Protocolo de 21 horas: ataque de 150 mg/kg em 1 hora, seguido de 50 mg/kg em 4 horas e 100 mg/kg em 16 horas); Como a ingestão ocorreu há cerca de 4 horas, realizar Carvão Ativado em dose única (1 g/kg); Monitoramento de transaminases, função renal e coagulograma a cada 12 horas; Avaliação psiquiátrica de suporte após estabilização clínica.",
      palavrasChave: ["acetilcisteina", "nac", "paracetamol", "rumack", "hepatotoxicidade", "carvao"]
    }
  }
];
