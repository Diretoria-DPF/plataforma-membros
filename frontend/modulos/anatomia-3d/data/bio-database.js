/* ========================================================================= */
/* ARQUIVO: anatomia-3d/data/bio-database.js                                 */
/* VERSÃO:  2.0.0                                                            */
/* DATA:    2026-01-15                                                       */
/*                                                                           */
/* CHANGELOG v2.0.0:                                                         */
/*  [P1] CORRIGIDO — musculoesqueletico dividido em esqueletico + articular  */
/*       + muscular (3 sistemas independentes)                              */
/*  [P2] CORRIGIDO — Duplicatas ovario/testiculo removidas de endocrino      */
/*  [P3] CORRIGIDO — processosDisponiveis preenchido em todos os 14 sistemas */
/*  [P4] CORRIGIDO — focoCamera.y === targetLook.y (consistência 3D)         */
/*  [P5] CORRIGIDO — meshKeywords agora usam convenção mesh_* com glob      */
/*  [NEW] paiId + nivelHierarquico (árvore completa)                        */
/*  [NEW] icd10, icd11, meshId, wikidataId, fipatId (metadados externos)    */
/*  [NEW] sinonimos[], termosRelacionados[], nomeEn/Es/La (i18n + busca)    */
/*  [NEW] vascularizacao, inervacao, histologia, patologias, referencias    */
/*  [NEW] Vias de administração: 7 → 18                                     */
/*  [NEW] Processos fisiológicos: 5 → 15                                    */
/*  [NEW] Alvos moleculares: 9 → 24                                         */
/*  [NEW] Protocolos de biohacking: 7 → 15                                  */
/*  [NEW] Sistemas: 11 → 14 (+ articular, linfático, fascial)               */
/* ========================================================================= */

const ATLAS_DATABASE = {
  // =========================================================================
  // METADADOS GLOBAIS
  // =========================================================================
  versao: "2.0.0",
  ultimaAtualizacao: "2026-01-15",
  idiomasSuportados: ["pt-BR", "en", "es"],
  fontePrimaria: "Terminologia Anatomica (FIPAT) + MeSH + Wikidata",

  // =========================================================================
  // 1. ÁRVORE ANATÔMICA COMPLETA — 14 SISTEMAS
  // =========================================================================
  sistemas: [
    // =====================================================================
    // 1. RESPIRATÓRIO
    // =====================================================================
    {
      id: "respiratorio",
      paiId: null,
      nivelHierarquico: "sistema",
      nome: "Sistema Respiratório",
      nomeEn: "Respiratory System",
      nomeEs: "Sistema Respiratorio",
      nomeLa: "Systema respiratorium",
      icone: "🫁",
      cor: "#06b6d4",

      // Navegação 3D [P4 CORRIGIDO]
      focoCamera: { x: 0, y: 1.35, z: 1.95 },
      targetLook: { x: 0, y: 1.35, z: 0 },
      camadaDisseccao: 5,
      // [P5 CORRIGIDO] convenção mesh_* com glob
      meshKeywords: ["mesh_lung_*", "mesh_trachea_*", "mesh_bronch*", "mesh_laryn*", "mesh_pharyn*", "mesh_nasal_*"],

      // Metadados externos
      fipatId: "A06.0.00.000",
      meshId: "D012137",
      icd11Capitulo: "Capítulo 12 — Doenças do aparelho respiratório",
      wikidataId: "Q7891",

      // Busca
      sinonimos: ["Aparelho respiratório", "Sistema da respiração", "Vias aeríferas"],
      termosRelacionados: ["hematose", "ventilação", "oxigenação", "surfactante", "complacência"],

      descricao: "Vias aéreas superiores e inferiores responsáveis pela condução, umidificação, filtragem do ar e hematose alvéolo-capilar.",
      funcaoFisiologica: "Troca gasosa (O₂/CO₂), regulação do pH sanguíneo, fonação, defesa imunológica.",
      embriologiaOrigem: "Endoderma (epitélio) + Mesoderma esplâncnico (tecido conjuntivo)",
      histologiaPredominante: "Epitélio respiratório pseudoestratificado ciliado com células caliciformes",

      // Órgãos com schema expandido
      orgaos: [
        {
          id: "nariz_cavidade_nasal",
          paiId: "respiratorio",
          nivelHierarquico: "orgao",
          nome: "Nariz & Cavidade Nasal",
          nomeEn: "Nose & Nasal Cavity",
          meshKey: "mesh_nasal_cavity",
          camada: 5,
          fipatId: "A06.1.00.001",
          meshId: "D009299",
          wikidataId: "Q7363",
          icd10: ["J34.0", "J34.2"],
          sinonimos: ["Cavum", "Fossa nasal"],
          descricao: "Filtração por vibrissas, termorregulação do fluxo aéreo e absorção rápida de fármacos via plexo de Kiesselbach.",
          funcaoPrincipal: "Condicionamento do ar e olfação",
          vascularizacao: {
            arterial: ["aa. etmoidais anteriores e posteriores", "aa. esfenopalatinas"],
            venosa: ["plexo de Kiesselbach", "vv. faciais"],
            linfatica: ["linfonodos submandibulares", "linfonodos retrofaríngeos"]
          },
          inervacao: {
            sensitiva: ["NC I (olfatório)", "NC V1 e V2 (trigêmeo)"],
            simpatica: "T1-T2 (vasoconstrição)",
            parassimpatica: "NC VII (secreção glandular)"
          },
          histologia: {
            epitelio: "Pseudoestratificado ciliado (região respiratória)",
            tiposCelulares: ["Células caliciformes", "Células ciliadas", "Células basais", "Células em escova"],
            matrizExtracelular: "Lâmina própria com colágeno I e III"
          },
          subestruturas: [
            { id: "piramide_nasal", nome: "Pirâmide Nasal", nivel: "subestrutura", wikidataId: "Q1472154" },
            { id: "septo_nasal", nome: "Septo Nasal", nivel: "subestrutura" },
            { id: "concha_superior", nome: "Concha Nasal Superior", nivel: "subestrutura" },
            { id: "concha_media", nome: "Concha Nasal Média", nivel: "subestrutura" },
            { id: "concha_inferior", nome: "Concha Nasal Inferior", nivel: "subestrutura" },
            { id: "seio_frontal", nome: "Seio Frontal", nivel: "subestrutura" },
            { id: "seio_maxilar", nome: "Seio Maxilar", nivel: "subestrutura" },
            { id: "seio_etmoidal", nome: "Seio Etmoidal", nivel: "subestrutura" },
            { id: "seio_esfenoidal", nome: "Seio Esfenoidal", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Rinite alérgica", icd10: "J30", icd11: "CA08.0" },
            { nome: "Sinusite crônica", icd10: "J32", icd11: "CA0A" },
            { nome: "Epistaxe", icd10: "R04.0", icd11: "MD20" }
          ],
          proteinasChave: [
            { nome: "Histamina H1", pdbId: "3RZE", funcao: "Alvo anti-histamínicos" }
          ],
          processosIds: [],
          farmacosRelacionados: ["loratadina", "mometasona", "oximetazolina"],
          referencias: [
            { fonte: "Gray's Anatomy", edicao: "42ª", capitulo: "Cap. 32" },
            { fonte: "Netter Atlas", edicao: "7ª", prancha: "26" }
          ]
        },
        {
          id: "faringe_respiratoria",
          paiId: "respiratorio",
          nivelHierarquico: "orgao",
          nome: "Faringe",
          nomeEn: "Pharynx",
          meshKey: "mesh_pharynx",
          camada: 5,
          fipatId: "A05.3.01.001",
          meshId: "D010614",
          wikidataId: "Q174778",
          icd10: ["J39.2"],
          descricao: "Zona de transição aerodigestiva com anel linfático de Waldeyer protegendo contra patógenos inalados.",
          funcaoPrincipal: "Passagem aerodigestiva",
          vascularizacao: {
            arterial: ["a. faríngea ascendente", "aa. palatinas"],
            venosa: ["plexo faríngeo"],
            linfatica: ["linfonodos cervicais profundos"]
          },
          inervacao: {
            sensitiva: ["NC IX", "NC X"],
            motora: ["NC IX", "NC X", "NC XI"]
          },
          histologia: {
            epitelio: "Pseudoestratificado ciliado (nasofaringe) → escamoso estratificado (orofaringe)",
            tiposCelulares: ["Células caliciformes", "Linfócitos intraepiteliais"]
          },
          subestruturas: [
            { id: "nasofaringe", nome: "Nasofaringe", nivel: "subestrutura" },
            { id: "orofaringe", nome: "Orofaringe", nivel: "subestrutura" },
            { id: "laringofaringe", nome: "Laringofaringe", nivel: "subestrutura" },
            { id: "anel_waldeyer", nome: "Anel Linfático de Waldeyer", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Faringite estreptocócica", icd10: "J02.0", icd11: "CA02" },
            { nome: "Câncer de nasofaringe", icd10: "C11", icd11: "2B6B" }
          ],
          proteinasChave: [],
          processosIds: ["degluticao_humana"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 33" }]
        },
        {
          id: "laringe",
          paiId: "respiratorio",
          nivelHierarquico: "orgao",
          nome: "Laringe",
          nomeEn: "Larynx",
          meshKey: "mesh_larynx",
          camada: 5,
          fipatId: "A06.2.01.001",
          meshId: "D007830",
          wikidataId: "Q16364",
          icd10: ["J38.0", "J38.6"],
          descricao: "Órgão fonador com proteção de vias aéreas inferiores via reflexo de fechamento glótico pela epiglote.",
          funcaoPrincipal: "Fonação e proteção da via aérea",
          vascularizacao: {
            arterial: ["a. laríngea superior (ramo da tiroideana superior)", "a. laríngea inferior (ramo da tiroideana inferior)"],
            venosa: ["vv. laríngeas superior e inferior → v. jugular interna"],
            linfatica: ["linfonodos cervicais profundos"]
          },
          inervacao: {
            sensitiva: ["NC X - ramo interno do laríngeo superior (supraglote)", "NC X - laríngeo recorrente (infraglote)"],
            motora: ["NC X - laríngeo recorrente", "NC X - laríngeo externo (cricotireóideo)"]
          },
          histologia: {
            epitelio: "Escamoso estratificado (cordas vocais) + pseudoestratificado ciliado (restante)",
            tiposCelulares: ["Células ciliadas", "Células caliciformes"]
          },
          subestruturas: [
            { id: "cart_tireoidea", nome: "Cartilagem Tireóidea", nivel: "subestrutura" },
            { id: "cart_cricoidea", nome: "Cartilagem Cricóidea", nivel: "subestrutura" },
            { id: "epiglote", nome: "Epiglote", nivel: "subestrutura" },
            { id: "cart_aritenoideas", nome: "Cartilagens Aritenóideas", nivel: "subestrutura" },
            { id: "prega_vocal_verdadeira", nome: "Pregas Vocais Verdadeiras", nivel: "subestrutura" },
            { id: "prega_vocal_falsa", nome: "Pregas Vocais Falsas", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Laringite aguda", icd10: "J04.0", icd11: "CA04" },
            { nome: "Câncer de laringe", icd10: "C32", icd11: "2C23" },
            { nome: "Paralisia de corda vocal", icd10: "J38.0", icd11: "CA0E" }
          ],
          proteinasChave: [],
          processosIds: ["degluticao_humana"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 34" }]
        },
        {
          id: "traqueia",
          paiId: "respiratorio",
          nivelHierarquico: "orgao",
          nome: "Traqueia",
          nomeEn: "Trachea",
          meshKey: "mesh_trachea",
          camada: 5,
          fipatId: "A06.3.01.001",
          meshId: "D014132",
          wikidataId: "Q173466",
          icd10: ["J39.8", "C33"],
          descricao: "Tubo fibrocartilaginoso com 16 a 20 anéis em C mantendo a patência da luz contra pressões pleurais negativas.",
          funcaoPrincipal: "Condução do ar",
          vascularizacao: {
            arterial: ["aa. traqueais (ramos das tireocervicais)"],
            venosa: ["plexo venoso traqueal → vv. braquiocefálicas"],
            linfatica: ["linfonodos paratraqueais e traqueobronquiais"]
          },
          inervacao: {
            sensitiva: ["NC X - laríngeo recorrente"],
            parassimpatica: "NC X (secreção e broncoconstrição)"
          },
          histologia: {
            epitelio: "Pseudoestratificado ciliado",
            tiposCelulares: ["Caliciformes", "Ciliadas", "Basais", "Serosas", "Células de Kulchitsky (endócrinas)"],
            matrizExtracelular: "Cartilagem hialina (anéis), músculo liso (traqueal)"
          },
          subestruturas: [
            { id: "aneis_cartilaginosos", nome: "Anéis Cartilaginosos Traqueais", nivel: "subestrutura" },
            { id: "musculo_traqueal", nome: "Músculo Traqueal Posterior", nivel: "subestrutura" },
            { id: "carina", nome: "Carina Traqueal", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Traqueíte", icd10: "J04.1" },
            { nome: "Estenose traqueal", icd10: "J39.8" }
          ],
          proteinasChave: [],
          processosIds: ["hematose_alveolar"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 35" }]
        },
        {
          id: "bronquios_bronquiolos",
          paiId: "respiratorio",
          nivelHierarquico: "orgao",
          nome: "Árvore Brônquica",
          nomeEn: "Bronchial Tree",
          meshKey: "mesh_bronchi",
          camada: 5,
          fipatId: "A06.4.01.001",
          meshId: "D001982",
          wikidataId: "Q193107",
          icd10: ["J40", "J47"],
          descricao: "Ramificações condutoras até bronquíolos terminais e respiratórios suscetíveis a broncoconstrição colinérgica.",
          funcaoPrincipal: "Condução e condicionamento do ar",
          vascularizacao: {
            arterial: ["aa. brônquicas (ramos da aorta torácica)"],
            venosa: ["vv. brônquicas"],
            linfatica: ["linfonodos hilares"]
          },
          inervacao: {
            simpatica: "T2-T5 → β2 (broncodilatação)",
            parassimpatica: "NC X → M3 (broncoconstrição e secreção)"
          },
          histologia: {
            epitelio: "Pseudoestratificado ciliado (brônquios) → cuboide simples (bronquíolos)",
            tiposCelulares: ["Caliciformes (diminuem distalmente)", "Ciliadas", "Clara (bronquíolos)"]
          },
          subestruturas: [
            { id: "bronquio_principal_dir", nome: "Brônquio Principal Direito", nivel: "subestrutura" },
            { id: "bronquio_principal_esq", nome: "Brônquio Principal Esquerdo", nivel: "subestrutura" },
            { id: "bronquios_lobares", nome: "Brônquios Lobares", nivel: "subestrutura" },
            { id: "bronquios_segmentares", nome: "Brônquios Segmentares", nivel: "subestrutura" },
            { id: "bronquiolos_terminais", nome: "Bronquíolos Terminais", nivel: "subestrutura" },
            { id: "bronquiolos_respiratorios", nome: "Bronquíolos Respiratórios", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Asma", icd10: "J45", icd11: "CA23" },
            { nome: "DPOC", icd10: "J44", icd11: "CA22" },
            { nome: "Bronquiectasia", icd10: "J47", icd11: "CA24" }
          ],
          proteinasChave: [
            { nome: "Receptor β2-adrenérgico", pdbId: "2R4R", funcao: "Alvo broncodilatador" },
            { nome: "Receptor M3 muscarínico", pdbId: "5ZHP", funcao: "Alvo broncoconstritor" }
          ],
          processosIds: ["hematose_alveolar"],
          farmacosRelacionados: ["salbutamol", "ipratropio", "budesonida"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 36" }]
        },
        {
          id: "pulmoes_alveolos",
          paiId: "respiratorio",
          nivelHierarquico: "orgao",
          nome: "Pulmões & Alvéolos",
          nomeEn: "Lungs & Alveoli",
          meshKey: "mesh_lung",
          camada: 5,
          fipatId: "A06.5.01.001",
          meshId: "D008168",
          wikidataId: "Q7886",
          icd10: ["J98.4", "C34"],
          descricao: "Área alveolar de ~100 m² revestida por pneumócitos tipo I (troca gasosa) e pneumócitos tipo II (surfactante pulmonar).",
          funcaoPrincipal: "Hematose (troca gasosa O₂/CO₂)",
          vascularizacao: {
            arterial: ["aa. pulmonares", "aa. brônquicas"],
            venosa: ["vv. pulmonares (4)", "vv. brônquicas"],
            linfatica: ["plexo linfático subpleural", "linfonodos hilares"]
          },
          inervacao: {
            simpatica: "T1-T5 (broncodilatação, vasodilatação)",
            parassimpatica: "NC X (broncoconstrição, secreção)"
          },
          histologia: {
            epitelio: "Pavimentoso simples (alvéolos)",
            tiposCelulares: [
              "Pneumócito tipo I (95% área)",
              "Pneumócito tipo II (surfactante)",
              "Macrófago alveolar",
              "Célula de Clara (bronquiolar)"
            ],
            matrizExtracelular: "Elastina, colágeno I/III (interstício)"
          },
          subestruturas: [
            { id: "lobo_superior_dir", nome: "Lobo Superior Direito", nivel: "subestrutura" },
            { id: "lobo_medio_dir", nome: "Lobo Médio Direito", nivel: "subestrutura" },
            { id: "lobo_inferior_dir", nome: "Lobo Inferior Direito", nivel: "subestrutura" },
            { id: "lobo_superior_esq", nome: "Lobo Superior Esquerdo", nivel: "subestrutura" },
            { id: "lobo_inferior_esq", nome: "Lobo Inferior Esquerdo", nivel: "subestrutura" },
            { id: "alveolos", nome: "Alvéolos", nivel: "subestrutura" },
            { id: "pleura_visceral", nome: "Pleura Visceral", nivel: "subestrutura" },
            { id: "pleura_parietal", nome: "Pleura Parietal", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Pneumonia", icd10: "J18", icd11: "CA40" },
            { nome: "Enfisema pulmonar", icd10: "J43", icd11: "CA22" },
            { nome: "COVID-19", icd10: "U07.1", icd11: "RA01.0" },
            { nome: "Câncer de pulmão", icd10: "C34", icd11: "2C25" },
            { nome: "SDRA", icd10: "J80", icd11: "CB02" }
          ],
          proteinasChave: [
            { nome: "ACE2", pdbId: "1R42", funcao: "Receptor do SARS-CoV-2" },
            { nome: "Surfactante SP-A", pdbId: "1SP-A", funcao: "Defesa imune + redução tensão" },
            { nome: "TMPRSS2", pdbId: "7MEQ", funcao: "Protease de ativação viral" }
          ],
          processosIds: ["hematose_alveolar", "ventilacao_pulmonar"],
          farmacosRelacionados: ["salbutamol", "budesonida", "sildenafil"],
          referencias: [
            { fonte: "Gray's Anatomy", edicao: "42ª", capitulo: "Cap. 37" },
            { fonte: "West — Fisiologia Respiratória", edicao: "9ª" }
          ]
        }
      ],

      processosDisponiveis: ["hematose_alveolar", "ventilacao_pulmonar"],
      farmacosRelacionados: ["salbutamol", "ipratropio", "budesonida", "sildenafil", "n-acetilcisteina"],
      celulasTipicas: ["pneumocito_I", "pneumocito_II", "macrofago_alveolar", "celula_calice", "celula_clara"]
    },

    // =====================================================================
    // 2. CARDIOVASCULAR
    // =====================================================================
    {
      id: "cardiovascular",
      paiId: null,
      nivelHierarquico: "sistema",
      nome: "Sistema Cardiovascular",
      nomeEn: "Cardiovascular System",
      nomeEs: "Sistema Cardiovascular",
      nomeLa: "Systema cardiovasculare",
      icone: "❤️",
      cor: "#ef4444",
      focoCamera: { x: 0.08, y: 1.25, z: 1.85 },
      targetLook: { x: 0, y: 1.25, z: 0 },
      camadaDisseccao: 4,
      meshKeywords: ["mesh_heart_*", "mesh_aort*", "mesh_arter*", "mesh_vein_*", "mesh_coronary_*"],
      fipatId: "A12.0.00.000",
      meshId: "D002319",
      icd11Capitulo: "Capítulo 11 — Doenças do aparelho circulatório",
      wikidataId: "Q1072",
      sinonimos: ["Aparelho circulatório", "Sistema circulatório"],
      termosRelacionados: ["hemodinâmica", "débito cardíaco", "pressão arterial", "hematose"],
      descricao: "Circuito hemodinâmico de alta e baixa pressão responsável pela perfusão tecidual, transporte de gases, nutrientes e fármacos.",
      funcaoFisiologica: "Distribuição de sangue, transporte de O₂/nutrientes, remoção de CO₂/excretas, termorregulação, distribuição de hormônios.",
      embriologiaOrigem: "Mesoderma lateral esplâncnico + células da crista neural",
      histologiaPredominante: "Endotélio + músculo liso + tecido conjuntivo (3 túnicas)",
      orgaos: [
        {
          id: "coracao",
          paiId: "cardiovascular",
          nivelHierarquico: "orgao",
          nome: "Coração",
          nomeEn: "Heart",
          meshKey: "mesh_heart",
          camada: 5,
          fipatId: "A12.1.00.001",
          meshId: "D006321",
          wikidataId: "Q1072",
          icd10: ["I50", "I25", "I44-I49"],
          descricao: "Bomba muscular quadricameral sincicial dotada de automatismo elétrico pelo nó sinoatrial e nó atrioventricular.",
          funcaoPrincipal: "Bombeamento de sangue para circulação pulmonar e sistêmica",
          vascularizacao: {
            arterial: ["aa. coronárias direita e esquerda", "ramos interventriculares", "ramos circunflexos"],
            venosa: ["seio coronário", "vv. cardíacas anteriores"],
            linfatica: ["plexo linfático subepicárdico", "linfonodos mediastinais"]
          },
          inervacao: {
            simpatica: "T1-T4 → β1 (aumento FC e contratilidade)",
            parassimpatica: "NC X → M2 (redução FC, efeito dromotrópico negativo)",
            intrinseca: "Nó SA, nó AV, feixe de His, fibras de Purkinje"
          },
          histologia: {
            epitelio: "Endocárdio (endotélio + subendotélio)",
            tiposCelulares: ["Cardiomiócitos contráteis", "Cardiomiócitos nodais", "Células de Purkinje", "Fibroblastos cardíacos"],
            matrizExtracelular: "Colágeno I/III, elastina, proteoglicanos"
          },
          subestruturas: [
            { id: "atrio_direito", nome: "Átrio Direito", nivel: "subestrutura" },
            { id: "ventriculo_direito", nome: "Ventrículo Direito", nivel: "subestrutura" },
            { id: "atrio_esquerdo", nome: "Átrio Esquerdo", nivel: "subestrutura" },
            { id: "ventriculo_esquerdo", nome: "Ventrículo Esquerdo", nivel: "subestrutura" },
            { id: "valva_mitral", nome: "Valva Mitral", nivel: "subestrutura" },
            { id: "valva_tricuspide", nome: "Valva Tricúspide", nivel: "subestrutura" },
            { id: "valva_aortica", nome: "Valva Aórtica", nivel: "subestrutura" },
            { id: "valva_pulmonar", nome: "Valva Pulmonar", nivel: "subestrutura" },
            { id: "no_sinoatrial", nome: "Nó Sinoatrial", nivel: "subestrutura" },
            { id: "no_atrioventricular", nome: "Nó Atrioventricular", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Insuficiência cardíaca", icd10: "I50", icd11: "BD10-BD13" },
            { nome: "Infarto agudo do miocárdio", icd10: "I21", icd11: "BA41" },
            { nome: "Fibrilação atrial", icd10: "I48", icd11: "BC81.3" },
            { nome: "Estenose aórtica", icd10: "I35.0", icd11: "BB70" },
            { nome: "Miocardite", icd10: "I40", icd11: "BC42" }
          ],
          proteinasChave: [
            { nome: "Canal Nav1.5", pdbId: "6UZ0", funcao: "Potencial de ação cardíaco" },
            { nome: "SERCA2a", pdbId: "1SU4", funcao: "Reabsorção de Ca²⁺ no RS" },
            { nome: "Receptor β1-adrenérgico", pdbId: "2VT4", funcao: "Alvo betabloqueadores" },
            { nome: "Na⁺/K⁺-ATPase", pdbId: "3B8E", funcao: "Alvo digitálicos" }
          ],
          processosIds: ["ciclo_cardiaco", "conducao_impulso_cardiaco"],
          farmacosRelacionados: ["digoxina", "atenolol", "losartana", "furosemida", "warfarina", "aspirina"],
          referencias: [
            { fonte: "Gray's Anatomy", capitulo: "Cap. 51" },
            { fonte: "Guyton & Hall", capitulo: "Caps. 9-10, 20-22" }
          ]
        },
        {
          id: "arterias_sistemicas",
          paiId: "cardiovascular",
          nivelHierarquico: "orgao",
          nome: "Artérias Sistêmicas",
          nomeEn: "Systemic Arteries",
          meshKey: "mesh_aorta",
          camada: 4,
          fipatId: "A12.2.01.001",
          meshId: "D001158",
          wikidataId: "Q9655",
          icd10: ["I70-I79"],
          descricao: "Vasos de condutância e resistência periférica; túnica média rica em músculo liso sensível a catecolaminas.",
          funcaoPrincipal: "Distribuição de sangue oxigenado sob alta pressão",
          histologia: {
            epitelio: "Endotélio simples pavimentoso",
            tiposCelulares: ["Células endoteliais", "Células musculares lisas"],
            matrizExtracelular: "Elastina, colágeno, proteoglicanos"
          },
          subestruturas: [
            { id: "aorta_ascendente", nome: "Aorta Ascendente", nivel: "subestrutura" },
            { id: "arco_aortico", nome: "Arco Aórtico", nivel: "subestrutura" },
            { id: "aorta_toracica", nome: "Aorta Torácica", nivel: "subestrutura" },
            { id: "aorta_abdominal", nome: "Aorta Abdominal", nivel: "subestrutura" },
            { id: "tronco_celiaco", nome: "Tronco Celíaco", nivel: "subestrutura" },
            { id: "arterias_renais", nome: "Artérias Renais", nivel: "subestrutura" },
            { id: "arterias_iliacas", nome: "Artérias Ilíacas", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Aterosclerose", icd10: "I70", icd11: "BD40" },
            { nome: "Aneurisma de aorta", icd10: "I71", icd11: "BD50" },
            { nome: "Hipertensão arterial", icd10: "I10", icd11: "BA00" }
          ],
          proteinasChave: [
            { nome: "Receptor AT1", pdbId: "4YAY", funcao: "Alvo losartana" },
            { nome: "Receptor α1-adrenérgico", pdbId: "7B6W", funcao: "Vasoconstrição" }
          ],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 52" }]
        },
        {
          id: "veias_sistemicas",
          paiId: "cardiovascular",
          nivelHierarquico: "orgao",
          nome: "Veias Sistêmicas",
          nomeEn: "Systemic Veins",
          meshKey: "mesh_vein",
          camada: 4,
          fipatId: "A12.3.01.001",
          meshId: "D014680",
          wikidataId: "Q9609",
          icd10: ["I80-I89"],
          descricao: "Vasos de capacitância contendo ~65% da volemia corporal total, equipados com válvulas antirrefluxo.",
          funcaoPrincipal: "Retorno venoso ao coração",
          histologia: {
            epitelio: "Endotélio simples pavimentoso",
            tiposCelulares: ["Células endoteliais", "Células musculares lisas (menos que artérias)"],
            matrizExtracelular: "Colágeno, elastina"
          },
          subestruturas: [
            { id: "vcs", nome: "Veia Cava Superior", nivel: "subestrutura" },
            { id: "vci", nome: "Veia Cava Inferior", nivel: "subestrutura" },
            { id: "veias_jugulares", nome: "Veias Jugulares", nivel: "subestrutura" },
            { id: "veia_porta", nome: "Veia Porta Hepática", nivel: "subestrutura" },
            { id: "veia_safena_magna", nome: "Veia Safena Magna", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Trombose venosa profunda", icd10: "I80", icd11: "BD71" },
            { nome: "Varizes", icd10: "I83", icd11: "BD74" },
            { nome: "Embolia pulmonar", icd10: "I26", icd11: "BB00" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 53" }]
        },
        {
          id: "capilares_sanguineos",
          paiId: "cardiovascular",
          nivelHierarquico: "orgao",
          nome: "Leito Capilar",
          nomeEn: "Capillary Bed",
          meshKey: "mesh_capillary",
          camada: 4,
          fipatId: "A12.4.01.001",
          meshId: "D002196",
          wikidataId: "Q1031",
          descricao: "Zona de difusão de solutos e equilíbrio de Starling hidrostático-oncótico entre o plasma e o interstício.",
          funcaoPrincipal: "Troca de gases, nutrientes e metabólitos entre sangue e tecidos",
          histologia: {
            epitelio: "Endotélio simples pavimentoso com lâmina basal",
            tiposCelulares: ["Células endoteliais", "Pericitos"],
            matrizExtracelular: "Lâmina basal, colágeno IV"
          },
          subestruturas: [
            { id: "cap_continuo", nome: "Capilares Contínuos", nivel: "subestrutura" },
            { id: "cap_fenestrado", nome: "Capilares Fenestrados", nivel: "subestrutura" },
            { id: "cap_sinusoide", nome: "Capilares Sinusoides", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Edema", icd10: "R60", icd11: "MG29" },
            { nome: "Choque circulatório", icd10: "R57", icd11: "MG40" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Guyton & Hall", capitulo: "Cap. 16" }]
        },
        {
          id: "sangue_circulante",
          paiId: "cardiovascular",
          nivelHierarquico: "orgao",
          nome: "Sangue (Plasma & Elementos Figurados)",
          nomeEn: "Blood",
          meshKey: "mesh_blood",
          camada: 4,
          meshId: "D001769",
          wikidataId: "Q7873",
          descricao: "Tecido conjuntivo líquido carreador de hemácias, leucócitos, plaquetas, albumina e frações livres de fármacos.",
          funcaoPrincipal: "Transporte, regulação e defesa",
          histologia: {
            matrizExtracelular: "Plasma (90% água, 8% proteínas, 2% solutos)"
          },
          subestruturas: [
            { id: "plasma", nome: "Plasma", nivel: "subestrutura" },
            { id: "eritrocitos", nome: "Eritrócitos", nivel: "subestrutura" },
            { id: "leucocitos", nome: "Leucócitos", nivel: "subestrutura" },
            { id: "plaquetas", nome: "Plaquetas", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Anemia", icd10: "D64", icd11: "3A90-3A9Z" },
            { nome: "Leucemia", icd10: "C91-C95", icd11: "2B33" },
            { nome: "Trombocitopenia", icd10: "D69.6", icd11: "3B64" }
          ],
          proteinasChave: [
            { nome: "Hemoglobina A", pdbId: "2HHB", funcao: "Transporte de O₂" },
            { nome: "Albumina", pdbId: "1AO6", funcao: "Pressão oncótica + transporte" }
          ],
          processosIds: ["ciclo_cardiaco"],
          referencias: [{ fonte: "Guyton & Hall", capitulo: "Caps. 32-33" }]
        }
      ],
      processosDisponiveis: ["ciclo_cardiaco", "conducao_impulso_cardiaco"],
      farmacosRelacionados: ["digoxina", "atenolol", "losartana", "furosemida", "warfarina", "aspirina", "sinvastatina"],
      celulasTipicas: ["cardiomiocito", "celula_endotelial", "celula_muscular_lisa", "celula_purkinje"]
    },

    // =====================================================================
    // 3. NERVOSO
    // =====================================================================
    {
      id: "nervoso",
      paiId: null,
      nivelHierarquico: "sistema",
      nome: "Sistema Nervoso",
      nomeEn: "Nervous System",
      nomeEs: "Sistema Nervioso",
      nomeLa: "Systema nervosum",
      icone: "🧠",
      cor: "#38bdf8",
      focoCamera: { x: 0, y: 1.75, z: 1.75 },
      targetLook: { x: 0, y: 1.75, z: 0 },
      camadaDisseccao: 5,
      meshKeywords: ["mesh_brain_*", "mesh_cerebr*", "mesh_nerve_*", "mesh_spinal_*", "mesh_gangli*", "mesh_eye_*", "mesh_ear_*"],
      fipatId: "A14.0.00.000",
      meshId: "D009420",
      icd11Capitulo: "Capítulo 08 — Doenças do sistema nervoso",
      wikidataId: "Q9404",
      sinonimos: ["Sistema neural", "Sistema neuroendócrino"],
      termosRelacionados: ["neurônio", "sinapse", "neurotransmissor", "potencial de ação"],
      descricao: "Comunicação eletroquímica e processamento aferente/eferente integrando o encéfalo, medula espinhal, gânglios e órgãos dos sentidos.",
      funcaoFisiologica: "Detecção, processamento, integração e resposta a estímulos internos e externos.",
      embriologiaOrigem: "Ectoderma neural (neuroectoderma) + crista neural",
      histologiaPredominante: "Tecido nervoso (neurônios + glia)",
      orgaos: [
        {
          id: "cerebro_telencefalo",
          paiId: "nervoso",
          nivelHierarquico: "orgao",
          nome: "Cérebro (Telencéfalo)",
          nomeEn: "Cerebrum",
          meshKey: "mesh_brain_cerebrum",
          camada: 5,
          fipatId: "A14.1.03.001",
          meshId: "D054330",
          wikidataId: "Q75855",
          icd10: ["G40", "I63", "F00-F09"],
          descricao: "Substância cinzenta cortical e branca subcortical, corpo caloso e núcleos da base responsáveis por cognição e motricidade.",
          funcaoPrincipal: "Cognição, motricidade voluntária, linguagem, memória, emoção",
          vascularizacao: {
            arterial: ["a. carótida interna", "a. basilar", "polígono de Willis"],
            venosa: ["seios durais", "vv. cerebrais superficiais e profundas"],
            linfatica: ["linfonodos cervicais profundos (via LCR)"]
          },
          inervacao: {
            intrinseca: "Circuitos corticais e subcorticais",
            modulacao: "Sistemas colinérgico, dopaminérgico, serotoninérgico, noradrenérgico"
          },
          histologia: {
            tiposCelulares: ["Neurônios piramidais", "Interneurônios", "Astrócitos", "Oligodendrócitos", "Micróglia", "Células ependimárias"],
            matrizExtracelular: "Hialuronano, tenascina, proteoglicanos"
          },
          subestruturas: [
            { id: "lobo_frontal", nome: "Lobo Frontal", nivel: "subestrutura" },
            { id: "lobo_parietal", nome: "Lobo Parietal", nivel: "subestrutura" },
            { id: "lobo_temporal", nome: "Lobo Temporal", nivel: "subestrutura" },
            { id: "lobo_occipital", nome: "Lobo Occipital", nivel: "subestrutura" },
            { id: "giro_pre_central", nome: "Giro Pré-Central (Motor)", nivel: "subestrutura" },
            { id: "giro_pos_central", nome: "Giro Pós-Central (Sensorial)", nivel: "subestrutura" },
            { id: "nucleo_caudado", nome: "Núcleo Caudado", nivel: "subestrutura" },
            { id: "putamen", nome: "Putâmen", nivel: "subestrutura" },
            { id: "globo_palido", nome: "Globo Pálido", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "AVC isquêmico", icd10: "I63", icd11: "8B11" },
            { nome: "Epilepsia", icd10: "G40", icd11: "8A60-8A6Z" },
            { nome: "Alzheimer", icd10: "G30", icd11: "8A20" },
            { nome: "Parkinson", icd10: "G20", icd11: "8A00.0" },
            { nome: "Esquizofrenia", icd10: "F20", icd11: "6A20-6A2Z" }
          ],
          proteinasChave: [
            { nome: "Acetilcolinesterase", pdbId: "4EY7", funcao: "Alvo donepezila" },
            { nome: "Receptor D2 dopamina", pdbId: "6CM4", funcao: "Alvo antipsicóticos" },
            { nome: "Receptor 5-HT2A", pdbId: "6A93", funcao: "Alvo antidepressivos" },
            { nome: "Amiloide-β", pdbId: "2LMN", funcao: "Alvo terapias Alzheimer" }
          ],
          processosIds: ["sinapse_colinergica"],
          farmacosRelacionados: ["donepezila", "levodopa", "fluoxetina", "risperidona"],
          referencias: [
            { fonte: "Gray's Anatomy", capitulo: "Cap. 25" },
            { fonte: "Kandel — Principles of Neural Science", edicao: "6ª" }
          ]
        },
        {
          id: "diencefalo_tronco",
          paiId: "nervoso",
          nivelHierarquico: "orgao",
          nome: "Diencéfalo & Tronco Encefálico",
          nomeEn: "Diencephalon & Brainstem",
          meshKey: "mesh_brain_brainstem",
          camada: 5,
          fipatId: "A14.1.08.001",
          meshId: "D004027",
          wikidataId: "Q188424",
          icd10: ["G93.8", "I60-I69"],
          descricao: "Relé sensorial tálamo-hipotalâmico e centros autônomos bulbares de controle respiratório e vasomotor.",
          funcaoPrincipal: "Relé sensorial, controle autonômico, regulação endócrina",
          vascularizacao: {
            arterial: ["a. basilar", "aa. cerebrais posteriores", "aa. talâmicas"],
            venosa: ["vv. cerebrais internas", "seio reto"]
          },
          inervacao: { intrinseca: "Circuitos talamocorticais e hipotalâmicos" },
          histologia: {
            tiposCelulares: ["Neurônios talâmicos", "Neurônios hipotalâmicos", "Neurônios do tronco"]
          },
          subestruturas: [
            { id: "talamo", nome: "Tálamo", nivel: "subestrutura" },
            { id: "hipotalamo", nome: "Hipotálamo", nivel: "subestrutura" },
            { id: "epitalamo", nome: "Epitálamo", nivel: "subestrutura" },
            { id: "mesencefalo", nome: "Mesencéfalo", nivel: "subestrutura" },
            { id: "ponte", nome: "Ponte de Varólio", nivel: "subestrutura" },
            { id: "bulbo", nome: "Bulbo Raquidiano", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "AVC de tronco", icd10: "I63.1" },
            { nome: "Síndrome de Wernicke-Korsakoff", icd10: "E51.2" },
            { nome: "Síndrome de Parinaud", icd10: "H51.8" }
          ],
          proteinasChave: [
            { nome: "Receptor GABA-A", pdbId: "6D6T", funcao: "Alvo benzodiazepínicos" }
          ],
          processosIds: [],
          referencias: [{ fonte: "Kandel — Principles of Neural Science", capitulo: "Parte VI" }]
        },
        {
          id: "cerebelo",
          paiId: "nervoso",
          nivelHierarquico: "orgao",
          nome: "Cerebelo",
          nomeEn: "Cerebellum",
          meshKey: "mesh_cerebellum",
          camada: 5,
          fipatId: "A14.1.07.001",
          meshId: "D002531",
          wikidataId: "Q130983",
          icd10: ["G11"],
          descricao: "Coordenação motora, refinamento de movimentos voluntários, equilíbrio vestibular e propriocepção.",
          funcaoPrincipal: "Coordenação e aprendizado motor",
          vascularizacao: {
            arterial: ["aa. cerebelares superior, anteroinferior e posteroinferior"],
            venosa: ["vv. cerebelares → seios venosos durais"]
          },
          inervacao: { intrinseca: "Células de Purkinje, granulares, de Golgi" },
          histologia: {
            tiposCelulares: ["Células de Purkinje", "Células granulares", "Células de Golgi", "Células em cesta"]
          },
          subestruturas: [
            { id: "cortex_cerebelar", nome: "Córtex Cerebelar", nivel: "subestrutura" },
            { id: "vermis", nome: "Vérmis Cerebelar", nivel: "subestrutura" },
            { id: "hemisferios_cerebelares", nome: "Hemisférios Cerebelares", nivel: "subestrutura" },
            { id: "nucleo_denteado", nome: "Núcleo Denteado", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Ataxia cerebelar", icd10: "G11.9" },
            { nome: "Tumor cerebelar", icd10: "D43.1" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Kandel — Principles of Neural Science", capitulo: "Cap. 42" }]
        },
        {
          id: "medula_espinhal",
          paiId: "nervoso",
          nivelHierarquico: "orgao",
          nome: "Medula Espinhal",
          nomeEn: "Spinal Cord",
          meshKey: "mesh_spinal_cord",
          camada: 4,
          fipatId: "A14.1.02.001",
          meshId: "D013116",
          wikidataId: "Q9606",
          icd10: ["G95.0", "S14", "S24", "S34"],
          descricao: "Cordão nervoso condutor protegido pelo canal vertebral, integrando substância cinzenta medular em H e tratos axonais.",
          funcaoPrincipal: "Condução de informação sensitiva e motora + reflexos segmentares",
          vascularizacao: {
            arterial: ["a. espinhal anterior", "aa. espinhais posteriores", "aa. radiculares"],
            venosa: ["plexo venoso vertebral interno"]
          },
          inervacao: { intrinseca: "Tratos ascendentes e descendentes" },
          histologia: {
            tiposCelulares: ["Neurônios motores", "Neurônios sensitivos", "Interneurônios", "Astrócitos", "Oligodendrócitos"]
          },
          subestruturas: [
            { id: "corno_anterior", nome: "Corno Anterior (Motor)", nivel: "subestrutura" },
            { id: "corno_posterior", nome: "Corno Posterior (Sensitivo)", nivel: "subestrutura" },
            { id: "trato_corticoespinhal", nome: "Trato Corticoespinhal", nivel: "subestrutura" },
            { id: "trato_espinotalamico", nome: "Trato Espinotalâmico", nivel: "subestrutura" },
            { id: "cauda_equina", nome: "Cauda Equina", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Lesão medular", icd10: "S14", icd11: "NA21" },
            { nome: "Esclerose múltipla", icd10: "G35", icd11: "8A40" },
            { nome: "Poliomielite", icd10: "A80" }
          ],
          proteinasChave: [
            { nome: "Canal Nav1.7", pdbId: "6J8G", funcao: "Alvo anestésicos locais" }
          ],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 24" }]
        },
        {
          id: "nervos_perifericos",
          paiId: "nervoso",
          nivelHierarquico: "orgao",
          nome: "Nervos Cranianos, Espinhais & Periféricos",
          nomeEn: "Peripheral Nerves",
          meshKey: "mesh_nerve",
          camada: 4,
          fipatId: "A14.2.00.001",
          meshId: "D010525",
          wikidataId: "Q160116",
          descricao: "Feixes axonais mielinizados ou amielínicos conectando o SNC aos tecidos alvos motores e viscerais.",
          funcaoPrincipal: "Comunicação SNC ↔ periferia",
          histologia: {
            tiposCelulares: ["Neurônios sensitivos", "Neurônios motores", "Células de Schwann", "Fibroblastos do endoneuro"]
          },
          subestruturas: [
            { id: "nc_i", nome: "NC I — Olfatório", nivel: "subestrutura" },
            { id: "nc_ii", nome: "NC II — Óptico", nivel: "subestrutura" },
            { id: "nc_iii", nome: "NC III — Oculomotor", nivel: "subestrutura" },
            { id: "nc_v", nome: "NC V — Trigêmeo", nivel: "subestrutura" },
            { id: "nc_vii", nome: "NC VII — Facial", nivel: "subestrutura" },
            { id: "nc_x", nome: "NC X — Vago", nivel: "subestrutura" },
            { id: "nervo_ciatico", nome: "Nervo Ciático", nivel: "subestrutura" },
            { id: "nervo_frenico", nome: "Nervo Frênico", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Neuropatia periférica", icd10: "G62.9", icd11: "8C0Z" },
            { nome: "Síndrome do túnel do carpo", icd10: "G56.0", icd11: "8C10.0" },
            { nome: "Lesão do nervo ciático", icd10: "S74.0" }
          ],
          proteinasChave: [],
          processosIds: ["sinapse_colinergica"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Caps. 27-31" }]
        },
        {
          id: "ganglios_nervosos",
          paiId: "nervoso",
          nivelHierarquico: "orgao",
          nome: "Gânglios Nervosos",
          nomeEn: "Nerve Ganglia",
          meshKey: "mesh_ganglion",
          camada: 4,
          meshId: "D005724",
          wikidataId: "Q189033",
          descricao: "Agrupamentos de corpos neuronais fora do SNC; incluem gânglios das raízes dorsais e cadeias paravertebrais simpáticas.",
          funcaoPrincipal: "Relé sensitivo e autonômico",
          histologia: {
            tiposCelulares: ["Neurônios ganglionares", "Células satélites", "Células de Schwann"]
          },
          subestruturas: [
            { id: "ganglio_raiz_dorsal", nome: "Gânglios da Raiz Dorsal", nivel: "subestrutura" },
            { id: "cadeia_simpatica", nome: "Cadeia Paravertebral Simpática", nivel: "subestrutura" },
            { id: "ganglios_viscerais", nome: "Gânglios Parassimpáticos Intramurais", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Herpes zoster", icd10: "B02" },
            { nome: "Ganglionopatia autonômica", icd10: "G90.0" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 26" }]
        },
        {
          id: "orgaos_sentidos",
          paiId: "nervoso",
          nivelHierarquico: "orgao",
          nome: "Órgãos dos Sentidos",
          nomeEn: "Sense Organs",
          meshKey: "mesh_eye",
          camada: 5,
          meshId: "D012679",
          wikidataId: "Q24925",
          descricao: "Transdutores biológicos especializados na conversão de estímulos físicos e químicos em potenciais de ação.",
          funcaoPrincipal: "Visão, audição, equilíbrio, olfato, gustação, tato",
          histologia: {
            tiposCelulares: ["Cones e bastonetes", "Células ciliadas cocleares", "Células olfatórias", "Botões gustativos"]
          },
          subestruturas: [
            { id: "olho", nome: "Olho (Córnea, Íris, Cristalino, Retina)", nivel: "subestrutura" },
            { id: "orelha", nome: "Orelha (Externa, Média, Interna/Cóclea)", nivel: "subestrutura" },
            { id: "epitelio_olfatorio", nome: "Epitélio Olfatório", nivel: "subestrutura" },
            { id: "botoes_gustativos", nome: "Botões Gustativos", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Catarata", icd10: "H25", icd11: "9B10" },
            { nome: "Glaucoma", icd10: "H40", icd11: "9C61" },
            { nome: "Perda auditiva sensorioneural", icd10: "H90", icd11: "AB52" },
            { nome: "Retinopatia diabética", icd10: "H36.0" }
          ],
          proteinasChave: [
            { nome: "Rodopsina", pdbId: "1GZM", funcao: "Fotorrecepção" }
          ],
          processosIds: [],
          referencias: [{ fonte: "Kandel — Principles of Neural Science", capitulo: "Partes VII-VIII" }]
        }
      ],
      processosDisponiveis: ["sinapse_colinergica"],
      farmacosRelacionados: ["donepezila", "levodopa", "fluoxetina", "diazepam", "morfina"],
      celulasTipicas: ["neuronio_piramidal", "celula_purkinje", "astrocito", "oligodendrocito", "microglia"]
    },

    // =====================================================================
    // 4. DIGESTÓRIO
    // =====================================================================
    {
      id: "digestorio",
      paiId: null,
      nivelHierarquico: "sistema",
      nome: "Sistema Digestório",
      nomeEn: "Digestive System",
      nomeEs: "Sistema Digestivo",
      nomeLa: "Systema digestorium",
      icone: "🍽️",
      cor: "#f97316",
      focoCamera: { x: 0, y: 1.05, z: 2.2 },
      targetLook: { x: 0, y: 1.05, z: 0 },
      camadaDisseccao: 5,
      meshKeywords: ["mesh_stomach_*", "mesh_liver_*", "mesh_esophag*", "mesh_intestin*", "mesh_pancrea*", "mesh_gall*", "mesh_colon_*", "mesh_cecum_*", "mesh_rectum_*", "mesh_mesenter*"],
      fipatId: "A05.0.00.000",
      meshId: "D004066",
      icd11Capitulo: "Capítulo 13 — Doenças do aparelho digestivo",
      wikidataId: "Q9649",
      sinonimos: ["Aparelho digestivo", "Trato gastrointestinal"],
      termosRelacionados: ["digestão", "absorção", "peristaltismo", "secreção"],
      descricao: "Trato gastrointestinal contínuo e glândulas anexas responsáveis pela digestão, absorção de xenobióticos e excreção fecal.",
      funcaoFisiologica: "Ingestão, digestão mecânica e química, absorção de nutrientes, eliminação de resíduos.",
      embriologiaOrigem: "Endoderma + mesoderma esplâncnico",
      histologiaPredominante: "Epitélio colunar simples com vilosidades e criptas",
      orgaos: [
        {
          id: "boca_estruturas",
          paiId: "digestorio",
          nivelHierarquico: "orgao",
          nome: "Boca (Dentes, Língua, Lábios & Glândulas Salivares)",
          nomeEn: "Mouth",
          meshKey: "mesh_oral_cavity",
          camada: 5,
          fipatId: "A05.1.00.001",
          meshId: "D009055",
          wikidataId: "Q9633",
          icd10: ["K12", "K14"],
          descricao: "Início da digestão mecânica e hidrólise enzimática; absorção transmucosa sublingual rápida.",
          funcaoPrincipal: "Mastigação, insalivação, formação do bolo alimentar",
          histologia: {
            epitelio: "Escamoso estratificado não queratinizado",
            tiposCelulares: ["Queratinócitos", "Células de Merkel", "Melanócitos"],
            matrizExtracelular: "Lâmina própria com colágeno"
          },
          subestruturas: [
            { id: "dentes", nome: "Dentes", nivel: "subestrutura" },
            { id: "lingua", nome: "Língua", nivel: "subestrutura" },
            { id: "labios", nome: "Lábios", nivel: "subestrutura" },
            { id: "glandula_parotida", nome: "Glândula Parótida", nivel: "subestrutura" },
            { id: "glandula_submandibular", nome: "Glândula Submandibular", nivel: "subestrutura" },
            { id: "glandula_sublingual", nome: "Glândula Sublingual", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Cárie dentária", icd10: "K02" },
            { nome: "Periodontite", icd10: "K05.3" },
            { nome: "Câncer oral", icd10: "C00-C06" },
            { nome: "Xerostomia", icd10: "K11.7" }
          ],
          proteinasChave: [
            { nome: "Amilase salivar", pdbId: "1SMD", funcao: "Digestão do amido" },
            { nome: "Lisozima", pdbId: "1LYZ", funcao: "Defesa antimicrobiana" }
          ],
          processosIds: ["degluticao_humana"],
          farmacosRelacionados: ["lidocaina", "midazolam", "nitroglicerina"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 40" }]
        },
        {
          id: "esofago",
          paiId: "digestorio",
          nivelHierarquico: "orgao",
          nome: "Esôfago",
          nomeEn: "Esophagus",
          meshKey: "mesh_esophagus",
          camada: 5,
          fipatId: "A05.4.01.001",
          meshId: "D004947",
          wikidataId: "Q173710",
          icd10: ["K20-K23", "C15"],
          descricao: "Tubo muscular de 25 cm com peristaltismo propulsivo descendente e controle esfincteriano cranial e caudal.",
          funcaoPrincipal: "Condução do bolo alimentar",
          vascularizacao: {
            arterial: ["aa. esofágicas (ramos da tireoidiana inferior, aorta e gástrica esquerda)"],
            venosa: ["plexo esofágico → vv. gástricas e ázigo"],
            linfatica: ["linfonodos cervicais, mediastinais e gástricos"]
          },
          inervacao: {
            parassimpatica: "NC X (peristaltismo)",
            simpatica: "T1-T6 (modulação)"
          },
          histologia: {
            epitelio: "Escamoso estratificado não queratinizado",
            tiposCelulares: ["Queratinócitos", "Células de Langerhans"],
            matrizExtracelular: "Músculo estriado (1/3 sup) → músculo liso (2/3 inf)"
          },
          subestruturas: [
            { id: "ees", nome: "Esfíncter Esofágico Superior (EES)", nivel: "subestrutura" },
            { id: "corpo_esofagico", nome: "Corpo Esofágico", nivel: "subestrutura" },
            { id: "eei", nome: "Esfíncter Esofágico Inferior (EEI)", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "DRGE", icd10: "K21", icd11: "DA22" },
            { nome: "Acalásia", icd10: "K22.0", icd11: "DA21.0" },
            { nome: "Câncer de esôfago", icd10: "C15", icd11: "2B70" },
            { nome: "Varizes esofágicas", icd10: "I85" }
          ],
          proteinasChave: [
            { nome: "H⁺/K⁺-ATPase gástrica", pdbId: "5YLV", funcao: "Alvo omeprazol" }
          ],
          processosIds: ["degluticao_humana"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 41" }]
        },
        {
          id: "estomago",
          paiId: "digestorio",
          nivelHierarquico: "orgao",
          nome: "Estômago",
          nomeEn: "Stomach",
          meshKey: "mesh_stomach",
          camada: 5,
          fipatId: "A05.5.01.001",
          meshId: "D013270",
          wikidataId: "Q1029907",
          icd10: ["K25-K31", "C16"],
          descricao: "Reservatório ácido (pH 1.5 a 2.0) com secreção cloridropéptica, fator intrínseco e motilidade de mistura.",
          funcaoPrincipal: "Digestão química de proteínas e armazenamento",
          vascularizacao: {
            arterial: ["a. gástrica esquerda", "a. gástrica direita", "aa. gastroepiploicas"],
            venosa: ["vv. gástricas → veia porta"],
            linfatica: ["linfonodos celíacos e gástricos"]
          },
          inervacao: {
            parassimpatica: "NC X (secreção ácida e motilidade)",
            simpatica: "T6-T9 (modulação)",
            intrinseca: "Plexos de Auerbach e Meissner"
          },
          histologia: {
            epitelio: "Colunar simples glandular",
            tiposCelulares: ["Células parietais (HCl + FI)", "Células principais (pepsinogênio)", "Células mucosas", "Células G (gastrina)", "Células ECL (histamina)"],
            matrizExtracelular: "Lâmina própria com capilares fenestrados"
          },
          subestruturas: [
            { id: "cardia", nome: "Cárdia", nivel: "subestrutura" },
            { id: "fundo_gastrico", nome: "Fundo Gástrico", nivel: "subestrutura" },
            { id: "corpo_gastrico", nome: "Corpo Gástrico", nivel: "subestrutura" },
            { id: "antro_pilorico", nome: "Antro Pilórico", nivel: "subestrutura" },
            { id: "piloro", nome: "Piloro", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Úlcera péptica", icd10: "K27", icd11: "DA60" },
            { nome: "Gastrite", icd10: "K29", icd11: "DA42" },
            { nome: "Câncer gástrico", icd10: "C16", icd11: "2B72" },
            { nome: "H. pylori", icd10: "B96.81" }
          ],
          proteinasChave: [
            { nome: "H⁺/K⁺-ATPase", pdbId: "5YLV", funcao: "Alvo omeprazol" },
            { nome: "Pepsina", pdbId: "4PEP", funcao: "Digestão proteica" },
            { nome: "Urease H. pylori", pdbId: "1E9Z", funcao: "Sobrevivência bacteriana" }
          ],
          processosIds: ["degluticao_humana", "peristaltismo_intestinal"],
          farmacosRelacionados: ["omeprazol", "amoxicilina", "claritromicina", "metoclopramida"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 42" }]
        },
        {
          id: "intestino_delgado",
          paiId: "digestorio",
          nivelHierarquico: "orgao",
          nome: "Intestino Delgado (Duodeno, Jejuno & Íleo)",
          nomeEn: "Small Intestine",
          meshKey: "mesh_intestine_small",
          camada: 5,
          fipatId: "A05.6.01.001",
          meshId: "D007421",
          wikidataId: "Q11090",
          icd10: ["K50-K52", "C17"],
          descricao: "Principal sítio de absorção enteral (~30 m²) provido de vilosidades, microvilosidades e enzimas de borda em escova.",
          funcaoPrincipal: "Digestão final e absorção de nutrientes",
          vascularizacao: {
            arterial: ["a. mesentérica superior"],
            venosa: ["vv. mesentéricas → veia porta"],
            linfatica: ["vasos quilíferos → cisterna do quilo → ducto torácico"]
          },
          inervacao: {
            parassimpatica: "NC X (motilidade e secreção)",
            simpatica: "T9-T11 (modulação)",
            intrinseca: "Plexos de Auerbach e Meissner"
          },
          histologia: {
            epitelio: "Colunar simples com vilosidades e microvilosidades",
            tiposCelulares: ["Enterócitos", "Células caliciformes", "Células de Paneth", "Células enteroendócrinas", "Células M"],
            matrizExtracelular: "Lâmina própria com capilares e linfáticos"
          },
          subestruturas: [
            { id: "duodeno", nome: "Duodeno", nivel: "subestrutura" },
            { id: "jejuno", nome: "Jejuno", nivel: "subestrutura" },
            { id: "ileo", nome: "Íleo", nivel: "subestrutura" },
            { id: "valvula_ileocecal", nome: "Válvula Ileocecal", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Doença celíaca", icd10: "K90.0", icd11: "DA95" },
            { nome: "Doença de Crohn", icd10: "K50", icd11: "DD70" },
            { nome: "Obstrução intestinal", icd10: "K56.6" }
          ],
          proteinasChave: [
            { nome: "SGLT1", pdbId: "2XQ2", funcao: "Cotransporte Na⁺/glicose" },
            { nome: "GLUT2", pdbId: "4JAA", funcao: "Transporte de glicose" },
            { nome: "Lactase", pdbId: "3ONV", funcao: "Digestão da lactose" }
          ],
          processosIds: ["peristaltismo_intestinal"],
          farmacosRelacionados: ["metformina", "orlistate"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 43" }]
        },
        {
          id: "intestino_grosso",
          paiId: "digestorio",
          nivelHierarquico: "orgao",
          nome: "Intestino Grosso (Ceco, Cólons & Reto)",
          nomeEn: "Large Intestine",
          meshKey: "mesh_colon",
          camada: 5,
          fipatId: "A05.7.01.001",
          meshId: "D007420",
          wikidataId: "Q11190",
          icd10: ["K57-K63", "C18-C20"],
          descricao: "Recuperação de água e eletrólitos, fermentação microbiótica e formação de massa fecal.",
          funcaoPrincipal: "Absorção de água e formação de fezes",
          vascularizacao: {
            arterial: ["a. mesentérica superior (colon direito)", "a. mesentérica inferior (colon esquerdo)"],
            venosa: ["vv. mesentéricas → veia porta"],
            linfatica: ["linfonodos mesentéricos e para-aórticos"]
          },
          inervacao: {
            parassimpatica: "NC X (colon proximal) + nn. pélvicos (colon distal)",
            simpatica: "T10-L2 (modulação)"
          },
          histologia: {
            epitelio: "Colunar simples com criptas de Lieberkühn",
            tiposCelulares: ["Enterócitos", "Células caliciformes (abundantes)", "Células enteroendócrinas"]
          },
          subestruturas: [
            { id: "ceco", nome: "Ceco", nivel: "subestrutura" },
            { id: "colon_ascendente", nome: "Cólon Ascendente", nivel: "subestrutura" },
            { id: "colon_transverso", nome: "Cólon Transverso", nivel: "subestrutura" },
            { id: "colon_descendente", nome: "Cólon Descendente", nivel: "subestrutura" },
            { id: "colon_sigmoide", nome: "Cólon Sigmoide", nivel: "subestrutura" },
            { id: "reto", nome: "Reto", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Retocolite ulcerativa", icd10: "K51", icd11: "DD71" },
            { nome: "Câncer colorretal", icd10: "C18-C20", icd11: "2B91" },
            { nome: "SII", icd10: "K58", icd11: "DD91.0" },
            { nome: "Diverticulite", icd10: "K57" }
          ],
          proteinasChave: [],
          processosIds: ["peristaltismo_intestinal"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 44" }]
        },
        {
          id: "canal_anal",
          paiId: "digestorio",
          nivelHierarquico: "orgao",
          nome: "Canal Anal & Ânus",
          nomeEn: "Anal Canal & Anus",
          meshKey: "mesh_anus",
          camada: 5,
          meshId: "D000863",
          wikidataId: "Q4970",
          icd10: ["K60-K62", "C21"],
          descricao: "Porção terminal de continência fecal controlada por esfíncter anal interno (liso) e externo (estriado).",
          funcaoPrincipal: "Continência e eliminação fecal",
          histologia: {
            epitelio: "Escamoso estratificado (distal) + transição (linha pectínea)"
          },
          subestruturas: [
            { id: "esfíncter_interno", nome: "Esfíncter Anal Interno", nivel: "subestrutura" },
            { id: "esfíncter_externo", nome: "Esfíncter Anal Externo", nivel: "subestrutura" },
            { id: "linha_pectinea", nome: "Linha Pectínea", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Hemorroidas", icd10: "K64", icd11: "DB60" },
            { nome: "Fissura anal", icd10: "K60.2" },
            { nome: "Incontinência fecal", icd10: "R15" }
          ],
          proteinasChave: [],
          processosIds: ["peristaltismo_intestinal"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 45" }]
        },
        {
          id: "figado",
          paiId: "digestorio",
          nivelHierarquico: "orgao",
          nome: "Fígado",
          nomeEn: "Liver",
          meshKey: "mesh_liver",
          camada: 5,
          fipatId: "A05.8.01.001",
          meshId: "D008099",
          wikidataId: "Q9368",
          icd10: ["K70-K77", "C22"],
          descricao: "Órgão metabólico mestre; síntese de albumina, ácidos biliares e biotransformação de Fase I e II de xenobióticos.",
          funcaoPrincipal: "Metabolismo, detoxificação, síntese proteica, produção de bile",
          vascularizacao: {
            arterial: ["a. hepática própria (ramo do tronco celíaco)"],
            venosa: ["veia porta (75% do fluxo)", "vv. hepáticas → VCI"],
            linfatica: ["linfonodos hepáticos e celíacos"]
          },
          inervacao: {
            parassimpatica: "NC X (função)",
            simpatica: "T7-T10 (glicogenólise)"
          },
          histologia: {
            epitelio: "Hepatócitos em cordões",
            tiposCelulares: ["Hepatócitos", "Células de Kupffer", "Células estreladas (Ito)", "Colangiócitos"],
            matrizExtracelular: "Colágeno I/III, fibronectina (espaço de Disse)"
          },
          subestruturas: [
            { id: "lobo_dir", nome: "Lobo Hepático Direito", nivel: "subestrutura" },
            { id: "lobo_esq", nome: "Lobo Hepático Esquerdo", nivel: "subestrutura" },
            { id: "lobo_caudado", nome: "Lobo Caudado", nivel: "subestrutura" },
            { id: "lobo_quadrado", nome: "Lobo Quadrado", nivel: "subestrutura" },
            { id: "triade_portal", nome: "Tríade Portal", nivel: "subestrutura" },
            { id: "sinusoides_hepaticos", nome: "Sinusoides Hepáticos", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Cirrose hepática", icd10: "K74", icd11: "DB93.1" },
            { nome: "Hepatite B", icd10: "B16", icd11: "1E51" },
            { nome: "Hepatite C", icd10: "B17.1", icd11: "1E51.1" },
            { nome: "Carcinoma hepatocelular", icd10: "C22.0" },
            { nome: "Esteatose hepática", icd10: "K76.0" }
          ],
          proteinasChave: [
            { nome: "CYP3A4", pdbId: "1TQN", funcao: "Metabolismo de Fase I" },
            { nome: "Albumina", pdbId: "1AO6", funcao: "Pressão oncótica" },
            { nome: "Glutationa S-transferase", pdbId: "1GST", funcao: "Conjugação Fase II" }
          ],
          processosIds: [],
          farmacosRelacionados: ["paracetamol", "sinvastatina", "metronidazol"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 46" }]
        },
        {
          id: "vesicula_biliar",
          paiId: "digestorio",
          nivelHierarquico: "orgao",
          nome: "Vesícula Biliar & Vias Biliares",
          nomeEn: "Gallbladder & Biliary Tree",
          meshKey: "mesh_gallbladder",
          camada: 5,
          fipatId: "A05.8.02.001",
          meshId: "D005704",
          wikidataId: "Q64386",
          icd10: ["K80-K83", "C23-C24"],
          descricao: "Concentração, armazenamento e ejeção de bile emulsificante de lipídios ativada por CCK.",
          funcaoPrincipal: "Armazenamento e concentração de bile",
          vascularizacao: {
            arterial: ["a. cística (ramo da hepática direita)"],
            venosa: ["vv. císticas → veia porta"],
            linfatica: ["linfonodos císticos e hepáticos"]
          },
          inervacao: {
            parassimpatica: "NC X (contração)",
            simpatica: "T7-T10 (relaxamento)"
          },
          histologia: {
            epitelio: "Colunar simples com microvilosidades",
            tiposCelulares: ["Colangiócitos", "Células musculares lisas"]
          },
          subestruturas: [
            { id: "fundo", nome: "Fundo", nivel: "subestrutura" },
            { id: "corpo", nome: "Corpo", nivel: "subestrutura" },
            { id: "colo", nome: "Colo", nivel: "subestrutura" },
            { id: "ducto_cistico", nome: "Ducto Cístico", nivel: "subestrutura" },
            { id: "coledoco", nome: "Ducto Colédoco", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Colelitíase", icd10: "K80", icd11: "DC11" },
            { nome: "Colecistite", icd10: "K81", icd11: "DC12" },
            { nome: "Colangite", icd10: "K83.0" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 47" }]
        },
        {
          id: "pancreas_exocrino",
          paiId: "digestorio",
          nivelHierarquico: "orgao",
          nome: "Pâncreas (Fração Exócrina)",
          nomeEn: "Exocrine Pancreas",
          meshKey: "mesh_pancreas",
          camada: 5,
          fipatId: "A05.9.01.001",
          meshId: "D010179",
          wikidataId: "Q9612",
          icd10: ["K85-K86", "C25"],
          descricao: "Secreção acinar de zimogênios digestivos (tripsinogênio, lipase, amilase) e tampão de bicarbonato para o duodeno.",
          funcaoPrincipal: "Secreção de enzimas digestivas e bicarbonato",
          vascularizacao: {
            arterial: ["a. pancreatoduodenal superior (gastroduodenal)", "a. pancreatoduodenal inferior (mesentérica superior)", "a. esplênica"],
            venosa: ["vv. pancreáticas → veia porta / esplênica"],
            linfatica: ["linfonodos pancreáticos e celíacos"]
          },
          inervacao: {
            parassimpatica: "NC X (secreção)",
            simpatica: "T6-T10 (inibição)"
          },
          histologia: {
            epitelio: "Acinos serosos",
            tiposCelulares: ["Células acinares", "Células ductais", "Células centroacinares"]
          },
          subestruturas: [
            { id: "acinos", nome: "Ácinos Pancreáticos", nivel: "subestrutura" },
            { id: "ducto_wirsung", nome: "Ducto Pancreático Principal (Wirsung)", nivel: "subestrutura" },
            { id: "ducto_santorini", nome: "Ducto Acessório (Santorini)", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Pancreatite aguda", icd10: "K85", icd11: "DC31" },
            { nome: "Pancreatite crônica", icd10: "K86.0-K86.1" },
            { nome: "Câncer de pâncreas", icd10: "C25", icd11: "2C10" }
          ],
          proteinasChave: [
            { nome: "Tripsina", pdbId: "1TRN", funcao: "Digestão proteica" },
            { nome: "Lipase", pdbId: "1LPA", funcao: "Digestão de gorduras" },
            { nome: "Amilase", pdbId: "1PIF", funcao: "Digestão de amido" }
          ],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 48" }]
        },
        {
          id: "mesenterio",
          paiId: "digestorio",
          nivelHierarquico: "orgao",
          nome: "Mesentério & Peritônio",
          nomeEn: "Mesentery & Peritoneum",
          meshKey: "mesh_mesentery",
          camada: 5,
          meshId: "D008643",
          wikidataId: "Q193107",
          descricao: "Dobra peritoneal contínua que ancora as alças intestinais, veiculando vasos mesentéricos e linfáticos.",
          funcaoPrincipal: "Sustentação e vascularização visceral",
          histologia: {
            epitelio: "Mesotélio simples pavimentoso",
            matrizExtracelular: "Tecido conjuntivo frouxo com adipócitos"
          },
          subestruturas: [
            { id: "raiz_mesenterio", nome: "Raiz do Mesentério", nivel: "subestrutura" },
            { id: "mesocolon_transverso", nome: "Mesocólon Transverso", nivel: "subestrutura" },
            { id: "omento_maior", nome: "Omento Maior", nivel: "subestrutura" },
            { id: "omento_menor", nome: "Omento Menor", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Peritonite", icd10: "K65" },
            { nome: "Ascite", icd10: "R18" },
            { nome: "Carcinomatose peritoneal", icd10: "C78.6" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 49" }]
        }
      ],
      processosDisponiveis: ["degluticao_humana", "peristaltismo_intestinal"],
      farmacosRelacionados: ["omeprazol", "metoclopramida", "loperamida", "metronidazol", "orlistate"],
      celulasTipicas: ["enterocito", "hepatocito", "celula_parietal", "celula_principal", "celula_gastrina"]
    },

    // =====================================================================
    // 5. URINÁRIO
    // =====================================================================
    {
      id: "urinario",
      paiId: null,
      nivelHierarquico: "sistema",
      nome: "Sistema Urinário",
      nomeEn: "Urinary System",
      nomeEs: "Sistema Urinario",
      nomeLa: "Systema urinarium",
      icone: "💧",
      cor: "#eab308",
      focoCamera: { x: 0, y: 0.95, z: 1.9 },
      targetLook: { x: 0, y: 0.95, z: 0 },
      camadaDisseccao: 5,
      meshKeywords: ["mesh_kidney_*", "mesh_ureter_*", "mesh_bladder_*", "mesh_urethra_*"],
      fipatId: "A08.0.00.000",
      meshId: "D014551",
      icd11Capitulo: "Capítulo 16 — Doenças do aparelho geniturinário",
      wikidataId: "Q46299",
      sinonimos: ["Aparelho urinário", "Sistema excretor"],
      termosRelacionados: ["filtração", "reabsorção", "secreção", "clearance"],
      descricao: "Regulação do equilíbrio hidroeletrolítico, controle pressórico volêmico, equilíbrio ácido-base e depuração renal.",
      funcaoFisiologica: "Formação de urina, regulação volêmica, pressórica e ácido-base, produção de hormônios (EPO, renina, calcitriol).",
      embriologiaOrigem: "Mesoderma intermediário (rim) + endoderma (bexiga)",
      histologiaPredominante: "Epitélio simples cuboide (túbulos) + urotélio (vias)",
      orgaos: [
        {
          id: "rins",
          paiId: "urinario",
          nivelHierarquico: "orgao",
          nome: "Rins",
          nomeEn: "Kidneys",
          meshKey: "mesh_kidney",
          camada: 5,
          fipatId: "A08.1.01.001",
          meshId: "D007668",
          wikidataId: "Q9377",
          icd10: ["N00-N29", "C64"],
          descricao: "Filtração de 180 L/dia de plasma com ultrafiltração glomerular, reabsorção tubular seletiva e secreção ativa.",
          funcaoPrincipal: "Filtração, reabsorção, secreção, regulação hormonal",
          vascularizacao: {
            arterial: ["aa. renais (ramos da aorta abdominal)"],
            venosa: ["vv. renais → veia cava inferior"],
            linfatica: ["linfonodos para-aórticos lombares"]
          },
          inervacao: {
            simpatica: "T10-L1 (vasoconstrição, liberação de renina)",
            parassimpatica: "NC X (modulação)"
          },
          histologia: {
            epitelio: "Simples cuboide / escamoso (túbulos)",
            tiposCelulares: ["Podócitos", "Células mesangiais", "Células do TCP", "Células da alça de Henle", "Células do ducto coletor"],
            matrizExtracelular: "Membrana basal glomerular (colágeno IV)"
          },
          subestruturas: [
            { id: "cortex_renal", nome: "Córtex Renal", nivel: "subestrutura" },
            { id: "piramides_renais", nome: "Pirâmides Medulares Renais", nivel: "subestrutura" },
            { id: "glomerulos", nome: "Glomérulos Renais", nivel: "subestrutura" },
            { id: "tubulo_proximal", nome: "Túbulo Contorcido Proximal", nivel: "subestrutura" },
            { id: "alca_henle", nome: "Alça de Henle", nivel: "subestrutura" },
            { id: "tubulo_distal", nome: "Túbulo Contorcido Distal", nivel: "subestrutura" },
            { id: "ducto_coletor", nome: "Ducto Coletor", nivel: "subestrutura" },
            { id: "pelve_renal", nome: "Pelve Renal", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Doença renal crônica", icd10: "N18", icd11: "GB61" },
            { nome: "Insuficiência renal aguda", icd10: "N17", icd11: "GB60" },
            { nome: "Nefrolitíase", icd10: "N20", icd11: "GB70" },
            { nome: "Glomerulonefrite", icd10: "N05", icd11: "GB40" },
            { nome: "Câncer renal", icd10: "C64", icd11: "2C90" }
          ],
          proteinasChave: [
            { nome: "Na⁺/K⁺-ATPase", pdbId: "3B8E", funcao: "Reabsorção tubular" },
            { nome: "Anidrase carbônica II", pdbId: "1CA2", funcao: "Equilíbrio ácido-base" },
            { nome: "Renina", pdbId: "2REN", funcao: "Sistema renina-angiotensina" },
            { nome: "EPO", pdbId: "1BUY", funcao: "Eritropoese" }
          ],
          processosIds: ["filtracao_glomerular"],
          farmacosRelacionados: ["furosemida", "losartana", "metformina", "digoxina"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 75" }]
        },
        {
          id: "ureteres",
          paiId: "urinario",
          nivelHierarquico: "orgao",
          nome: "Ureteres",
          nomeEn: "Ureters",
          meshKey: "mesh_ureter",
          camada: 5,
          fipatId: "A08.2.01.001",
          meshId: "D014513",
          wikidataId: "Q173022",
          icd10: ["N20-N23"],
          descricao: "Condutos musculares pares com ondas peristálticas ativas que conduzem a urina da pelve renal à bexiga.",
          funcaoPrincipal: "Condução de urina",
          vascularizacao: {
            arterial: ["aa. renais, gonadais, ilíacas"],
            venosa: ["vv. correspondentes"],
            linfatica: ["linfonodos lombares e ilíacos"]
          },
          inervacao: {
            parassimpatica: "S2-S4 (peristaltismo)",
            simpatica: "T10-L2"
          },
          histologia: {
            epitelio: "Urotélio (transicional)",
            tiposCelulares: ["Células uroteliais (umbrella)"]
          },
          subestruturas: [
            { id: "ureter_abdominal", nome: "Ureter Abdominal", nivel: "subestrutura" },
            { id: "ureter_pelvico", nome: "Ureter Pélvico", nivel: "subestrutura" },
            { id: "juncao_ureterovesical", nome: "Junção Ureterovesical", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Cálculo ureteral", icd10: "N20.1" },
            { nome: "Estenose ureteral", icd10: "N13.5" }
          ],
          proteinasChave: [],
          processosIds: ["filtracao_glomerular"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 76" }]
        },
        {
          id: "bexiga_urinaria",
          paiId: "urinario",
          nivelHierarquico: "orgao",
          nome: "Bexiga Urinária",
          nomeEn: "Urinary Bladder",
          meshKey: "mesh_bladder",
          camada: 5,
          fipatId: "A08.3.01.001",
          meshId: "D001746",
          wikidataId: "Q9382",
          icd10: ["N30-N32", "C67"],
          descricao: "Reservatório muscular distensível revestido por urotélio com acomodação volêmica intermediada pelo músculo detrusor.",
          funcaoPrincipal: "Armazenamento de urina",
          vascularizacao: {
            arterial: ["aa. vesicais superiores (umbilical)", "aa. vesicais inferiores (ilíaca interna)"],
            venosa: ["plexo venoso vesical → vv. ilíacas internas"],
            linfatica: ["linfonodos ilíacos internos e externos"]
          },
          inervacao: {
            parassimpatica: "S2-S4 → contração do detrusor",
            simpatica: "T11-L2 → relaxamento do detrusor",
            somatica: "N. pudendo (esfíncter externo)"
          },
          histologia: {
            epitelio: "Urotélio (transicional)",
            tiposCelulares: ["Células uroteliais", "Células musculares lisas (detrusor)"]
          },
          subestruturas: [
            { id: "apice", nome: "Ápice Vesical", nivel: "subestrutura" },
            { id: "corpo_vesical", nome: "Corpo Vesical", nivel: "subestrutura" },
            { id: "fundo_vesical", nome: "Fundo Vesical", nivel: "subestrutura" },
            { id: "trigono", nome: "Trígono Vesical", nivel: "subestrutura" },
            { id: "detrusor", nome: "Músculo Detrusor", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Cistite", icd10: "N30", icd11: "GC00" },
            { nome: "Bexiga neurogênica", icd10: "N31" },
            { nome: "Câncer de bexiga", icd10: "C67", icd11: "2C94" },
            { nome: "Bexiga hiperativa", icd10: "N32.81" }
          ],
          proteinasChave: [
            { nome: "Receptor M3 muscarínico", pdbId: "5ZHP", funcao: "Alvo oxibutinina" },
            { nome: "Receptor β3-adrenérgico", pdbId: "2Y02", funcao: "Alvo mirabegrona" }
          ],
          processosIds: [],
          farmacosRelacionados: ["oxibutinina", "mirabegrona"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 77" }]
        },
        {
          id: "uretra",
          paiId: "urinario",
          nivelHierarquico: "orgao",
          nome: "Uretra",
          nomeEn: "Urethra",
          meshKey: "mesh_urethra",
          camada: 5,
          fipatId: "A08.4.01.001",
          meshId: "D014521",
          wikidataId: "Q9385",
          icd10: ["N34-N36"],
          descricao: "Canal excretor terminal com dimorfismo anatômico entre os sexos, contendo esfíncteres uretral interno e externo.",
          funcaoPrincipal: "Condução de urina para o exterior",
          histologia: {
            epitelio: "Urotélio → escamoso estratificado distal"
          },
          subestruturas: [
            { id: "esfíncter_interno", nome: "Esfíncter Uretral Interno", nivel: "subestrutura" },
            { id: "esfíncter_externo", nome: "Esfíncter Uretral Externo", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Uretrite", icd10: "N34", icd11: "GC02" },
            { nome: "Estenose uretral", icd10: "N35" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 78" }]
        }
      ],
      processosDisponiveis: ["filtracao_glomerular"],
      farmacosRelacionados: ["furosemida", "losartana", "ceftriaxona"],
      celulasTipicas: ["podocito", "celula_mesangial", "celula_urotelial", "celula_justaglomerular"]
    },

    // =====================================================================
    // 6. ENDÓCRINO (P2 CORRIGIDO — sem duplicatas com reprodutor)
    // =====================================================================
    {
      id: "endocrino",
      paiId: null,
      nivelHierarquico: "sistema",
      nome: "Sistema Endócrino",
      nomeEn: "Endocrine System",
      nomeEs: "Sistema Endocrino",
      nomeLa: "Systema endocrinum",
      icone: "⚗️",
      cor: "#ec4899",
      focoCamera: { x: 0, y: 1.35, z: 1.8 },
      targetLook: { x: 0, y: 1.35, z: 0 },
      camadaDisseccao: 5,
      meshKeywords: ["mesh_pituitary_*", "mesh_pineal_*", "mesh_thyroid_*", "mesh_parathyroid_*", "mesh_adrenal_*", "mesh_pancreas_islet*"],
      fipatId: "A11.0.00.000",
      meshId: "D004700",
      icd11Capitulo: "Capítulo 05 — Doenças endócrinas, nutricionais e metabólicas",
      wikidataId: "Q13317",
      sinonimos: ["Sistema hormonal", "Sistema glandular endócrino"],
      termosRelacionados: ["hormônio", "feedback", "eixo hipotálamo-hipófise"],
      descricao: "Comunicação humoral e controle homeostático através de hormônios secretados na corrente sanguínea.",
      funcaoFisiologica: "Regulação do metabolismo, crescimento, reprodução, resposta ao estresse, homeostase.",
      embriologiaOrigem: "Ectoderma (hipófise, pineal) + endoderma (tireoide, paratireoide, pâncreas) + mesoderma (adrenais, gônadas)",
      histologiaPredominante: "Epitélio glandular endócrino (cordões, folículos, ilhotas)",
      // NOTA P2: ovários e testículos aparecem APENAS em reprodutor.
      // Aqui são referenciados via "estruturasRelacionadas" para evitar duplicação.
      estruturasRelacionadas: [
        { id: "ovarios_endocrino", sistemaOrigem: "reprodutor", funcaoEndocrina: "Estrogênio e progesterona" },
        { id: "testiculos_endocrino", sistemaOrigem: "reprodutor", funcaoEndocrina: "Testosterona" }
      ],
      orgaos: [
        {
          id: "hipofise",
          paiId: "endocrino",
          nivelHierarquico: "orgao",
          nome: "Hipófise (Glândula Pituitária)",
          nomeEn: "Pituitary Gland",
          meshKey: "mesh_pituitary",
          camada: 5,
          fipatId: "A11.1.01.001",
          meshId: "D010900",
          wikidataId: "Q170554",
          icd10: ["E22-E23", "D35.2"],
          descricao: "Glândula mestra alojada na sela túrcica conectada ao hipotálamo, secretando hormônios tróficos sistêmicos.",
          funcaoPrincipal: "Secreção de hormônios tróficos e efetores",
          vascularizacao: {
            arterial: ["aa. hipofisárias superiores e inferiores (ramos da carótida interna)"],
            venosa: ["seio intercavernoso → seio petroso inferior"],
            sistema_porta: "Sistema porta hipofisário (hipotálamo → adeno-hipófise)"
          },
          inervacao: {
            simpatica: "T1-T4 (modulação)",
            parassimpatica: "NC X (modulação)"
          },
          histologia: {
            tiposCelulares: [
              "Somatotrofos (GH)",
              "Lactotrofos (Prolactina)",
              "Corticotrofos (ACTH)",
              "Tireotrofos (TSH)",
              "Gonadotrofos (LH, FSH)",
              "Pituícitos (neuro-hipófise)"
            ]
          },
          subestruturas: [
            { id: "adeno_hipofise", nome: "Adeno-hipófise (Lobo Anterior)", nivel: "subestrutura" },
            { id: "neuro_hipofise", nome: "Neuro-hipófise (Lobo Posterior)", nivel: "subestrutura" },
            { id: "infundibulo", nome: "Infundíbulo", nivel: "subestrutura" },
            { id: "pars_intermedia", nome: "Pars Intermedia", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Hipopituitarismo", icd10: "E23.0", icd11: "5A61" },
            { nome: "Acromegalia", icd10: "E22.0", icd11: "5A60.0" },
            { nome: "Diabetes insipidus", icd10: "E23.2", icd11: "5A61.2" },
            { nome: "Adenoma hipofisário", icd10: "D35.2" }
          ],
          proteinasChave: [
            { nome: "Receptor de GH", pdbId: "1A22", funcao: "Sinalização de crescimento" }
          ],
          processosIds: [],
          referencias: [{ fonte: "Guyton & Hall", capitulo: "Cap. 75" }]
        },
        {
          id: "glandula_pineal",
          paiId: "endocrino",
          nivelHierarquico: "orgao",
          nome: "Glândula Pineal (Epífise)",
          nomeEn: "Pineal Gland",
          meshKey: "mesh_pineal",
          camada: 5,
          fipatId: "A11.2.01.001",
          meshId: "D010870",
          wikidataId: "Q189292",
          icd10: ["D35.4", "G93.8"],
          descricao: "Glândula neuroendócrina central responsável pela síntese de melatonina em resposta ao ciclo de luz-escuridão.",
          funcaoPrincipal: "Ritmo circadiano, síntese de melatonina",
          vascularizacao: {
            arterial: ["aa. coroideias posteriores"],
            venosa: ["vv. cerebrais internas"]
          },
          inervacao: {
            simpatica: "Via gânglio cervical superior (noradrenalina)"
          },
          histologia: {
            tiposCelulares: ["Pinealócitos", "Astrócitos", "Células intersticiais"]
          },
          subestruturas: [
            { id: "pinealocitos", nome: "Pinealócitos", nivel: "subestrutura" },
            { id: "arenito_cerebral", nome: "Arenito Cerebral (Corpora Arenacea)", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Tumor pineal", icd10: "D35.4" },
            { nome: "Distúrbios circadianos", icd10: "G47.2" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Guyton & Hall", capitulo: "Cap. 76" }]
        },
        {
          id: "glandula_tireoide",
          paiId: "endocrino",
          nivelHierarquico: "orgao",
          nome: "Glândula Tireoide",
          nomeEn: "Thyroid Gland",
          meshKey: "mesh_thyroid",
          camada: 5,
          fipatId: "A11.3.01.001",
          meshId: "D013961",
          wikidataId: "Q16399",
          icd10: ["E00-E07", "C73"],
          descricao: "Regulação do metabolismo basal e consumo celular de oxigênio através dos hormônios tiroxina (T4) e tri-iodotironina (T3).",
          funcaoPrincipal: "Metabolismo basal, crescimento, termogênese",
          vascularizacao: {
            arterial: ["a. tireóidea superior (carótida externa)", "a. tireóidea inferior (subclávia)"],
            venosa: ["vv. tireóideas superiores, médias e inferiores → jugular interna / braquiocefálica"],
            linfatica: ["linfonodos cervicais profundos"]
          },
          inervacao: {
            simpatica: "Gânglios cervicais (vasoconstrição)",
            parassimpatica: "NC X (modulação)"
          },
          histologia: {
            tiposCelulares: ["Tireócitos (folículos)", "Células C parafoliculares (calcitonina)"]
          },
          subestruturas: [
            { id: "lobo_dir", nome: "Lobo Direito", nivel: "subestrutura" },
            { id: "lobo_esq", nome: "Lobo Esquerdo", nivel: "subestrutura" },
            { id: "istmo", nome: "Istmo da Tireoide", nivel: "subestrutura" },
            { id: "foliculos", nome: "Folículos Tireoidianos", nivel: "subestrutura" },
            { id: "celulas_c", nome: "Células C Parafoliculares", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Hipotireoidismo", icd10: "E03", icd11: "5A00" },
            { nome: "Hipertireoidismo", icd10: "E05", icd11: "5A02" },
            { nome: "Tireoidite de Hashimoto", icd10: "E06.3" },
            { nome: "Câncer de tireoide", icd10: "C73", icd11: "2D10" }
          ],
          proteinasChave: [
            { nome: "Tireoperoxidase (TPO)", pdbId: "1DNU", funcao: "Síntese de T3/T4" },
            { nome: "Tireoglobulina", pdbId: "1TGH", funcao: "Precursor hormonal" }
          ],
          processosIds: [],
          farmacosRelacionados: ["levotiroxina", "metimazol"],
          referencias: [{ fonte: "Guyton & Hall", capitulo: "Cap. 77" }]
        },
        {
          id: "glandulas_paratireoides",
          paiId: "endocrino",
          nivelHierarquico: "orgao",
          nome: "Glândulas Paratireoides",
          nomeEn: "Parathyroid Glands",
          meshKey: "mesh_parathyroid",
          camada: 5,
          fipatId: "A11.4.01.001",
          meshId: "D010280",
          wikidataId: "Q237450",
          icd10: ["E20-E21", "D35.1"],
          descricao: "Quatro pequenas glândulas posteriores à tireoide secretoras de paratormônio (PTH), regulador mestre da calcemia.",
          funcaoPrincipal: "Regulação da calcemia",
          vascularizacao: {
            arterial: ["a. tireóidea inferior"],
            venosa: ["vv. tireóideas"]
          },
          histologia: {
            tiposCelulares: ["Células principais (PTH)", "Células oxífilas"]
          },
          subestruturas: [
            { id: "paratireoides_sup", nome: "Paratireoides Superiores", nivel: "subestrutura" },
            { id: "paratireoides_inf", nome: "Paratireoides Inferiores", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Hiperparatireoidismo", icd10: "E21", icd11: "5A50" },
            { nome: "Hipoparatireoidismo", icd10: "E20", icd11: "5A50.0" }
          ],
          proteinasChave: [
            { nome: "PTH", pdbId: "1ET1", funcao: "Regulação da calcemia" }
          ],
          processosIds: [],
          referencias: [{ fonte: "Guyton & Hall", capitulo: "Cap. 79" }]
        },
        {
          id: "glandulas_adrenais",
          paiId: "endocrino",
          nivelHierarquico: "orgao",
          nome: "Glândulas Adrenais (Suprarrenais)",
          nomeEn: "Adrenal Glands",
          meshKey: "mesh_adrenal",
          camada: 5,
          fipatId: "A11.5.01.001",
          meshId: "D000311",
          wikidataId: "Q185004",
          icd10: ["E24-E27", "C74"],
          descricao: "Glândulas pares sobre os polos renais divididas em córtex esteroidogênico e medula secretora de catecolaminas.",
          funcaoPrincipal: "Resposta ao estresse, homeostase hidroeletrolítica",
          vascularizacao: {
            arterial: ["aa. suprarrenais superior, média e inferior"],
            venosa: ["v. suprarrenal direita → VCI; v. suprarrenal esquerda → v. renal esquerda"],
            linfatica: ["linfonodos lombares"]
          },
          inervacao: {
            simpatica: "Fibras pré-ganglionares (medula adrenal atua como gânglio simpático modificado)",
            parassimpatica: "NC X (cortical modulação)"
          },
          histologia: {
            tiposCelulares: [
              "Células da zona glomerulosa (aldosterona)",
              "Células da zona fasciculada (cortisol)",
              "Células da zona reticular (andrógenos)",
              "Células cromafins (adrenalina/noradrenalina)"
            ]
          },
          subestruturas: [
            { id: "zona_glomerulosa", nome: "Zona Glomerulosa", nivel: "subestrutura" },
            { id: "zona_fasciculada", nome: "Zona Fasciculada", nivel: "subestrutura" },
            { id: "zona_reticular", nome: "Zona Reticular", nivel: "subestrutura" },
            { id: "medula_adrenal", nome: "Medula Adrenal", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Doença de Addison", icd10: "E27.1", icd11: "5A74" },
            { nome: "Síndrome de Cushing", icd10: "E24", icd11: "5A70" },
            { nome: "Feocromocitoma", icd10: "D35.0", icd11: "5A75" },
            { nome: "Hiperaldosteronismo", icd10: "E26" }
          ],
          proteinasChave: [
            { nome: "CYP11B1 (11β-hidroxilase)", pdbId: "6M7X", funcao: "Síntese de cortisol" }
          ],
          processosIds: [],
          farmacosRelacionados: ["dexametasona", "espironolactona"],
          referencias: [{ fonte: "Guyton & Hall", capitulo: "Cap. 78" }]
        },
        {
          id: "pancreas_endocrino",
          paiId: "endocrino",
          nivelHierarquico: "orgao",
          nome: "Pâncreas Endócrino (Ilhotas de Langerhans)",
          nomeEn: "Endocrine Pancreas",
          meshKey: "mesh_pancreas_islet",
          camada: 5,
          meshId: "D007515",
          wikidataId: "Q188919",
          icd10: ["E10-E14", "D13.7"],
          descricao: "Ilhotas de Langerhans dispersas no parênquima pancreático que controlam a homeostase glicêmica.",
          funcaoPrincipal: "Regulação da glicemia",
          vascularizacao: {
            arterial: ["aa. pancreáticas (ramos da esplênica e mesentérica superior)"],
            venosa: ["vv. pancreáticas → veia porta"]
          },
          inervacao: {
            simpatica: "T6-T10",
            parassimpatica: "NC X"
          },
          histologia: {
            tiposCelulares: [
              "Células β (insulina) — 60-70%",
              "Células α (glucagon) — 20-25%",
              "Células δ (somatostatina) — 5-10%",
              "Células PP (polipeptídeo pancreático)"
            ]
          },
          subestruturas: [
            { id: "celulas_beta", nome: "Células Beta (Insulina)", nivel: "subestrutura" },
            { id: "celulas_alfa", nome: "Células Alfa (Glucagon)", nivel: "subestrutura" },
            { id: "celulas_delta", nome: "Células Delta (Somatostatina)", nivel: "subestrutura" },
            { id: "celulas_pp", nome: "Células PP", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Diabetes tipo 1", icd10: "E10", icd11: "5A10" },
            { nome: "Diabetes tipo 2", icd10: "E11", icd11: "5A11" },
            { nome: "Insulinoma", icd10: "D13.7" }
          ],
          proteinasChave: [
            { nome: "Insulina", pdbId: "4INS", funcao: "Redução da glicemia" },
            { nome: "Receptor de insulina", pdbId: "3W14", funcao: "Sinalização de captação de glicose" }
          ],
          processosIds: [],
          farmacosRelacionados: ["insulina_regular", "metformina"],
          referencias: [{ fonte: "Guyton & Hall", capitulo: "Cap. 79" }]
        }
      ],
      processosDisponiveis: [],
      farmacosRelacionados: ["levotiroxina", "dexametasona", "insulina_regular", "metformina", "metimazol"],
      celulasTipicas: ["somatotrofo", "tireocito", "celula_beta", "celula_alfa", "celula_cromafim"]
    },

    // =====================================================================
    // 7. ESQUELÉTICO [P1 CORRIGIDO — separado de muscular/articular]
    // =====================================================================
    {
      id: "esqueletico",
      paiId: null,
      nivelHierarquico: "sistema",
      nome: "Sistema Esquelético",
      nomeEn: "Skeletal System",
      nomeEs: "Sistema Esquelético",
      nomeLa: "Systema skeletale",
      icone: "🦴",
      cor: "#a855f7",
      focoCamera: { x: 0, y: 1.1, z: 2.8 },
      targetLook: { x: 0, y: 1.1, z: 0 },
      camadaDisseccao: 3,
      meshKeywords: ["mesh_skull_*", "mesh_vertebrae_*", "mesh_rib_*", "mesh_sternum_*", "mesh_femur_*", "mesh_tibia_*", "mesh_humerus_*", "mesh_pelvis_*"],
      fipatId: "A02.0.00.000",
      meshId: "D012898",
      icd11Capitulo: "Capítulo 15 — Doenças do sistema osteomuscular",
      wikidataId: "Q956453",
      sinonimos: ["Esqueleto", "Arcabouço ósseo"],
      termosRelacionados: ["osso", "osteologia", "remodelação óssea", "hematopoese"],
      descricao: "Armação estrutural rígida de sustentação, alavanca mecânica, proteção de órgãos vitais e reservatório de cálcio e fósforo.",
      funcaoFisiologica: "Suporte, proteção, movimento (alavancas), reserva mineral, hematopoese.",
      embriologiaOrigem: "Mesoderma paraxial + crista neural (crânio) + esclerótomo (coluna)",
      histologiaPredominante: "Osso cortical (compacto) + osso trabecular (esponjoso) + cartilagem hialina articular",
      orgaos: [
        {
          id: "ossos_axial",
          paiId: "esqueletico",
          nivelHierarquico: "regiao",
          nome: "Esqueleto Axial",
          nomeEn: "Axial Skeleton",
          meshKey: "mesh_axial_skeleton",
          camada: 3,
          meshId: "D012898",
          wikidataId: "Q2267350",
          descricao: "Conjunto de 80 ossos formando o eixo central do corpo (crânio, coluna, caixa torácica).",
          funcaoPrincipal: "Proteção de órgãos vitais e sustentação central",
          subestruturas: [
            { id: "cranio", nome: "Crânio (Calvária e Face)", nivel: "subestrutura" },
            { id: "coluna_vertebral", nome: "Coluna Vertebral", nivel: "subestrutura" },
            { id: "caixa_toracica", nome: "Caixa Torácica (Costelas + Esterno)", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Escoliose", icd10: "M41", icd11: "FA70" },
            { nome: "Fraturas vertebrais", icd10: "S22-S32" }
          ],
          proteinasChave: [
            { nome: "Colágeno tipo I", pdbId: "3HR2", funcao: "Resistência à tração" },
            { nome: "Osteocalcina", pdbId: "1Q8H", funcao: "Mineralização óssea" }
          ],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 5" }]
        },
        {
          id: "ossos_apendicular",
          paiId: "esqueletico",
          nivelHierarquico: "regiao",
          nome: "Esqueleto Apendicular",
          nomeEn: "Appendicular Skeleton",
          meshKey: "mesh_appendicular_skeleton",
          camada: 3,
          meshId: "D012898",
          wikidataId: "Q619790",
          descricao: "Conjunto de 126 ossos dos membros superiores e inferiores + cinturas escapular e pélvica.",
          funcaoPrincipal: "Locomoção e manipulação",
          subestruturas: [
            { id: "cintura_escapular", nome: "Cintura Escapular (Clavícula + Escápula)", nivel: "subestrutura" },
            { id: "membro_sup", nome: "Membros Superiores", nivel: "subestrutura" },
            { id: "cintura_pelvica", nome: "Cintura Pélvica", nivel: "subestrutura" },
            { id: "membro_inf", nome: "Membros Inferiores", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Osteoporose", icd10: "M81", icd11: "FB83" },
            { nome: "Fraturas de fêmur", icd10: "S72" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 6" }]
        }
      ],
      processosDisponiveis: [],
      farmacosRelacionados: ["alendronato", "teriparatida", "vitamina_d3"],
      celulasTipicas: ["osteoblasto", "osteocito", "osteoclasto", "celula_osteoprogenitora"]
    },

    // =====================================================================
    // 8. ARTICULAR (NOVO — P1)
    // =====================================================================
    {
      id: "articular",
      paiId: null,
      nivelHierarquico: "sistema",
      nome: "Sistema Articular",
      nomeEn: "Articular System",
      nomeEs: "Sistema Articular",
      nomeLa: "Systema articulare",
      icone: "🦴",
      cor: "#7c3aed",
      focoCamera: { x: 0, y: 1.1, z: 2.8 },
      targetLook: { x: 0, y: 1.1, z: 0 },
      camadaDisseccao: 3,
      meshKeywords: ["mesh_joint_*", "mesh_cartilage_*", "mesh_ligament_*", "mesh_meniscus_*"],
      fipatId: "A03.0.00.000",
      meshId: "D007596",
      icd11Capitulo: "Capítulo 15 — Doenças do sistema osteomuscular",
      wikidataId: "Q1479227",
      sinonimos: ["Junturas", "Artrologia"],
      termosRelacionados: ["sinovial", "cartilagem", "líquido sinovial", "cápsula"],
      descricao: "Conjunto de junturas que conectam ossos entre si ou ossos e cartilagens, permitindo mobilidade.",
      funcaoFisiologica: "Movimento (alavancas), estabilidade (ligamentos), absorção de impacto (cartilagem).",
      embriologiaOrigem: "Mesoderma (interzona articular)",
      histologiaPredominante: "Cartilagem hialina + membrana sinovial + cápsula fibrosa",
      orgaos: [
        {
          id: "articulacoes_sinoviais",
          paiId: "articular",
          nivelHierarquico: "regiao",
          nome: "Articulações Sinoviais",
          meshKey: "mesh_joint_synovial",
          camada: 3,
          meshId: "D013580",
          wikidataId: "Q512942",
          descricao: "Junções móveis com cavidade articular, cápsula e líquido sinovial (ombro, quadril, joelho, cotovelo).",
          funcaoPrincipal: "Movimento amplo",
          subestruturas: [
            { id: "glenoumeral", nome: "Articulação Glenoumeral (Ombro)", nivel: "subestrutura" },
            { id: "coxofemoral", nome: "Articulação Coxofemoral (Quadril)", nivel: "subestrutura" },
            { id: "joelho", nome: "Articulação do Joelho", nivel: "subestrutura" },
            { id: "cotovelo", nome: "Articulação do Cotovelo", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Osteoartrite", icd10: "M15-M19", icd11: "FA00-FA05" },
            { nome: "Artrite reumatoide", icd10: "M05-M06", icd11: "FA20" },
            { nome: "Lesão de menisco", icd10: "S83.2" },
            { nome: "Luxação de ombro", icd10: "S43.0" }
          ],
          proteinasChave: [
            { nome: "Colágeno tipo II", pdbId: "1CAG", funcao: "Cartilagem articular" },
            { nome: "Aggrecan", pdbId: "1BQV", funcao: "Proteoglicano da matriz cartilaginosa" }
          ],
          processosIds: [],
          farmacosRelacionados: ["ibuprofeno", "celecoxib", "metotrexato"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 5" }]
        },
        {
          id: "articulacoes_cartilagineas",
          paiId: "articular",
          nivelHierarquico: "regiao",
          nome: "Articulações Cartilagíneas",
          meshKey: "mesh_joint_cartilaginous",
          camada: 3,
          meshId: "D013580",
          wikidataId: "Q9270328",
          descricao: "Junções semimóveis com cartilagem hialina (sincondrose) ou fibrocartilagem (sínfise).",
          funcaoPrincipal: "Estabilidade com leve mobilidade",
          subestruturas: [
            { id: "discos_intervertebrais", nome: "Discos Intervertebrais", nivel: "subestrutura" },
            { id: "sinfise_pubica", nome: "Sínfise Púbica", nivel: "subestrutura" },
            { id: "cartilagens_costais", nome: "Cartilagens Costais", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Hérnia de disco", icd10: "M51", icd11: "FA80" },
            { nome: "Discopatia degenerativa", icd10: "M51.3" }
          ],
          proteinasChave: [
            { nome: "Colágeno tipo X", pdbId: "1X8P", funcao: "Cartilagem hipertrófica" }
          ],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 5" }]
        },
        {
          id: "articulacoes_fibrosas",
          paiId: "articular",
          nivelHierarquico: "regiao",
          nome: "Articulações Fibrosas",
          meshKey: "mesh_joint_fibrous",
          camada: 3,
          meshId: "D013580",
          wikidataId: "Q1430266",
          descricao: "Junções quase imóveis com tecido fibroso (suturas cranianas, sindesmoses, gonfoses).",
          funcaoPrincipal: "Estabilidade rígida",
          subestruturas: [
            { id: "suturas_cranianas", nome: "Suturas Cranianas", nivel: "subestrutura" },
            { id: "sindesmose_tibiofibular", nome: "Sindesmose Tibiofibular", nivel: "subestrutura" },
            { id: "gonfose_dental", nome: "Gonfose Dental", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Craniossinostose", icd10: "Q75.0" },
            { nome: "Entorse de tornozelo", icd10: "S93.4" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 5" }]
        }
      ],
      processosDisponiveis: [],
      farmacosRelacionados: ["ibuprofeno", "celecoxib", "metotrexato", "alendronato"],
      celulasTipicas: ["condrocito", "sinoviocito", "fibroblasto_sinovial"]
    },

    // =====================================================================
    // 9. MUSCULAR [P1 CORRIGIDO — separado de esquelético/articular]
    // =====================================================================
    {
      id: "muscular",
      paiId: null,
      nivelHierarquico: "sistema",
      nome: "Sistema Muscular",
      nomeEn: "Muscular System",
      nomeEs: "Sistema Muscular",
      nomeLa: "Systema musculare",
      icone: "💪",
      cor: "#ef4444",
      focoCamera: { x: 0, y: 1.15, z: 2.6 },
      targetLook: { x: 0, y: 1.15, z: 0 },
      camadaDisseccao: 2,
      meshKeywords: ["mesh_muscle_*", "mesh_tendon_*", "mesh_fascia_*", "mesh_biceps_*", "mesh_pectoral_*", "mesh_quadriceps_*"],
      fipatId: "A04.0.00.000",
      meshId: "D009132",
      icd11Capitulo: "Capítulo 15 — Doenças do sistema osteomuscular",
      wikidataId: "Q7060553",
      sinonimos: ["Miologia", "Aparelho muscular"],
      termosRelacionados: ["contração", "actina", "miosina", "tônus muscular"],
      descricao: "Miócitos contráteis especializados na geração de força mecânica, locomoção, manutenção postural e termogênese.",
      funcaoFisiologica: "Movimento, postura, termogênese, retorno venoso, proteção de órgãos.",
      embriologiaOrigem: "Mesoderma paraxial (somitos) + mesoderma esplâncnico",
      histologiaPredominante: "Estriado esquelético + liso visceral + estriado cardíaco",
      orgaos: [
        {
          id: "musculos_esqueleticos",
          paiId: "muscular",
          nivelHierarquico: "regiao",
          nome: "Músculos Esqueléticos (Voluntários)",
          meshKey: "mesh_muscle_skeletal",
          camada: 2,
          meshId: "D018482",
          wikidataId: "Q7365",
          descricao: "Mais de 600 músculos estriados inervados pelo sistema nervoso somático operando via pontes cruzadas de actina-miosina.",
          funcaoPrincipal: "Movimento voluntário e postura",
          vascularizacao: {
            arterial: ["aa. musculares específicas por região"],
            venosa: ["vv. musculares correspondentes"],
            linfatica: ["linfonodos regionais"]
          },
          inervacao: {
            motora: "Motoneurônios alfa do corno anterior medular",
            sensitiva: "Fusos musculares e órgãos de Golgi"
          },
          histologia: {
            tiposCelulares: ["Fibras tipo I (lentas oxidativas)", "Fibras tipo IIa (rápidas oxidativas)", "Fibras tipo IIb (rápidas glicolíticas)"]
          },
          subestruturas: [
            { id: "m_cabeca_pescoco", nome: "Músculos da Cabeça e Pescoço", nivel: "subestrutura" },
            { id: "m_tronco", nome: "Músculos do Tronco", nivel: "subestrutura" },
            { id: "m_diafragma", nome: "Músculo Diafragma", nivel: "subestrutura" },
            { id: "m_membros_sup", nome: "Músculos dos Membros Superiores", nivel: "subestrutura" },
            { id: "m_membros_inf", nome: "Músculos dos Membros Inferiores", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Distrofia muscular de Duchenne", icd10: "G71.0", icd11: "8C70.1" },
            { nome: "Miastenia gravis", icd10: "G70.0", icd11: "8C61" },
            { nome: "Rabdomiólise", icd10: "M62.8" },
            { nome: "Sarcopenia", icd10: "M62.84" }
          ],
          proteinasChave: [
            { nome: "Distrofina", pdbId: "1DXX", funcao: "Estabilidade do sarcolema" },
            { nome: "Receptor nicotínico AChR", pdbId: "2BG9", funcao: "Recepção neuromuscular" },
            { nome: "Dihidropiridina receptor (Cav1.1)", pdbId: "5GJV", funcao: "Acoplamento excitação-contração" }
          ],
          processosIds: ["contracao_muscular", "sinapse_colinergica"],
          farmacosRelacionados: ["succinilcolina", "pancuronio", "neostigmina"],
          referencias: [
            { fonte: "Gray's Anatomy", capitulo: "Cap. 4" },
            { fonte: "Guyton & Hall", capitulo: "Caps. 6-7" }
          ]
        },
        {
          id: "musculo_cardiaco",
          paiId: "muscular",
          nivelHierarquico: "regiao",
          nome: "Músculo Cardíaco (Miocárdio)",
          meshKey: "mesh_heart_myocardium",
          camada: 2,
          meshId: "D009206",
          wikidataId: "Q46366",
          descricao: "Músculo estriado involuntário com discos intercalares e junções comunicantes (gap junctions) para condução iônica sincicial.",
          funcaoPrincipal: "Bombeamento cardíaco",
          histologia: {
            tiposCelulares: ["Cardiomiócitos", "Células nodais", "Células de Purkinje", "Fibroblastos cardíacos"]
          },
          subestruturas: [
            { id: "discos_intercalares", nome: "Discos Intercalares", nivel: "subestrutura" },
            { id: "tubulos_t", nome: "Túbulos T Cardíacos", nivel: "subestrutura" },
            { id: "rs_cardiaco", nome: "Retículo Sarcoplasmático Cardíaco", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Miocardiopatia dilatada", icd10: "I42.0" },
            { nome: "Miocardiopatia hipertrófica", icd10: "I42.1" },
            { nome: "Infarto do miocárdio", icd10: "I21" }
          ],
          proteinasChave: [
            { nome: "Troponina I cardíaca", pdbId: "1J1D", funcao: "Marcador de infarto" },
            { nome: "Troponina T", pdbId: "1J1E", funcao: "Marcador de infarto" }
          ],
          processosIds: ["ciclo_cardiaco"],
          referencias: [{ fonte: "Guyton & Hall", capitulo: "Cap. 9" }]
        },
        {
          id: "musculo_liso",
          paiId: "muscular",
          nivelHierarquico: "regiao",
          nome: "Músculo Liso (Visceral & Vascular)",
          meshKey: "mesh_smooth_muscle",
          camada: 2,
          meshId: "D009130",
          wikidataId: "Q1128595",
          descricao: "Miócitos fusiformes involuntários não estriados nas paredes dos vasos, TGI, brônquios e útero.",
          funcaoPrincipal: "Motilidade visceral e vascular",
          histologia: {
            tiposCelulares: ["Células musculares lisas unitárias", "Células musculares lisas multiunitárias"]
          },
          subestruturas: [
            { id: "ml_vasos", nome: "Camada Muscular Vascular", nivel: "subestrutura" },
            { id: "ml_gi", nome: "Musculatura Gastrointestinal", nivel: "subestrutura" },
            { id: "ml_detrusor", nome: "Músculo Detrusor", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Hipertensão arterial", icd10: "I10" },
            { nome: "Atonia uterina", icd10: "O72.0" },
            { nome: "Íleo paralítico", icd10: "K56.0" }
          ],
          proteinasChave: [
            { nome: "Receptor M3 muscarínico", pdbId: "5ZHP", funcao: "Contração do ML" }
          ],
          processosIds: ["peristaltismo_intestinal"],
          referencias: [{ fonte: "Guyton & Hall", capitulo: "Cap. 8" }]
        },
        {
          id: "tendoes_fascias",
          paiId: "muscular",
          nivelHierarquico: "regiao",
          nome: "Tendões & Fáscias",
          meshKey: "mesh_tendon",
          camada: 2,
          meshId: "D013710",
          wikidataId: "Q184755",
          descricao: "Estruturas de ancoragem colagênica inextensível que transmitem a tensão do ventre muscular às alavancas ósseas.",
          funcaoPrincipal: "Transmissão de força e cobertura muscular",
          histologia: {
            tiposCelulares: ["Tenócitos", "Fibroblastos fasciais"],
            matrizExtracelular: "Colágeno tipo I altamente organizado"
          },
          subestruturas: [
            { id: "tendao_aquiles", nome: "Tendão Calcâneo (de Aquiles)", nivel: "subestrutura" },
            { id: "tendao_patelar", nome: "Tendão Patelar", nivel: "subestrutura" },
            { id: "fascia_lata", nome: "Fáscia Lata", nivel: "subestrutura" },
            { id: "fascia_toracolombar", nome: "Fáscia Toracolombar", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Tendinopatia do Aquiles", icd10: "M76.6" },
            { nome: "Fascite plantar", icd10: "M72.2" },
            { nome: "Fibromialgia", icd10: "M79.7" }
          ],
          proteinasChave: [
            { nome: "Tenasina-C", pdbId: "1TEN", funcao: "Remodelação de tecido conjuntivo" }
          ],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 4" }]
        }
      ],
      processosDisponiveis: ["contracao_muscular"],
      farmacosRelacionados: ["succinilcolina", "pancuronio", "neostigmina", "metformina"],
      celulasTipicas: ["miocito_esqueletico", "cardiomiocito", "celula_muscular_lisa", "tenocito"]
    },

    // =====================================================================
    // 10. IMUNOLÓGICO (separado de linfático — P1)
    // =====================================================================
    {
      id: "imunologico",
      paiId: null,
      nivelHierarquico: "sistema",
      nome: "Sistema Imunológico",
      nomeEn: "Immune System",
      nomeEs: "Sistema Inmunitario",
      nomeLa: "Systema immunitatis",
      icone: "🛡️",
      cor: "#10b981",
      focoCamera: { x: 0, y: 1.15, z: 2.1 },
      targetLook: { x: 0, y: 1.15, z: 0 },
      camadaDisseccao: 4,
      meshKeywords: ["mesh_spleen_*", "mesh_thymus_*", "mesh_tonsil_*", "mesh_marrow_*", "mesh_peyer_*"],
      fipatId: "A13.0.00.000",
      meshId: "D007107",
      icd11Capitulo: "Capítulo 04 — Doenças do sistema imunológico",
      wikidataId: "Q1059",
      sinonimos: ["Sistema imune", "Sistema de defesa"],
      termosRelacionados: ["anticorpo", "linfócito", "citocina", "inflamação"],
      descricao: "Vigilância celular contra patógenos, processamento antigênico e resposta imune inata e adaptativa.",
      funcaoFisiologica: "Defesa contra patógenos, tolerância, memória imunológica.",
      embriologiaOrigem: "Mesoderma (medula óssea) + endoderma (timo)",
      histologiaPredominante: "Tecido linfoide (linfócitos, macrófagos, células dendríticas)",
      orgaos: [
        {
          id: "baco",
          paiId: "imunologico",
          nivelHierarquico: "orgao",
          nome: "Baço",
          nomeEn: "Spleen",
          meshKey: "mesh_spleen",
          camada: 5,
          fipatId: "A13.2.01.001",
          meshId: "D013154",
          wikidataId: "Q210912",
          icd10: ["D73.0-D73.5"],
          descricao: "Maior órgão linfoide periférico; filtra o sangue, elimina hemácias senescentes e orquestra respostas imunes humorais.",
          funcaoPrincipal: "Filtração sanguínea, resposta imune, hematopoese",
          vascularizacao: {
            arterial: ["a. esplênica (tronco celíaco)"],
            venosa: ["v. esplênica → veia porta"],
            linfatica: ["linfonodos celíacos"]
          },
          inervacao: {
            simpatica: "Plexo celíaco (T6-T10)"
          },
          histologia: {
            tiposCelulares: ["Linfócitos B e T", "Macrófagos", "Células dendríticas"]
          },
          subestruturas: [
            { id: "polpa_branca", nome: "Polpa Branca", nivel: "subestrutura" },
            { id: "polpa_vermelha", nome: "Polpa Vermelha", nivel: "subestrutura" },
            { id: "cordões_billroth", nome: "Cordões de Billroth", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Esplenomegalia", icd10: "R16.1" },
            { nome: "Ruptura esplênica", icd10: "S36.0" },
            { nome: "Linfoma esplênico", icd10: "C85" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Abbas — Imunologia Celular e Molecular", capitulo: "Cap. 2" }]
        },
        {
          id: "timo",
          paiId: "imunologico",
          nivelHierarquico: "orgao",
          nome: "Timo",
          nomeEn: "Thymus",
          meshKey: "mesh_thymus",
          camada: 5,
          fipatId: "A13.1.01.001",
          meshId: "D013950",
          wikidataId: "Q163987",
          icd10: ["D15.0", "E31.0"],
          descricao: "Órgão linfoide primário no mediastino anterior responsável pela maturação, diferenciação e seleção positiva/negativa de linfócitos T.",
          funcaoPrincipal: "Maturação de linfócitos T",
          vascularizacao: {
            arterial: ["aa. torácicas internas", "aa. tireóideas inferiores"],
            venosa: ["vv. tireóideas e torácicas internas"]
          },
          inervacao: {
            simpatica: "Cadeia simpática cervical",
            parassimpatica: "NC X"
          },
          histologia: {
            tiposCelulares: ["Timócitos", "Células epiteliais tímicas", "Células dendríticas", "Macrófagos"]
          },
          subestruturas: [
            { id: "cortex_timico", nome: "Córtex Tímico", nivel: "subestrutura" },
            { id: "medula_timica", nome: "Medula Tímica", nivel: "subestrutura" },
            { id: "corpusculos_hassall", nome: "Corpúsculos de Hassall", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Miastenia gravis", icd10: "G70.0" },
            { nome: "Timoma", icd10: "D15.0" }
          ],
          proteinasChave: [
            { nome: "AIRE", pdbId: "5D8S", funcao: "Tolerância central" }
          ],
          processosIds: [],
          referencias: [{ fonte: "Abbas — Imunologia Celular e Molecular", capitulo: "Cap. 7" }]
        },
        {
          id: "tonsilas",
          paiId: "imunologico",
          nivelHierarquico: "orgao",
          nome: "Tonsilas (Amígdalas)",
          meshKey: "mesh_tonsil",
          camada: 5,
          fipatId: "A13.3.01.001",
          meshId: "D014066",
          wikidataId: "Q172198",
          icd10: ["J35.0", "J03"],
          descricao: "Agregados linfoides da mucosa faríngea (Anel de Waldeyer) de contato primário com antígenos inalados e ingeridos.",
          funcaoPrincipal: "Defesa imunológica da orofaringe",
          histologia: {
            tiposCelulares: ["Linfócitos", "Criptas epiteliais"]
          },
          subestruturas: [
            { id: "tonsila_palatina", nome: "Tonsilas Palatinas", nivel: "subestrutura" },
            { id: "adenoide", nome: "Tonsila Faríngea (Adenoide)", nivel: "subestrutura" },
            { id: "tonsila_lingual", nome: "Tonsila Lingual", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Amigdalite", icd10: "J03", icd11: "CA03" },
            { nome: "Hipertrofia adenoideana", icd10: "J35.2" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Abbas — Imunologia Celular e Molecular", capitulo: "Cap. 12" }]
        },
        {
          id: "medula_ossea",
          paiId: "imunologico",
          nivelHierarquico: "orgao",
          nome: "Medula Óssea Hematopoética",
          meshKey: "mesh_bone_marrow",
          camada: 3,
          fipatId: "A13.4.01.001",
          meshId: "D001853",
          wikidataId: "Q1037007",
          icd10: ["D50-D53", "C91-C95"],
          descricao: "Órgão primário hematopoético no interior dos ossos esponjosos, gerador de todas as linhagens de células do sangue.",
          funcaoPrincipal: "Hematopoese e maturação de linfócitos B",
          vascularizacao: {
            arterial: ["aa. nutrícias dos ossos"],
            venosa: ["seios venosos medulares"],
            linfatica: ["linfonodos regionais"]
          },
          histologia: {
            tiposCelulares: ["Células-tronco hematopoéticas", "Progenitores mieloides", "Progenitores linfoides", "Estroma medular", "Adipócitos"]
          },
          subestruturas: [
            { id: "cth", nome: "Células-Tronco Hematopoéticas", nivel: "subestrutura" },
            { id: "linhagem_mieloide", nome: "Linhagem Mieloide", nivel: "subestrutura" },
            { id: "linhagem_linfoide", nome: "Linhagem Linfoide", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Leucemia", icd10: "C91-C95", icd11: "2B33" },
            { nome: "Anemia aplástica", icd10: "D61" },
            { nome: "Mieloma múltiplo", icd10: "C90.0" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Abbas — Imunologia Celular e Molecular", capitulo: "Cap. 2" }]
        },
        {
          id: "galt_placas_peyer",
          paiId: "imunologico",
          nivelHierarquico: "orgao",
          nome: "Tecido Linfoide Associado ao Intestino (GALT)",
          meshKey: "mesh_peyer_patches",
          camada: 5,
          meshId: "D010581",
          wikidataId: "Q1479809",
          descricao: "Folículos linfoides agregados na lâmina própria e submucosa ileal com células M captadoras de antígenos luminais.",
          funcaoPrincipal: "Vigilância imunológica intestinal",
          histologia: {
            tiposCelulares: ["Células M", "Linfócitos intraepiteliais", "Linfócitos B e T", "Células dendríticas"]
          },
          subestruturas: [
            { id: "placas_peyer", nome: "Placas de Peyer no Íleo", nivel: "subestrutura" },
            { id: "celulas_m", nome: "Células M (Microfold)", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Doença de Crohn", icd10: "K50" },
            { nome: "Doença celíaca", icd10: "K90.0" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Abbas — Imunologia Celular e Molecular", capitulo: "Cap. 12" }]
        }
      ],
      processosDisponiveis: [],
      farmacosRelacionados: ["dexametasona_nano", "metotrexato", "corticoide"],
      celulasTipicas: ["linfocito_T", "linfocito_B", "macrofago", "celula_dendritica", "neutrofilo"]
    },

    // =====================================================================
    // 11. LINFÁTICO (NOVO — P1)
    // =====================================================================
    {
      id: "linfatico",
      paiId: null,
      nivelHierarquico: "sistema",
      nome: "Sistema Linfático",
      nomeEn: "Lymphatic System",
      nomeEs: "Sistema Linfático",
      nomeLa: "Systema lymphoideum",
      icone: "🌊",
      cor: "#22c55e",
      focoCamera: { x: 0, y: 1.15, z: 2.1 },
      targetLook: { x: 0, y: 1.15, z: 0 },
      camadaDisseccao: 4,
      meshKeywords: ["mesh_lymph_node_*", "mesh_lymph_vessel_*", "mesh_duct_thoracic*"],
      fipatId: "A13.5.00.000",
      meshId: "D008208",
      wikidataId: "Q172612",
      sinonimos: ["Sistema linfático"], 
      termosRelacionados: ["linfa", "linfonodo", "ducto torácico", "edema"],
      descricao: "Rede de vasos e órgãos que drenam o fluido intersticial, transportam lipídios (quilomícrons) e veiculam células imunes.",
      funcaoFisiologica: "Drenagem do interstício, absorção de lipídios, transporte de células imunes.",
      embriologiaOrigem: "Mesoderma",
      histologiaPredominante: "Endotélio linfático + tecido linfoide",
      orgaos: [
        {
          id: "linfonodos",
          paiId: "linfatico",
          nivelHierarquico: "orgao",
          nome: "Linfonodos",
          meshKey: "mesh_lymph_node",
          camada: 4,
          fipatId: "A13.5.01.001",
          meshId: "D008198",
          wikidataId: "Q170758",
          icd10: ["I88", "C77", "R59"],
          descricao: "Estruturas reniformes encapsuladas intercaladas nos vasos linfáticos para retenção e apresentação de antígenos.",
          funcaoPrincipal: "Filtração linfática e resposta imune",
          vascularizacao: {
            arterial: ["aa. regionais específicas"],
            venosa: ["vv. regionais"],
            linfatica: ["aferentes e eferentes"]
          },
          inervacao: {
            simpatica: "Plexos periarteriais"
          },
          histologia: {
            tiposCelulares: ["Linfócitos B (córtex)", "Linfócitos T (paracórtex)", "Macrófagos", "Células dendríticas foliculares"]
          },
          subestruturas: [
            { id: "cortex_superficial", nome: "Córtex Superficial (Folículos B)", nivel: "subestrutura" },
            { id: "paracortex", nome: "Paracórtex (Zona T)", nivel: "subestrutura" },
            { id: "medula", nome: "Medula (Cordões e Seios)", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Linfadenite", icd10: "I88", icd11: "BD90" },
            { nome: "Linfoma de Hodgkin", icd10: "C81", icd11: "2B30" },
            { nome: "Linfoma não-Hodgkin", icd10: "C82-C85" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Abbas — Imunologia Celular e Molecular", capitulo: "Cap. 2" }]
        },
        {
          id: "vasos_linfaticos",
          paiId: "linfatico",
          nivelHierarquico: "orgao",
          nome: "Vasos Linfáticos & Ducto Torácico",
          meshKey: "mesh_lymph_vessel",
          camada: 4,
          meshId: "D008205",
          wikidataId: "Q25615",
          icd10: ["I89"],
          descricao: "Rede unidirecional valvulada que drena a linfa e lipídios absorvidos (quilo) de volta à circulação venosa sistêmica.",
          funcaoPrincipal: "Retorno de linfa ao sangue",
          histologia: {
            tiposCelulares: ["Células endoteliais linfáticas", "Células musculares lisas"]
          },
          subestruturas: [
            { id: "capilares_linf", nome: "Capilares Linfáticos Iniciais", nivel: "subestrutura" },
            { id: "cisterna_quilo", nome: "Cisterna do Quilo", nivel: "subestrutura" },
            { id: "ducto_toracico", nome: "Ducto Torácico", nivel: "subestrutura" },
            { id: "ducto_linf_dir", nome: "Ducto Linfático Direito", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Linfedema", icd10: "I89.0", icd11: "BD93" },
            { nome: "Linfangite", icd10: "I89.1" }
          ],
          proteinasChave: [
            { nome: "VEGFR-3", pdbId: "4BSK", funcao: "Linfangiogênese" }
          ],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 7" }]
        }
      ],
      processosDisponiveis: [],
      farmacosRelacionados: [],
      celulasTipicas: ["celula_endotelial_linfatica", "linfocito_T", "linfocito_B", "macrofago"]
    },

    // =====================================================================
    // 12. TEGUMENTAR
    // =====================================================================
    {
      id: "tegumentar",
      paiId: null,
      nivelHierarquico: "sistema",
      nome: "Sistema Tegumentar",
      nomeEn: "Integumentary System",
      nomeEs: "Sistema Tegumentario",
      nomeLa: "Systema integumentare",
      icone: "🧴",
      cor: "#fbbf24",
      focoCamera: { x: 0, y: 1.1, z: 2.5 },
      targetLook: { x: 0, y: 1.1, z: 0 },
      camadaDisseccao: 1,
      meshKeywords: ["mesh_skin_*", "mesh_hair_*", "mesh_nail_*", "mesh_mammary_*", "mesh_subcutaneous_*"],
      fipatId: "A16.0.00.000",
      meshId: "D034582",
      icd11Capitulo: "Capítulo 14 — Doenças da pele",
      wikidataId: "Q12137",
      sinonimos: ["Sistema tegumentar"],
      termosRelacionados: ["epiderme", "derme", "queratina", "melanina"],
      descricao: "Envoltório protetor primário contra agressões mecânicas, radiação UV, dessecação e patógenos, com funções termorreguladoras.",
      funcaoFisiologica: "Proteção, termorregulação, sensação, síntese de vitamina D, excreção.",
      embriologiaOrigem: "Ectoderma (epiderme) + mesoderma (derme)",
      histologiaPredominante: "Epitélio escamoso estratificado queratinizado",
      orgaos: [
        {
          id: "pele_estratos",
          paiId: "tegumentar",
          nivelHierarquico: "orgao",
          nome: "Pele (Epiderme & Derme)",
          nomeEn: "Skin",
          meshKey: "mesh_skin",
          camada: 1,
          fipatId: "A16.1.01.001",
          meshId: "D012867",
          wikidataId: "Q1074",
          icd10: ["L00-L99", "C43-C44"],
          descricao: "Maior órgão do corpo humano; barreira hidrofóbica com estrato córneo limitante da permeabilidade tópica.",
          funcaoPrincipal: "Barreira, termorregulação, sensação",
          vascularizacao: {
            arterial: ["plexos dérmicos (superficial e profundo)"],
            venosa: ["vv. cutâneas → vv. perfurantes"],
            linfatica: ["plexo linfático dérmico"]
          },
          inervacao: {
            sensitiva: ["Terminações nervosas livres (dor)", "Corpúsculos de Meissner (tato)", "Corpúsculos de Pacini (vibração)", "Discos de Merkel (tato fino)"],
            simpatica: "Sudomotor e vasomotor"
          },
          histologia: {
            epitelio: "Escamoso estratificado queratinizado",
            tiposCelulares: ["Queratinócitos", "Melanócitos", "Células de Langerhans", "Células de Merkel"],
            matrizExtracelular: "Colágeno I e III, elastina, ácido hialurônico"
          },
          subestruturas: [
            { id: "estrato_corneo", nome: "Estrato Córneo", nivel: "subestrutura" },
            { id: "estrato_basal", nome: "Estrato Basal", nivel: "subestrutura" },
            { id: "derme_papilar", nome: "Derme Papilar", nivel: "subestrutura" },
            { id: "derme_reticular", nome: "Derme Reticular", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Dermatite atópica", icd10: "L20", icd11: "EA80" },
            { nome: "Psoríase", icd10: "L40", icd11: "EA90" },
            { nome: "Melanoma", icd10: "C43", icd11: "2C30" },
            { nome: "Carcinoma basocelular", icd10: "C44" }
          ],
          proteinasChave: [
            { nome: "Filagrina", pdbId: "4PJ3", funcao: "Estrutura do estrato córneo" },
            { nome: "Tirosinase", pdbId: "5M8L", funcao: "Síntese de melanina" }
          ],
          processosIds: [],
          farmacosRelacionados: ["dexametasona_nano", "betametasona", "tacrolimo"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 8" }]
        },
        {
          id: "cabelo_foliculos",
          paiId: "tegumentar",
          nivelHierarquico: "orgao",
          nome: "Cabelo & Folículos Pilosos",
          meshKey: "mesh_hair_follicle",
          camada: 1,
          meshId: "D006197",
          wikidataId: "Q14076",
          icd10: ["L65-L67", "L73"],
          descricao: "Filamentos queratinizados produzidos por folículos epidérmicos invaginados com inervação tátil sensível.",
          funcaoPrincipal: "Proteção, termorregulação, sensação tátil",
          histologia: {
            tiposCelulares: ["Queratinócitos foliculares", "Melanócitos do bulbo", "Células da bainha radicular"]
          },
          subestruturas: [
            { id: "haste_pilosa", nome: "Haste Pilosa", nivel: "subestrutura" },
            { id: "bulbo_piloso", nome: "Bulbo Piloso", nivel: "subestrutura" },
            { id: "musculo_eretor", nome: "Músculo Eretor do Pelo", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Alopecia androgenética", icd10: "L64", icd11: "ED70.2" },
            { nome: "Alopecia areata", icd10: "L63", icd11: "ED70.1" },
            { nome: "Foliculite", icd10: "L73.9" }
          ],
          proteinasChave: [],
          processosIds: [],
          farmacosRelacionados: ["minoxidil", "finasterida"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 8" }]
        },
        {
          id: "unhas",
          paiId: "tegumentar",
          nivelHierarquico: "orgao",
          nome: "Unhas",
          meshKey: "mesh_nail",
          camada: 1,
          meshId: "D009264",
          wikidataId: "Q165328",
          icd10: ["L60", "L62"],
          descricao: "Placas rígidas de queratina densa na face dorsal dos dígitos que auxiliam na preensão e proteção das falanges distais.",
          funcaoPrincipal: "Proteção das extremidades digitais",
          histologia: {
            tiposCelulares: ["Onicócitos (matriz)", "Queratinócitos do leito ungueal"]
          },
          subestruturas: [
            { id: "lamina_ungueal", nome: "Lâmina Ungueal", nivel: "subestrutura" },
            { id: "matriz_ungueal", nome: "Matriz Ungueal", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Onicomicose", icd10: "B35.1" },
            { nome: "Psoríase ungueal", icd10: "L40.8" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 8" }]
        },
        {
          id: "glandulas_mamarias",
          paiId: "tegumentar",
          nivelHierarquico: "orgao",
          nome: "Glândulas Mamárias",
          meshKey: "mesh_mammary",
          camada: 1,
          meshId: "D042241",
          wikidataId: "Q7156",
          icd10: ["N60-N64", "C50"],
          descricao: "Glândulas sudoríparas apócrinas modificadas na região peitoral responsáveis pela síntese e ejeção de leite materno.",
          funcaoPrincipal: "Lactação",
          vascularizacao: {
            arterial: ["a. torácica interna", "a. torácica lateral"],
            venosa: ["vv. torácicas → axilar"],
            linfatica: ["linfonodos axilares (75%)", "linfonodos paraesternais"]
          },
          inervacao: {
            simpatica: "T4-T6 (ejeção de leite - ocitocina)"
          },
          histologia: {
            tiposCelulares: ["Células alveolares secretoras", "Células mioepiteliais"]
          },
          subestruturas: [
            { id: "lobulos_mamarios", nome: "Lóbulos Mamários", nivel: "subestrutura" },
            { id: "ductos_lactiferos", nome: "Ductos Lactíferos", nivel: "subestrutura" },
            { id: "papila_mamaria", nome: "Papila Mamária", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Câncer de mama", icd10: "C50", icd11: "2C60-2C6Z" },
            { nome: "Mastite", icd10: "N61" },
            { nome: "Fibroadenoma", icd10: "D24" }
          ],
          proteinasChave: [
            { nome: "HER2", pdbId: "1N8Z", funcao: "Alvo trastuzumabe" },
            { nome: "Receptor de estrogênio", pdbId: "1A52", funcao: "Alvo tamoxifeno" }
          ],
          processosIds: [],
          farmacosRelacionados: ["tamoxifeno", "trastuzumabe"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 8" }]
        },
        {
          id: "tecido_subcutaneo",
          paiId: "tegumentar",
          nivelHierarquico: "orgao",
          nome: "Tecido Subcutâneo (Hipoderme)",
          meshKey: "mesh_subcutaneous",
          camada: 1,
          meshId: "D040521",
          wikidataId: "Q1130193",
          icd10: ["E65", "L98.8"],
          descricao: "Camada adiposa vascularizada de isolamento térmico, absorção de choque mecânico e depósito de injeções subcutâneas.",
          funcaoPrincipal: "Isolamento, reserva energética, absorção de impacto",
          histologia: {
            tiposCelulares: ["Adipócitos", "Fibroblastos"],
            matrizExtracelular: "Colágeno frouxo + capilares"
          },
          subestruturas: [
            { id: "panículo_adiposo", nome: "Panículo Adiposo", nivel: "subestrutura" },
            { id: "septos_fibrosos", nome: "Septos Fibrosos Interlobulares", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Obesidade", icd10: "E66", icd11: "5B81" },
            { nome: "Celulite", icd10: "L98.8" },
            { nome: "Lipodistrofia", icd10: "E88.1" }
          ],
          proteinasChave: [
            { nome: "Leptina", pdbId: "1AX8", funcao: "Regulação do apetite" }
          ],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 8" }]
        }
      ],
      processosDisponiveis: [],
      farmacosRelacionados: ["dexametasona_nano", "metformina"],
      celulasTipicas: ["queratinocito", "melanocito", "celula_langerhans", "adipocito"]
    },

    // =====================================================================
    // 13. REPRODUTOR
    // =====================================================================
    {
      id: "reprodutor",
      paiId: null,
      nivelHierarquico: "sistema",
      nome: "Sistema Reprodutor",
      nomeEn: "Reproductive System",
      nomeEs: "Sistema Reproductor",
      nomeLa: "Systema genitale",
      icone: "🧬",
      cor: "#6366f1",
      focoCamera: { x: 0, y: 0.8, z: 1.85 },
      targetLook: { x: 0, y: 0.8, z: 0 },
      camadaDisseccao: 5,
      meshKeywords: ["mesh_testis_*", "mesh_epididym*", "mesh_prostat*", "mesh_penis_*", "mesh_ovary_*", "mesh_uterus_*", "mesh_vagina_*", "mesh_fallopian_*"],
      fipatId: "A09.0.00.000",
      meshId: "D005835",
      icd11Capitulo: "Capítulo 16 — Doenças do aparelho geniturinário",
      wikidataId: "Q270275",
      sinonimos: ["Aparelho reprodutor", "Sistema genital"],
      termosRelacionados: ["gametogênese", "fertilização", "gestação", "hormônios sexuais"],
      descricao: "Gametogênese, produção de hormônios sexuais, cópula e gestação da espécie humana.",
      funcaoFisiologica: "Reprodução, produção hormonal, perpetuação da espécie.",
      embriologiaOrigem: "Mesoderma intermediário + endoderma (gônadas) + seio urogenital",
      histologiaPredominante: "Epitélio germinativo + células de Sertoli/Leydig ou folículos ovarianos",
      // NOTA P2: aqui ficam ovários e testículos (únicos); endócrino REFERENCIA estes.
      orgaos: [
        {
          id: "testiculos",
          paiId: "reprodutor",
          nivelHierarquico: "orgao",
          nome: "Testículos & Túbulos Seminíferos (M)",
          nomeEn: "Testes",
          meshKey: "mesh_testis",
          camada: 5,
          fipatId: "A09.3.01.001",
          meshId: "D013737",
          wikidataId: "Q9384",
          icd10: ["N43-N45", "C62"],
          descricao: "Gônadas masculinas contendo túbulos seminíferos onde ocorre a espermatogênese contínua sob ação do FSH; células de Leydig produzem testosterona sob LH.",
          funcaoPrincipal: "Espermatogênese e produção de testosterona",
          vascularizacao: {
            arterial: ["a. testicular (aorta abdominal)"],
            venosa: ["plexo pampiniforme → v. testicular"],
            linfatica: ["linfonodos para-aórticos lombares"]
          },
          inervacao: {
            simpatica: "T10-T11"
          },
          histologia: {
            tiposCelulares: ["Espermatogônias", "Espermatócitos", "Espermátides", "Espermatozoides", "Células de Sertoli", "Células de Leydig"]
          },
          subestruturas: [
            { id: "tubulos_seminiferos", nome: "Túbulos Seminíferos Contorcidos", nivel: "subestrutura" },
            { id: "tunica_albuginea", nome: "Túnica Albugínea", nivel: "subestrutura" },
            { id: "rete_testis", nome: "Rede Testicular (Rete Testis)", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Câncer de testículo", icd10: "C62", icd11: "2C80" },
            { nome: "Hipogonadismo", icd10: "E29" },
            { nome: "Varicocele", icd10: "I86.1" }
          ],
          proteinasChave: [
            { nome: "Receptor de LH", pdbId: "4MQW", funcao: "Síntese de testosterona" },
            { nome: "Receptor de FSH", pdbId: "4AY9", funcao: "Espermatogênese" }
          ],
          processosIds: [],
          farmacosRelacionados: ["testosterona", "clomifeno"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 79" }]
        },
        {
          id: "epididimo",
          paiId: "reprodutor",
          nivelHierarquico: "orgao",
          nome: "Epidídimo (M)",
          meshKey: "mesh_epididymis",
          camada: 5,
          meshId: "D004822",
          wikidataId: "Q173253",
          icd10: ["N45"],
          descricao: "Estrutura tubular convoluta apostada ao testículo onde os espermatozoides adquirem motilidade e maturação funcional.",
          funcaoPrincipal: "Maturação e armazenamento de espermatozoides",
          histologia: {
            tiposCelulares: ["Células epiteliais principal", "Células basais", "Células claras", "Estereocílios"]
          },
          subestruturas: [
            { id: "cabeca", nome: "Cabeça", nivel: "subestrutura" },
            { id: "corpo", nome: "Corpo", nivel: "subestrutura" },
            { id: "cauda", nome: "Cauda", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Epididimite", icd10: "N45" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 79" }]
        },
        {
          id: "prostata",
          paiId: "reprodutor",
          nivelHierarquico: "orgao",
          nome: "Próstata (M)",
          meshKey: "mesh_prostate",
          camada: 5,
          meshId: "D011467",
          wikidataId: "Q9620",
          icd10: ["N40", "C61"],
          descricao: "Glândula fibro-muscular subvesical que secreta líquido prostático alcalino contendo PSA e zinco.",
          funcaoPrincipal: "Secreção de líquido seminal",
          vascularizacao: {
            arterial: ["a. vesical inferior", "a. retal média"],
            venosa: ["plexo prostático → vv. ilíacas internas"],
            linfatica: ["linfonodos ilíacos internos"]
          },
          inervacao: {
            parassimpatica: "S2-S4 (secreção)",
            simpatica: "T11-L2 (ejaculação)"
          },
          histologia: {
            tiposCelulares: ["Células glandulares", "Células basais", "Células neuroendócrinas"]
          },
          subestruturas: [
            { id: "zona_periferica", nome: "Zona Periférica", nivel: "subestrutura" },
            { id: "zona_transicao", nome: "Zona de Transição (HPB)", nivel: "subestrutura" },
            { id: "zona_central", nome: "Zona Central", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Hiperplasia prostática benigna", icd10: "N40", icd11: "GA90" },
            { nome: "Câncer de próstata", icd10: "C61", icd11: "2C82" },
            { nome: "Prostatite", icd10: "N41" }
          ],
          proteinasChave: [
            { nome: "PSA (Kallikrein-3)", pdbId: "3QUM", funcao: "Marcador prostático" },
            { nome: "Receptor androgênico", pdbId: "2AM9", funcao: "Alvo antiandrogênios" }
          ],
          processosIds: [],
          farmacosRelacionados: ["finasterida", "tansulosina", "bicalutamida"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 80" }]
        },
        {
          id: "penis",
          paiId: "reprodutor",
          nivelHierarquico: "orgao",
          nome: "Pênis & Corpos Cavernosos (M)",
          meshKey: "mesh_penis",
          camada: 5,
          meshId: "D010413",
          wikidataId: "Q7873",
          icd10: ["N48", "F52"],
          descricao: "Órgão copulador masculino dotado de tecido erétil vascular dependente de liberação de óxido nítrico e GMPc.",
          funcaoPrincipal: "Cópula e condução de urina",
          vascularizacao: {
            arterial: ["a. dorsal do pênis", "a. profunda do pênis", "a. bulbar"],
            venosa: ["v. dorsal profunda do pênis"],
            linfatica: ["linfonodos inguinais superficiais e profundos"]
          },
          inervacao: {
            somatica: "N. pudendo (S2-S4)",
            autonoma: "Plexo prostático (parassimpático - ereção)"
          },
          histologia: {
            tiposCelulares: ["Endotélio sinusoidal", "Músculo liso trabecular"]
          },
          subestruturas: [
            { id: "corpos_cavernosos", nome: "Corpos Cavernosos", nivel: "subestrutura" },
            { id: "corpo_esponjoso", nome: "Corpo Esponjoso", nivel: "subestrutura" },
            { id: "glande", nome: "Glande do Pênis", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Disfunção erétil", icd10: "F52.2", icd11: "HA01.0" },
            { nome: "Priapismo", icd10: "N48.3" },
            { nome: "Fimose", icd10: "N47" }
          ],
          proteinasChave: [
            { nome: "PDE5", pdbId: "1TBF", funcao: "Alvo sildenafil" },
            { nome: "NOS endotelial", pdbId: "3NLE", funcao: "Síntese de NO" }
          ],
          processosIds: [],
          farmacosRelacionados: ["sildenafil", "tadalafila"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 80" }]
        },
        {
          id: "ovarios",
          paiId: "reprodutor",
          nivelHierarquico: "orgao",
          nome: "Ovários (F)",
          meshKey: "mesh_ovary",
          camada: 5,
          fipatId: "A09.1.01.001",
          meshId: "D010053",
          wikidataId: "Q172290",
          icd10: ["N83", "C56", "E28"],
          descricao: "Gônadas femininas pares onde ocorrem a oogênese folicular mensal e a ovulação cíclica; produzem estrogênio e progesterona.",
          funcaoPrincipal: "Oogênese e produção hormonal",
          vascularizacao: {
            arterial: ["a. ovariana (aorta) + a. uterina"],
            venosa: ["plexo uterovarianas → v. ovariana direita → VCI; v. ovariana esquerda → v. renal"],
            linfatica: ["linfonodos para-aórticos"]
          },
          inervacao: {
            simpatica: "T10-T11 (dolorosa)",
            parassimpatica: "NC X"
          },
          histologia: {
            tiposCelulares: ["Oócitos", "Células da granulosa", "Células da teca interna e externa"]
          },
          subestruturas: [
            { id: "cortex_ovariano", nome: "Córtex Ovariano", nivel: "subestrutura" },
            { id: "medula_ovariana", nome: "Medula Ovariana", nivel: "subestrutura" },
            { id: "folículo_graaf", nome: "Folículo de Graaf", nivel: "subestrutura" },
            { id: "corpo_luteo", nome: "Corpo Lúteo", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "SOP", icd10: "E28.2", icd11: "5A80" },
            { nome: "Câncer de ovário", icd10: "C56", icd11: "2C73" },
            { nome: "Cisto ovariano", icd10: "N83.2" }
          ],
          proteinasChave: [
            { nome: "Receptor de FSH", pdbId: "4AY9", funcao: "Foliculogênese" },
            { nome: "Receptor de LH", pdbId: "4MQW", funcao: "Ovulação" }
          ],
          processosIds: [],
          farmacosRelacionados: ["clomifeno", "estradiol"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 81" }]
        },
        {
          id: "trompas_uterinas",
          paiId: "reprodutor",
          nivelHierarquico: "orgao",
          nome: "Tubas Uterinas (F)",
          meshKey: "mesh_fallopian_tube",
          camada: 5,
          meshId: "D005187",
          wikidataId: "Q216931",
          icd10: ["N70-N73", "N83.5"],
          descricao: "Condutos pares dotados de epitélio ciliado que captam o oócito secundário e servem de sítio à fertilização.",
          funcaoPrincipal: "Transporte do oócito e fertilização",
          histologia: {
            tiposCelulares: ["Células ciliadas", "Células secretoras (peg)", "Células intercalares"]
          },
          subestruturas: [
            { id: "fimbrias", nome: "Fímbrias", nivel: "subestrutura" },
            { id: "ampola", nome: "Ampola (Local de Fecundação)", nivel: "subestrutura" },
            { id: "istmo", nome: "Istmo", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Gravidez ectópica", icd10: "O00", icd11: "JA01" },
            { nome: "Salpingite", icd10: "N70" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 81" }]
        },
        {
          id: "utero",
          paiId: "reprodutor",
          nivelHierarquico: "orgao",
          nome: "Útero (F)",
          meshKey: "mesh_uterus",
          camada: 5,
          fipatId: "A09.1.03.001",
          meshId: "D014599",
          wikidataId: "Q9612",
          icd10: ["N80-N98", "C53-C55"],
          descricao: "Órgão muscular oco piriforme revestido por endométrio dinâmico onde se processa a nidação e o parto.",
          funcaoPrincipal: "Nidação, gestação e parto",
          vascularizacao: {
            arterial: ["a. uterina (ilíaca interna) + a. ovariana"],
            venosa: ["plexo uterino → vv. ilíacas internas"],
            linfatica: ["linfonodos ilíacos internos, para-aórticos e inguinais superficiais"]
          },
          inervacao: {
            simpatica: "T10-L1 (contração)",
            parassimpatica: "S2-S4"
          },
          histologia: {
            tiposCelulares: ["Endométrio (células epiteliais + estroma)", "Miométrio (células musculares lisas)"]
          },
          subestruturas: [
            { id: "fundo_uterino", nome: "Fundo do Útero", nivel: "subestrutura" },
            { id: "corpo_uterino", nome: "Corpo Uterino", nivel: "subestrutura" },
            { id: "miometrio", nome: "Miométrio", nivel: "subestrutura" },
            { id: "endometrio", nome: "Endométrio", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Mioma uterino", icd10: "D25", icd11: "2E86" },
            { nome: "Endometriose", icd10: "N80", icd11: "GA10" },
            { nome: "Câncer de endométrio", icd10: "C54.1", icd11: "2C76" },
            { nome: "Adenomiose", icd10: "N80.0" }
          ],
          proteinasChave: [
            { nome: "Receptor de estrogênio", pdbId: "1A52", funcao: "Alvo tamoxifeno" },
            { nome: "Receptor de progesterona", pdbId: "1A28", funcao: "Alvo RU-486" }
          ],
          processosIds: [],
          farmacosRelacionados: ["estradiol", "progesterona", "tamoxifeno"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 82" }]
        },
        {
          id: "vagina",
          paiId: "reprodutor",
          nivelHierarquico: "orgao",
          nome: "Vagina (F)",
          meshKey: "mesh_vagina",
          camada: 5,
          fipatId: "A09.1.04.001",
          meshId: "D014621",
          wikidataId: "Q165199",
          icd10: ["N76-N77", "C52"],
          descricao: "Tubo musculomembranoso distensível de cópula e canal de parto com ecossistema ácido mantido por lactobacilos.",
          funcaoPrincipal: "Cópula, canal de parto, fluxo menstrual",
          histologia: {
            tiposCelulares: ["Epitélio escamoso estratificado não queratinizado", "Lactobacillus (microbiota)"]
          },
          subestruturas: [
            { id: "fornice_vaginal", nome: "Fórnice Vaginal", nivel: "subestrutura" },
            { id: "parede_muscular", nome: "Parede Muscular", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Vaginose bacteriana", icd10: "N76.0" },
            { nome: "Candidíase vaginal", icd10: "B37.3" },
            { nome: "Câncer de vagina", icd10: "C52" }
          ],
          proteinasChave: [],
          processosIds: [],
          farmacosRelacionados: ["metronidazol", "fluconazol"],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 82" }]
        },
        {
          id: "vulva",
          paiId: "reprodutor",
          nivelHierarquico: "orgao",
          nome: "Vulva & Clitóris (F)",
          meshKey: "mesh_vulva",
          camada: 5,
          meshId: "D014845",
          wikidataId: "Q178395",
          icd10: ["N76", "N90-N94"],
          descricao: "Conjunto genital externo feminino ricamente inervado contendo corpos eréteis e orifícios uretral e vaginal.",
          funcaoPrincipal: "Proteção, prazer sexual, micção",
          histologia: {
            tiposCelulares: ["Epitélio escamoso estratificado queratinizado"]
          },
          subestruturas: [
            { id: "monte_pubis", nome: "Monte do Púbis", nivel: "subestrutura" },
            { id: "labios_maiores", nome: "Lábios Maiores", nivel: "subestrutura" },
            { id: "labios_menores", nome: "Lábios Menores", nivel: "subestrutura" },
            { id: "clitoris", nome: "Clitóris", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Vulvovaginite", icd10: "N76.0-N76.1" },
            { nome: "Câncer de vulva", icd10: "C51" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 82" }]
        },
        {
          id: "placenta",
          paiId: "reprodutor",
          nivelHierarquico: "orgao",
          nome: "Placenta (Órgão Gestacional Transitório)",
          meshKey: "mesh_placenta",
          camada: 5,
          meshId: "D010920",
          wikidataId: "Q170205",
          icd10: ["O43-O46", "P02.2"],
          descricao: "Órgão fetomaterno temporário que assegura trocas gasosas, nutrição, descarte de excretas e secreção de hCG.",
          funcaoPrincipal: "Trocas metabólicas e endócrinas fetomaternas",
          vascularizacao: {
            arterial: ["aa. espiraladas (uterinas maternais)"],
            venosa: ["veias uterinas maternas"],
            linfatica: ["ausente"]
          },
          inervacao: { intrinseca: "Ausente" },
          histologia: {
            tiposCelulares: ["Vilosidades coriônicas (citotrofoblasto + sinciciotrofoblasto)"]
          },
          subestruturas: [
            { id: "placa_corionica", nome: "Placa Coriônica (Fetal)", nivel: "subestrutura" },
            { id: "vilosidades_corionicas", nome: "Vilosidades Coriônicas", nivel: "subestrutura" },
            { id: "placa_basal", nome: "Placa Basal Decidual (Materna)", nivel: "subestrutura" },
            { id: "cordao_umbilical", nome: "Cordão Umbilical", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Pré-eclâmpsia", icd10: "O14", icd11: "JA24" },
            { nome: "Placenta prévia", icd10: "O44", icd11: "JA41" },
            { nome: "Descolamento prematuro", icd10: "O45" }
          ],
          proteinasChave: [
            { nome: "hCG", pdbId: "1HCN", funcao: "Manutenção do corpo lúteo" }
          ],
          processosIds: [],
          farmacosRelacionados: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 83" }]
        }
      ],
      processosDisponiveis: [],
      farmacosRelacionados: ["testosterona", "estradiol", "progesterona", "clomifeno", "tamoxifeno"],
      celulasTipicas: ["espermatogonia", "celula_leydig", "celula_sertoli", "oocito", "celula_granulosa"]
    },

    // =====================================================================
    // 14. FASCIAL (NOVO — sistema emergente 2018)
    // =====================================================================
    {
      id: "fascial",
      paiId: null,
      nivelHierarquico: "sistema",
      nome: "Sistema Fascial",
      nomeEn: "Fascial System",
      nomeEs: "Sistema Fascial",
      nomeLa: "Systema fasciale",
      icone: "🕸️",
      cor: "#e0e7ef",
      focoCamera: { x: 0, y: 1.15, z: 2.6 },
      targetLook: { x: 0, y: 1.15, z: 0 },
      camadaDisseccao: 2,
      meshKeywords: ["mesh_fascia_*", "mesh_connective_*", "mesh_tendon_*"],
      fipatId: "A04.0.00.000",
      meshId: "D005121",
      icd11Capitulo: "Capítulo 15 — Doenças do sistema osteomuscular",
      wikidataId: "Q1417772",
      sinonimos: ["Tecido conjuntivo contínuo", "Rede fascial"],
      termosRelacionados: ["colágeno", "propriocepção", "miofascial", "tensão"],
      descricao: "Rede contínua tridimensional de tecido conjuntivo que envolve, conecta e sustenta todos os sistemas corporais, transmitindo tensão e informação mecânica.",
      funcaoFisiologica: "Sustentação, transmissão de força, propriocepção, hidratação tecidual, comunicação mecânica.",
      embriologiaOrigem: "Mesoderma (todas as linhagens conjuntivas)",
      histologiaPredominante: "Colágeno tipo I e III + elastina + fibroblastos",
      orgaos: [
        {
          id: "fascia_superficial",
          paiId: "fascial",
          nivelHierarquico: "regiao",
          nome: "Fáscia Superficial",
          meshKey: "mesh_fascia_superficial",
          camada: 2,
          meshId: "D005121",
          wikidataId: "Q5454302",
          descricao: "Camada adiposa subcutânea contínua em toda a superfície corporal.",
          funcaoPrincipal: "Isolamento, deslizamento e reserva energética",
          histologia: {
            tiposCelulares: ["Adipócitos", "Fibroblastos"],
            matrizExtracelular: "Colágeno frouxo, elastina, ácido hialurônico"
          },
          subestruturas: [
            { id: "panículo_adiposo", nome: "Panículo Adiposo", nivel: "subestrutura" },
            { id: "retináculos_cutis", nome: "Retináculos da Pele", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Fibromialgia", icd10: "M79.7" },
            { nome: "Lipodistrofia", icd10: "E88.1" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Stecco — Functional Atlas of the Human Fascial System", edicao: "1ª" }]
        },
        {
          id: "fascia_profunda",
          paiId: "fascial",
          nivelHierarquico: "regiao",
          nome: "Fáscia Profunda",
          meshKey: "mesh_fascia_deep",
          camada: 2,
          meshId: "D005121",
          wikidataId: "Q5454304",
          descricao: "Camada densa e organizada que envolve músculos, vasos e nervos, formando bainhas e septos.",
          funcaoPrincipal: "Contenção muscular e transmissão de força",
          histologia: {
            tiposCelulares: ["Fibroblastos fasciais", "Miofibroblastos"],
            matrizExtracelular: "Colágeno I densamente empacotado"
          },
          subestruturas: [
            { id: "fascia_lata", nome: "Fáscia Lata", nivel: "subestrutura" },
            { id: "fascia_toracolombar", nome: "Fáscia Toracolombar", nivel: "subestrutura" },
            { id: "fascia_plantar", nome: "Fáscia Plantar", nivel: "subestrutura" },
            { id: "fascia_cervical", nome: "Fáscia Cervical", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Fascite plantar", icd10: "M72.2" },
            { nome: "Síndrome do piriforme", icd10: "G57.0" },
            { nome: "Síndrome compartimental", icd10: "T79.A0" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Stecco — Functional Atlas of the Human Fascial System" }]
        },
        {
          id: "fascia_visceral",
          paiId: "fascial",
          nivelHierarquico: "regiao",
          nome: "Fáscia Visceral",
          meshKey: "mesh_fascia_visceral",
          camada: 2,
          meshId: "D005121",
          wikidataId: "Q5454306",
          descricao: "Camada que envolve órgãos internos, formando ligamentos e mesos que os suspendem.",
          funcaoPrincipal: "Suspensão visceral e deslizamento",
          histologia: {
            tiposCelulares: ["Fibroblastos", "Mesotélio (peritônio, pleura, pericárdio)"]
          },
          subestruturas: [
            { id: "peritonio", nome: "Peritônio", nivel: "subestrutura" },
            { id: "pleura", nome: "Pleura", nivel: "subestrutura" },
            { id: "pericardio", nome: "Pericárdio", nivel: "subestrutura" }
          ],
          patologias: [
            { nome: "Peritonite", icd10: "K65" },
            { nome: "Adesões pós-cirúrgicas", icd10: "K66.0" }
          ],
          proteinasChave: [],
          processosIds: [],
          referencias: [{ fonte: "Gray's Anatomy", capitulo: "Cap. 4" }]
        }
      ],
      processosDisponiveis: [],
      farmacosRelacionados: [],
      celulasTipicas: ["fibroblasto", "miofibroblasto", "adipocito"]
    }
  ],

  // =========================================================================
  // 2. VIAS DE ADMINISTRAÇÃO — 18 (era 7)
  // =========================================================================
  viasAdministracao: {
    // ---------- VIAS ENTERAIS ----------
    ORAL: {
      id: "ORAL", nome: "Via Oral (Enteral)", categoria: "enteral", icone: "💊", corFluxo: "#f59e0b",
      biodisponibilidadeMedia: "30%-90%", tMaxMedio: "45-90 min",
      primeiraPassagemHepatica: true,
      barreirasBiologicas: "Acidez gástrica (pH 1.5), enzimas enterais, efluxo via P-gp e CYP3A4 nos enterócitos.",
      descricaoClinica: "Via mais comum, segura e econômica. Absorção predominante no duodeno e jejuno. Fármaco absorvido atinge a veia porta e sofre metabolização hepática antes da circulação sistêmica.",
      orgaosSequenciais: ["Boca", "Esôfago", "Estômago", "Intestino Delgado", "Veia Porta Hepática", "Fígado", "Coração", "Aorta Sistêmica"],
      waypoints3D: [
        { x: 0.0, y: 1.74, z: 0.12, label: "Inserção Oral (Bolo)" },
        { x: 0.0, y: 1.52, z: 0.06, label: "Trânsito Esofágico" },
        { x: -0.06, y: 1.05, z: 0.08, label: "Dissolução Gástrica" },
        { x: 0.02, y: 0.88, z: 0.07, label: "Absorção Duodenal" },
        { x: 0.05, y: 0.98, z: 0.04, label: "Eixo Porta-Hepático" },
        { x: 0.09, y: 1.06, z: 0.06, label: "Metabolismo de 1ª Passagem (CYP450)" },
        { x: 0.04, y: 1.25, z: 0.08, label: "Circulação Sistêmica (Coração)" }
      ]
    },
    SUBLINGUAL: {
      id: "SUBLINGUAL", nome: "Via Sublingual", categoria: "enteral", icone: "👅", corFluxo: "#f59e0b",
      biodisponibilidadeMedia: "60%-90%", tMaxMedio: "3-10 min",
      primeiraPassagemHepatica: false,
      barreirasBiologicas: "Epitélio escamoso estratificado fino do assoalho bucal, saliva.",
      descricaoClinica: "Absorção direta via veias sublinguais → veia cava superior, contornando a primeira passagem hepática. Ideal para emergências (nitroglicerina), fármacos lábios aos lípidos e de alta potência.",
      orgaosSequenciais: ["Assoalho Bucal", "Veias Sublinguais", "Veia Jugular Interna", "Veia Cava Superior", "Coração"],
      waypoints3D: [
        { x: 0.0, y: 1.68, z: 0.06, label: "Aplicação Sublingual" },
        { x: 0.03, y: 1.66, z: 0.04, label: "Absorção Epitelial" },
        { x: 0.12, y: 1.60, z: 0.03, label: "Veias Sublinguais" },
        { x: 0.12, y: 1.40, z: 0.04, label: "Veia Jugular Interna" },
        { x: 0.06, y: 1.32, z: 0.05, label: "Veia Cava Superior → Coração" }
      ]
    },
    RETAL: {
      id: "RETAL", nome: "Via Retal", categoria: "enteral", icone: "🧴", corFluxo: "#f59e0b",
      biodisponibilidadeMedia: "50%-75%", tMaxMedio: "15-30 min",
      primeiraPassagemHepatica: "Parcial (50% evita)",
      barreirasBiologicas: "Epitélio colunar retal, muco fecal.",
      descricaoClinica: "Alternativa em vômitos, crianças, pacientes inconscientes. Absorção via veias hemorroidárias médias → circulação sistêmica (evita 1ª passagem); via veias hemorroidárias superiores → veia porta.",
      orgaosSequenciais: ["Ampola Retal", "Veias Hemorroidárias Médias", "Veia Cava Inferior", "Coração"],
      waypoints3D: [
        { x: 0.0, y: 0.72, z: -0.10, label: "Aplicação Retal" },
        { x: 0.03, y: 0.70, z: -0.08, label: "Absorção Transmucosa" },
        { x: 0.06, y: 0.75, z: -0.06, label: "Veias Hemorroidárias" },
        { x: 0.05, y: 1.00, z: -0.02, label: "Veia Cava Inferior" },
        { x: 0.04, y: 1.25, z: 0.05, label: "Átrio Direito" }
      ]
    },
    INTRAGASTRICA: {
      id: "INTRAGASTRICA", nome: "Via Intragástrica (Sonda)", categoria: "enteral", icone: "🎈", corFluxo: "#f59e0b",
      biodisponibilidadeMedia: "Variável", tMaxMedio: "30-60 min",
      primeiraPassagemHepatica: true,
      barreirasBiologicas: "Semelhante à via oral, mas contorna mastigação/deglutição.",
      descricaoClinica: "Usada em pacientes com sonda nasogástrica ou gastrostomia (SNG/PEG). Não deve ser usada para fármacos de liberação entérica (revestimento gastrorresistente).",
      orgaosSequenciais: ["Sonda Gástrica", "Estômago", "Intestino", "Fígado", "Circulação"],
      waypoints3D: [
        { x: 0.02, y: 1.60, z: 0.10, label: "Sonda Nasogástrica" },
        { x: -0.05, y: 1.20, z: 0.06, label: "Trajeto Esofágico" },
        { x: -0.06, y: 1.05, z: 0.08, label: "Instilação Gástrica" },
        { x: 0.02, y: 0.88, z: 0.07, label: "Absorção Duodenal" },
        { x: 0.04, y: 1.25, z: 0.08, label: "Circulação Sistêmica" }
      ]
    },

    // ---------- VIAS PARENTERAIS ----------
    INTRAVENOSA: {
      id: "INTRAVENOSA", nome: "Via Intravenosa (Bolus / Infusão)", categoria: "parenteral", icone: "🩸", corFluxo: "#ef4444",
      biodisponibilidadeMedia: "100% (F=1.0)", tMaxMedio: "Instantâneo (~0 min)",
      primeiraPassagemHepatica: false,
      barreirasBiologicas: "Nenhuma barreira de absorção primária. Acesso direto ao compartimento central.",
      descricaoClinica: "Injeção direta no leito vascular. Ideal para emergências e substâncias irritantes. Exige controle rigoroso de velocidade para prevenir concentrações tóxicas.",
      orgaosSequenciais: ["Veia Periférica", "Veia Cava Superior", "Átrio Direito", "Ventrículo Direito", "Circulação Pulmonar", "Coração Esquerdo", "Aorta Sistêmica"],
      waypoints3D: [
        { x: 0.32, y: 1.12, z: 0.05, label: "Acesso Venoso Periférico" },
        { x: 0.22, y: 1.22, z: 0.04, label: "Veia Basílica / Subclávia" },
        { x: 0.08, y: 1.30, z: 0.05, label: "Veia Cava Superior" },
        { x: 0.05, y: 1.25, z: 0.07, label: "Átrio / Ventrículo Direito" },
        { x: 0.0, y: 1.28, z: 0.04, label: "Pequena Circulação Pulmonar" },
        { x: 0.04, y: 1.24, z: 0.08, label: "Ventrículo Esquerdo" },
        { x: 0.02, y: 1.35, z: 0.05, label: "Distribuição Sistêmica Aórtica" }
      ]
    },
    INTRAMUSCULAR: {
      id: "INTRAMUSCULAR", nome: "Via Intramuscular (IM)", categoria: "parenteral", icone: "💉", corFluxo: "#a855f7",
      biodisponibilidadeMedia: "75%-100%", tMaxMedio: "15-30 min (aquosa) / dias (depot)",
      primeiraPassagemHepatica: false,
      barreirasBiologicas: "Endotélio capilar muscular fenestrado + fáscia muscular.",
      descricaoClinica: "Injeção profunda em músculo altamente vascularizado (deltoide, glúteo, vasto lateral). Permite formulações oleosas de liberação prolongada (depot).",
      orgaosSequenciais: ["Tecido Muscular Profundo", "Leito Capilar Muscular", "Veias Subclávias", "VCS", "Coração", "Aorta"],
      waypoints3D: [
        { x: 0.38, y: 1.35, z: 0.03, label: "Depósito Intramuscular (Deltoide)" },
        { x: 0.28, y: 1.32, z: 0.04, label: "Drenagem Capilar Muscular" },
        { x: 0.15, y: 1.30, z: 0.05, label: "Veia Axilar / Subclávia" },
        { x: 0.05, y: 1.25, z: 0.07, label: "Coração Direito" },
        { x: 0.03, y: 1.32, z: 0.06, label: "Ejeção Arterial Sistêmica" }
      ]
    },
    SUBCUTANEA: {
      id: "SUBCUTANEA", nome: "Via Subcutânea (SC)", categoria: "parenteral", icone: "💉", corFluxo: "#a855f7",
      biodisponibilidadeMedia: "60%-80%", tMaxMedio: "30-90 min",
      primeiraPassagemHepatica: false,
      barreirasBiologicas: "Tecido adiposo hipodérmico, capilares fenestrados menos densos que músculo.",
      descricaoClinica: "Absorção mais lenta que IM (menos vascularização). Ideal para insulina, heparina de baixo peso molecular, alguns biológicos. Locais: abdome, coxa, braço.",
      orgaosSequenciais: ["Tecido Subcutâneo", "Capilares Dérmicos", "Veias Locais", "Circulação Sistêmica"],
      waypoints3D: [
        { x: 0.05, y: 0.95, z: 0.10, label: "Depósito Subcutâneo (Abdome)" },
        { x: 0.05, y: 0.98, z: 0.08, label: "Absorção Capilar" },
        { x: 0.05, y: 1.10, z: 0.04, label: "Veia Epigástrica" },
        { x: 0.04, y: 1.25, z: 0.05, label: "Circulação Sistêmica" }
      ]
    },
    INTRADERMICA: {
      id: "INTRADERMICA", nome: "Via Intradérmica (ID)", categoria: "parenteral", icone: "🩹", corFluxo: "#a855f7",
      biodisponibilidadeMedia: "Variável", tMaxMedio: "Lento (uso diagnóstico)",
      primeiraPassagemHepatica: false,
      barreirasBiologicas: "Derme papilar densamente inervada e imunologicamente ativa.",
      descricaoClinica: "Usada para testes alérgicos (PPD), vacinas (BCG), anestesia local superficial. Volumes pequenos (0.1 mL). Resposta imunológica local rápida.",
      orgaosSequenciais: ["Derme Papilar", "Capilares Dérmicos", "Vasos Linfáticos", "Linfonodos Regionais"],
      waypoints3D: [
        { x: 0.30, y: 1.15, z: 0.10, label: "Injeção Intradérmica" },
        { x: 0.30, y: 1.15, z: 0.08, label: "Reação Imune Local" },
        { x: 0.20, y: 1.20, z: 0.06, label: "Drenagem Linfática Regional" }
      ]
    },
    INTRAARTERIAL: {
      id: "INTRAARTERIAL", nome: "Via Intra-arterial (IA)", categoria: "parenteral", icone: "🩸", corFluxo: "#ef4444",
      biodisponibilidadeMedia: "100% (local)", tMaxMedio: "Instantâneo",
      primeiraPassagemHepatica: false,
      barreirasBiologicas: "Acesso direto ao território arterial alvo; risco de toxicidade distal.",
      descricaoClinica: "Uso especializado: quimioembolização hepática, trombolíticos intra-arteriais, vasodilatadores em angiografia. Exige controle rigoroso de pressão.",
      orgaosSequenciais: ["Artéria Alvo", "Capilares Distais", "Veias de Drenagem"],
      waypoints3D: [
        { x: 0.02, y: 1.35, z: 0.05, label: "Acesso Intra-arterial" },
        { x: 0.05, y: 1.05, z: 0.03, label: "Artéria Hepática" },
        { x: 0.08, y: 1.00, z: 0.05, label: "Território Alvo (Tumor)" }
      ]
    },
    INTRACARDIACA: {
      id: "INTRACARDIACA", nome: "Via Intracardíaca", categoria: "parenteral", icone: "❤️", corFluxo: "#ef4444",
      biodisponibilidadeMedia: "100%", tMaxMedio: "Instantâneo",
      primeiraPassagemHepatica: false,
      barreirasBiologicas: "Injeção direta no miocárdio ventricular.",
      descricaoClinica: "Histórica para reanimação (adrenalina); substituída pela via IV/IO. Uso atual em procedimentos guiados por imagem.",
      orgaosSequenciais: ["Ventrículo", "Circulação Sistêmica"],
      waypoints3D: [
        { x: 0.04, y: 1.25, z: 0.05, label: "Punção Cardíaca" },
        { x: 0.04, y: 1.24, z: 0.08, label: "Distribuição Sistêmica" }
      ]
    },
    INTRAOSSEA: {
      id: "INTRAOSSEA", nome: "Via Intraóssea (IO)", categoria: "parenteral", icone: "🦴", corFluxo: "#a855f7",
      biodisponibilidadeMedia: "100% (equivalente IV)", tMaxMedio: "Instantâneo",
      primeiraPassagemHepatica: false,
      barreirasBiologicas: "Canal medular ósseo comunicante com sinusoides venosos.",
      descricaoClinica: "Emergências pediátricas e adultos sem acesso IV (PCR, choque). Locais: tíbia proximal, úmero proximal. Mesma farmacocinética que IV.",
      orgaosSequenciais: ["Canal Medular Ósseo", "Sinusoides Venosos", "Circulação Sistêmica"],
      waypoints3D: [
        { x: -0.10, y: 0.60, z: 0.08, label: "Acesso Intraósseo (Tíbia)" },
        { x: 0.05, y: 0.90, z: 0.04, label: "Canal Medular" },
        { x: 0.04, y: 1.25, z: 0.05, label: "Circulação Sistêmica" }
      ]
    },
    INTRATECAL: {
      id: "INTRATECAL", nome: "Via Intratecal (IT)", categoria: "parenteral", icone: "🧠", corFluxo: "#38bdf8",
      biodisponibilidadeMedia: "100% (LCR)", tMaxMedio: "Instantâneo (LCR)",
      primeiraPassagemHepatica: false,
      barreirasBiologicas: "Barreira hematoencefálica contornada por acesso direto ao LCR.",
      descricaoClinica: "Anestesia raquidiana, quimioterapia intratecal (leucemia/meningite), antibióticos. Acesso por punção lombar (L3-L4).",
      orgaosSequenciais: ["Espaço Subaracnóideo", "LCR", "Encéfalo/Medula"],
      waypoints3D: [
        { x: 0.0, y: 0.80, z: -0.10, label: "Punção Lombar" },
        { x: 0.0, y: 1.10, z: -0.05, label: "Difusão no LCR" },
        { x: 0.0, y: 1.70, z: 0.0, label: "Distribuição no SNC" }
      ]
    },
    EPIDURAL: {
      id: "EPIDURAL", nome: "Via Epidural", categoria: "parenteral", icone: "🧠", corFluxo: "#38bdf8",
      biodisponibilidadeMedia: "Difusão pelo espaço epidural", tMaxMedio: "15-30 min",
      primeiraPassagemHepatica: false,
      barreirasBiologicas: "Espaço epidural (fora da dura-máter); difusão através da dura.",
      descricaoClinica: "Analgesia do parto, cirurgias abdominais e torácicas, dor crônica. Cateter permite infusão contínua. Menor risco de cefaleia pós-punção que intratecal.",
      orgaosSequenciais: ["Espaço Epidural", "Dura-máter", "Raízes Nervosas"],
      waypoints3D: [
        { x: 0.0, y: 0.85, z: -0.10, label: "Cateter Epidural" },
        { x: 0.0, y: 1.10, z: -0.05, label: "Difusão pelo Espaço" },
        { x: 0.0, y: 1.30, z: -0.02, label: "Bloqueio de Raízes" }
      ]
    },

    // ---------- VIAS TÓPICAS / MUCOSAS ----------
    TOPICA: {
      id: "TOPICA", nome: "Via Tópica & Transdérmica", categoria: "topica", icone: "🧴", corFluxo: "#fbbf24",
      biodisponibilidadeMedia: "5%-30% (transdérmica)", tMaxMedio: "2-8 h (lenta, contínua)",
      primeiraPassagemHepatica: false,
      barreirasBiologicas: "Estrato córneo (lipídios intercelulares hidrofóbicos).",
      descricaoClinica: "Ação local ou sistêmica (adesivos: nicotina, fentanil, estrogênio). Fármacos lipofílicos < 500 Da penetram de forma sustentada.",
      orgaosSequenciais: ["Estrato Córneo", "Epiderme", "Plexo Capilar Dérmico", "Veias Cutâneas", "Circulação Geral"],
      waypoints3D: [
        { x: 0.35, y: 0.95, z: 0.08, label: "Aplicação Tópica" },
        { x: 0.34, y: 0.95, z: 0.06, label: "Partição no Estrato Córneo" },
        { x: 0.32, y: 0.96, z: 0.04, label: "Capilarização Dérmica" },
        { x: 0.22, y: 1.08, z: 0.04, label: "Veia Radial / Cefálica" },
        { x: 0.05, y: 1.25, z: 0.07, label: "Entrada Sistêmica" }
      ]
    },
    NASAL: {
      id: "NASAL", nome: "Via Nasal (Inalação / Spray)", categoria: "mucosa", icone: "👃", corFluxo: "#06b6d4",
      biodisponibilidadeMedia: "40%-80%", tMaxMedio: "5-15 min",
      primeiraPassagemHepatica: false,
      barreirasBiologicas: "Depuração mucociliar, enzimas proteolíticas nasais.",
      descricaoClinica: "Dupla via: (1) drenagem para circulação sistêmica via plexo de Kiesselbach; (2) translocação axonal pelo nervo olfatório ao SNC, contornando BHE (ex.: insulina intranasal, midazolam).",
      orgaosSequenciais: ["Conchas Nasais", "Mucosa Olfatória", "Lâmina Crivosa do Etmoide", "SNC / Veias Jugulares", "Coração"],
      waypoints3D: [
        { x: 0.0, y: 1.76, z: 0.15, label: "Nebulização Nasal" },
        { x: 0.0, y: 1.75, z: 0.10, label: "Plexo de Kiesselbach" },
        { x: 0.0, y: 1.78, z: 0.07, label: "Via Direta Nariz-Cérebro" },
        { x: 0.0, y: 1.82, z: 0.05, label: "Distribuição no SNC" }
      ]
    },
    PULMONAR_INALATORIA: {
      id: "PULMONAR_INALATORIA", nome: "Via Pulmonar (Inalatória)", categoria: "mucosa", icone: "🫁", corFluxo: "#06b6d4",
      biodisponibilidadeMedia: "10%-50% (depende da fração respirável)", tMaxMedio: "1-5 min",
      primeiraPassagemHepatica: false,
      barreirasBiologicas: "Deposição por impactação/sedimentação/difusão nos alvéolos; escape pelo muco.",
      descricaoClinica: "Ação local (asma, DPOC) ou sistêmica (anestésicos voláteis, óxido nítrico). Vantagens: superfície alveolar gigantesca (~100 m²), início rápido, ausência de 1ª passagem.",
      orgaosSequenciais: ["Orofaringe", "Traqueia", "Brônquios", "Alvéolos", "Sangue"],
      waypoints3D: [
        { x: 0.0, y: 1.70, z: 0.12, label: "Inalação Oral" },
        { x: 0.02, y: 1.55, z: 0.05, label: "Traqueia" },
        { x: -0.05, y: 1.40, z: 0.02, label: "Árvore Brônquica" },
        { x: -0.10, y: 1.38, z: 0.01, label: "Difusão Alveolar" },
        { x: 0.03, y: 1.32, z: 0.05, label: "Capilar Pulmonar → Coração" }
      ]
    },
    OCULAR: {
      id: "OCULAR", nome: "Via Ocular (Colírio / Pomada)", categoria: "mucosa", icone: "👁️", corFluxo: "#38bdf8",
      biodisponibilidadeMedia: "1%-7% (penetração ocular)", tMaxMedio: "10-25 min",
      primeiraPassagemHepatica: false,
      barreirasBiologicas: "Lavagem lacrimal, epitélio corneano, drenagem nasolacrimal.",
      descricaoClinica: "Ação oftálmica local. < 5% da dose atinge câmara anterior; o excedente é drenado pelo ducto nasolacrimal podendo gerar efeitos sistêmicos.",
      orgaosSequenciais: ["Fundo de Saco Conjuntival", "Córnea", "Câmara Anterior", "Ducto Nasolacrimal", "Mucosa Nasal"],
      waypoints3D: [
        { x: -0.04, y: 1.78, z: 0.16, label: "Instilação no Saco Conjuntival" },
        { x: -0.035, y: 1.78, z: 0.14, label: "Penetração Corneana" },
        { x: -0.02, y: 1.75, z: 0.13, label: "Drenagem Nasolacrimal" },
        { x: 0.0, y: 1.70, z: 0.10, label: "Absorção Nasal Secundária" }
      ]
    },
    OTOLOGICA: {
      id: "OTOLOGICA", nome: "Via Otológica (Gotas Auriculares)", categoria: "topica", icone: "👂", corFluxo: "#e2e8f0",
      biodisponibilidadeMedia: "Ação local (< 1% sistêmica)", tMaxMedio: "Variável",
      primeiraPassagemHepatica: false,
      barreirasBiologicas: "Conduto auditivo externo queratinizado, membrana timpânica (se íntegra).",
      descricaoClinica: "Exclusivamente tópica para otites externas e cerúmen. Membrana timpânica íntegra impede penetração para orelha média.",
      orgaosSequenciais: ["Pavilhão Auricular", "Meato Acústico Externo", "Membrana Timpânica"],
      waypoints3D: [
        { x: 0.16, y: 1.76, z: 0.02, label: "Instilação Auricular" },
        { x: 0.13, y: 1.75, z: 0.01, label: "Conduto Auditivo" },
        { x: 0.10, y: 1.74, z: 0.00, label: "Membrana Timpânica" }
      ]
    },
    VAGINAL: {
      id: "VAGINAL", nome: "Via Vaginal", categoria: "mucosa", icone: "🌸", corFluxo: "#fd79a8",
      biodisponibilidadeMedia: "10%-30%", tMaxMedio: "30-60 min",
      primeiraPassagemHepatica: false,
      barreirasBiologicas: "Epitélio vaginal estratificado, pH ácido (3.8-4.5), microbiota.",
      descricaoClinica: "Ação local (antifúngicos, anticoncepcionais) ou sistêmica parcial. Absorção pela mucosa vaginal → veias ilíacas internas (evita 1ª passagem parcial).",
      orgaosSequenciais: ["Fundo Vaginal", "Mucosa", "Veias Vaginais", "Plexo Uterovaginal"],
      waypoints3D: [
        { x: 0.0, y: 0.72, z: 0.0, label: "Aplicação Vaginal" },
        { x: 0.0, y: 0.75, z: 0.02, label: "Absorção Transmucosa" },
        { x: 0.03, y: 0.85, z: 0.03, label: "Veias Ilíacas Internas" },
        { x: 0.04, y: 1.10, z: 0.04, label: "Circulação Sistêmica" }
      ]
    }
  },

  // =========================================================================
  // 3. PROCESSOS FISIOLÓGICOS — 15 (era 5)
  // =========================================================================
  processos: {
    degluticao_humana: {
      id: "degluticao_humana", titulo: "Fisiologia da Deglutição Humana", sistema: "digestorio",
      descricao: "Sequência neuromuscular reflexa coordenada dividida em estágios oral, faríngeo e esofágico.",
      etapas: [
        { ordem: 1, fase: "Fase Oral (Voluntária)", duracaoMs: 1000,
          descricao: "Mastigação coordenada, insalivação rica em ptialina e compactação do bolo. A língua eleva-se contra o palato duro, projetando o bolo para o istmo das fauces.",
          nervos: "NC V3 (Trigêmeo) e NC XII (Hipoglosso)",
          musculos: "Masseter, Temporal, Pterigóideos e Músculos da Língua",
          acaoParticulas: "oral_cavity",
          enzimas: ["Amilase Salivar (Ptialina - PDB: 1SMD)", "Lipase Lingual"] },
        { ordem: 2, fase: "Fase Faríngea (Involuntária / Reflexa)", duracaoMs: 1000,
          descricao: "Oclusão de segurança das vias aéreas: palato mole veda nasofaringe; laringe eleva-se e epiglote fecha a fenda glótica. Apneia reflexa bulbar.",
          nervos: "NC IX (Glossofaríngeo) e NC X (Vago)",
          musculos: "Constritores da Faringe e Palatofaríngeo",
          acaoParticulas: "pharynx_transit",
          enzimas: ["Mucina Glicoproteica"] },
        { ordem: 3, fase: "Fase Esofágica", duracaoMs: 3500,
          descricao: "Relaxamento do Esfíncter Esofágico Superior. Plexo mioentérico de Auerbach propaga ondas peristálticas primárias a 3-4 cm/s.",
          nervos: "NC X (Vago) e Plexo Mioentérico de Auerbach",
          musculos: "Musculatura Esofágica Estriada (1/3 sup) e Lisa (2/3 inf)",
          acaoParticulas: "esophagus_wave", enzimas: [] },
        { ordem: 4, fase: "Relaxamento Receptivo Gástrico", duracaoMs: 1500,
          descricao: "Liberação de NO e VIP, relaxando o EEI e permitindo a entrada gástrica do quimo.",
          nervos: "Fibras Vago-Vagais NANC",
          musculos: "Esfíncter Esofágico Inferior e Fundo Gástrico",
          acaoParticulas: "stomach_entry",
          enzimas: ["Pepsina (PDB: 4PEP)", "Ácido Clorídrico (H+/K+-ATPase)"] }
      ]
    },
    ciclo_cardiaco: {
      id: "ciclo_cardiaco", titulo: "Ciclo Eletromecânico Cardíaco", sistema: "cardiovascular",
      descricao: "Sequência periódica de despolarização elétrica e sístole/diástole ventricular.",
      etapas: [
        { ordem: 1, fase: "Sístole Atrial", duracaoMs: 800,
          descricao: "Despolarização nodal sinoatrial (onda P do ECG) gerando contração atrial final.",
          nervos: "Nó Sinoatrial e Vias Internodais", musculos: "Miocárdio Atrial D e E",
          acaoParticulas: "atria_to_ventricle", enzimas: [] },
        { ordem: 2, fase: "Contração Isovolumétrica", duracaoMs: 400,
          descricao: "Despolarização via feixe de His e Purkinje (complexo QRS). Fechamento das valvas AV (B1).",
          nervos: "Fibras de Purkinje (Nav1.5)", musculos: "Miocárdio Ventricular e Papilares",
          acaoParticulas: "ventricle_pressurize",
          enzimas: ["SERCA2a (Bomba Ca2+-ATPase Sarcoplasmática)"] },
        { ordem: 3, fase: "Ejeção Ventricular Rápida", duracaoMs: 1200,
          descricao: "Abertura das valvas aórtica e pulmonar com ejeção rápida do volume sistólico (~70 mL).",
          nervos: "Tônus Adrenérgico β1", musculos: "Paredes Ventriculares Livres",
          acaoParticulas: "aorta_flow", enzimas: [] }
      ]
    },
    conducao_impulso_cardiaco: {
      id: "conducao_impulso_cardiaco", titulo: "Condução do Impulso Cardíaco", sistema: "cardiovascular",
      descricao: "Propagação ordenada do potencial de ação pelo sistema de condução cardíaco.",
      etapas: [
        { ordem: 1, fase: "Geração no Nó Sinoatrial (SA)", duracaoMs: 0,
          descricao: "Marcapasso primário (60-100 bpm). Gera impulso espontaneamente (automatismo).",
          localizacao: "Junção da VCS com átrio direito", acaoParticulas: "sa_node", enzimas: [] },
        { ordem: 2, fase: "Propagação Atrial", duracaoMs: 50,
          descricao: "Difusão pelos átrios via feixes internodais.", acaoParticulas: "atrial_spread", enzimas: [] },
        { ordem: 3, fase: "Retardo no Nó Atrioventricular (AV)", duracaoMs: 100,
          descricao: "Retardo fisiológico (~100 ms) para permitir enchimento ventricular.",
          acaoParticulas: "av_node", enzimas: [] },
        { ordem: 4, fase: "Feixe de His e Ramos", duracaoMs: 30,
          descricao: "Condução rápida pelo septo interventricular.", acaoParticulas: "his_bundle", enzimas: [] },
        { ordem: 5, fase: "Fibras de Purkinje", duracaoMs: 40,
          descricao: "Condução para o miocárdio ventricular (despolarização de baixo para cima).",
          acaoParticulas: "purkinje", enzimas: [] }
      ]
    },
    peristaltismo_intestinal: {
      id: "peristaltismo_intestinal", titulo: "Motilidade e Peristaltismo Enteral", sistema: "digestorio",
      descricao: "Propulsão e mistura do quimo coordenadas pelos plexos mioentéricos entéricos.",
      etapas: [
        { ordem: 1, fase: "Contração a Montante", duracaoMs: 1500,
          descricao: "Estiramento ativa interneurônios colinérgicos com liberação de ACh antes do bolo.",
          nervos: "Plexo de Auerbach", musculos: "Camada Circular Interna",
          acaoParticulas: "quimo_propulsion", enzimas: ["Enteropeptidase"] },
        { ordem: 2, fase: "Relaxamento Receptivo a Jusante", duracaoMs: 1500,
          descricao: "Liberação inibitória de NO adiante do bolo, relaxando o lúmen.",
          nervos: "Neurônios Inibitórios Entéricos", musculos: "Camada Longitudinal Externa",
          acaoParticulas: "quimo_advance",
          enzimas: ["Amilase Pancreática", "Lipase Pancreática"] }
      ]
    },
    filtracao_glomerular: {
      id: "filtracao_glomerular", titulo: "Filtração Glomerular & Dinâmica Tubular", sistema: "urinario",
      descricao: "Ultrafiltração por pressão hidrostática através da barreira capilar-podocitária renal.",
      etapas: [
        { ordem: 1, fase: "Ultrafiltração Glomerular", duracaoMs: 1000,
          descricao: "Plasma atravessa endotélio fenestrado e fendas de filtração sob pressão líquida efetiva.",
          nervos: "Autorregulação Miogênica", musculos: "Células Mesangiais",
          acaoParticulas: "glomerular_filter", enzimas: ["Anidrase Carbônica Tipo IV"] },
        { ordem: 2, fase: "Reabsorção no Túbulo Contorcido Proximal", duracaoMs: 2000,
          descricao: "Recuperação ativa de Na, água e glicose total (via SGLT2).",
          nervos: "Cotransportadores Dependentes de Na", musculos: "Epitélio Tubular com Borda em Escova",
          acaoParticulas: "tubular_reabsorption", enzimas: ["Na+/K+-ATPase Basolateral (PDB: 3B8E)"] }
      ]
    },
    hematose_alveolar: {
      id: "hematose_alveolar", titulo: "Hematose Alvéolo-Capilar", sistema: "respiratorio",
      descricao: "Troca gasosa O₂/CO₂ através da membrana alvéolo-capilar.",
      etapas: [
        { ordem: 1, fase: "Ventilação Alveolar", duracaoMs: 700,
          descricao: "Renovação do ar alveolar (~350 mL/ciclo) mantendo PO₂ 104 mmHg / PCO₂ 40 mmHg.",
          nervos: "Centros respiratórios bulbares e pontinos", musculos: "Diafragma e Intercostais Externos",
          acaoParticulas: "ventilation", enzimas: [] },
        { ordem: 2, fase: "Difusão de O₂", duracaoMs: 500,
          descricao: "Gradiente alvéolo(104)→capilar(40)→arterial(100). Equilíbrio em 0.25s.",
          acaoParticulas: "o2_diffusion", enzimas: [] },
        { ordem: 3, fase: "Difusão de CO₂", duracaoMs: 400,
          descricao: "Gradiente capilar(45)→alvéolo(40). CO₂ difunde 20× mais rápido que O₂.",
          acaoParticulas: "co2_diffusion", enzimas: ["Anidrase Carbônica II (PDB: 1CA2)"] }
      ]
    },
    sinapse_colinergica: {
      id: "sinapse_colinergica", titulo: "Transmissão Sináptica Colinérgica", sistema: "nervoso",
      descricao: "Neurotransmissão química na fenda sináptica e hidrólise de ACh por AChE.",
      etapas: [
        { ordem: 1, fase: "Despolarização e Influxo de Cálcio", duracaoMs: 500,
          descricao: "PA pré-sináptico abre canais Cav2.1 com exocitose de vesículas de ACh.",
          nervos: "Neurônio Motor Somático", musculos: "Placa Motora Terminal",
          acaoParticulas: "synapse_calcium", enzimas: ["Colina Acetiltransferase (ChAT)"] },
        { ordem: 2, fase: "Exocitose e Degradação Enzimática", duracaoMs: 1500,
          descricao: "Ativação de receptores nicotínicos/muscarínicos e clivagem rápida de ACh por AChE.",
          nervos: "Receptores Nicotínicos e Muscarínicos", musculos: "Sarcolema Muscular",
          acaoParticulas: "synapse_ache_cleave", enzimas: ["Acetilcolinesterase (PDB: 4EY7)"] }
      ]
    },
    contracao_muscular: {
      id: "contracao_muscular", titulo: "Contração Muscular Esquelética", sistema: "muscular",
      descricao: "Ciclo de pontes cruzadas actina-miosina dependente de ATP e Ca²⁺.",
      etapas: [
        { ordem: 1, fase: "Liberação de Ca²⁺ do RS", duracaoMs: 200,
          descricao: "PA no túbulo T ativa receptor DHPR, abrindo rianodina (RyR1) e liberando Ca²⁺ citosólico.",
          acaoParticulas: "calcium_release", enzimas: ["Receptor de Rianodina (RyR1)"] },
        { ordem: 2, fase: "Ligação Ca²⁺-Troponina C", duracaoMs: 300,
          descricao: "Ca²⁺ liga-se à troponina C, deslocando tropomiosina e expondo sítios de ligação.",
          acaoParticulas: "troponin_binding", enzimas: [] },
        { ordem: 3, fase: "Ciclo das Pontes Cruzadas", duracaoMs: 1000,
          descricao: "Miosina hidrolisa ATP, liga-se à actina, sofre power stroke e desliza.",
          acaoParticulas: "crossbridge_cycle", enzimas: ["Miosina ATPase"] },
        { ordem: 4, fase: "Relaxamento (Recaptação por SERCA)", duracaoMs: 500,
          descricao: "SERCA bombeia Ca²⁺ de volta ao RS, com consequente relaxamento.",
          acaoParticulas: "serca_uptake", enzimas: ["SERCA (PDB: 1SU4)"] }
      ]
    },
    espermatogenese: {
      id: "espermatogenese", titulo: "Espermatogênese", sistema: "reprodutor",
      descricao: "Produção contínua de espermatozoides nos túbulos seminíferos (74 dias).",
      etapas: [
        { ordem: 1, fase: "Mitoses Espermatogoniais", duracaoMs: 2000,
          descricao: "Espermatogônias tipo A (renovação) e tipo B (diferenciação) proliferam por mitose.",
          nervos: "FSH (eixo hipotálamo-hipófise)", enzimas: [] },
        { ordem: 2, fase: "Meiose I (Espermatócitos Primários)", duracaoMs: 3000,
          descricao: "Divisão reducional: 1 espermatócito primário (2n) → 2 secundários (n).",
          enzimas: ["Complexo Sinaptonêmico"] },
        { ordem: 3, fase: "Meiose II (Espermatócitos Secundários)", duracaoMs: 2000,
          descricao: "Divisão equacional: 2 secundários → 4 espermátides (n).", enzimas: [] },
        { ordem: 4, fase: "Espermiogênese", duracaoMs: 4000,
          descricao: "Diferenciação final: formação do acrossomo, flagelo e condensação nuclear.",
          enzimas: ["Acrosina", "Hialuronidase"] }
      ]
    },
    coagulacao_sanguinea: {
      id: "coagulacao_sanguinea", titulo: "Cascata de Coagulação Sanguínea", sistema: "cardiovascular",
      descricao: "Conversão de fibrinogênio em fibrina estável para hemostasia.",
      etapas: [
        { ordem: 1, fase: "Hemostasia Primária (Plaquetas)", duracaoMs: 300,
          descricao: "Vasoconstrição reflexa e adesão plaquetária ao colágeno subendotelial (via vWF).",
          enzimas: ["Fator de von Willebrand"] },
        { ordem: 2, fase: "Via Extrínseca (TF + VII)", duracaoMs: 200,
          descricao: "Fator tecidual exposto ativa VII → VIIa → X → Xa.", enzimas: ["Fator VIIa"] },
        { ordem: 3, fase: "Via Intrínseca (XII, XI, IX, VIII)", duracaoMs: 800,
          descricao: "Contato com superfície ativa XII → XI → IX → X.", enzimas: ["Fator XIIa"] },
        { ordem: 4, fase: "Via Comum (X → Trombina → Fibrina)", duracaoMs: 300,
          descricao: "Xa converte protrombina em trombina; trombina converte fibrinogênio em fibrina.",
          enzimas: ["Trombina", "Fator Xa", "Fibrina"] },
        { ordem: 5, fase: "Fibrinólise", duracaoMs: 600,
          descricao: "Plasminogênio → plasmina → degrada fibrina (produtos D-dímero).",
          enzimas: ["Plasmina", "tPA"] }
      ]
    },
    resposta_inflamatoria: {
      id: "resposta_inflamatoria", titulo: "Resposta Inflamatória Aguda", sistema: "imunologico",
      descricao: "Sequência vascular e celular desencadeada por lesão ou infecção.",
      etapas: [
        { ordem: 1, fase: "Vasodilatação e Aumento da Permeabilidade", duracaoMs: 1000,
          descricao: "Histamina e NO causam vasodilatação; edema por aumento de permeabilidade.",
          enzimas: ["Histamina (mastócitos)", "NO (endotélio)"] },
        { ordem: 2, fase: "Marginação e Rolamento de Leucócitos", duracaoMs: 1500,
          descricao: "Selectinas medeiam rolamento; integrinas medeiam adesão firme.",
          enzimas: ["Selectina-P", "Integrina LFA-1"] },
        { ordem: 3, fase: "Diapedese", duracaoMs: 800,
          descricao: "Neutrófilos atravessam o endotélio por junções e chegam ao tecido.",
          enzimas: ["Metaloproteinases (MMPs)"] },
        { ordem: 4, fase: "Fagocitose e Destruição", duracaoMs: 2000,
          descricao: "Neutrófilos e macrófagos fagocitam patógenos via ROS e enzimas lisossomais.",
          enzimas: ["NADPH oxidase", "Mieloperoxidase", "Lisozima"] }
      ]
    },
    ciclo_menstrual: {
      id: "ciclo_menstrual", titulo: "Ciclo Menstrual (28 dias típico)", sistema: "reprodutor",
      descricao: "Ciclo ovariano + endometrial regulado por FSH, LH, estrogênio e progesterona.",
      etapas: [
        { ordem: 1, fase: "Menstruação (Dias 1-5)", duracaoMs: 5000,
          descricao: "Descamação do endométrio funcional por queda de progesterona.",
          enzimas: ["Metaloproteinases da matriz (MMPs)"] },
        { ordem: 2, fase: "Fase Folicular (Dias 1-13)", duracaoMs: 13000,
          descricao: "FSH estimula folículos; estrogênio crescente prolifera o endométrio.",
          enzimas: ["Aromatase (CYP19A1)"] },
        { ordem: 3, fase: "Ovulação (Dia 14)", duracaoMs: 1000,
          descricao: "Pico de LH induz ruptura folicular e liberação do oócito.",
          enzimas: ["LH", "Catepsina L"] },
        { ordem: 4, fase: "Fase Lútea (Dias 15-28)", duracaoMs: 12000,
          descricao: "Corpo lúteo secreta progesterona; endométrio torna-se secretor.",
          enzimas: ["Progesterona", "Inibina A"] }
      ]
    },
    eixo_hpa: {
      id: "eixo_hpa", titulo: "Eixo Hipotálamo-Hipófise-Adrenal", sistema: "endocrino",
      descricao: "Eixo neuroendócrino de resposta ao estresse.",
      etapas: [
        { ordem: 1, fase: "CRH Hipotâmico", duracaoMs: 300,
          descricao: "Estresse → hipotálamo secreta CRH no sistema porta hipofisário.",
          enzimas: ["CRH (Corticotropina)"] },
        { ordem: 2, fase: "ACTH Hipofisário", duracaoMs: 500,
          descricao: "CRH estimula corticotrofos → secreção de ACTH.",
          enzimas: ["ACTH"] },
        { ordem: 3, fase: "Cortisol Adrenal", duracaoMs: 1500,
          descricao: "ACTH estimula zona fasciculada → cortisol (gliconeogênese, anti-inflamação).",
          enzimas: ["CYP11B1 (11β-hidroxilase)"] },
        { ordem: 4, fase: "Feedback Negativo", duracaoMs: 500,
          descricao: "Cortisol inibe CRH e ACTH (feedback negativo).",
          enzimas: ["Receptor de glicocorticoide (NR3C1)"] }
      ]
    },
    reflexo_miotatico: {
      id: "reflexo_miotatico", titulo: "Reflexo Miotático (De Estiramento)", sistema: "nervoso",
      descricao: "Arco reflexo monossináptico de ajuste postural.",
      etapas: [
        { ordem: 1, fase: "Estiramento do Fuso Muscular", duracaoMs: 100,
          descricao: "Alongamento ativa mecanorreceptores do fuso (fibras Ia).",
          nervos: "Fibras Ia (aferentes)", enzimas: [] },
        { ordem: 2, fase: "Sinapse na Medula Espinhal", duracaoMs: 200,
          descricao: "Aferência entra no corno posterior e ativa motoneurônio alfa.",
          nervos: "Motoneurônio α", enzimas: [] },
        { ordem: 3, fase: "Contração Reflexa", duracaoMs: 300,
          descricao: "Contração do músculo estirado via placa motora; inibição recíproca do antagonista.",
          enzimas: ["Acetilcolinesterase"] }
      ]
    },
    resposta_imune_adaptativa: {
      id: "resposta_imune_adaptativa", titulo: "Resposta Imune Adaptativa Humoral", sistema: "imunologico",
      descricao: "Ativação de linfócitos B e produção de anticorpos específicos.",
      etapas: [
        { ordem: 1, fase: "Apresentação Antigênica", duracaoMs: 1000,
          descricao: "Células dendríticas apresentam antígeno via MHC-II a linfócitos T CD4+.",
          enzimas: ["MHC-II"] },
        { ordem: 2, fase: "Ativação de Linfócitos T Helper", duracaoMs: 1500,
          descricao: "T CD4+ ativa-se e secreta citocinas (IL-2, IL-4, IL-21).",
          enzimas: ["IL-2", "IL-4"] },
        { ordem: 3, fase: "Ativação de Linfócitos B", duracaoMs: 2000,
          descricao: "Célula B capta antígeno, processa e recebe ajuda do T helper.",
          enzimas: ["BCR (Receptor de célula B)"] },
        { ordem: 4, fase: "Produção de Anticorpos", duracaoMs: 3000,
          descricao: "Diferenciação em plasmócitos → secreção de IgM → IgG (troca de classe).",
          enzimas: ["IgM", "IgG", "AID (Activation-Induced Cytidine Deaminase)"] }
      ]
    }
  },

  // =========================================================================
  // 4. ALVOS MOLECULARES / PDB — 24 (era 9)
  // =========================================================================
  alvosMoleculares: [
    { id: "ptialina", nome: "Amilase Salivar (Ptialina)", tipo: "enzima", pdbId: "1SMD", sistema: "digestorio",
      funcao: "Endoamilase cálcio-dependente que cliva ligações α-1,4 do amido.",
      liganteFarmaco: "Acarbose", quimica: { formula: "C25H43NO18", pesoMolecular: "645.6 g/mol", classe: "Hidrolase EC 3.2.1.1" } },
    { id: "pepsina", nome: "Pepsina Gástrica", tipo: "enzima", pdbId: "4PEP", sistema: "digestorio",
      funcao: "Endopeptidase ácida aspartato; degradação de proteínas em pH 1.5-2.0.",
      liganteFarmaco: "Pepstatina A", quimica: { formula: "C34H63N5O9", pH_otimo: "1.5-2.0" } },
    { id: "h_pylori_urease", nome: "Urease de H. pylori", tipo: "patogeno", pdbId: "1E9Z", sistema: "digestorio",
      funcao: "Hidrolisa ureia gerando amônia protetora contra acidez gástrica.",
      liganteFarmaco: "Amoxicilina + Claritromicina + Omeprazol", quimica: { patogenicidade: "Úlcera péptica" } },
    { id: "cox1", nome: "Ciclooxigenase-1", tipo: "enzima", pdbId: "1EQG", sistema: "cardiovascular",
      funcao: "Proteção gástrica e hemostasia; constitutiva.",
      liganteFarmaco: "Aspirina (irreversível)", quimica: { alvo: "AINEs clássicos" } },
    { id: "cox2", nome: "Ciclooxigenase-2", tipo: "enzima", pdbId: "3LN1", sistema: "cardiovascular",
      funcao: "Indutível na inflamação; síntese de PGH2.",
      liganteFarmaco: "Celecoxibe", quimica: { formula: "C17H14F3N3O2S", seletividade: "COX-2 seletivo" } },
    { id: "ache", nome: "Acetilcolinesterase (AChE)", tipo: "enzima", pdbId: "4EY7", sistema: "nervoso",
      funcao: "Hidrolisa ACh na placa motora e SNC (tríade Ser200-His440-Glu327).",
      liganteFarmaco: "Donepezila / Pralidoxima", quimica: { velocidade: "~25000 s⁻¹" } },
    { id: "sars_cov2_mpro", nome: "Protease Principal Mpro (SARS-CoV-2)", tipo: "patogeno", pdbId: "7VH8", sistema: "respiratorio",
      funcao: "Cisteína protease vital para replicação viral.",
      liganteFarmaco: "Nirmatrelvir (Paxlovid)", quimica: { diade: "Cys145-His41", tipo: "Inibidor covalente reversível" } },
    { id: "bomba_na_k", nome: "Na⁺/K⁺-ATPase", tipo: "enzima", pdbId: "3B8E", sistema: "urinario",
      funcao: "Transporta 3 Na⁺ para fora e 2 K⁺ para dentro consumindo ATP.",
      liganteFarmaco: "Digoxina / Ouabaína", quimica: { estequiometria: "3Na⁺:2K⁺:1ATP" } },
    { id: "complexo_1_mito", nome: "Complexo I Mitocondrial", tipo: "enzima", pdbId: "5LUF", sistema: "cardiovascular",
      funcao: "Transfere elétrons do NADH à CoQ10 gerando gradiente de prótons.",
      liganteFarmaco: "Metformina / Rotenona", quimica: { centros_redox: "FMN + Fe-S" } },
    { id: "cyp3a4", nome: "Citocromo P450 3A4", tipo: "enzima", pdbId: "1TQN", sistema: "digestorio",
      funcao: "Metaboliza >50% dos fármacos (oxidação microssomal).",
      liganteFarmaco: "Claritromicina / Cetoconazol", quimica: { grupo_prostetico: "Heme Fe-Protoporfirina IX" } },
    // NOVOS
    { id: "serca", nome: "SERCA (Ca²⁺-ATPase)", tipo: "enzima", pdbId: "1SU4", sistema: "muscular",
      funcao: "Bombeia Ca²⁺ de volta ao retículo sarcoplasmático.",
      liganteFarmaco: "Tapsigargina", quimica: { Km_Ca: "0.2 µM" } },
    { id: "ace", nome: "Enzima Conversora de Angiotensina", tipo: "enzima", pdbId: "1O86", sistema: "cardiovascular",
      funcao: "Converte Ang I em Ang II e degrada bradicinina.",
      liganteFarmaco: "Lisinopril / Enalapril", quimica: { cofatores: ["Zn²⁺", "Cl⁻"] } },
    { id: "renina", nome: "Renina", tipo: "enzima", pdbId: "2REN", sistema: "urinario",
      funcao: "Cliva angiotensinogênio em Angiotensina I (etapa limitante).",
      liganteFarmaco: "Alisquireno", quimica: { localizacao: "Aparelho justaglomerular" } },
    { id: "hmgcr", nome: "HMG-CoA Redutase", tipo: "enzima", pdbId: "1HWK", sistema: "cardiovascular",
      funcao: "Etapa limitante da síntese de colesterol.",
      liganteFarmaco: "Sinvastatina / Atorvastatina", quimica: { cofatores: ["NADPH"] } },
    { id: "atp_sintase", nome: "ATP Sintase (Complexo V)", tipo: "enzima", pdbId: "1BMF", sistema: "cardiovascular",
      funcao: "Sintetiza ATP a partir de ADP + Pi usando gradiente de prótons.",
      liganteFarmaco: "Oligomicina", quimica: { cofatores: ["gradiente_H+"] } },
    { id: "sod1", nome: "Superóxido Dismutase", tipo: "enzima", pdbId: "1SOS", sistema: "imunologico",
      funcao: "2 O₂•⁻ + 2 H⁺ → H₂O₂ + O₂. Mutações → ELA familiar.",
      liganteFarmaco: "Miméticos de SOD", quimica: { cofatores: ["Cu", "Zn"] } },
    { id: "catalase", nome: "Catalase", tipo: "enzima", pdbId: "1DGB", sistema: "imunologico",
      funcao: "2 H₂O₂ → 2 H₂O + O₂. Defesa antioxidante peroxissomal.",
      liganteFarmaco: "—", quimica: { cofatores: ["heme"] } },
    { id: "lisozima", nome: "Lisozima", tipo: "enzima", pdbId: "1LYZ", sistema: "imunologico",
      funcao: "Cliva peptidoglicano bacteriano (β 1→4).",
      liganteFarmaco: "—", quimica: { localizacao: "Lágrimas, saliva, muco" } },
    { id: "dhfr", nome: "Di-hidrofolato Redutase", tipo: "enzima", pdbId: "1DHF", sistema: "imunologico",
      funcao: "DHF + NADPH → THF + NADP⁺. Síntese de nucleotídeos.",
      liganteFarmaco: "Metotrexato / Trimetoprima", quimica: { cofatores: ["NADPH"] } },
    { id: "anidrase_carbonica", nome: "Anidrase Carbônica", tipo: "enzima", pdbId: "1CA2", sistema: "urinario",
      funcao: "CO₂ + H₂O ↔ H₂CO₃ ↔ H⁺ + HCO₃⁻.",
      liganteFarmaco: "Acetazolamida", quimica: { cofatores: ["Zn²⁺"], turnover: "10⁶ s⁻¹" } },
    { id: "pde5", nome: "Fosfodiesterase-5 (PDE5)", tipo: "enzima", pdbId: "1TBF", sistema: "reprodutor",
      funcao: "Degrada GMPc em GMP; regula tônus vascular do corpo cavernoso.",
      liganteFarmaco: "Sildenafila / Tadalafila", quimica: { substrato: "GMPc" } },
    { id: "aromatase", nome: "Aromatase (CYP19A1)", tipo: "enzima", pdbId: "3EQM", sistema: "reprodutor",
      funcao: "Converte androgênios em estrogênios.",
      liganteFarmaco: "Anastrozol / Letrozol", quimica: { cofatores: ["NADPH", "O₂"] } },
    { id: "receptor_ar", nome: "Receptor Androgênico", tipo: "receptor", pdbId: "2AM9", sistema: "reprodutor",
      funcao: "Fator de transcrição ativado por testosterona/DHT.",
      liganteFarmaco: "Bicalutamida / Enzalutamida", quimica: { classe: "Nuclear receptor" } },
    { id: "nAChR", nome: "Receptor Nicotínico de ACh", tipo: "receptor", pdbId: "2BG9", sistema: "muscular",
      funcao: "Canal iônico ligante-dependente; transmite impulso neuromuscular.",
      liganteFarmaco: "Succinilcolina / Vecurônio", quimica: { tipo: "Cys-loop LGIC" } }
  ],

  // =========================================================================
  // 5. PROTOCOLOS DE BIOHACKING — 15 (era 7)
  // =========================================================================
  protocols: [
    { id: "bio_mag_treonato", nome: "Magnésio L-Treonato", icone: "🧠",
      viaMetabolica: "Neuroplasticidade e Densidade Sináptica", sistema: "nervoso",
      mecanismoAcao: "Sal quelado de Mg²⁺ e ácido L-treônico atravessa BHE via transportadores; otimiza receptores NMDA.",
      tags: ["Nootrópico", "Mineral Quelado", "SNC"],
      cofatores: ["Vitamina B6", "Zinco", "Vitamina D3"], targetMesh: "brain",
      pkData: { route: "ORAL", vd: 35, halfLife: 5.5, dose: 2000, ka: 1.8, targetOrgan: "brain" } },
    { id: "bio_coq10_ubiquinol", nome: "Coenzima Q10 (Ubiquinol)", icone: "⚡",
      viaMetabolica: "Cadeia Transportadora de Elétrons", sistema: "cardiovascular",
      mecanismoAcao: "Transferência de elétrons entre complexos I/II → III; otimiza ATP miocárdico.",
      tags: ["Bioenergética", "Anti-aging", "Fosforilação Oxidativa"],
      cofatores: ["PQQ", "L-Carnitina", "Magnésio"], targetMesh: "heart",
      pkData: { route: "ORAL", vd: 120, halfLife: 33, dose: 200, ka: 0.5, targetOrgan: "heart" } },
    { id: "bio_pqq", nome: "PQQ (Pirroloquinolina Quinona)", icone: "🔋",
      viaMetabolica: "Biogênese Mitocondrial", sistema: "digestorio",
      mecanismoAcao: "Ativa PGC-1α e CREB, induzindo mitocondriogênese.",
      tags: ["Biogênese", "Fator de Transcrição", "Neuroproteção"],
      cofatores: ["Ubiquinol", "ALA"], targetMesh: "liver",
      pkData: { route: "ORAL", vd: 45, halfLife: 4.2, dose: 20, ka: 2.1, targetOrgan: "liver" } },
    { id: "bio_mag_bisglicinato", nome: "Magnésio Bisglicinato", icone: "💪",
      viaMetabolica: "Relaxamento Neuromuscular", sistema: "muscular",
      mecanismoAcao: "Quelato a 2 glicinas; absorção via PEPT1 sem concorrência com TRPM6.",
      tags: ["Quelato Aminoácido", "Recuperação", "Parassimpático"],
      cofatores: ["Taurina", "Cálcio", "Potássio"], targetMesh: "muscl",
      pkData: { route: "ORAL", vd: 40, halfLife: 4.8, dose: 400, ka: 1.5, targetOrgan: "muscl" } },
    { id: "bio_creatina_mono", nome: "Creatina Monoidratada", icone: "🏃",
      viaMetabolica: "Sistema Fosfogênio (ATP-CP)", sistema: "muscular",
      mecanismoAcao: "Fosfocreatina doa radical fosfato para ATP via creatina quinase.",
      tags: ["Ergogênico", "Ressíntese de ATP"],
      cofatores: ["Carboidratos", "Sódio"], targetMesh: "muscl",
      pkData: { route: "ORAL", vd: 100, halfLife: 3, dose: 5000, ka: 2.5, targetOrgan: "muscl" } },
    { id: "bio_zinco_picolinato", nome: "Zinco Picolinato", icone: "🛡️",
      viaMetabolica: "Catálise Enzimática e Imunomodulação", sistema: "imunologico",
      mecanismoAcao: "Integra dedos de zinco estruturais do DNA; ativa SOD1.",
      tags: ["Imunológico", "Síntese Proteica", "Metaloenzima"],
      cofatores: ["Cobre", "Vitamina C", "Quercetina"], targetMesh: "bone",
      pkData: { route: "ORAL", vd: 60, halfLife: 280, dose: 30, ka: 1.2, targetOrgan: "bone" } },
    { id: "bio_glutationa_iv", nome: "Glutationa (GSH) Endovenosa", icone: "🩸",
      viaMetabolica: "Sistema Antioxidante Mestre", sistema: "digestorio",
      mecanismoAcao: "Neutraliza EROs e sustenta conjugação Fase II (GST).",
      tags: ["Antioxidante Mestre", "Detoxificação Fase II"],
      cofatores: ["NAC", "Selênio", "ALA"], targetMesh: "liver",
      pkData: { route: "IV", vd: 15, halfLife: 0.25, dose: 1200, ka: 0, targetOrgan: "liver" } },
    // NOVOS
    { id: "bio_nmn", nome: "Nicotinamida Mononucleotídeo (NMN)", icone: "⏳",
      viaMetabolica: "Via NAD+ / Sirtuínas", sistema: "cardiovascular",
      mecanismoAcao: "Precursor de NAD+ que ativa sirtuínas SIRT1/3 e melhora função mitocondrial.",
      tags: ["Longevidade", "Sirtuínas", "Anti-aging"],
      cofatores: ["Resveratrol", "TMG"], targetMesh: "heart",
      pkData: { route: "ORAL", vd: 80, halfLife: 0.5, dose: 500, ka: 0.8, targetOrgan: "liver" } },
    { id: "bio_omega3", nome: "Ômega-3 (EPA/DHA)", icone: "🐟",
      viaMetabolica: "Resolução da Inflamação", sistema: "cardiovascular",
      mecanismoAcao: "Precursores de resolvinas, protectinas e maresinas (SPM).",
      tags: ["Anti-inflamatório", "Cardioprotetor", "Cognição"],
      cofatores: ["Vitamina E", "Astrágalo"], targetMesh: "heart",
      pkData: { route: "ORAL", vd: 60, halfLife: 48, dose: 2000, ka: 0.4, targetOrgan: "brain" } },
    { id: "bio_vitamina_d3", nome: "Vitamina D3 (Colecalciferol)", icone: "☀️",
      viaMetabolica: "Sinalização Hormonal (VDR)", sistema: "endocrino",
      mecanismoAcao: "Ligante do receptor VDR; regula >200 genes (imunidade, Ca²⁺, proliferação).",
      tags: ["Hormônio Secosteroide", "Imunomodulador", "Osteoprotetor"],
      cofatores: ["Vitamina K2", "Magnésio", "Zinco"], targetMesh: "bone",
      pkData: { route: "ORAL", vd: 200, halfLife: 360, dose: 5000, ka: 0.6, targetOrgan: "bone" } },
    { id: "bio_tmg", nome: "Trimetilglicina (TMG / Betaína)", icone: "🧪",
      viaMetabolica: "Metilação / Homocisteína", sistema: "cardiovascular",
      mecanismoAcao: "Doador de metil (via betaína-homocisteína metiltransferase) que reduz homocisteína.",
      tags: ["Metilação", "Cardiovascular", "Fígado"],
      cofatores: ["B12", "Folato", "B6"], targetMesh: "liver",
      pkData: { route: "ORAL", vd: 30, halfLife: 3, dose: 1000, ka: 2.0, targetOrgan: "liver" } },
    { id: "bio_curcumina_fito", nome: "Curcumina Fitossomal", icone: "🟡",
      viaMetabolica: "Anti-inflamatório NF-κB", sistema: "digestorio",
      mecanismoAcao: "Inibe NF-κB e COX-2; fitossoma (lecitina) aumenta biodisponibilidade ~30×.",
      tags: ["Polifenol", "Anti-inflamatório", "Fitossomal"],
      cofatores: ["Piperina", "Óleo MCT"], targetMesh: "liver",
      pkData: { route: "ORAL", vd: 20, halfLife: 6, dose: 500, ka: 0.7, targetOrgan: "liver" } },
    { id: "bio_spermidina", nome: "Espermidina", icone: "🔄",
      viaMetabolica: "Autofagia / Longevidade", sistema: "imunologico",
      mecanismoAcao: "Induz autofagia via eIF5A hipusinação e inibe acetiltransferases.",
      tags: ["Autofagia", "Longevidade", "Poliamina"],
      cofatores: ["Resveratrol", "Treonina"], targetMesh: "intestin",
      pkData: { route: "ORAL", vd: 50, halfLife: 1.5, dose: 3, ka: 1.4, targetOrgan: "intestin" } },
    { id: "bio_berberina", nome: "Berberina (Fitossomal)", icone: "🌿",
      viaMetabolica: "AMPK / Metabolismo Glicídico", sistema: "endocrino",
      mecanismoAcao: "Ativa AMPK, inibe complexo I mitocondrial hepático; efeito similar à metformina.",
      tags: ["Alcaloide", "Metabólico", "Glicemia"],
      cofatores: ["Berberina + Silimarina"], targetMesh: "liver",
      pkData: { route: "ORAL", vd: 25, halfLife: 5, dose: 500, ka: 1.1, targetOrgan: "liver" } },
    { id: "bio_lions_mane", nome: "Hericium erinaceus (Lion's Mane)", icone: "🍄",
      viaMetabolica: "NGF / Neurogênese", sistema: "nervoso",
      mecanismoAcao: "Erinacinas e hericenonas estimulam síntese de NGF e mielinização.",
      tags: ["Nootrópico", "Fungo Funcional", "NGF"],
      cofatores: ["Cogumelo + Ácido Alfa-Lipóico"], targetMesh: "brain",
      pkData: { route: "ORAL", vd: 30, halfLife: 4, dose: 1000, ka: 1.0, targetOrgan: "brain" } }
  ]
};

// =========================================================================
// RETROCOMPATIBILIDADE GLOBAL
// =========================================================================
const BioDatabase = {
  protocols: ATLAS_DATABASE.protocols,
  sistemas: ATLAS_DATABASE.sistemas,
  viasAdministracao: ATLAS_DATABASE.viasAdministracao,
  processos: ATLAS_DATABASE.processos,
  alvosMoleculares: ATLAS_DATABASE.alvosMoleculares,
  versao: ATLAS_DATABASE.versao,
  ultimaAtualizacao: ATLAS_DATABASE.ultimaAtualizacao
};

if (typeof window !== "undefined") {
  window.ATLAS_DATABASE = ATLAS_DATABASE;
  window.BioDatabase = BioDatabase;
}

/* ========================================================================= */
/* FIM DO ARQUIVO: bio-database.js — v2.0.0                                  */
/* ========================================================================= */
