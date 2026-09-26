/**
 * BANCO DE DADOS OFICIAL — SIMULADOR DE TOXICOLOGIA CLÍNICA & FORENSE (LAIFT)
 * 240 Questões Comentadas divididas em 10 Tópicos Especializados
 */

const allQuestions = [
  // =========================================================
  // TÓPICO 1: ANTÍDOTOS E TRATAMENTO ESPECÍFICO (1 a 25)
  // =========================================================
  {
    id: 1,
    module: "toxico",
    topic: "Antídotos",
    question: "Qual é o antídoto específico para intoxicação por paracetamol (acetaminofeno)?",
    options: ["Naloxona", "Flumazenil", "N-acetilcisteína", "Atropina"],
    correct: 2,
    explanation: "A N-acetilcisteína (NAC) repõe as reservas hepáticas de glutationa (GSH) e conjuga-se diretamente com o metabólito reativo eletrofílico NAPQI, evitando a necrose centrolobular.",
    apiFallback: false
  },
  {
    id: 2,
    module: "toxico",
    topic: "Antídotos",
    question: "O antídoto padrão para intoxicação por opioides (morfina, heroína, fentanil) é:",
    options: ["Naloxona", "Naltrexona", "Metadona", "Buprenorfina"],
    correct: 0,
    explanation: "A naloxona é um antagonista competitivo puro dos receptores opioides (especialmente mu), revertendo rapidamente a depressão respiratória e o coma.",
    apiFallback: false
  },
  {
    id: 3,
    module: "toxico",
    topic: "Antídotos",
    question: "Em casos de intoxicação aguda por organofosforados, o tratamento farmacológico de escolha baseia-se em:",
    options: ["Atropina e Pralidoxima", "Diazepam e Flumazenil", "Naloxona e Carvão ativado", "Carvão ativado isolado"],
    correct: 0,
    explanation: "A atropina antagoniza competitivamente a hiperestimulação muscarínica (controlando broncorreia e bradicardia), enquanto a pralidoxima reativa a enzima acetilcolinesterase desfosforilando-a.",
    apiFallback: false
  },
  {
    id: 4,
    module: "toxico",
    topic: "Antídotos",
    question: "A vitamina K1 (fitomenadiona) é o antídoto indicado para a intoxicação por qual classe de praguicidas?",
    options: ["Fosfeto de zinco", "Anticoagulantes cumarínicos (varfarina, brodifacoum)", "Estricnina", "Fluoroacetato de sódio"],
    correct: 1,
    explanation: "Rodenticidas cumarínicos inibem a enzima vitamina K epóxido redutase no fígado; a vitamina K1 repõe o cofator essencial para a síntese dos fatores de coagulação II, VII, IX e X.",
    apiFallback: false
  },
  {
    id: 5,
    module: "toxico",
    topic: "Antídotos",
    question: "Qual agente quelante clássico é utilizado por via parenteral no tratamento do saturnismo (intoxicação por chumbo)?",
    options: ["Deferoxamina", "Penicilamina", "EDTA cálcico dissódico", "Azul de Prússia"],
    correct: 2,
    explanation: "O EDTA cálcico dissódico quela o chumbo sérico e ósseo trocando-o por cálcio, formando um complexo atóxico hidrossolúvel eliminado por filtração glomerular.",
    apiFallback: false
  },
  {
    id: 6,
    module: "toxico",
    topic: "Antídotos",
    question: "O flumazenil é o antagonista específico indicado na superdosagem de:",
    options: ["Álcool etílico", "Benzodiazepínicos", "Barbitúricos", "Anticolinérgicos"],
    correct: 1,
    explanation: "O flumazenil bloqueia competitivamente o sítio alostérico benzodiazepínico no complexo GABA-A, revertendo a sedação e o coma induzidos por essas drogas.",
    apiFallback: false
  },
  {
    id: 7,
    module: "toxico",
    topic: "Antídotos",
    question: "Na intoxicação por cianeto, o kit clássico tradicional de antídotos é composto por:",
    options: ["Nitrito de amila + Nitrito de sódio + Tiossulfato de sódio", "Fomepizol + Etanol", "Hidroxocobalamina + Naloxona", "Azul de metileno isolado"],
    correct: 0,
    explanation: "Os nitritos induzem a formação de metemoglobina, que possui alta afinidade pelo cianeto formando cianometemoglobina. O tiossulfato fornece enxofre para a enzima rodanase produzir tiocianato atóxico.",
    apiFallback: false
  },
  {
    id: 8,
    module: "toxico",
    topic: "Antídotos",
    question: "A hidroxocobalamina (vitamina B12a) é considerada o antídoto de primeira escolha para:",
    options: ["Monóxido de carbono", "Metanol", "Cianeto", "Sulfeto de hidrogênio"],
    correct: 2,
    explanation: "A hidroxocobalamina combina-se diretamente com o cianeto intracelular e intravascular para sintetizar cianocobalamina (vitamina B12 pura), que é eliminada com segurança pelos rins.",
    apiFallback: false
  },
  {
    id: 9,
    module: "toxico",
    topic: "Antídotos",
    question: "Na intoxicação digitálica grave (digoxina) com arritmias ventriculares ou hipercalemia, utiliza-se:",
    options: ["Atropina em infusão", "Fragmentos Fab de anticorpos antidigoxina", "Lidocaína profilática", "Bicarbonato de sódio"],
    correct: 1,
    explanation: "Os fragmentos Fab ligam-se à digoxina livre com afinidade superior à da bomba Na+/K+-ATPase miocárdica, formando complexos excretados pela urina.",
    apiFallback: false
  },
  {
    id: 10,
    module: "toxico",
    topic: "Antídotos",
    question: "O antídoto específico que inibe competitivamente a álcool desidrogenase na intoxicação por metanol e etilenoglicol é:",
    options: ["Fomepizol (ou Etanol)", "Naloxona", "Bicarbonato de sódio", "Flumazenil"],
    correct: 0,
    explanation: "O fomepizol inibe competitivamente a enzima álcool desidrogenase (ADH), impedindo a conversão do metanol em ácido fórmico e do etilenoglicol em ácido oxálico.",
    apiFallback: false
  },
  {
    id: 11,
    module: "toxico",
    topic: "Antídotos",
    question: "O sulfato de atropina é indicado especificamente para reverter os efeitos muscarínicos decorrentes da exposição a:",
    options: ["Organofosforados e carbamatos", "Nicotina pura", "Curare", "Piretroides"],
    correct: 0,
    explanation: "A atropina é um antagonista competitivo dos receptores muscarínicos pós-ganglionares, cessando a broncorreia, o broncoespasmo, a sialorreia e a bradicardia causadas pela inibição da colinesterase.",
    apiFallback: false
  },
  {
    id: 12,
    module: "toxico",
    topic: "Antídotos",
    question: "O antiveneno específico indicado nos acidentes graves causados pela aranha viúva-negra (Latrodectus) é o:",
    options: ["Soro antiescorpiônico", "Soro antiaracnídico polivalente", "Soro antilatrodectus", "Soro antiofídico"],
    correct: 2,
    explanation: "O soro antilatrodectus neutraliza as frações de alfa-latrotoxina circulantes, revertendo as contraturas musculares intensas, a dor abdominal e a sudorese profusa.",
    apiFallback: false
  },
  {
    id: 13,
    module: "toxico",
    topic: "Antídotos",
    question: "Na intoxicação aguda grave por ferro, o agente quelante parenteral de escolha é:",
    options: ["Deferoxamina", "EDTA dissódico", "Penicilamina", "Dimercaprol (BAL)"],
    correct: 0,
    explanation: "A deferoxamina liga-se seletivamente aos íons de ferro livre (Fe3+), gerando o complexo estável ferrioxamina, que confere coloração avermelhada característica à urina ('urina cor de vinho rosé').",
    apiFallback: false
  },
  {
    id: 14,
    module: "toxico",
    topic: "Antídotos",
    question: "O azul de metileno a 1% é o antídoto preconizado para o tratamento de:",
    options: ["Intoxicação por paracetamol", "Meta-hemoglobinemia adquirida (por nitritos, dapsona ou anilinas)", "Intoxicação por arsênio", "Hepatite induzida por ferro"],
    correct: 1,
    explanation: "O azul de metileno atua como carreador de elétrons para a enzima NADPH-metemoglobina redutase, reduzindo o ferro férrico (Fe3+) inativo da hemoglobina de volta ao estado ferroso funcional (Fe2+).",
    apiFallback: false
  },
  {
    id: 15,
    module: "toxico",
    topic: "Antídotos",
    question: "O dimercaprol (BAL - British Anti-Lewisite) é utilizado historicamente na quelação de quais metais pesados?",
    options: ["Arsênio, mercúrio inorgânico e sais de ouro", "Cádmio e alumínio", "Chumbo isolado em pediatria", "Tálio e bário"],
    correct: 0,
    explanation: "O BAL possui grupamentos sulfidrila (-SH) vicinais que competem avidamente com os tecidos do hospedeiro pelos íons de arsênio, mercúrio e ouro, formando complexos eliminados por via biliar e renal.",
    apiFallback: false
  },
  {
    id: 16,
    module: "toxico",
    topic: "Antídotos",
    question: "A administração de carvão ativado é formalmente contraindicada em intoxicações causadas por:",
    options: ["Paracetamol", "Substâncias corrosivas (ácidos e bases fortes) e hidrocarbonetos", "Carbamazepina", "Teofilina"],
    correct: 1,
    explanation: "Corrosivos lesionam mecanicamente a mucosa digestiva (risco de perfuração e impedimento da visualização endoscópica), além de não serem adsorvidos adequadamente pelo carvão.",
    apiFallback: false
  },
  {
    id: 17,
    module: "toxico",
    topic: "Antídotos",
    question: "Qual protocolo terapêutico de resgate é preconizado no colapso cardiovascular por bloqueadores dos canais de cálcio?",
    options: ["Adrenalina isolada", "Gluconato de cálcio associado à terapia de hiperinsulinemia euglicêmica (HIE)", "Atropina em altas doses", "Bicarbonato de sódio a 8,4%"],
    correct: 1,
    explanation: "A infusão de altas doses de insulina regular acompanhada de glicose restaura o metabolismo energético dos cardiomiócitos, enquanto o cálcio intravenoso supera o bloqueio inotrópico periférico.",
    apiFallback: false
  },
  {
    id: 18,
    module: "toxico",
    topic: "Antídotos",
    question: "Na hipoglicemia refratária causada por superdosagem de sulfonilureias (ex.: glibenclamida), o antídoto adjuvante de eleição é:",
    options: ["Octreotida", "Glucagon contínuo", "Dextrose a 5% isolada", "Diazóxido"],
    correct: 0,
    explanation: "A octreotida é um análogo sintético da somatostatina que suprime diretamente a secreção de insulina pelas células beta do pâncreas induzida pelas sulfonilureias.",
    apiFallback: false
  },
  {
    id: 19,
    module: "toxico",
    topic: "Antídotos",
    question: "Na intoxicação por betabloqueadores acompanhada de bradicardia e choque cardiogênico refratário, utiliza-se:",
    options: ["Dobutamina pura", "Glucagon intravenoso", "Atropina contínua", "Isoproterenol"],
    correct: 1,
    explanation: "O glucagon estimula receptores miocárdicos independentes dos beta-adrenérgicos, elevando os níveis de AMP cíclico (AMPc) e recuperando a contratilidade e o cronotropismo cardíaco.",
    apiFallback: false
  },
  {
    id: 20,
    module: "toxico",
    topic: "Antídotos",
    question: "A fisostigmina (eserina) é o antídoto de escolha para reverter o delírio e a hipertermia causados por:",
    options: ["Agonistas colinérgicos", "Síndrome anticolinérgica central grave (por atropina, escopolamina ou anti-histamínicos)", "Inibidores da MAO", "Opioides sintéticos"],
    correct: 1,
    explanation: "Por ser uma amina terciária, a fisostigmina atravessa a barreira hematoencefálica e inibe reversivelmente a acetilcolinesterase, restabelecendo a concentração de acetilcolina no SNC.",
    apiFallback: false
  },
  {
    id: 21,
    module: "toxico",
    topic: "Antídotos",
    question: "Qual substância atua como trocador iônico insolúvel no trato digestivo, sendo o antídoto de escolha na intoxicação por Tálio?",
    options: ["Azul da Prússia (hexacianoferrato de potássio e ferro)", "EDTA cálcico", "Penicilamina", "Dimercaprol (BAL)"],
    correct: 0,
    explanation: "O Azul da Prússia troca íons potássio por tálio no lúmen intestinal; o complexo formado é insolúvel e não absorvível, sendo excretado nas fezes e interrompendo o ciclo êntero-hepático.",
    apiFallback: false
  },
  {
    id: 22,
    module: "toxico",
    topic: "Antídotos",
    question: "O manejo farmacológico inicial de emergência nas convulsões tetânicas causadas por intoxicação por Estricnina baseia-se em:",
    options: ["Benzodiazepínicos (como Diazepam) em altas doses e suporte ventilatório", "Naloxona intravenosa", "Flumazenil precoce", "Bicarbonato de sódio"],
    correct: 0,
    explanation: "A estricnina bloqueia competitivamente os receptores de glicina na medula espinhal; os benzodiazepínicos potencializam a inibição GABAérgica, controlando os espasmos musculares e o opistótono.",
    apiFallback: false
  },
  {
    id: 23,
    module: "toxico",
    topic: "Antídotos",
    question: "Qual é a abordagem recomendada na intoxicação por Álcool Isopropílico?",
    options: ["Administração de Etanol", "Uso de Fomepizol", "Suporte hidroeletrolítico e hemodiálise nos casos críticos (não há antídoto metabólico específico)", "Naloxona contínua"],
    correct: 2,
    explanation: "O isopropanol é metabolizado a acetona (que não gera acidose metabólica grave nem lesão ocular). O tratamento é eminentemente de suporte, pois inibir a enzima não previne toxicidade crítica.",
    apiFallback: false
  },
  {
    id: 24,
    module: "toxico",
    topic: "Antídotos",
    question: "O dantroleno sódico é o agente miorrelaxante específico indicado para o manejo de:",
    options: ["Síndrome neuroléptica maligna leve", "Hipertermia Maligna deflagrada por anestésicos inalatórios halogenados e succinilcolina", "Rabdomiólise por esforço físico", "Intoxicação por salicilatos"],
    correct: 1,
    explanation: "O dantroleno liga-se ao canal de rianodina (RyR1) no retículo sarcoplasmático do músculo esquelético, bloqueando a liberação descontrolada de cálcio no citoplasma celular.",
    apiFallback: false
  },
  {
    id: 25,
    module: "toxico",
    topic: "Antídotos",
    question: "Na intoxicação aguda por Fosfeto de Alumínio ou Zinco (liberadores de gás fosfina), destaca-se na terapia de suporte intensivo:",
    options: ["Sulfato de magnésio para estabilização de membrana miocárdica e suporte hemodinâmico", "Atropinização plena precoce", "Próprio fosfeto em baixas doses", "Carvão ativado seriado em altas doses"],
    correct: 0,
    explanation: "Não existe antídoto específico para a fosfina; o sulfato de magnésio atua como antioxidante e estabilizador de membrana contra as arritmias ventriculares malignas induzidas pelo veneno.",
    apiFallback: false
  },

  // =========================================================
  // TÓPICO 2: PRAGUICIDAS (26 a 55)
  // =========================================================
  {
    id: 26,
    module: "toxico",
    topic: "Praguicidas",
    question: "O mecanismo primário de ação dos inseticidas organofosforados consiste na:",
    options: ["Ativação constitutiva da adenilil ciclase", "Inibição irreversível (após envelhecimento) da enzima Acetilcolinesterase", "Bloqueio dos receptores de dopamina D2", "Inativação da monoaminoxidase (MAO)"],
    correct: 1,
    explanation: "Eles fosforilam o resíduo de serina no sítio ativo da acetilcolinesterase, impedindo a degradação fisiológica da acetilcolina nas fendas sinápticas.",
    apiFallback: false
  },
  {
    id: 27,
    module: "toxico",
    topic: "Praguicidas",
    question: "As manifestações clínicas da crise colinérgica aguda por organofosforados compreendem efeitos:",
    options: ["Simpatomiméticos exclusivos com midríase e taquicardia", "Muscarínicos (broncorreia, miose, bradicardia) e nicotínicos (fasciculações e fraqueza muscular)", "Anticolinérgicos com pele seca e retenção urinária", "Extrapiramidais puros"],
    correct: 1,
    explanation: "O acúmulo de acetilcolina estimula tanto receptores muscarínicos parassimpáticos (secreções, miose) quanto nicotínicos na placa motora esquelética (fasciculações, paralisia).",
    apiFallback: false
  },
  {
    id: 28,
    module: "toxico",
    topic: "Praguicidas",
    question: "Qual herbicida é classicamente associado ao desenvolvimento de necrose tubular renal aguda inicial seguida de fibrose pulmonar proliferativa fatal?",
    options: ["Glifosato", "Paraquat", "2,4-D", "Atrazina"],
    correct: 1,
    explanation: "O paraquat concentra-se nos pneumócitos através de transportadores de poliaminas, gerando estresse oxidativo contínuo, alveolite inflamatória precoce e fibrose pulmonar irreversível.",
    apiFallback: false
  },
  {
    id: 29,
    module: "toxico",
    topic: "Praguicidas",
    question: "O tropismo tecidual do Paraquat que leva à destruição e cicatrização pulmonar ocorre preferencialmente em:",
    options: ["Pneumócitos tipo I e II", "Células mesangiais renais", "Hepatócitos periportais", "Cardiomiócitos ventriculares"],
    correct: 0,
    explanation: "O sistema celular de captação ativa de poliaminas presente na membrana dos pneumócitos alveolares sequestra o paraquat contra o gradiente de concentração.",
    apiFallback: false
  },
  {
    id: 30,
    module: "toxico",
    topic: "Praguicidas",
    question: "Os rodenticidas anticoagulantes de segunda geração (supervarfarínicos, como brodifacoum) exercem sua ação inibindo a:",
    options: ["Trombina circulante", "Vitamina K epóxido redutase (VKOR)", "Fator X ativado", "Ciclo-oxigenase plaquetária"],
    correct: 1,
    explanation: "O bloqueio da VKOR impede a regeneração da hidroquinona de vitamina K reduzida, bloqueando a gama-carboxilação dos fatores II, VII, IX e X da coagulação.",
    apiFallback: false
  },
  {
    id: 31,
    module: "toxico",
    topic: "Praguicidas",
    question: "O antídoto indicado para restabelecer a hemostasia em envenenamentos por rodenticidas anticoagulantes é:",
    options: ["Sulfato de Protamina", "Fitomenadiona (Vitamina K1)", "Ácido tranexâmico isolado", "N-acetilcisteína"],
    correct: 1,
    explanation: "A fitomenadiona permite a carboxilação dos fatores pelo fígado por uma via alternativa; nos supervarfarínicos, o tratamento com vitamina K1 pode durar meses devido à sua alta lipofilia.",
    apiFallback: false
  },
  {
    id: 32,
    module: "toxico",
    topic: "Praguicidas",
    question: "O mecanismo toxicológico do raticida Fosfeto de Zinco baseia-se na sua reação com o ácido clorídrico gástrico, liberando:",
    options: ["Gás Arsina", "Gás Fosfina (PH3)", "Gás Cianídrico", "Monóxido de carbono"],
    correct: 1,
    explanation: "A fosfina liberada no estômago é absorvida rapidamente, bloqueando o complexo IV da cadeia transportadora de elétrons mitocondrial e causando colapso circulatório grave.",
    apiFallback: false
  },
  {
    id: 33,
    module: "toxico",
    topic: "Praguicidas",
    question: "A intoxicação aguda por Carbamatos (ex.: aldicarb, o 'chumbinho') deve ser tratada preferencialmente com:",
    options: ["Apenas Atropina (a pralidoxima não é recomendada por ausência de benefício clínico comprovado)", "Pralidoxima em monoterapia", "Flumazenil associado a bicarbonato", "Carvão ativado exclusivo"],
    correct: 0,
    explanation: "Como a carbamilação da enzima reverte espontaneamente em poucas horas e não sofre envelhecimento, a atropina é o pilar terapêutico para reverter os efeitos muscarínicos.",
    apiFallback: false
  },
  {
    id: 34,
    module: "toxico",
    topic: "Praguicidas",
    question: "Formulados comerciais de Glifosato ingeridos em grandes volumes provocam toxicidade sistêmica grave (hipotensão e acidose) primariamente devido a:",
    options: ["Bloqueio colinérgico periférico", "Surfactantes surfactantes da formulação (como o POEA), que provocam choque hemodinâmico e lesão de mucosas", "Inibição irreversível da coagulação", "Neurotoxicidade convulsivante imediata"],
    correct: 1,
    explanation: "Os surfactantes adicionados para facilitar a penetração na folha vegetal (ex: polioxietilenoamina - POEA) são os principais responsáveis pela vasodilatação, hipotensão e erosão gastrointestinal.",
    apiFallback: false
  },
  {
    id: 35,
    module: "toxico",
    topic: "Praguicidas",
    question: "Os inseticidas piretroides têm como mecanismo primário de ação sobre o sistema nervoso a alteração de:",
    options: ["Receptores nicotínicos ganglionares", "Receptores GABAérgicos tipo B", "Canais de sódio voltagem-dependentes (retardando seu fechamento)", "Receptores de glicina"],
    correct: 2,
    explanation: "Eles mantêm os canais neuronais de sódio abertos por tempo prolongado, provocando disparos elétricos repetitivos que resultam em parestesias, tremores e fasciculações.",
    apiFallback: false
  },
  {
    id: 36,
    module: "toxico",
    topic: "Praguicidas",
    question: "O quadro clínico característico da contaminação cutânea ocupacional por piretroides de tipo I e II inclui:",
    options: ["Parestesia facial e perioral (ardor e formigamento sem eritema)", "Paralisia flácida arreflexa", "Miose fixa com bradipneia", "Ulcerações necróticas profundas"],
    correct: 0,
    explanation: "A estimulação contínua dos terminais nervosos sensoriais cutâneos deflagra queimação e parestesia local intensa, sintoma característico dos aplicadores agrícolas.",
    apiFallback: false
  },
  {
    id: 37,
    module: "toxico",
    topic: "Praguicidas",
    question: "O inseticida organoclorado DDT atua nos neurônios através de:",
    options: ["Retardo no fechamento e na inativação dos canais de sódio axônicos", "Bloqueio seletivo de canais de potássio", "Inibição pura de colinesterases", "Agonismo muscarínico direto"],
    correct: 0,
    explanation: "Assim como os piretroides de tipo I, o DDT prolonga a corrente despolarizante de sódio durante o potencial de ação, causando hiperexcitabilidade de axônios centrais e periféricos.",
    apiFallback: false
  },
  {
    id: 38,
    module: "toxico",
    topic: "Praguicidas",
    question: "Qual inseticida organoclorado ciclodieno atua como antagonista não-competitivo no canal de cloreto acoplado ao receptor GABA-A?",
    options: ["DDT", "Lindano", "Permetrina", "Metamidofós"],
    correct: 1,
    explanation: "O lindano (gama-hexaclorociclo-hexano) bloqueia os receptores inibitórios GABA-A no SNC, predispondo a episódios convulsivos e hipertermia por desinibição neuronal.",
    apiFallback: false
  },
  {
    id: 39,
    module: "toxico",
    topic: "Praguicidas",
    question: "Os neonicotinoides (como a imidacloprida) exercem sua ação inseticida atuando como agonistas seletivos nos receptores:",
    options: ["Muscarínicos cardíacos", "Nicotínicos de acetilcolina dos insetos (nAChR)", "GABAérgicos tipo A", "Glutamatérgicos metabotrópicos"],
    correct: 1,
    explanation: "A imidacloprida tem alta afinidade pelos subtipos nicotínicos do sistema nervoso central dos insetos, apresentando toxicidade aguda substancialmente menor em mamíferos.",
    apiFallback: false
  },
  {
    id: 40,
    module: "toxico",
    topic: "Praguicidas",
    question: "O achado ocular semiológico patognomônico da estimulação muscarínica na síndrome colinérgica por organofosforados é:",
    options: ["Midríase reativa bilateral", "Anisocoria com nistagmo rotatório", "Miose puntiforme bilateral", "Midríase fixa não-fotorreagente"],
    correct: 2,
    explanation: "A estimulação excessiva de receptores M3 no músculo esfíncter da íris provoca constrição pupilar acentuada e involuntária (miose em cabeça de alfinete).",
    apiFallback: false
  },
  {
    id: 41,
    module: "toxico",
    topic: "Praguicidas",
    question: "A pralidoxima deve ser administrada precocemente nas primeiras 24 a 48 horas porque:",
    options: ["Ela só consegue hidrolisar a enzima antes de ocorrer a perda do radical alquila ('envelhecimento' ou aging)", "A atropina perde a eficácia após esse período", "Ela previne a absorção no duodeno", "Ela atua exclusivamente como indutor enzimático hepático"],
    correct: 0,
    explanation: "Após o envelhecimento conformacional da ligação covalente entre o fósforo e a serina da colinesterase, a quebra da ligação torna-se quimicamente impossível por oximas.",
    apiFallback: false
  },
  {
    id: 42,
    module: "toxico",
    topic: "Praguicidas",
    question: "O estresse oxidativo e a destruição tecidual pulmonar desencadeados pelo Paraquat ocorrem via:",
    options: ["Desacoplamento puro da bomba de sódio e potássio", "Ciclo redox contínuo com consumo de NADPH e formação massiva de radicais superóxido (O2•-)", "Alquilação direta de histonas nucleares", "Inibição competitiva da síntese de colágeno"],
    correct: 1,
    explanation: "O paraquat reduz-se recebendo elétrons do NADPH e reoxida-se espontaneamente transferindo-os ao oxigênio molecular, formando ciclos perpétuos de peroxidação lipídica.",
    apiFallback: false
  },
  {
    id: 43,
    module: "toxico",
    topic: "Praguicidas",
    question: "Na ingestão oral de Paraquat concentrado, o sinal clínico bucofaríngeo característico das primeiras 24 a 48 horas é:",
    options: ["Língua geográfica indolor", "Ulcerações necróticas profundas recobertas por pseudomembranas ('língua de paraquat')", "Candidíase oral hiperplásica", "Hipertrofia gengival hemorrágica"],
    correct: 1,
    explanation: "A substância concentrada exerce potente ação cáustica e inflamatória local, destruindo a mucosa oral e esofágica antes de deflagrar a fibrose alveolar.",
    apiFallback: false
  },
  {
    id: 44,
    module: "toxico",
    topic: "Praguicidas",
    question: "A baixa toxicidade sistêmica dos piretroides em seres humanos decorre fundamentalmente de:",
    options: ["Rápida hidrólise metabólica por carboxilesterases e oxidação pelo CYP450 hepático", "Ausência de canais de sódio na membrana de mamíferos", "Eliminação fecal inalterada em 100% da dose", "Inativação pelo pH ácido da saliva"],
    correct: 0,
    explanation: "Mamíferos possuem sistemas de hidrólise por esterases hepáticas e menor afinidade dos canais de sódio à molécula em temperaturas corporais fisiológicas.",
    apiFallback: false
  },
  {
    id: 45,
    module: "toxico",
    topic: "Praguicidas",
    question: "O rodenticida Fluoroacetato de Sódio (composto 1080) inibe qual etapa do metabolismo intermediário mitocondrial?",
    options: ["A enzima aconitase no Ciclo de Krebs (após biossíntese letal em fluorocitrato)", "A gliconeogênese por inibição da frutose-1,6-bisfosfatase", "A síntese de fosfolipídios na membrana mitocondrial externa", "A beta-oxidação de ácidos graxos"],
    correct: 0,
    explanation: "O fluoroacetato substitui o acetato formando fluorocitrato; este inibe a enzima aconitase, paralisando a cadeia do ciclo do ácido cítrico e o fornecimento de ATP celular.",
    apiFallback: false
  },
  {
    id: 46,
    module: "toxico",
    topic: "Praguicidas",
    question: "O envenenamento por Estricnina (antigo rodenticida clandestino) manifesta-se clinicamente por:",
    options: ["Paralisia flácida simétrica e hipotermia", "Espasmos musculares tônicos dolorosos, trismo e opistótono desencadeados por estímulos sensoriais", "Sedação profunda e coma hiporreflexo", "Ataxia cerebelar pura"],
    correct: 1,
    explanation: "Bloqueia competitivamente os receptores de glicina pós-sinápticos nos neurônios motores medulares, provocando hiperexcitabilidade muscular reflexa sem perda de consciência.",
    apiFallback: false
  },
  {
    id: 47,
    module: "toxico",
    topic: "Praguicidas",
    question: "No suporte inicial à intoxicação aguda por Paraquat, a conduta recomendada em relação ao manejo respiratório é:",
    options: ["Oxigenioterapia em alto fluxo imediata por cateter nasal", "Evitar a administração desnecessária de oxigênio suplementar (manter FiO2 ambiente), exceto em hipoxemia refratária grave", "Hiperventilação mecânica profilática", "Uso de câmara hiperbárica precoce"],
    correct: 1,
    explanation: "O aumento da concentração alveolar de O2 potencializa a formação de radicais livres derivados do ciclo redox do paraquat, acelerando a peroxidação lipídica e o dano alveolar.",
    apiFallback: false
  },
  {
    id: 48,
    module: "toxico",
    topic: "Praguicidas",
    question: "Embora compartilhem efeitos colinérgicos semelhantes, os carbamatos diferem dos organofosforados pelo fato de:",
    options: ["Não inibirem a acetilcolinesterase plasmática", "A carbamilação da enzima ser espontaneamente reversível, com recuperação clínica habitualmente mais rápida", "Provocarem exclusivamente manifestações nicotínicas", "Não atravessarem barreiras biológicas"],
    correct: 1,
    explanation: "A ligação do grupo carbamil dissocia-se da enzima por hidrólise espontânea em poucas horas, raramente evoluindo para a ligação estável definitiva.",
    apiFallback: false
  },
  {
    id: 49,
    module: "toxico",
    topic: "Praguicidas",
    question: "O principal intermediário metabólico responsável pela toxicidade pulmonar mediada por radicais livres na intoxicação por Paraquat é o:",
    options: ["Radical livre cátion Paraquat e o íon superóxido (O2•-)", "Metabólito ácido acético", "Gás formaldeído liberado no alvéolo", "Formato de metila"],
    correct: 0,
    explanation: "A transferência monoeletrônica intracelular gera o radical monovalente paraquat, que reage com o oxigênio celular formando superóxido e peróxido de hidrogênio destrutivos.",
    apiFallback: false
  },
  {
    id: 50,
    module: "toxico",
    topic: "Praguicidas",
    question: "Qual substância atua como doador de substrato competitivo na intoxicação por fluoroacetato de sódio?",
    options: ["Monoacetina (gliceril monoacetato)", "Fitomenadiona", "Diazepam", "Flumazenil"],
    correct: 0,
    explanation: "A monoacetina fornece grupos acetato para competir enzimaticamente com o fluoroacetato antes da conversão letal mitocondrial em fluorocitrato.",
    apiFallback: false
  },
  {
    id: 51,
    module: "toxico",
    topic: "Praguicidas",
    question: "A Síndrome Intermediária associada a certos inseticidas organofosforados lipofílicos manifesta-se tipicamente por:",
    options: ["Fasciculações musculares fugazes nos primeiros 10 minutos", "Fraqueza dos músculos proximais dos membros, flexores do pescoço e pares cranianos entre 24 e 96 horas pós-exposição", "Neuropatia periférica dolorosa 3 meses após a alta", "Delírio maníaco transitório"],
    correct: 1,
    explanation: "Surge após a resolução da crise colinérgica muscarínica inicial, resultando em desensibilização e disfunção pré e pós-sináptica da placa motora nicotínica com risco de parada respiratória.",
    apiFallback: false
  },
  {
    id: 52,
    module: "toxico",
    topic: "Praguicidas",
    question: "A Neuropatia Retardada Induzida por Organofosforados (OPIDN) decorre da inibição e envelhecimento de qual alvo protéico neuronal?",
    options: ["Esterase Neuropática Alvo (NTE)", "Receptor nicotínico alfa-7", "Canais de cálcio tipo L", "Mielina periférica básica"],
    correct: 0,
    explanation: "A fosforilação da NTE resulta em degeneração axonal retrógrada do tipo 'morrendo para trás' (dying-back), provocando paraparesia espástica 2 a 3 semanas após a intoxicação.",
    apiFallback: false
  },
  {
    id: 53,
    module: "toxico",
    topic: "Praguicidas",
    question: "Na vigência de crise colinérgica, a resposta hemodinâmica típica esperada pelo estímulo muscarínico pós-ganglionar no coração é:",
    options: ["Bradicardia sinusal associada a bloqueios de condução atrioventricular", "Taquicardia ventricular monomórfica", "Fibrilação atrial paroxística", "Hipertensão sistólica refratária"],
    correct: 0,
    explanation: "A acetilcolina estimula receptores M2 cardíacos acoplados à proteína Gi, diminuindo o automatismo do nó sinusal e a condução atrioventricular.",
    apiFallback: false
  },
  {
    id: 54,
    module: "toxico",
    topic: "Praguicidas",
    question: "Na intoxicação aguda grave por Paraquat, a realização de hemoperfusão com cartucho de carvão ativado possui maior indicação se:",
    options: ["Iniciada precocemente nas primeiras 2 a 4 horas pós-ingestão, antes do sequestro tecidual pulmonar", "Administrada tardiamente após o início da tosse seca", "Realizada apenas após a confirmação da falência renal", "Prescrita em regime domiciliar ambulatorial"],
    correct: 0,
    explanation: "Como o paraquat é sequestrado avidamente pelos tecidos pulmonares e renais, os métodos de depuração extracorpórea perdem eficácia após poucas horas da absorção digestiva.",
    apiFallback: false
  },
  {
    id: 55,
    module: "toxico",
    topic: "Praguicidas",
    question: "O uso excessivo de atropina na intoxicação por inibidores da colinesterase pode deflagrar síndrome anticolinérgica iatrogênica, expressa por:",
    options: ["Hipotermia com sialorreia de rebote", "Taquicardia, hipertermia, retenção urinária, mucosas secas e agitação/delírio", "Bradipneia com miose bilateral fixa", "Astenia motora proximal pura"],
    correct: 1,
    explanation: "A atropina em doses supraterapêuticas bloqueia os receptores muscarínicos em todo o organismo, invertendo o quadro clínico para a clássica toxidrome anticolinérgica.",
    apiFallback: false
  },

  // =========================================================
  // TÓPICO 3: ANIMAIS PEÇONHENTOS (56 a 85)
  // =========================================================
  {
    id: 56,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "O Soro Antibotrópico (SAB) é o antiveneno específico indicado no manejo dos acidentes causados por serpentes do gênero:",
    options: ["Crotalus (cascavéis)", "Bothrops (jararaca, jararacuçu, urutu)", "Lachesis (surucucu-pico-de-jaca)", "Micrurus (corais verdadeiras)"],
    correct: 1,
    explanation: "As serpentes do gênero Bothrops são responsáveis por cerca de 70 a 85% dos acidentes ofídicos no Brasil, sendo tratadas pelo soro antibotrópico específico.",
    apiFallback: false
  },
  {
    id: 57,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "No acidente botrópico (Bothrops), as manifestações inflamatórias locais típicas compreendem:",
    options: ["Parestesia local e ausência de edema", "Dor intensa imediata, edema endurado progressivo, equimose e surgimento de bolhas", "Anestesia cutânea indolor com necrose óssea", "Palidez isquêmica sem sangramento"],
    correct: 1,
    explanation: "A ação proteolítica e inflamatória mediada por metaloproteinases e fosfolipases A2 deflagra extravasamento de plasma, destruição tecidual, necrose local e dor acentuada.",
    apiFallback: false
  },
  {
    id: 58,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "O acidente crotálico (Crotalus durissus - cascavel) manifesta-se classicamente pela combinação de:",
    options: ["Edema local deformante e gangrena", "Fácies miastênica (ptose palpebral e oftalmoplegia), miotoxicidade com rabdomiólise e urina escura", "Hipotensão vagal e cólicas abdominais intensas", "Lesão cutânea dermonecrótica em placa marmórea"],
    correct: 1,
    explanation: "A crotoxina atua como neurotoxina pré-sináptica inibindo a liberação de acetilcolina e deflagrando lise muscular esquelética difusa (rabdomiólise) com mioglobinúria.",
    apiFallback: false
  },
  {
    id: 59,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "O antiveneno específico para acidentes causados por serpentes do gênero Micrurus (coral verdadeira) é o:",
    options: ["Soro Anticrotálico", "Soro Antibotrópico", "Soro Antielapídico", "Soro Antilaquético"],
    correct: 2,
    explanation: "As corais verdadeiras pertencem à família Elapidae; seu veneno neurotóxico é neutralizado exclusivamente pelo soro antielapídico.",
    apiFallback: false
  },
  {
    id: 60,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "Qual mecanismo é o principal causador de Lesão Renal Aguda (LRA) no acidente crotálico grave?",
    options: ["Hipotensão choque séptico", "Precipitação intratubular de mioglobina (nefropatia por mioglobinúria secundária à rabdomiólise)", "Microangiopatia trombótica exclusiva", "Toxicidade alérgica glomerular"],
    correct: 1,
    explanation: "A mioglobina liberada em grande quantidade no sangue pelas fibras musculares lisadas filtra-se nos glomérulos e precipita nos túbulos renais sob pH ácido, induzindo necrose tubular aguda.",
    apiFallback: false
  },
  {
    id: 61,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "O acidente laquético (Lachesis muta - surucucu) distingue-se clinicamente do botrópico por apresentar adicionalmente:",
    options: ["Manifestações neurotóxicas puras sem dor", "Síndrome vagal / parassimpática (bradicardia, hipotensão arterial, diarreia profusa e vômitos)", "Rigidez nucal e trismo", "Priapismo sustentado"],
    correct: 1,
    explanation: "O veneno laquético compartilha ações inflamatórias e coagulantes com o botrópico, mas estimula o sistema vagal autônomo, provocando bradicardia e colapso hipotensivo.",
    apiFallback: false
  },
  {
    id: 62,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "A peçonha de serpentes do gênero Bothrops possui três ações farmacodinâmicas fundamentais no organismo da vítima:",
    options: ["Miotóxica, citotóxica e analgésica", "Proteolítica (inflamatória/necrotizante), coagulante e hemorrágica", "Cardiotóxica, miastênica e hipoglicemiante", "Neurotóxica central, nefrotóxica e sedativa"],
    correct: 1,
    explanation: "As metaloproteinases destroem a microvasculatura e o colágeno (ação hemorrágica e proteolítica), enquanto enzimas tipo trombina ativam fibrinogênio, gerando coagulopatia de consumo.",
    apiFallback: false
  },
  {
    id: 63,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "No escorpionismo causado por Tityus serrulatus (escorpião amarelo), a fase sistêmica aguda grave caracteriza-se por:",
    options: ["Paralisia flácida e miose", "Liberação maciça de catecolaminas e acetilcolina, cursando com sudorese, sialorreia, hipertensão ou arritmias e choque", "Necrose muscular extensa sem dor local", "Hemorragia digestiva incoagulável"],
    correct: 1,
    explanation: "As escorpiotoxinas abrem canais neuronais de sódio, deflagrando disparos autonômicos em cadeia com liberação tempestuosa de noradrenalina e acetilcolina.",
    apiFallback: false
  },
  {
    id: 64,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "A soroterapia específica antiescorpiônica está indicada formalmente em quais situações?",
    options: ["Em qualquer picada com dor local isolada", "Nos acidentes classificados como moderados ou graves com manifestações sistêmicas (vômitos profusos, sudorese, taquipneia, choque)", "Apenas após 72 horas de evolução", "Exclusivamente em idosos assintomáticos"],
    correct: 1,
    explanation: "Acidentes leves com dor local isolada exigem apenas analgesia/bloqueio anestésico; a presença de vômitos frequentes ou manifestações sistêmicas dita a soroterapia imediata.",
    apiFallback: false
  },
  {
    id: 65,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "A picada da aranha armadeira (Phoneutria nigriventer) provoca dor local intensa e, em crianças e homens jovens, pode deflagrar:",
    options: ["Priapismo doloroso e sustentado por estimulação autonômica e liberação de óxido nítrico", "Ginecomastia aguda", "Atrofia testicular temporária", "Poliúria osmótica"],
    correct: 0,
    explanation: "Toxinas como a PnTx2-6 ativam canais de sódio e estimulam a via L-arginina/óxido nítrico nos corpos cavernosos, provocando ereção involuntária mantida.",
    apiFallback: false
  },
  {
    id: 66,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "O Soro Antiaracnídico polivalente do Ministério da Saúde do Brasil é produzido para neutralizar peçonhas de:",
    options: ["Caranguejeiras e tarântulas", "Aranhas do gênero Phoneutria (armadeira), Loxosceles (aranha-marrom) e escorpiões do gênero Tityus", "Aranha viúva-negra isoladamente", "Aranha de jardim e insetos himenópteros"],
    correct: 1,
    explanation: "O soro antiaracnídico brasileiro é trivalente, cobrindo o veneno das armadeiras, aranhas-marrons e escorpiões do gênero Tityus.",
    apiFallback: false
  },
  {
    id: 67,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "O quadro dermonecrótico característico do loxoscelismo cutâneo (aranha-marrom) é desencadeado primariamente pela enzima:",
    options: ["Hialuronidase", "Esfingomielinase D", "Fosfolipase A2 pura", "Metaloproteinase tipo botrocetina"],
    correct: 1,
    explanation: "A esfingomielinase D quebra a esfingomielina endotelial e eritrocitária, ativando o sistema complemento e o recrutamento neutrofílico, culminando em trombose microvascular e necrose.",
    apiFallback: false
  },
  {
    id: 68,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "No loxoscelismo cutâneo (aranha-marrom), a conduta conservadora local recomendada na primeira semana pós-picada é:",
    options: ["Desbridamento cirúrgico precoce agressivo", "Aplicação de compressas frias/gelo locais e analgesia (evitando calor, que acelera a esfingomielinase D)", "Cauterização química tópica", "Pomadas vasodilatadoras aquecidas"],
    correct: 1,
    explanation: "A atividade da enzima esfingomielinase D é temperatura-dependente; compressas frias reduzem a velocidade de clivagem e o processo inflamatório local.",
    apiFallback: false
  },
  {
    id: 69,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "O contato acidental com cerdas de lagartas urticantes do gênero Lonomia (taturana) pode deflagrar:",
    options: ["Dor em queimação local benigna sem repercussões sistêmicas", "Síndrome hemorrágica sistêmica grave com consumo de fibrinogênio e incoagulabilidade sanguínea", "Paralisia flácida tipo botulismo", "Edema pulmonar neurogênico puro"],
    correct: 1,
    explanation: "A peçonha lonomíca contém ativadores dos fatores X e II (protrombina), desencadeando coagulação intravascular disseminada e fibrinólise secundária com graves sangramentos.",
    apiFallback: false
  },
  {
    id: 70,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "O Soro Antilonômico (SALon) deve ser infundido precocemente nos acidentes com lagartas Lonomia para:",
    options: ["Prevenir anafilaxia", "Neutralizar as toxinas ativadoras da coagulação e conter sangramentos sistêmicos e insuficiência renal", "Eliminar as cerdas retidas na pele", "Acelerar a cicatrização da queimadura"],
    correct: 1,
    explanation: "O soro específico neutraliza os fatores ativadores procoagulantes circulantes, revertendo o quadro hemorrágico em até 24 a 48 horas.",
    apiFallback: false
  },
  {
    id: 71,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "O distúrbio da hemostasia característico observado no teste de tempo de coagulação (TC) no acidente botrópico é:",
    options: ["Tempo de coagulação normal em 100% dos casos", "Incoagulabilidade sanguínea (TC prolongado ou sangue incoagulável) por consumo de fibrinogênio", "Hipercoagulabilidade rápida com trombose venosa profunda", "Plaquetopenia pura sem alteração do coagulograma"],
    correct: 1,
    explanation: "As serinoproteases trombina-símile convertem o fibrinogênio em monômeros de fibrina instáveis que são rapidamente lisados, depletando o fibrinogênio sérico.",
    apiFallback: false
  },
  {
    id: 72,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "No acidente crotálico (cascavel), a conduta profilática para prevenção de Lesão Renal Aguda inclui:",
    options: ["Restrição severa de fluidos intravenosos", "Hidratação venosa vigorosa com solução salina e estímulo à alcalinização urinária com bicarbonato", "Uso de diuréticos de alça em altas doses na anúria", "Administração de heparina plena"],
    correct: 1,
    explanation: "A hiperidratação mantém alto fluxo tubular urinário, e a alcalinização impede a precipitação de pigmentos de mioglobina sob a forma de cilindros túbulo-tóxicos.",
    apiFallback: false
  },
  {
    id: 73,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "A peçonha de cobras do gênero Micrurus (coral verdadeira) provoca paralisia neuromuscular através de:",
    options: ["Neurotoxinas que bloqueiam receptores nicotínicos pós-sinápticos (alfa-neurotoxinas) e inibem exocitose pré-sináptica", "Miotoxicidade com rabdomiólise fulminante", "Vasculite hemorrágica do tronco encefálico", "Ação proteolítica local na placa motora"],
    correct: 0,
    explanation: "As neurotoxinas da coral ligam-se aos receptores nicotínicos na placa motora gerando bloqueio não-despolarizante curariforme com paralisia descendente e parada respiratória.",
    apiFallback: false
  },
  {
    id: 74,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "No envenenamento escorpiônico pediátrico grave, a principal causa de mortalidade é:",
    options: ["Edema Agudo de Pulmão (cardiogênico e não-cardiogênico) associado ao choque circulatório", "Hemorragia digestiva maciça", "Meningoencefalite direta", "Insuficiência hepática aguda"],
    correct: 0,
    explanation: "A tempestade adrenérgica acarreta aumento abrupto da pós-carga, isquemia miocárdica e disfunção ventricular esquerda aguda, levando a edema pulmonar e choque cardiogênico.",
    apiFallback: false
  },
  {
    id: 75,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "No Brasil, o veneno utilizado para a imunização equina na produção do soro antiescorpiônico é extraído de:",
    options: ["Tityus serrulatus", "Tityus bahiensis", "Bothrops jararaca", "Phoneutria nigriventer"],
    correct: 0,
    explanation: "O veneno do escorpião amarelo (Tityus serrulatus) é a base antigênica oficial em decorrência da sua alta frequência de gravidade clínica e potência toxinológica.",
    apiFallback: false
  },
  {
    id: 76,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "A síndrome latrodectísmica (envenenamento por aranha viúva-negra) caracteriza-se por:",
    options: ["Dermonecrose central indolor", "Dor muscular intensa generalizada, contraturas em cólica na parede abdominal e fácies latrodectismica", "Paralisia flácida respiratória pura", "Lesão hemorrágica local extensa"],
    correct: 1,
    explanation: "A alfa-latrotoxina despolariza terminais colinérgicos e adrenérgicos, gerando liberação maciça de neurotransmissores com espasmos musculares dolorosos e abdome em tábua.",
    apiFallback: false
  },
  {
    id: 77,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "O manejo clínico sintomático dos espasmos e dores musculares no latrodectismo baseia-se em:",
    options: ["Anticolinérgicos e atropina", "Analgésicos opioides, benzodiazepínicos miorrelaxantes e gluconato de cálcio", "Antibióticos profiláticos", "Diuréticos osmóticos"],
    correct: 1,
    explanation: "Opiáceos e benzodiazepínicos diminuem a hiperexcitabilidade neuromuscular reflexa e controlam a dor excruciante nas fases precoces do acidente.",
    apiFallback: false
  },
  {
    id: 78,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "Uma complicação ortopédica local temida decorrente do edema subfascial tenso no acidente botrópico é a:",
    options: ["Síndrome compartimental com isquemia de extremidade", "Osteonecrose avascular assintomática", "Anquilose articular reflexa", "Luxação espontânea de articulações"],
    correct: 0,
    explanation: "O intenso edema inflamatório proteolítico em loja muscular fechada eleva a pressão intracompartimental, ocluindo a circulação capilar e ameaçando a viabilidade do membro.",
    apiFallback: false
  },
  {
    id: 79,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "Qual gênero de serpentes é responsável pela ampla maioria dos acidentes ofídicos notificados em território brasileiro?",
    options: ["Crotalus", "Bothrops", "Lachesis", "Micrurus"],
    correct: 1,
    explanation: "O gênero Bothrops responde por mais de 70 a 80% das notificações registradas no Sistema de Informação de Agravos de Notificação (SINAN).",
    apiFallback: false
  },
  {
    id: 80,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "A via de administração preconizada e obrigatória para a infusão de qualquer soro antiveneno heterólogo é:",
    options: ["Intramuscular profunda", "Subcutânea lenta fracionada", "Endovenosa exclusiva", "Intradérmica perilesional"],
    correct: 2,
    explanation: "A via intravenosa garante biodisponibilidade de 100% e neutralização imediata das frações de veneno circulantes nos tecidos e corrente sanguínea.",
    apiFallback: false
  },
  {
    id: 81,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "O diagnóstico sindrômico precoce do acidente crotálico (cascavel) apoia-se no exame neurológico com a identificação de:",
    options: ["Fácies miastênica de Rosenfeld (ptose palpebral bilateral, oftalmoplegia e midríase)", "Hemiplegia espástica contralateral", "Paraplegia sensitiva com nível sensitivo", "Coreia de Sydenham aguda"],
    correct: 0,
    explanation: "A paralisia precoce da musculatura ocular extrínseca inervada por pares cranianos motores gera o aspecto típico de sonolência e incapacidade de abrir totalmente as pálpebras.",
    apiFallback: false
  },
  {
    id: 82,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "A hemorragia tecidual espontânea no envenenamento botrópico decorre da ação de metaloproteinases que degradam:",
    options: ["Fibras de mielina central", "A lâmina basal e a integridade da parede capilar dos vasos sanguíneos (hemorraginas)", "A bomba de sódio e potássio dos eritrócitos", "A actina e miosina das plaquetas"],
    correct: 1,
    explanation: "As hemorraginas clivam as proteínas da matriz extracelular (colágeno tipo IV, laminina) na membrana basal capilar, provocando diapedese hemorrágica e necrose.",
    apiFallback: false
  },
  {
    id: 83,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "No escorpionismo, a ocorrência de bradicardia e hipotensão arterial precoce sinaliza:",
    options: ["Estímulo colinérgico vagal acentuado ou exaustão adrenérgica e disfunção ventricular grave", "Quadro leve sem necessidade de monitoramento", "Falta de toxina na corrente circulatória", "Resolução espontânea benigna do caso"],
    correct: 0,
    explanation: "A tempestade colinérgica vagal inicial ou o colapso hemodinâmico por insuficiência ventricular esquerda refratária são marcadores clássicos de gravidade extrema.",
    apiFallback: false
  },
  {
    id: 84,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "No acidente por aranha-marrom (Loxosceles), a lesão cutânea típica que se estabelece nas primeiras 72 horas é a:",
    options: ["Úlcera fagedênica sem dor", "Placa marmórea (eritema com áreas pálidas isquêmicas centrais e equimose violácea)", "Pápula puriginosa fugaz", "Bolha flácida com pus estéril"],
    correct: 1,
    explanation: "A vasculite com trombose dos pequenos vasos induzida pela esfingomielinase D confere à lesão um aspecto marmóreo, que evolui para crosta necrótica seca e ulcerada.",
    apiFallback: false
  },
  {
    id: 85,
    module: "toxico",
    topic: "Animais Peçonhentos",
    question: "Em relação ao perfil coagulante, a peçonha de Bothrops difere da de Crotalus durissus porque:",
    options: ["Bothrops causa consumo intenso de fibrinogênio com incoagulabilidade sanguínea evidente, enquanto Crotalus raramente produz incoagulabilidade plena", "Bothrops é puramente anticoagulante plaquetária", "Crotalus não gera produtos de degradação da fibrina", "Ambas agem exclusivamente ativando a proteína C"],
    correct: 0,
    explanation: "A fração trombina-símile botrópica atua maciçamente no fibrinogênio, tornando o sangue incoagulável na maioria dos casos moderados a graves.",
    apiFallback: false
  },

  // =========================================================
  // TÓPICO 4: METAIS PESADOS (86 a 110)
  // =========================================================
  {
    id: 86,
    module: "toxico",
    topic: "Metais Pesados",
    question: "As vias predominantes de absorção ocupacional e ambiental de compostos inorgânicos de Chumbo são:",
    options: ["Via dérmica íntegra exclusiva", "Vias respiratória (inalação de pós/vapores) e gastrointestinal (ingestão)", "Via parenteral acidental", "Transcutânea passiva"],
    correct: 1,
    explanation: "Vapores e poeiras de chumbo depositam-se nos alvéolos pulmonares com alta absorção; em crianças, a via digestiva por pica ou mãos sujas é predominante.",
    apiFallback: false
  },
  {
    id: 87,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A intoxicação crônica por chumbo na infância manifesta-se tipicamente com:",
    options: ["Neuropatia motora pura de membros inferiores", "Déficits cognitivos, redução do quociente de inteligência (QI), hiperatividade e encefalopatia", "Hipertensão portal primária", "Insuficiência adrenal aguda"],
    correct: 1,
    explanation: "A barreira hematoencefálica em formação é suscetível ao chumbo, que substitui o cálcio em processos sinápticos e lesa neurônios corticais de forma irreversível.",
    apiFallback: false
  },
  {
    id: 88,
    module: "toxico",
    topic: "Metais Pesados",
    question: "O principal órgão-alvo da inalação aguda de vapores de Mercúrio metálico elementar (Hg0) é o:",
    options: ["Sistema Musculoesquelético", "Sistema Nervoso Central e parênquima pulmonar", "Córtex adrenal", "Bílis hepática"],
    correct: 1,
    explanation: "Por ser apolar e altamente lipofílico, o vapor de mercúrio atravessa a membrana alvéolo-capilar e a barreira hematoencefálica, oxidando-se e acumulando-se no SNC.",
    apiFallback: false
  },
  {
    id: 89,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A tragédia ambiental da Baía de Minamata no Japão decorreu da bioacumulação marinha de qual forma química de mercúrio?",
    options: ["Mercúrio metálico elementar", "Metilmercúrio (mercúrio orgânico)", "Cloreto de mercúrio inorgânico", "Dimetilmercúrio"],
    correct: 1,
    explanation: "Bactérias metilam o mercúrio inorgânico descartado nas águas; a forma orgânica metilmercúrio sofre biomagnificação trófica na cadeia de peixes consumidos pela população.",
    apiFallback: false
  },
  {
    id: 90,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A ingestão crônica de águas contaminadas por Arsênio inorgânico associa-se semiologicamente ao desenvolvimento de:",
    options: ["Hiperqueratose palmoplantar nodular e hiperpigmentação cutânea em 'gotas de chuva'", "Alopecia universal com estrias purpúreas", "Dermatite herpetiforme descamativa", "Eritema nodoso recidivante"],
    correct: 0,
    explanation: "O arsênio deposita-se em tecidos ricos em queratina, gerando espessamento da pele nas mãos/pés e hiperpigmentação salpicada patognomônica.",
    apiFallback: false
  },
  {
    id: 91,
    module: "toxico",
    topic: "Metais Pesados",
    question: "Qual quelante de uso parenteral é utilizado preferencialmente na intoxicação aguda grave por sais inorgânicos de mercúrio?",
    options: ["EDTA cálcico", "Dimercaprol (BAL) ou DMPS", "Deferoxamina", "Azul de Prússia"],
    correct: 1,
    explanation: "O BAL liga-se aos sais de mercúrio inorgânico nos túbulos renais e sangue através de seus grupos tióis livres, facilitando a excreção e reduzindo a necrose tubular.",
    apiFallback: false
  },
  {
    id: 92,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A exposição crônica ocupacional ao Cádmio lesa primordialmente qual segmento anatômico renal?",
    options: ["Glomérulo renal por proliferação extracapilar", "Túbulo contorcido proximal (causando disfunção de reabsorção e Síndrome de Fanconi)", "Alça ascendente espessa de Henle", "Ducto papilar coletor"],
    correct: 1,
    explanation: "O complexo cádmio-metalotioneína é filtrado e reabsorvido no túbulo proximal; o cádmio livre liberado nos lisossomos destrói as células epiteliais tubulares.",
    apiFallback: false
  },
  {
    id: 93,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A doença de Itai-Itai (Japão), marcada por osteomalácia fraturante e nefropatia grave, foi provocada pela contaminação hídrica por:",
    options: ["Chumbo", "Cádmio", "Arsênio", "Mercúrio"],
    correct: 1,
    explanation: "A contaminação de plantações de arroz por cádmio gerou disfunção renal crônica com perda tubular massiva de cálcio e fosfato, enfraquecendo os ossos.",
    apiFallback: false
  },
  {
    id: 94,
    module: "toxico",
    topic: "Metais Pesados",
    question: "O mecanismo patogênico da anemia no saturnismo envolve a inibição enzimática das seguintes etapas da síntese do heme:",
    options: ["Ácido Delta-Aminolevulínico Desidratase (ALA-D) e Ferroquelatase", "Glicose-6-Fosfato Desidrogenase e Bilirrubina transferase", "Ribonucleotídeo redutase e Citocromo C", "Catalase peroxissomal e Piruvato quinase"],
    correct: 0,
    explanation: "O chumbo inibe a ALA-D (acumulando ALA plasmático e urinário) e a ferroquelatase (impedindo a inserção do Fe2+ na protoporfirina IX, formando a zinco-protoporfirina).",
    apiFallback: false
  },
  {
    id: 95,
    module: "toxico",
    topic: "Metais Pesados",
    question: "Na intoxicação aguda por Arsênio inorgânico, o agente quelante clássico de primeira escolha é o:",
    options: ["EDTA cálcico dissódico", "Dimercaprol (BAL)", "Sulfato de protamina", "Penicilamina pura"],
    correct: 1,
    explanation: "O BAL foi desenvolvido originalmente como contra-arma química à lewisite (à base de arsênio), quelando o metal trivalente com alta estabilidade química.",
    apiFallback: false
  },
  {
    id: 96,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A intoxicação ocupacional por chumbo em adultos com saturnismo sintomático é manejada com:",
    options: ["EDTA cálcico dissódico e/ou Succímero (DMSA)", "Deferasirox oral", "Fisostigmina", "Atropina em altas doses"],
    correct: 0,
    explanation: "O EDTA cálcico dissódico e o succímero (DMSA) são os quelantes preconizados pelos consensos toxicológicos para reduzir a carga corporal de chumbo.",
    apiFallback: false
  },
  {
    id: 97,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A toxicidade ocupacional provocada pela inalação de compostos de Cromo Hexavalente [Cr(VI)] expressa-se por:",
    options: ["Insuficiência cardíaca congestiva primária", "Perfuração e ulceração do septo nasal e aumento da incidência de câncer de pulmão", "Alopecia cicatricial total", "Cirrose hepática micronodular"],
    correct: 1,
    explanation: "O Cr(VI) penetra nas células epiteliais respiratórias, sendo reduzido a Cr(III) e gerando aductos de DNA mutagênicos e necrose cáustica septal.",
    apiFallback: false
  },
  {
    id: 98,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A intoxicação por Alumínio observada no passado em pacientes renais em hemodiálise cursava com:",
    options: ["Hepatite tóxica aguda", "Encefalopatia dialítica progressiva (demência da diálise) e osteomalácia resistente", "Anemia megaloblástica refratária", "Pancreatite hemorrágica"],
    correct: 1,
    explanation: "A água tratada inadequadamente ou o uso abusivo de quelantes orais à base de hidróxido de alumínio levavam ao depósito cerebral e inibição da mineralização óssea.",
    apiFallback: false
  },
  {
    id: 99,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A exposição crônica inalatória a poeiras de Manganês (manganismo) provoca síndrome neurológica extrapiramidal por lesão em:",
    options: ["Núcleos da base (em especial o globo pálido e substância negra)", "Córtex sensitivo parietal", "Neurônios motores medulares anteriores", "Corno anterior da medula sacral"],
    correct: 0,
    explanation: "O manganês atravessa a barreira hematoencefálica e acumula-se seletivamente no globo pálido, mimetizando os sinais e sintomas motores da Doença de Parkinson.",
    apiFallback: false
  },
  {
    id: 100,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A exposição transplacentária ao Metilmercúrio resulta em toxicidade teratogênica grave no feto expressa por:",
    options: ["Agenesia renal isolada", "Paralisia cerebral congênita atáxica, microcefalia, cegueira e retardo mental severo", "Cardiopatia congênita cianótica", "Onfalocele fechada"],
    correct: 1,
    explanation: "O metilmercúrio atravessa a placenta e a barreira hematoencefálica fetal transportado pelo carreador de aminoácidos neutros L-LAT1, interrompendo a migração de neuroblastos.",
    apiFallback: false
  },
  {
    id: 101,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A ingestão aguda de sais solúveis de Cobre (como sulfato de cobre) induz quadro clínico marcado por:",
    options: ["Vômitos de coloração azul-esverdeada, gastrite hemorrágica, icterícia e hemólise intravascular", "Miose bilateral com fraqueza muscular", "Arritmia ventricular instantânea sem náuseas", "Urina leitosa fosfatada"],
    correct: 0,
    explanation: "Os sais de cobre são cáusticos para a mucosa gastrointestinal e atuam como oxidantes diretos dos eritrócitos, gerando meta-hemoglobinemia e hemólise aguda.",
    apiFallback: false
  },
  {
    id: 102,
    module: "toxico",
    topic: "Metais Pesados",
    question: "O fármaco quelante por via oral indicado tanto na Doença de Wilson quanto na intoxicação exógena crônica por Cobre é a:",
    options: ["D-Penicilamina", "Deferoxamina", "Naloxona", "Fitomenadiona"],
    correct: 0,
    explanation: "A D-penicilamina é um derivado da penicilina contendo grupamento tiol que quela o cobre plasmático, promovendo sua excreção urinária.",
    apiFallback: false
  },
  {
    id: 103,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A intoxicação aguda por Arsênio por via digestiva manifesta-se tipicamente com:",
    options: ["Constipação crônica espástica", "Diarreia hemorrágica com fezes em 'água de arroz', colapso cardiovascular e choque hemodinâmico", "Cegueira imediata indolor", "Paralisia flácida sem queixas gastrointestinais"],
    correct: 1,
    explanation: "O arsênio inibe a piruvato desidrogenase e altera a permeabilidade vascular esplâncnica, mimetizando uma gastroenterite coleriforme fulminante.",
    apiFallback: false
  },
  {
    id: 104,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A inalação aguda de fumos de óxido de Zinco em soldadores deflagra a chamada:",
    options: ["Febre dos Fumos Metálicos (síndrome gripal febril aguda com calafrios e tosse)", "Encefalopatia plúmbica", "Silicose nodular crônica", "Edema pulmonar hemorrágico maciço"],
    correct: 0,
    explanation: "Partículas finas de óxido de zinco induzem a liberação maciça de citocinas inflamatórias (TNF-alfa, IL-6) nos macrófagos alveolares, simulando gripe aguda autolimitada.",
    apiFallback: false
  },
  {
    id: 105,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A selenose crônica (toxicidade por excesso de Selênio) caracteriza-se clinicamente por:",
    options: ["Hálito com odor de alho, alopecia (queda de cabelos) e unhas quebradiças com estrias", "Hipertensão portal crônica", "Gengivite com linha azulada gengival", "Hiponatremia refratária"],
    correct: 0,
    explanation: "O selênio substitui o enxofre em aminoácidos como cisteína e metionina, fragilizando queratina de fâneros e liberando compostos voláteis dimetilsenetilados pelo hálito.",
    apiFallback: false
  },
  {
    id: 106,
    module: "toxico",
    topic: "Metais Pesados",
    question: "O antídoto insolúvel de escolha na intoxicação por Tálio é o:",
    options: ["Azul da Prússia", "BAL", "EDTA", "Glucagon"],
    correct: 0,
    explanation: "O azul da prússia comporta-se como uma matriz trocadora de cátions monovalentes na luz intestinal, retendo o tálio e acelerando sua depuração fecal.",
    apiFallback: false
  },
  {
    id: 107,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A inalação crônica de compostos de Níquel em ambientes de fundição industrial está correlacionada etiologicamente a:",
    options: ["Câncer do trato respiratório (seios paranasais e pulmão)", "Insuficiência renal por necrose papilar", "Demência por depósito subcortical", "Ulceração esofágica pura"],
    correct: 0,
    explanation: "Compostos insolúveis de níquel sofrem endocitose pelas células respiratórias e liberam íons intracelulares mutagênicos que inibem o reparo de DNA e silenciam genes supressores de tumor.",
    apiFallback: false
  },
  {
    id: 108,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A intoxicação por sais solúveis de Bário (como carbonato ou cloreto de bário) induz colapso neuromuscular por provocar:",
    options: ["Hipocalemia grave refratária (por bloqueio dos canais de efluxo de potássio)", "Hipercalcemia com calcificação vascular", "Bloqueio neuromuscular despolarizante direto", "Acidose tubular tipo 4"],
    correct: 0,
    explanation: "O íon bário bloqueia os canais retificadores de potássio na membrana muscular esquelética; o potássio fica retido no intracelular, provocando hipocalemia profunda e paralisia.",
    apiFallback: false
  },
  {
    id: 109,
    module: "toxico",
    topic: "Metais Pesados",
    question: "Na intoxicação grave por Chumbo com encefalopatia e plumbemia > 70-100 µg/dL, a conduta quelante associada preconizada é:",
    options: ["Monoterapia exclusiva com penicilamina", "Terapia combinada inicial com Dimercaprol (BAL) seguido por EDTA cálcico dissódico", "Apenas diurese forçada neutra", "Carvão ativado em dose única"],
    correct: 1,
    explanation: "O BAL penetra nas células e na barreira hematoencefálica, quelando o chumbo intracelular e evitando o deslocamento inicial do metal para o SNC que ocorreria com o EDTA isolado.",
    apiFallback: false
  },
  {
    id: 110,
    module: "toxico",
    topic: "Metais Pesados",
    question: "A principal via de exposição ao mercúrio elementar na população geral decorria historicamente de:",
    options: ["Amálgamas dentários metálicos e fratura acidental de termômetros/esfigmomanômetros de mercúrio", "Consumo de carne bovina maturada", "Uso de cosméticos à base de água potável", "Consumo de peixes de águas profundas"],
    correct: 0,
    explanation: "O vapor exalado do mercúrio metálico em restaurações dentárias e o vazamento de dispositivos médicos de mercúrio líquido constituíam as principais fontes da forma elementar.",
    apiFallback: false
  },

  // =========================================================
  // TÓPICO 5: DROGAS DE ABUSO (111 a 135)
  // =========================================================
  {
    id: 111,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "A intoxicação aguda por cocaína caracteriza-se pela síndrome simpatomimética composta por midríase, taquicardia, hipertensão e:",
    options: ["Hipotermia com bradicardia paradoxal", "Hipertermia, sudorese, agitação e risco de convulsões", "Sedação profunda sem tremores", "Miose puntiforme"],
    correct: 1,
    explanation: "O bloqueio da recaptação de monoaminas (dopamina, noradrenalina) nos terminais pré-sinápticos mantém a fenda saturada, gerando vasoconstrição, estresse cardíaco e hipertermia.",
    apiFallback: false
  },
  {
    id: 112,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "O manejo farmacológico de primeira linha da agitação, convulsões e hipertensão induzidas por Cocaína apoia-se em:",
    options: ["Betabloqueadores puros (como Propranolol)", "Benzodiazepínicos (como Diazepam) intravenosos titulados", "Atropina em altas doses", "Naloxona pura"],
    correct: 1,
    explanation: "Os benzodiazepínicos reduzem a hiperatividade adrenérgica central e periférica, cessando as convulsões e diminuindo a frequência cardíaca e a pressão arterial de forma segura.",
    apiFallback: false
  },
  {
    id: 113,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "A síndrome de abstinência aguda em indivíduos dependentes de Opioides manifesta-se clinicamente por:",
    options: ["Sedação e miose puntiforme bilateral", "Midríase, sudorese, lacrimejamento, rinorreia, diarreia, piloereção ('gooseflesh') e cólicas abdominais", "Hipotensão profunda com coma", "Paralisia flácida de pares cranianos"],
    correct: 1,
    explanation: "A retirada do agonista desinibe a liberação adrenérgica pelo locus coeruleus, deflagrando uma intensa tempestade simpática e hiper-reatividade autonômica reflexa.",
    apiFallback: false
  },
  {
    id: 114,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "Qual opioide sintético de altíssima potência analgésica (cerca de 50 a 100 vezes mais potente que a morfina) lidera overdoses fatais acidentais?",
    options: ["Codeína", "Fentanil e seus análogos sintéticos", "Tramadol", "Metadona"],
    correct: 1,
    explanation: "A altíssima lipofilia e afinidade do fentanil pelo receptor mu-opioide desencadeiam apneia súbita e rigidez da parede torácica ('tórax em madeira') em doses diminutas.",
    apiFallback: false
  },
  {
    id: 115,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "A intoxicação por MDMA ('Ecstasy') pode cursar com qual alteração hidroeletrolítica letal mediada por secreção inapropriada de ADH associada à hiper-hidratação?",
    options: ["Hipercalemia com acidose láctica pura", "Hiponatremia dilucional grave com risco de edema cerebral e convulsões", "Hipercalcemia maligna", "Hipernatremia grave"],
    correct: 1,
    explanation: "O MDMA induz hipertermia e sede extrema e estimula a secreção central do hormônio antidiurético (ADH); o consumo copioso de água pura leva a hiponatremia hipotônica aguda.",
    apiFallback: false
  },
  {
    id: 116,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "O uso indiscriminado de Flumazenil em pacientes com coma por ingestão desconhecida (politoxicose) é perigoso porque:",
    options: ["Induz parada respiratória direta", "Pode precipitar convulsões refratárias e arritmias, especialmente na coingestão de antidepressivos tricíclicos", "Causa acidose tubular permanente", "Bloqueia a eliminação renal do etanol"],
    correct: 1,
    explanation: "A reversão abrupta do efeito protetor anticonvulsivante dos benzodiazepínicos desmascara a atividade pró-convulsivante de outros agentes associados (como tricíclicos).",
    apiFallback: false
  },
  {
    id: 117,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "O álcool etílico em superdosagem aguda age no SNC primariamente como:",
    options: ["Agonista glutamatérgico direto nos receptores NMDA", "Modulador alostérico positivo de receptores GABA-A e inibidor dos receptores NMDA", "Bloqueador puro de receptores dopaminérgicos", "Estimulante adrenérgico cortical"],
    correct: 1,
    explanation: "O etanol facilita a transmissão inibitória GABAérgica e bloqueia a excitação glutamatérgica, gerando ataxia, inibição de reflexos protetores e depressão do centro respiratório.",
    apiFallback: false
  },
  {
    id: 118,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "A toxicidade ocular e a acidose metabólica com ânion gap elevado provocadas pelo Metanol ocorrem devido ao acúmulo de:",
    options: ["Ácido Fórmico e formaldeído", "Acetaldeído", "Ácido acético", "Acetona pura"],
    correct: 0,
    explanation: "A oxidação do metanol pela álcool desidrogenase e aldeído desidrogenase gera formato; este inibe a citocromo c oxidase mitocondrial na retina e nervo óptico, gerando cegueira.",
    apiFallback: false
  },
  {
    id: 119,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "O protocolo terapêutico padrão na intoxicação confirmada por Metanol engloba:",
    options: ["Inibição enzimática (Fomepizol ou Etanol) + Bicarbonato de sódio + Ácido Folínico/Fólico", "Naloxona contínua associada a flumazenil", "Monoterapia exclusiva com carvão ativado", "Diurese osmótica com manitol"],
    correct: 0,
    explanation: "O fomepizol bloqueia a enzima que forma o ácido fórmico, o bicarbonato combate a acidose e o folato/ácido folínico acelera a degradação metabólica do formato residual em CO2 e água.",
    apiFallback: false
  },
  {
    id: 120,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "A intoxicação aguda por Cannabis em altas concentrações de tetrahidrocanabinol (THC) manifesta-se clinicamente por:",
    options: ["Bradicardia acentuada com constipação", "Taquicardia sinusal, hiperemia conjuntival, boca seca (xerostomia) e reações disfóricas/psicóticas agudas", "Rigidez muscular generalizada", "Miose em estenose fixa"],
    correct: 1,
    explanation: "O estímulo de receptores CB1 no sistema cardiovascular e autonômico desencadeia taquicardia reflexa, vasodilatação conjuntival e inibição da secreção salivar.",
    apiFallback: false
  },
  {
    id: 121,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "O uso crônico abusivo de cocaína por via inalatória nasal associa-se frequentemente à complicação de:",
    options: ["Perfuração do septo nasal secundária à vasoconstrição isquêmica crônica da mucosa", "Cardiopatia hipertrófica congênita", "Fibrose cística pulmonar", "Cirrose biliar primária"],
    correct: 0,
    explanation: "A vasoconstrição sustentada mediada por receptores alfa-1 adrenérgicos promove isquemia do pericôndrio e necrose avascular da cartilagem septal nasal.",
    apiFallback: false
  },
  {
    id: 122,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "Na crise hipertensiva hiperadrenérgica desencadeada pela interação de Inibidores da MAO com alimentos ricos em Tiramina, o fármaco de escolha é:",
    options: ["Propranolol isolado", "Fentolamina (antagonista alfa-adrenérgico) ou Nitroprussiato de sódio", "Clonidina em altas doses", "Metoprolol"],
    correct: 1,
    explanation: "A tiramina força a liberação massiva de noradrenalina das vesículas sinápticas; antagonistas alfa como fentolamina revertem a vasoconstrição periférica sem efeito pressórico paradoxal.",
    apiFallback: false
  },
  {
    id: 123,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "A Síndrome Serotoninérgica decorrente da interação entre MDMA, anfetaminas ou antidepressivos caracteriza-se pela tríade clínica de:",
    options: ["Hipotensão, sonolência e hipotermia", "Alteração do estado mental, hiperatividade autonômica (taquicardia, febre) e anormalidades neuromusculares (clônus, hiperreflexia)", "Paralisia flácida com arreflexia", "Miose com respiração lenta"],
    correct: 1,
    explanation: "A hiperestimulação dos receptores 5-HT2A e 5-HT1A centrais deflagra agitação motora, clônus espontâneo ou induzido, hipertermia maligna e sudorese.",
    apiFallback: false
  },
  {
    id: 124,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "O antagonista de receptores de serotonina (5-HT) utilizado como antídoto nos casos moderados a graves de Síndrome Serotoninérgica é a:",
    options: ["Ciproeptadina", "Naloxona", "Bromocriptina", "Atropina"],
    correct: 0,
    explanation: "A ciproeptadina é um anti-histamínico de primeira geração com propriedades bloqueadoras competitivas potentes nos receptores 5-HT1A e 5-HT2A cerebrais.",
    apiFallback: false
  },
  {
    id: 125,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "A oxidação metabólica do Álcool Isopropílico pela álcool desidrogenase no fígado gera como metabólito característico a:",
    options: ["Acetona (induzindo cetose e cetonúria sem acidose metabólica grave)", "Formaldeído", "Ácido lático", "Etanol residual"],
    correct: 0,
    explanation: "A conversão em acetona provoca hálito cetônico e depressão prolongada do SNC, mas não gera ânion gap severo nem dano retiniano como o metanol.",
    apiFallback: false
  },
  {
    id: 126,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "A intoxicação aguda grave por Barbitúricos (ex.: fenobarbital) caracteriza-se por:",
    options: ["Hipertermia com midríase hiper-reativa", "Depressão respiratória profunda, coma com flacidez muscular, hipotensão e hipotermia", "Convulsões em salvas sem sedação", "Sialorreia com fasciculações"],
    correct: 1,
    explanation: "Ao contrário dos benzodiazepínicos, os barbitúricos aumentam o tempo de abertura do canal de cloreto e em altas doses abrem o poro diretamente, gerando profunda depressão bulbar.",
    apiFallback: false
  },
  {
    id: 127,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "Na ressuscitação de overdose por opioides com Naloxona, a titulação da dose deve visar primariamente a:",
    options: ["Reversão imediata do estado de sedação para despertar completo", "Restauração da ventilação espontânea e frequência respiratória adequada, evitando síndrome de abstinência abrupta", "Indução de midríase fixa", "Normalização da pressão arterial exclusivamente"],
    correct: 1,
    explanation: "O objetivo clínico não é acordar o paciente repentinamente (o que pode precipitar agitação, vômitos e aspiração), mas sim recuperar a mecânica ventilatória e oxigenação.",
    apiFallback: false
  },
  {
    id: 128,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "A ingestão recreativa de GHB (Gama-Hidroxibutirato) manifesta-se clinicamente por:",
    options: ["Agitação psicomotora maníaca", "Coma de início rápido e flutuante, depressão respiratória, bradicardia e amnésia retrógrada", "Hiperreflexia persistente", "Midríase bilateral sem bradipneia"],
    correct: 1,
    explanation: "O GHB é agonista dos receptores GABA-B e receptores específicos de GHB; provoca perda súbita do nível de consciência, mioclonias e rápida recuperação espontânea em poucas horas.",
    apiFallback: false
  },
  {
    id: 129,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "A inalação abusiva crônica de solventes contendo Tolueno ('cheirinho da lata', colas) provoca lesão renal caracterizada por:",
    options: ["Acidose tubular renal distal (tipo 1) acompanhada de hipocalemia grave e fraqueza muscular", "Glomerulonefrite proliferativa aguda", "Necrose papilar renal anúrica", "Síndrome nefrótica pura"],
    correct: 0,
    explanation: "O ácido hipúrico excretado altera o gradiente de prótons nos túbulos coletores renais, provocando acidose tubular com perda urinária severa de potássio.",
    apiFallback: false
  },
  {
    id: 130,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "A dietilamida do ácido lisérgico (LSD) exerce seus efeitos perceptuais e alucinógenos clássicos por atuar como agonista em receptores de:",
    options: ["GABA-A", "Dopamina D1", "Serotonina do subtipo 5-HT2A", "Acetilcolina nicotínicos"],
    correct: 2,
    explanation: "O agonismo parcial nos receptores pós-sinápticos 5-HT2A do córtex cerebral desregula o processamento sensorial talâmico, gerando sinestesias e distorções perceptivas.",
    apiFallback: false
  },
  {
    id: 131,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "A administração isolada de betabloqueadores não-seletivos (como Propranolol) em hipertensão por overdose de Cocaína é contraindicada pelo risco de:",
    options: ["Hipotensão severa imediata", "Vasoconstrição coronariana e sistêmica desinibida paradoxal mediada por receptores alfa-1 livres", "Hipotermia acentuada", "Bloqueio atrioventricular benéfico"],
    correct: 1,
    explanation: "Sem a vasodilatação compensatória mediada pelos receptores beta-2, o excesso de catecolaminas atua exclusivamente nos receptores vasculares alfa-1, agravando o vasoespasmo e o infarto.",
    apiFallback: false
  },
  {
    id: 132,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "O delirium tremens decorrente da síndrome de abstinência grave de Álcool etílico deve ser tratado primariamente com:",
    options: ["Antipsicóticos puros (Haloperidol) em altas doses", "Benzodiazepínicos (como Diazepam ou Lorazepam) titulados por escores de sintomas", "Naloxona parenteral", "Clonidina isolada"],
    correct: 1,
    explanation: "A retirada do etanol elimina a inibição tônica GABAérgica do cérebro; os benzodiazepínicos restauram o tônus inibitório no complexo GABA-A, evitando convulsões e desfecho fatal.",
    apiFallback: false
  },
  {
    id: 133,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "No consumo agudo de Cannabis (THC), o impacto mais marcante sobre as funções executivas consiste no:",
    options: ["Aumento da precisão motora", "Déficit agudo na memória de curto prazo (operacional) e prejuízo no tempo de reação psicomotor", "Aceleração do pensamento lógico formal", "Bloqueio completo do apetite"],
    correct: 1,
    explanation: "A ativação de receptores CB1 no hipocampo e córtex pré-frontal prejudica a consolidação da memória imediata e a coordenação viso-espacial.",
    apiFallback: false
  },
  {
    id: 134,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "A clássica tríade semiológica diagnóstica da overdose aguda por Opioides compreende:",
    options: ["Miose puntiforme bilateral, depressão respiratória (bradipneia/apneia) e rebaixamento do nível de consciência (coma)", "Midríase bilateral, taquicardia e agitação", "Hipertensão grave, convulsões e sudorese", "Paralisia flácida, midríase e diarreia"],
    correct: 0,
    explanation: "A depressão do centro respiratório bulbar, a inibição cortical e a estimulação do núcleo de Edinger-Westphal produzem a tríade patognomônica.",
    apiFallback: false
  },
  {
    id: 135,
    module: "toxico",
    topic: "Drogas de Abuso",
    question: "A meia-vida de eliminação plasmática da Naloxona é curta (cerca de 30 a 90 minutos); clinicamente, esse fato implica que:",
    options: ["Uma única ampola basta para qualquer opioide", "O paciente pode ressedar e entrar em parada respiratória após o efeito da naloxona passar, exigindo doses repetidas ou infusão contínua", "A via oral é a única recomendada", "Não há risco de recorrência do coma"],
    correct: 1,
    explanation: "Opioides como metadona ou preparações de liberação prolongada permanecem no corpo muito mais tempo que a naloxona, exigindo observação hospitalar prolongada.",
    apiFallback: false
  },

  // =========================================================
  // TÓPICO 6: MEDICAMENTOS (136 a 165)
  // =========================================================
  {
    id: 136,
    module: "toxico",
    topic: "Medicamentos",
    question: "Em adultos, a dose única aguda de Paracetamol considerada potencialmente hepatotóxica situa-se habitualmente acima de:",
    options: ["2 g", "7,5 g a 10 g (ou > 150 mg/kg em peso)", "4 g", "1 g"],
    correct: 1,
    explanation: "Doses acima de 150 mg/kg ou superiores a 7,5-10 g esgotam em mais de 70% as reservas hepáticas de glutationa, iniciando a ligação covalente de NAPQI aos hepatócitos.",
    apiFallback: false
  },
  {
    id: 137,
    module: "toxico",
    topic: "Medicamentos",
    question: "A lesão tecidual hepática na intoxicação aguda por Paracetamol decorre da síntese microssomal de qual metabólito eletrofílico hepatotóxico?",
    options: ["Ácido mercaptúrico", "N-acetil-p-benzoquinona imina (NAPQI)", "Sulfato de paracetamol", "Glucuronídeo de fenol"],
    correct: 1,
    explanation: "A isoenzima CYP2E1 metaboliza o paracetamol excedente em NAPQI, que oxida macromoléculas celulares e desencadeia necrose centrolobular massiva.",
    apiFallback: false
  },
  {
    id: 138,
    module: "toxico",
    topic: "Medicamentos",
    question: "A eficácia hepatoprotetora máxima do antídoto N-Acetilcisteína (NAC) ocorre quando sua administração inicia-se até:",
    options: ["2 horas", "8 a 10 horas após a ingestão aguda do paracetamol", "24 horas exclusivamente", "48 horas"],
    correct: 1,
    explanation: "O tratamento iniciado antes de 8 a 10 horas atinge quase 100% de sucesso na prevenção da hepatite fulminante, antes que a necrose irreversível se estabeleça.",
    apiFallback: false
  },
  {
    id: 139,
    module: "toxico",
    topic: "Medicamentos",
    question: "Superdosagens maciças de anti-inflamatórios não esteroides (AINEs, como ibuprofeno) causam prioritariamente:",
    options: ["Hepatite tóxica viral", "Gastrite erosiva/hemorragia digestiva, acidose metabólica e lesão renal aguda por vasoconstrição arteriolar", "Síndrome extrapiramidal aguda", "Pneumonite obstrutiva"],
    correct: 1,
    explanation: "A inibição da COX-1 gástrica elimina a proteção da mucosa, enquanto a perda de prostaglandinas vasodilatadoras renais (PGE2 e PGI2) gera isquemia e insuficiência renal.",
    apiFallback: false
  },
  {
    id: 140,
    module: "toxico",
    topic: "Medicamentos",
    question: "Os antidepressivos tricíclicos (como Amitriptilina) desencadeiam toxicidade cardiovascular grave (arritmias e hipotensão) pelo bloqueio de:",
    options: ["Canais lentos de cálcio", "Canais rápidos de sódio dependentes de voltagem (efeito quinidínico tipo Ia) e receptores alfa-1", "Bomba de sódio e potássio ATPase", "Receptores beta-1 miocárdicos"],
    correct: 1,
    explanation: "O bloqueio do influxo de sódio na fase 0 do potencial de ação miocárdico alarga o complexo QRS, predispõe a arritmias ventriculares e agrava o colapso vascular.",
    apiFallback: false
  },
  {
    id: 141,
    module: "toxico",
    topic: "Medicamentos",
    question: "O tratamento de escolha para reverter o alargamento do QRS (> 100-120 ms) e hipotensão por antidepressivos tricíclicos é:",
    options: ["Flumazenil", "Bicarbonato de Sódio a 8,4% intravenoso", "Naloxona em bolus", "Atropina contínua"],
    correct: 1,
    explanation: "A alcalinização sérica (pH 7,45 a 7,55) e a sobrecarga de sódio aumentam o gradiente extracelular e diminuem a afinidade dos tricíclicos pelo canal de sódio.",
    apiFallback: false
  },
  {
    id: 142,
    module: "toxico",
    topic: "Medicamentos",
    question: "Sintomas clínicos típicos de intoxicação crônica por Digoxina incluem distúrbios digestivos e qual alteração visual clássica?",
    options: ["Amaurose fugaz súbita", "Xantopsia (visão amarelada ou esverdeada com halos luminosos)", "Midríase fixa bilateral", "Nistagmo rotatório"],
    correct: 1,
    explanation: "A inibição da Na+/K+-ATPase nos cones da retina gera cromatopsia, na qual os objetos adquirem tons amarelados, associada a náuseas e bradiarritmias.",
    apiFallback: false
  },
  {
    id: 143,
    module: "toxico",
    topic: "Medicamentos",
    question: "Qual distúrbio eletrolítico prévio potencializa fortemente a cardiotoxicidade da Digoxina e facilita arritmias graves?",
    options: ["Hipercalcemia assintomática", "Hipocalemia e hipomagnesemia", "Hipercalemia extrema", "Hipernatremia pura"],
    correct: 1,
    explanation: "O potássio baixo diminui a competição no sítio de ligação extracelular da Na+/K+-ATPase, permitindo que a digoxina se ligue mais avidamente e bloqueie a enzima.",
    apiFallback: false
  },
  {
    id: 144,
    module: "toxico",
    topic: "Medicamentos",
    question: "O antídoto específico nos casos de arritmias ventriculares refratárias por intoxicação por Digoxina é:",
    options: ["Fragmentos Fab específicos antidigoxina", "Atropina", "Lidocaína profilática", "Isoproterenol"],
    correct: 0,
    explanation: "Os fragmentos Fab capturam a digoxina livre intravascular e tecidual, normalizando o ritmo e revertendo a toxicidade em minutos.",
    apiFallback: false
  },
  {
    id: 145,
    module: "toxico",
    topic: "Medicamentos",
    question: "A intoxicação aguda por Teofilina (broncodilatador xantínico) manifesta-se tipicamente com:",
    options: ["Sedação e miose bilateral", "Taquiarrítmias cardíacas, náuseas incoercíveis, hipocalemia e crises convulsivas refratárias", "Hipotermia grave", "Hipercalemia com bloqueio AV"],
    correct: 1,
    explanation: "O bloqueio de receptores de adenosina e a inibição de fosfodiesterases elevam o AMPc celular, promovendo estimulação adrenérgica extrema e convulsões.",
    apiFallback: false
  },
  {
    id: 146,
    module: "toxico",
    topic: "Medicamentos",
    question: "Nas formas graves e refratárias de intoxicação por Teofilina, o método de depuração extracorpórea mais eficiente é:",
    options: ["Diálise peritoneal intermitente", "Hemoperfusão com cartucho de carvão ativado ou hemodiálise de alto fluxo", "Diurese forçada ácida", "Uso isolado de laxantes osmóticos"],
    correct: 1,
    explanation: "A teofilina possui baixo volume de distribuição e peso molecular favorável, sendo depurada rapidamente por hemoperfusão ou hemodiálise.",
    apiFallback: false
  },
  {
    id: 147,
    module: "toxico",
    topic: "Medicamentos",
    question: "A ingestão aguda excessiva de Inibidores Seletivos da Recaptação de Serotonina (ISRS, como sertralina) causa mais comumente:",
    options: ["Bloqueio de ramo com alargamento do QRS", "Sintomas gastrointestinais benignos (náuseas, vômitos), sonolência, tremores e taquicardia leve", "Hepatite necrótica fulminante", "Depressão respiratória súbita"],
    correct: 1,
    explanation: "Os ISRS isolados apresentam margem de segurança relativamente ampla; em overdose moderada manifestam efeitos serotoninérgicos leves, raramente evoluindo para síndrome serotoninérgica plena.",
    apiFallback: false
  },
  {
    id: 148,
    module: "toxico",
    topic: "Medicamentos",
    question: "Na intoxicação por Carbonato de Lítio, o sinal semiológico precoce neurológico mais frequente é o surgimento de:",
    options: ["Coreoatetose aguda", "Tremor grosseiro das extremidades, ataxia de marcha, hiperreflexia e disartria", "Miopatia proximal indolor", "Paralisia flácida facial"],
    correct: 1,
    explanation: "O lítio acumula-se no SNC e compete com cátions monovalentes e divalentes, afetando a transmissão cerebelar e neuromuscular e provocando tremores e desequilíbrio.",
    apiFallback: false
  },
  {
    id: 149,
    module: "toxico",
    topic: "Medicamentos",
    question: "Nas intoxicações moderadas a severas por Lítio com níveis séricos elevados (> 3,5-4,0 mEq/L) e disfunção neurológica, a intervenção mandatória é a:",
    options: ["Administração de carvão ativado", "Hemodiálise de urgência", "Diurese forçada com furosemida", "Quelação com EDTA"],
    correct: 1,
    explanation: "Como íon de diminuto peso molecular sem ligação a proteínas e com eliminação estritamente renal, o lítio é depurado rapidamente pela membrana da hemodiálise.",
    apiFallback: false
  },
  {
    id: 150,
    module: "toxico",
    topic: "Medicamentos",
    question: "A intoxicação por Salicilatos (Ácido Acetilsalicílico) provoca classicamente qual distúrbio acidobásico misto característico?",
    options: ["Acidose respiratória com alcalose metabólica", "Alcalose respiratória inicial (por hiperventilação central) associada a Acidose metabólica com ânion gap elevado", "Alcalose metabólica pura", "Acidose hiperclorêmica isolada"],
    correct: 1,
    explanation: "Os salicilatos estimulam diretamente o centro respiratório medular (taquipneia gerando alcalose respiratória) e desacoplam a fosforilação oxidativa mitocondrial (gerando lactato e cetoácidos).",
    apiFallback: false
  },
  {
    id: 151,
    module: "toxico",
    topic: "Medicamentos",
    question: "O tratamento para acelerar a eliminação renal de salicilatos no plasma baseia-se na:",
    options: ["Acidificação da urina com ácido ascórbico", "Alcalinização urinária com Bicarbonato de Sódio para aprisionamento iônico (pH urinário 7,5 a 8,0)", "Indução de vômitos repetidos", "Hemoperfusão sem alcalinização"],
    correct: 1,
    explanation: "Em pH urinário alcalino, o salicilato (ácido fraco) ioniza-se perdendo prótons; a molécula com carga elétrica não atravessa a membrana tubular e é eliminada na urina.",
    apiFallback: false
  },
  {
    id: 152,
    module: "toxico",
    topic: "Medicamentos",
    question: "A toxicidade aguda por Fenitoína (anticonvulsivante) correlaciona-se com seus níveis séricos e expressa-se precocemente por:",
    options: ["Hipotensão com bradicardia sinusal", "Nistagmo horizontal, ataxia de marcha, diplopia e disartria", "Poliúria osmótica", "Arritmias cardíacas ventriculares (por via oral)"],
    correct: 1,
    explanation: "Por possuir farmacocinética não-linear (cinética de Michaelis-Menten com eliminação saturável), pequenas elevações de dose causam ataxia e nistagmo cerebelar.",
    apiFallback: false
  },
  {
    id: 153,
    module: "toxico",
    topic: "Medicamentos",
    question: "O Sulfato de Protamina é o agente neutralizante específico preconizado na superdosagem de:",
    options: ["Varfarina", "Heparina Não Fracionada (e reversão parcial de HBPM)", "Clopidogrel", "Rivaroxabana"],
    correct: 1,
    explanation: "A protamina é uma proteína catiônica forte que reage iônicamente com os grupamentos sulfato aniônicos da heparina, inativando o complexo anticoagulante.",
    apiFallback: false
  },
  {
    id: 154,
    module: "toxico",
    topic: "Medicamentos",
    question: "A superdosagem acidental ou acúmulo de Metformina em pacientes com insuficiência renal pode culminar no quadro potencialmente fatal de:",
    options: ["Cetoacidose diabética hiperosmolar", "Acidose Lática com ânion gap elevado e colapso circulatório", "Hipoglicemia profunda refratária", "Pancreatite lúpica"],
    correct: 1,
    explanation: "A inibição do complexo I mitocondrial hepático pela metformina bloqueia a conversão de lactato em glicose; em falência de excreção renal, o lactato acumula perigosamente.",
    apiFallback: false
  },
  {
    id: 155,
    module: "toxico",
    topic: "Medicamentos",
    question: "Na acidose lática induzida por Metformina, a conduta definitiva que depura o medicamento e corrige o desequilíbrio acidobásico é a:",
    options: ["Hemodiálise intermitente precoce", "Administração de glucagon contínuo", "Diurese forçada com furosemida", "Infusão exclusiva de dextrose 50%"],
    correct: 0,
    explanation: "A metformina apresenta baixo peso molecular e baixa ligação proteica; a hemodiálise depura a droga acumulada e normaliza a acidemia metabólica grave.",
    apiFallback: false
  },
  {
    id: 156,
    module: "toxico",
    topic: "Medicamentos",
    question: "A neurotoxicidade aguda por Isoniazida manifesta-se por convulsões refratárias ao tratamento padrão, decorrentes da:",
    options: ["Inibição pura de canais de sódio", "Depleção do fosfato de piridoxal (vitamina B6) com bloqueio da síntese do neurotransmissor GABA", "Hiperglicemia hiperosmolar súbita", "Destruição do trato corticoespinhal"],
    correct: 1,
    explanation: "A isoniazida inativa a piridoxina e inibe a enzima ácido glutâmico descarboxilase, diminuindo a produção do neurotransmissor inibitório GABA no cérebro.",
    apiFallback: false
  },
  {
    id: 157,
    module: "toxico",
    topic: "Medicamentos",
    question: "O antídoto específico obrigatório que cessa as crises convulsivas na intoxicação por Isoniazida é a:",
    options: ["Piridoxina (Vitamina B6) intravenosa grama a grama", "Tiamina (Vitamina B1)", "Cianocobalamina (Vitamina B12)", "Riboflavina"],
    correct: 0,
    explanation: "A piridoxina exógena reconstitui os estoques coenzimáticos cerebrais, reativando a síntese de GABA e interrompendo o estado de mal epiléptico.",
    apiFallback: false
  },
  {
    id: 158,
    module: "toxico",
    topic: "Medicamentos",
    question: "A ingestão excessiva de Colchicina deflagra toxicidade multissistêmica fulminante decorrente do seu mecanismo de:",
    options: ["Inibição da polimerização das tubulinas e bloqueio da divisão celular mitótica", "Bloqueio dos canais de cálcio periféricos", "Inativação da bomba de prótons", "Estimulação da secreção ácida gástrica"],
    correct: 0,
    explanation: "Por paralisar a divisão celular mitótica e o citoesqueleto de células de renovação rápida, a colchicina causa enterite coleriforme, aplasia medular e choque cardiogênico.",
    apiFallback: false
  },
  {
    id: 159,
    module: "toxico",
    topic: "Medicamentos",
    question: "O resgate farmacológico nas superdosagens acidentais do quimioterápico Metotrexato é executado com:",
    options: ["Ácido Folínico (Leucovorina)", "Ácido Fólico simples", "Sulfato ferroso", "Deferoxamina"],
    correct: 0,
    explanation: "O ácido folínico entra nas células contornando a inibição da di-hidrofolato redutase (DHFR) provocada pelo metotrexato, fornecendo tetraidrofolato ativo diretamente.",
    apiFallback: false
  },
  {
    id: 160,
    module: "toxico",
    topic: "Medicamentos",
    question: "A manifestação toxicológica predominante na superdosagem de Inibidores da ECA (como Enalapril ou Captopril) é a:",
    options: ["Crise hipertensiva reflexa", "Hipotensão arterial sistêmica sustentada por vasodilatação arteriolovenosa", "Tosse paroxística asfixiante", "Hipercalcemia grave"],
    correct: 1,
    explanation: "A supressão na síntese de angiotensina II associada ao acúmulo de bradicininas promove perda intensa da resistência vascular periférica sistêmica.",
    apiFallback: false
  },
  {
    id: 161,
    module: "toxico",
    topic: "Medicamentos",
    question: "Superdosagens de anti-histamínicos de primeira geração (como Difenidramina) manifestam-se clinicamente pela toxidrome:",
    options: ["Colinérgica muscarínica", "Anticolinérgica (midríase, boca seca, taquicardia, retenção urinária e delírio)", "Opioide clássica", "Simpaticolítica pura"],
    correct: 1,
    explanation: "Além do bloqueio dos receptores H1 de histamina, esses fármacos antagonizam fortemente os receptores muscarínicos centrais e periféricos.",
    apiFallback: false
  },
  {
    id: 162,
    module: "toxico",
    topic: "Medicamentos",
    question: "O antídoto indicado na síndrome anticolinérgica grave induzida por fármacos com delírio refratário e agitação perigosa é a:",
    options: ["Atropina", "Fisostigmina", "Neostigmina", "Pralidoxima"],
    correct: 1,
    explanation: "A fisostigmina supera a barreira hematoencefálica e eleva os níveis de acetilcolina no sistema nervoso central, revertendo a psicose e o delírio anticolinérgico.",
    apiFallback: false
  },
  {
    id: 163,
    module: "toxico",
    topic: "Medicamentos",
    question: "A intoxicação aguda por Betabloqueadores (como Propranolol) caracteriza-se hemodinamicamente por:",
    options: ["Taquicardia sinusal e rubor facial", "Bradicardia sinusal, bloqueios atrioventriculares, hipotensão arterial e risco de broncoespasmo", "Hipertensão maligna isolada", "Poliúria aquosa"],
    correct: 1,
    explanation: "A perda do tônus beta-adrenérgico reduz o débito cardíaco, desacelera a condução nodal e pode desencadear choque cardiogênico.",
    apiFallback: false
  },
  {
    id: 164,
    module: "toxico",
    topic: "Medicamentos",
    question: "Na refratariedade ao suporte hemodinâmico na overdose por betabloqueadores, a droga que aumenta o inotropismo por via alternativa é o:",
    options: ["Glucagon intravenoso", "Verapamil", "Captopril", "Atenolol"],
    correct: 0,
    explanation: "O glucagon ativa receptores específicos que estimulam a adenilil ciclase miocárdica sem passar pelos receptores beta-1 bloqueados.",
    apiFallback: false
  },
  {
    id: 165,
    module: "toxico",
    topic: "Medicamentos",
    question: "A superdosagem acidental de Clonidina (agonista alfa-2 central) em pediatria costuma mimetizar qual outra toxidrome?",
    options: ["Toxidrome colinérgica", "Toxidrome opioide (com miose, sonolência/coma, hipotensão e bradipneia)", "Toxidrome simpaticomimética", "Toxidrome anticolinérgica"],
    correct: 1,
    explanation: "A diminuição drástica do efluxo simpático central produz miose puntiforme, depressão respiratória e coma, simulando intoxicação por morfina.",
    apiFallback: false
  },

  // =========================================================
  // TÓPICO 7: PRODUTOS DOMÉSTICOS E SOLVENTES (166 a 185)
  // =========================================================
  {
    id: 166,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "A ingestão acidental de Soda Cáustica (hidróxido de sódio concentrado) provoca lesão tecidual do tipo:",
    options: ["Necrose de coagulação com formação de escara seca protetora", "Necrose de liquefação profunda, com saponificação de lipídios e alto risco de perfuração esofágica", "Ulceração superficial sem sequelas", "Estenose tardia isolada sem lesão aguda"],
    correct: 1,
    explanation: "Álcalis fortes solubilizam proteínas teciduais e saponificam gorduras de membrana, penetrando profundamente na musculatura esofágica e mediastino.",
    apiFallback: false
  },
  {
    id: 167,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "Na abordagem de urgência hospitalar pós-ingestão de substâncias químicas cáusticas corrosivas, a conduta recomendada é:",
    options: ["Realizar lavagem gástrica copiosa imediata", "Não induzir vômitos nem passar sondas gástricas às cegas; programar Endoscopia Digestiva Alta (EDA) precoce nas primeiras 12 a 24 horas", "Administrar ácido acético para neutralizar a base", "Dar carvão ativado em suspensão"],
    correct: 1,
    explanation: "A indução de vômito relesa o esôfago e favorece a aspiração; a EDA precoce classifica a gravidade do dano transmural (escala de Zargar).",
    apiFallback: false
  },
  {
    id: 168,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "O principal risco clínico letal na ingestão acidental de querosene ou outros hidrocarbonetos alifáticos é a:",
    options: ["Necrose gástrica transmural", "Pneumonite química aspirativa por baixa viscosidade e alta volatilidade", "Insuficiência renal anúrica", "Hemorragia digestiva baixa"],
    correct: 1,
    explanation: "A baixa tensão superficial e a alta volatilidade facilitam a aspiração para as vias aéreas, destruindo o surfactante pulmonar e causando edema alvéolo-capilar grave.",
    apiFallback: false
  },
  {
    id: 169,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "A inalação de solventes contendo Tolueno pode desencadear alteração hidroeletrolítica severa marcada por:",
    options: ["Acidose tubular renal distal com hipocalemia grave e fraqueza motora", "Alcalose metabólica persistente", "Hipercalcemia aguda", "Hipercalemia com bloqueio sinusal"],
    correct: 0,
    explanation: "O tolueno é convertido em ácido hipúrico, cujo excesso tubular compromete a secreção de prótons H+, provocando acidose e perda urinária acentuada de potássio.",
    apiFallback: false
  },
  {
    id: 170,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "A afinidade da molécula de Monóxido de Carbono (CO) pela hemoglobina circulante é cerca de:",
    options: ["10 vezes superior à do oxigênio", "200 a 250 vezes superior à do oxigênio", "Igual à do oxigênio", "Menor que a do oxigênio"],
    correct: 1,
    explanation: "O CO liga-se avidamente ao sítio do ferro na hemoglobina formando carboxiemoglobina e desvia a curva de dissociação para a esquerda, impedindo a liberação do O2 aos tecidos.",
    apiFallback: false
  },
  {
    id: 171,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "O tratamento básico de escolha na intoxicação aguda por Monóxido de Carbono em ambiente hospitalar é a:",
    options: ["Oxigenioterapia normobárica a 100% com máscara com reservatório não-reinalante", "Administração de bicarbonato de sódio contínuo", "Lavagem gástrica com solução salina", "Ventilação com ar ambiente simples"],
    correct: 0,
    explanation: "A inalação de O2 a 100% reduz a meia-vida da carboxiemoglobina de cerca de 300-320 minutos (em ar ambiente) para aproximadamente 60 a 90 minutos.",
    apiFallback: false
  },
  {
    id: 172,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "O mecanismo patogênico central da intoxicação por Cianeto em incêndios em ambientes fechados consiste na:",
    options: ["Destruição direta de eritrócitos circulantes", "Inibição reversível da enzima citocromo c oxidase (complexo IV da cadeia respiratória mitocondrial)", "Inibição de colinesterases musculares", "Formação de meta-hemoglobina pura"],
    correct: 1,
    explanation: "Ao fixar-se no ferro férrico (Fe3+) da citocromo oxidase, o cianeto interrompe a fosforilação oxidativa mitocondrial e paralisa o consumo celular de oxigênio (hipóxia histotóxica).",
    apiFallback: false
  },
  {
    id: 173,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "O antídoto pré-hospitalar parenteral de escolha nas vítimas de inalação de fumaça de incêndio com suspeita de cianeto é a:",
    options: ["Hidroxocobalamina (Vitamina B12a)", "Atropina", "N-acetilcisteína", "Fisostigmina"],
    correct: 0,
    explanation: "A hidroxocobalamina sequestra o cianeto formando cianocobalamina segura, sem induzir metemoglobinemia em vítimas que já sofrem de hipóxia por monóxido de carbono.",
    apiFallback: false
  },
  {
    id: 174,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "A intoxicação aguda pela ingestão de Formol (formaldeído a 37%) induz necrose de coagulação e acidose decorrente de sua oxidação a:",
    options: ["Ácido Fórmico", "Ácido acético", "Ácido úrico", "Acetaldeído"],
    correct: 0,
    explanation: "O formaldeído é oxidado rapidamente pela formaldeído desidrogenase em ácido fórmico, provocando acidose metabólica grave e lesões cáusticas no trato digestivo.",
    apiFallback: false
  },
  {
    id: 175,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "O gás cloro (Cl2), ao entrar em contato com a umidade das vias aéreas e alvéolos, reage quimicamente formando:",
    options: ["Ácido Clorídrico (HCl) e Ácido Hipocloroso (HOCl)", "Ácido sulfúrico", "Ácido nítrico concentrado", "Gás cianídrico"],
    correct: 0,
    explanation: "A hidrólise do cloro na mucosa respiratória produz ácidos que liberam radicais livres de oxigênio e causam corrosão química e edema de glote agudo.",
    apiFallback: false
  },
  {
    id: 176,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "A inalação ocupacional prolongada de solventes clorados como o Tetracloreto de Carbono (CCl4) provoca toxicidade em quais órgãos?",
    options: ["Hepatotoxicidade e Nefrotoxicidade (necrose centrolobular e tubular)", "Apenas dermatite estéril", "Pancreatite crônica pura", "Osteomalácia dialítica"],
    correct: 0,
    explanation: "O CCl4 é ativado pelo CYP2E1 no radical livre triclorometil (•CCl3), que desencadeia peroxidação lipídica nas membranas do retículo dos hepatócitos e túbulos renais.",
    apiFallback: false
  },
  {
    id: 177,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "Em crianças pequenas, a ingestão acidental de álcool em gel (etanol a 70%) comumente precipita:",
    options: ["Hiperglicemia cetótica", "Hipoglicemia grave por inibição da gliconeogênese associada à depressão do SNC", "Hipertermia com midríase", "Poliúria alcalina"],
    correct: 1,
    explanation: "A oxidação do etanol eleva a relação NADH/NAD+ nos hepatócitos, desviando piruvato para lactato e bloqueando a gliconeogênese nas crianças com baixas reservas de glicogênio.",
    apiFallback: false
  },
  {
    id: 178,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "O Gás Sulfídrico (H2S - ácido sulfídrico), liberado em esgotos e refinarias, é um asfixiante celular histotóxico cujo mecanismo é:",
    options: ["Inibição da enzima citocromo c oxidase mitocondrial (semelhante ao cianeto)", "Destruição exclusiva de hemácias", "Bloqueio neuromuscular nicotínico", "Inibição de anidrase carbônica"],
    correct: 0,
    explanation: "O sulfeto liga-se ao ferro férrico (Fe3+) do complexo IV da cadeia respiratória, bloqueando a respiração aeróbia celular e provocando colapso respiratório em segundos.",
    apiFallback: false
  },
  {
    id: 179,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "Na descontaminação de contato dérmico acidental com a maioria dos produtos químicos industriais, a conduta primária obrigatória é:",
    options: ["Irrigação copiosa e contínua com água corrente limpa em temperatura ambiente por 15 a 20 minutos", "Aplicação de solução de vinagre para neutralizar", "Passagem de pomadas oleosas imediatas", "Exposição ao ar seco"],
    correct: 0,
    explanation: "A água corrente em grande volume dilui e remove mecanicamente a substância química tóxica da derme, minimizando a queimadura e a absorção percutânea.",
    apiFallback: false
  },
  {
    id: 180,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "O Fenol concentrado (ácido carbólico), além de provocar queimaduras químicas dérmicas indolores, pode ser absorvido pela pele provocando:",
    options: ["Arritmias ventriculares graves, depressão do SNC e lesão hepatorrenal", "Aumento da motilidade colônica pura", "Hipercalcemia assintomática", "Alopecia precoce"],
    correct: 0,
    explanation: "O fenol atua como anestésico local nas terminações nervosas da pele (daí o caráter indolor inicial), mas é absorvido sistemicamente, exercendo toxicidade cardíaca e renal.",
    apiFallback: false
  },
  {
    id: 181,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "O Gás Mostarda (agente químico de guerra vesicante) caracteriza-se clinicamente por apresentar:",
    options: ["Aparecimento tardio das lesões (período de latência assintomático de várias horas), seguido de formação de bolhas cutâneas e necrose traqueal", "Dor imediata dilacerante na pele em segundos", "Paralisia flácida sem lesões cutâneas", "Hipotensão fugaz"],
    correct: 0,
    explanation: "Por ser um agente alquilante de DNA, o dano molecular inicial não deflagra dor imediata; a resposta inflamatória com flictenas e destruição celular eclode após 4 a 12 horas.",
    apiFallback: false
  },
  {
    id: 182,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "A mielotoxicidade crônica da exposição ocupacional continuada ao solvente Benzeno associa-se etiologicamente ao desenvolvimento de:",
    options: ["Anemia falciforme", "Aplasia de medula óssea e Leucemia Mieloide Aguda (LMA)", "Linfoma de Hodgkin exclusivo", "Policitemia rubra vera"],
    correct: 1,
    explanation: "Metabólitos hepáticos do benzeno (como hidroquinona e benzoquinona) migram para a medula óssea, danificando cromossomos de células-tronco hematopoiéticas.",
    apiFallback: false
  },
  {
    id: 183,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "O Glutaraldeído (desinfetante hospitalar) e o Formaldeído são agentes químicos reconhecidos toxicologicamente por causarem:",
    options: ["Irritação de mucosas, sensibilização alérgica do trato respiratório (asma ocupacional) e potencial carcinogênico", "Neuropatia puramente sensitiva", "Bloqueio de receptores adrenérgicos", "Sedação profunda"],
    correct: 0,
    explanation: "São aldeídos reativos que promovem ligações cruzadas com proteínas de membrana, provocando hipersensibilidade alérgica imunomediada e danos cromossômicos.",
    apiFallback: false
  },
  {
    id: 184,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "O biomarcador urinário clássico empregado na monitorização biológica da exposição ocupacional ao Tolueno é a dosagem de:",
    options: ["Ácido Hipúrico", "Ácido Delta-aminolevulínico", "Ácido Mandélico", "Fenol livre"],
    correct: 0,
    explanation: "O tolueno sofre biotransformação microssomal em ácido benzoico, que se conjuga com glicina no fígado para formar o ácido hipúrico excretado na urina.",
    apiFallback: false
  },
  {
    id: 185,
    module: "toxico",
    topic: "Produtos Domésticos & Solventes",
    question: "A contaminação acidental ou deliberada com o inseticida organoclorado DDT cursa com alterações no SNC que se expressam por:",
    options: ["Depressão respiratória sem tremores", "Parestesia perioral, hiperestesia tátil, tremores e crises convulsivas generalizadas", "Paralisia flácida simétrica", "Hipersalivação intensa"],
    correct: 1,
    explanation: "O retardo no fechamento dos canais de sódio nos axônios sensitivos e motores provoca potenciais repetitivos que culminam em hiperexcitabilidade cortical e convulsões.",
    apiFallback: false
  },

  // =========================================================
  // TÓPICO 8: PLANTAS TÓXICAS (186 a 205)
  // =========================================================
  {
    id: 186,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "A ingestão da planta ornamental Espirradeira (Nerium oleander) provoca cardiotoxicidade severa por conter glicosídeos ativos semelhantes à:",
    options: ["Atropina", "Digoxina (oleandrina e neriina)", "Nicotina", "Morfina"],
    correct: 1,
    explanation: "A oleandrina presente em todas as partes da espirradeira inibe a Na+/K+-ATPase cardíaca, gerando arritmias ventriculares e bloqueios atrioventriculares graves.",
    apiFallback: false
  },
  {
    id: 187,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "O tratamento específico para arritmias ventriculares refratárias pós-ingestão de Espirradeira (Nerium oleander) pode incluir:",
    options: ["Atropina isolada", "Fragmentos de anticorpos Fab antidigoxina", "Carvão ativado em dose única exclusiva", "Naloxona"],
    correct: 1,
    explanation: "Os fragmentos Fab antidigoxina possuem reatividade cruzada com a oleandrina e neutralizam os glicosídeos cardiotônicos circulantes da planta.",
    apiFallback: false
  },
  {
    id: 188,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "As sementes mastigadas da planta Mamona (Ricinus communis) liberam a toxina proteica Ricina, cujo mecanismo letal consiste na:",
    options: ["Inibição da síntese de DNA", "Inibição da síntese proteica celular por inativação irreversível da subunidade ribossomal 60S", "Lise da membrana celular por saponinas", "Inibição da colinesterase"],
    correct: 1,
    explanation: "A cadeia A da ricina entra nas células e cliva um resíduo de adenina no rRNA 28S do ribossomo, interrompendo a tradução de proteínas celulares e causando morte celular.",
    apiFallback: false
  },
  {
    id: 189,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "A intoxicação grave por ingestão mastigada de sementes de Mamona (Ricina) manifesta-se clinicamente com:",
    options: ["Sonolência benigna", "Gastroenterite hemorrágica severa com perda massiva de fluidos, choque e necrose de órgãos", "Paralisia espástica ascendente", "Crises convulsivas sem diarreia"],
    correct: 1,
    explanation: "O epitélio intestinal sofre apoptose e necrose precoce, gerando vômitos incoercíveis, enterite necrótica, desidratação e insuficiência de múltiplos órgãos.",
    apiFallback: false
  },
  {
    id: 190,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "A Trombeteira ou Cartucheira (Brugmansia suaveolens) contém alcaloides tropânicos que deflagram no consumidor a toxidrome:",
    options: ["Síndrome colinérgica muscarínica", "Síndrome anticolinérgica (midríase fotofóbica, mucosas secas, hipertermia, taquicardia e delírio alucinatório)", "Síndrome simpaticolítica", "Síndrome opioide"],
    correct: 1,
    explanation: "A escopolamina e a atropina presentes na planta bloqueiam competitivamente os receptores muscarínicos em todo o corpo.",
    apiFallback: false
  },
  {
    id: 191,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "Os principais princípios ativos alucinógenos e tóxicos da planta Saia-Branca (Datura stramonium) são:",
    options: ["Hiosciamina, Atropina e Escopolamina", "Morfina e codeína", "Nicotina pura", "Tetrahidrocanabinol"],
    correct: 0,
    explanation: "A Datura stramonium é rica em alcaloides do tropano que promovem bloqueio parassimpático e intensa agitação alucinatória central.",
    apiFallback: false
  },
  {
    id: 192,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "A planta Touca-de-Frade (Aconitum napellus) contém o alcaloide Aconitina, que provoca cardiotoxicidade por atuar em:",
    options: ["Canais de cálcio lentos", "Canais de sódio voltagem-dependentes (mantendo-os abertos continuamente e gerando arritmias ventriculares fatais)", "Bomba de prótons miocárdica", "Receptores beta-adrenérgicos"],
    correct: 1,
    explanation: "A aconitina impede a inativação dos canais de sódio do músculo cardíaco e nervos periféricos, causando parestesias orais e taquicardia ventricular refratária.",
    apiFallback: false
  },
  {
    id: 193,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "A mastigação de folhas da planta ornamental Comigo-Ninguém-Pode (Dieffenbachia picta) causa dor e edema imediato devido à presença de:",
    options: ["Ráfides microscópicas de Oxalato de Cálcio que perfuram mecanicamente a mucosa oral associadas a enzimas proteolíticas", "Glicosídeos cianogênicos voláteis", "Ácido fórmico puro", "Alcaloides opiáceos"],
    correct: 0,
    explanation: "Os cristais pontiagudos de oxalato de cálcio atuam como agulhas que injetam cininas inflamatórias na língua e faringe, gerando edema que pode ocluir as vias aéreas.",
    apiFallback: false
  },
  {
    id: 194,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "A ingestão da planta Cicuta (Conium maculatum) induz paralisia respiratória flácida decorrente da ação da toxina Coniína sobre:",
    options: ["Receptores nicotínicos da placa motora (bloqueio despolarizante bifásico)", "Receptores muscarínicos centrais", "Bomba de sódio e potássio", "Inibição de colinesterases"],
    correct: 0,
    explanation: "A coniína tem estrutura análoga à nicotina; estimula e subsequentemente desensibiliza os receptores nicotínicos da junção neuromuscular, causando paralisia ascendente.",
    apiFallback: false
  },
  {
    id: 195,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "As sementes da planta Olho-de-Cabra (Abrus precatorius) contêm a potente toxina proteica Abrina, que age por meio de:",
    options: ["Inibição da síntese proteica celular por inativação do ribossomo (mecanismo similar ao da ricina)", "Inibição da acetilcolinesterase", "Bloqueio puramente adrenérgico", "Abertura dos canais de cloro"],
    correct: 0,
    explanation: "A abrina é uma toxalbumina citotóxica que inibe a tradução proteica ribosomal, apresentando potência de toxicidade celular ainda mais elevada que a ricina.",
    apiFallback: false
  },
  {
    id: 196,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "O tratamento farmacológico específico da intoxicação grave por Saia-Branca com delírio e agitação refratária baseia-se na:",
    options: ["Atropina", "Fisostigmina (antagonista anticolinérgico que reverte o quadro central)", "Neostigmina", "Naloxona"],
    correct: 1,
    explanation: "Como a Datura stramonium satura o cérebro de alcaloides anticolinérgicos, a fisostigmina cruza a BHE para recuperar a concentração de acetilcolina.",
    apiFallback: false
  },
  {
    id: 197,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "A ingestão aguda maciça de extratos concentrados de Guaraná ou Café pode deflagrar superdosagem de Cafeína, caracterizada por:",
    options: ["Sedação e hipotermia", "Taquicardia supraventricular/ventricular, tremores, hipocalemia, hiperglicemia e convulsões", "Hipotensão profunda com miose", "Bradicardia sinusal assintomática"],
    correct: 1,
    explanation: "O bloqueio de receptores de adenosina e a inibição de fosfodiesterases promovem descarga catecolaminérgica simpática acentuada e arritmias.",
    apiFallback: false
  },
  {
    id: 198,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "O consumo continuado da Samambaia-do-campo (Pteridium aquilinum) está correlacionado à carcinogenicidade devido à presença do princípio ativo:",
    options: ["Ptaquilosídeo (glicosídeo norsesquiterpênico carcinogênico)", "Coniína", "Ricina", "Oleandrina"],
    correct: 0,
    explanation: "O ptaquilosídeo é um agente carcinogênico natural que se converte em intermediário alquilante de DNA, associado a neoplasias de esôfago e bexiga em humanos e gado.",
    apiFallback: false
  },
  {
    id: 199,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "As sementes do Pinhão-Roxo ou Pinhão-de-Purga (Jatropha curcas) provocam grave gastroenterite tóxica em decorrência da toxalbumina:",
    options: ["Curcina (e ésteres de forbol)", "Escopolamina", "Aconitina", "Abrina"],
    correct: 0,
    explanation: "A curcina inibe a síntese de proteínas nas células mucosas gástricas, enquanto os ésteres de forbol causam efeito purgativo drástico e irritação tecidual.",
    apiFallback: false
  },
  {
    id: 200,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "O uso empírico abusivo da planta Cavalinha (Equisetum arvense) em chás medicinais pode induzir toxicidade caracterizada por:",
    options: ["Hipervitaminose A", "Deficiência de tiamina (Vitamina B1) decorrente da presença de tiaminases na planta", "Saturnismo crônico", "Anemia megaloblástica isolada"],
    correct: 1,
    explanation: "A enzima tiaminase degrada a vitamina B1 no trato digestivo, podendo precipitar manifestações neurológicas compatíveis com carência de tiamina.",
    apiFallback: false
  },
  {
    id: 201,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "A ingestão oral de extratos concentrados de Arnica (Arnica montana) é contraindicada pelo risco de toxicidade associada à lactona sesquiterpênica:",
    options: ["Helenalina (causando gastroenterite severa e cardiotoxicidade)", "Atropina", "Nicotina", "Ricina"],
    correct: 0,
    explanation: "A helenalina é citotóxica e irritante de mucosas; seu uso é restrito a formulações tópicas sobre pele íntegra.",
    apiFallback: false
  },
  {
    id: 202,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "O manejo terapêutico de emergência para intoxicações por plantas com glicosídeos cardiotônicos (como Adelfa/Espirradeira) compreende:",
    options: ["Administração de cálcio intravenoso em bolus", "Carvão ativado seriado, correção de hipocalemia/hipomagnesemia e fragmentos Fab antidigoxina nos casos graves", "Oxigenoterapia hiperbárica pura", "Uso profilático de verapamil"],
    correct: 1,
    explanation: "O carvão ativado impede a absorção continuada, o controle eletrolítico estabiliza o miocárdio e o Fab antidigoxina reverte a toxicidade por reatividade cruzada.",
    apiFallback: false
  },
  {
    id: 203,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "A planta Beladona (Atropa belladonna) é a fonte botânica clássica de qual alcaloide anticolinérgico?",
    options: ["Atropina", "Escopolamina pura", "Morfina", "Quinina"],
    correct: 0,
    explanation: "A Atropa belladonna sintetiza o alcaloide tropânico l-hiosciamina, que se racemiza em atropina durante a extração e atua como antagonista muscarínico.",
    apiFallback: false
  },
  {
    id: 204,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "A planta Dedaleira (Digitalis purpurea) é a fonte original dos fármacos digitálicos; sua intoxicação vegetal é tratada preferencialmente com:",
    options: ["Atropina isolada", "Fragmentos Fab de anticorpos antidigoxina", "Lidocaína profilática", "Propranolol"],
    correct: 1,
    explanation: "A dedaleira contém digitoxina e digoxina que bloqueiam a bomba de sódio cardíaca; o antídoto imune Fab captura as moléculas circulantes com alta afinidade.",
    apiFallback: false
  },
  {
    id: 205,
    module: "toxico",
    topic: "Plantas Tóxicas",
    question: "Plantas ornamentais como Tinhorão (Caladium bicolor) e Costela-de-Adão (Monstera deliciosa) compartilham a toxicidade local decorrente de:",
    options: ["Ráfides insolúveis de Oxalato de Cálcio provocando queimação oral e edema de mucosas", "Toxinas necróticas bacterianas", "Alcaloides pirrolizidínicos", "Metais pesados acumulados"],
    correct: 0,
    explanation: "A mastigação libera cristais espiculados de oxalato de cálcio contidos em idioblastos, injetando substâncias que inflamam o epitélio bucal e perilaringeo.",
    apiFallback: false
  },

  // =========================================================
  // TÓPICO 9: COGUMELOS VENENOSOS (206 a 220)
  // =========================================================
  {
    id: 206,
    module: "toxico",
    topic: "Cogumelos Venenosos",
    question: "O cogumelo tóxico Amanita phalloides ('cicuta verde' ou 'chapéu-da-morte') contém como toxinas letais primárias as:",
    options: ["Muscarina e psilocibina", "Amatoxinas (em especial alfa-amanitina) e Faloidinas", "Ácido ibotênico puro", "Giromitrina e orelanina"],
    correct: 1,
    explanation: "As amatoxinas são octapeptídeos bicíclicos termorresistentes responsáveis pela hepatotoxicidade fatal após a ingestão de cogumelos do gênero Amanita.",
    apiFallback: false
  },
  {
    id: 207,
    module: "toxico",
    topic: "Cogumelos Venenosos",
    question: "O mecanismo biológico letal da alfa-amanitina na célula eucariótica consiste na:",
    options: ["Inibição seletiva da RNA Polimerase II, bloqueando a síntese de mRNA e a transcrição gênica", "Lise da membrana mitocondrial externa", "Inativação da bomba de sódio ATPase", "Inibição irreversível da glicólise"],
    correct: 1,
    explanation: "A toxina paralisa a transcrição de RNA mensageiro; sem reposição de proteínas essenciais, os hepatócitos entram em apoptose e necrose generalizada.",
    apiFallback: false
  },
  {
    id: 208,
    module: "toxico",
    topic: "Cogumelos Venenosos",
    question: "A intoxicação por cogumelos contendo amatoxinas (Amanita phalloides) caracteriza-se clinicamente por um período de latência inicial assintomático de:",
    options: ["15 a 30 minutos", "6 a 24 horas (latência prolongada)", "1 a 2 horas exclusivamente", "3 a 5 dias"],
    correct: 1,
    explanation: "Sintomas gastrointestinais precoces (< 6 horas) costumam indicar cogumelos menos letais; a latência longa (> 6 a 12 horas) é marcador clínico clássico de amatoxinas.",
    apiFallback: false
  },
  {
    id: 209,
    module: "toxico",
    topic: "Cogumelos Venenosos",
    question: "Após a fase de latência, o quadro clínico inicial da intoxicação por Amanita phalloides caracteriza-se por:",
    options: ["Coma flácido imediato", "Fase gastrointestinal com vômitos profusos, dores abdominais e diarreia aquosa coleriforme", "Insuficiência renal anúrica indolor", "Convulsões em salvas sem diarreia"],
    correct: 1,
    explanation: "A toxina atinge o epitélio intestinal deflagrando enterite aguda severa com desidratação e distúrbios hidroeletrolíticos antes de atacar o parênquima hepático.",
    apiFallback: false
  },
  {
    id: 210,
    module: "toxico",
    topic: "Cogumelos Venenosos",
    question: "A fase tardia (2º ao 4º dia) da intoxicação por Amanita phalloides expressa-se clinicamente por:",
    options: ["Insuficiência hepática aguda fulminante com necrose maciça, icterícia, coagulopatia e encefalopatia", "Hipertensão maligna isolada", "Pneumonite intersticial fibrosante", "Anemia hemolítica transitória"],
    correct: 0,
    explanation: "O colapso da síntese proteica nos hepatócitos desencadeia elevação de transaminases a dezenas de milhares de U/L, coagulopatia e coma hepático.",
    apiFallback: false
  },
  {
    id: 211,
    module: "toxico",
    topic: "Cogumelos Venenosos",
    question: "O protocolo terapêutico de suporte específico farmacológico na intoxicação por Amanita phalloides preconiza o uso de:",
    options: ["Carvão ativado seriado, Silibinina (extrato de cardo-mariano), Penicilina G cristalina e N-Acetilcisteína", "Apenas flumazenil intravenoso", "Fisostigmina com hemodiálise", "Atropina em altas doses contínuas"],
    correct: 0,
    explanation: "A silibinina inibe a captação celular de amatoxinas pelos transportadores OATP1B3 dos hepatócitos; a penicilina compete pelos carreadores e a NAC atua como antioxidante.",
    apiFallback: false
  },
  {
    id: 212,
    module: "toxico",
    topic: "Cogumelos Venenosos",
    question: "Cogumelos dos gêneros Inocybe e Clitocybe possuem como princípio ativo tóxico predominante a:",
    options: ["Muscarina pura em alta concentração (síndrome colinérgica precoce)", "Psilocibina", "Alfa-amanitina", "Ácido ibotênico"],
    correct: 0,
    explanation: "A ingestão desses cogumelos deflagra sudorese profusa, salivação, lacrimejamento e bradicardia nas primeiras 2 horas devido ao excesso de muscarina.",
    apiFallback: false
  },
  {
    id: 213,
    module: "toxico",
    topic: "Cogumelos Venenosos",
    question: "A ingestão de cogumelos do gênero Psilocybe provoca alterações psíquicas e sensoriais alucinógenas decorrentes de seu metabólito ativo:",
    options: ["Psilocina (agonista de receptores serotoninérgicos 5-HT2A)", "Muscimol", "Ácido lisérgico puro", "Faloidina"],
    correct: 0,
    explanation: "A psilocibina é desfosforilada no trato digestivo em psilocina, que atua como agonista nos receptores corticais 5-HT2A, alterando a percepção espaço-temporal.",
    apiFallback: false
  },
  {
    id: 214,
    module: "toxico",
    topic: "Cogumelos Venenosos",
    question: "O antídoto específico para a síndrome colinérgica muscarínica deflagrada pela ingestão de cogumelos Inocybe é a:",
    options: ["Pralidoxima", "Atropina", "Naloxona", "Fisostigmina"],
    correct: 1,
    explanation: "A atropina antagoniza competitivamente os receptores muscarínicos estimulados diretamente pela muscarina fúngica.",
    apiFallback: false
  },
  {
    id: 215,
    module: "toxico",
    topic: "Cogumelos Venenosos",
    question: "O cogumelo Amanita muscaria (agárico-das-moscas) contém ácido ibotênico e muscimol, que provocam quadro caracterizado por:",
    options: ["Necrose hepática fulminante por amatoxinas", "Síndrome psicoativa/delirante com confusão mental, ataxia e alterações visuais (ação em receptores GABA-A e NMDA)", "Colite hemorrágica pura", "Paralisia flácida curariforme"],
    correct: 1,
    explanation: "O muscimol é um potente agonista dos receptores GABA-A cerebrais e o ácido ibotênico estimula receptores glutamatérgicos, gerando o quadro de intoxicação micoatropínica.",
    apiFallback: false
  },
  {
    id: 216,
    module: "toxico",
    topic: "Cogumelos Venenosos",
    question: "Cogumelos do gênero Cortinarius (como Cortinarius orellanus) contêm a toxina Orelanina, cujo órgão-alvo é o:",
    options: ["Parênquima renal (provocando nefrite túbulo-intersticial aguda e falência renal após latência de até 2 semanas)", "Miocárdio ventricular", "Tecido hepático exclusivo", "Córtex adrenal"],
    correct: 0,
    explanation: "A orelanina possui um período de latência assintomático de 3 a 14 dias, gerando lesão oxidativa seletiva nas células epiteliais tubulares renais com nefrite intersticial.",
    apiFallback: false
  },
  {
    id: 217,
    module: "toxico",
    topic: "Cogumelos Venenosos",
    question: "O cogumelo Gyromitra esculenta contém Giromitrina, que é hidrolisada in vivo gerando qual metabólito neurotóxico convulsivante?",
    options: ["Monometil-hidrazina (MMH)", "Metanol", "Ácido oxálico", "Gás cianídrico"],
    correct: 0,
    explanation: "A monometil-hidrazina reage com o fosfato de piridoxal (vitamina B6), inibindo a síntese de GABA cerebral e provocando convulsões refratárias e hepatotoxicidade.",
    apiFallback: false
  },
  {
    id: 218,
    module: "toxico",
    topic: "Cogumelos Venenosos",
    question: "No tratamento das convulsões induzidas pela ingestão de cogumelos do gênero Gyromitra, o fármaco indicado é a:",
    options: ["Atropina", "Piridoxina (Vitamina B6) intravenosa", "Naloxona", "Pralidoxima"],
    correct: 1,
    explanation: "A piridoxina exógena reconstitui a enzima ácido glutâmico descarboxilase inibida pela monometil-hidrazina, restaurando a síntese de GABA.",
    apiFallback: false
  },
  {
    id: 219,
    module: "toxico",
    topic: "Cogumelos Venenosos",
    question: "A recomendação toxicológica fundamental para prevenção de micetismo (envenenamento por cogumelos) é:",
    options: ["Ferver os cogumelos silvestres por 10 minutos para inativar qualquer toxina", "Não coletar nem consumir cogumelos colhidos na natureza sem identificação botânica especializada (o cozimento NÃO destrói amatoxinas)", "Consumir apenas com leite para neutralizar o veneno", "Provar pequenos fragmentos crus primeiro"],
    correct: 1,
    explanation: "Amatoxinas e outras micotoxinas são peptídeos termoestáveis que resistem ao calor, cozimento, congelamento e enzimas digestivas.",
    apiFallback: false
  },
  {
    id: 220,
    module: "toxico",
    topic: "Cogumelos Venenosos",
    question: "A confirmação laboratorial diagnóstica precoce de exposição a amatoxinas pode ser realizada por meio de:",
    options: ["Dosagem de alfa-amanitina na urina por imunoensaio (ELISA) nas primeiras 24 a 48 horas", "Hemograma com contagem de eosinófilos", "Eletrocardiograma basal", "Glicemia de jejum"],
    correct: 0,
    explanation: "A detecção de alfa-amanitina na urina confirma a ingestão do cogumelo letal antes do colapso enzimático hepático, orientando a intervenção com silibinina e NAC.",
    apiFallback: false
  },

  // =========================================================
  // TÓPICO 10: GASES E ASFIXIANTES (221 a 240)
  // =========================================================
  {
    id: 221,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "A inalação de Monóxido de Carbono (CO) resulta na ligação do gás à hemoglobina nos eritrócitos, gerando a formação de:",
    options: ["Meta-hemoglobina", "Carboxiemoglobina (COHb)", "Sulfoemoglobina", "Cianometemoglobina"],
    correct: 1,
    explanation: "O CO liga-se ao sítio ferroso heme com avidez cerca de 200 vezes superior à do oxigênio, formando a carboxiemoglobina e bloqueando o transporte de O2.",
    apiFallback: false
  },
  {
    id: 222,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "Na intoxicação aguda grave por Monóxido de Carbono, níveis plasmáticos de Carboxiemoglobina (COHb) superiores a 40-50% associam-se a:",
    options: ["Cefaleia leve transitória", "Coma, crises convulsivas, isquemia miocárdica e óbito iminente", "Taquicardia isolada sem repercussão", "Parestesia nos pés exclusiva"],
    correct: 1,
    explanation: "Níveis elevados de COHb acarretam colapso no fornecimento tecidual de oxigênio e inibição da citocromo oxidase mitocondrial cerebral e cardíaca.",
    apiFallback: false
  },
  {
    id: 223,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "A indicação formal de Oxigenoterapia Hiperbárica (OHB) na intoxicação por Monóxido de Carbono é estabelecida na presença de:",
    options: ["COHb > 25% (ou > 15% em gestantes), perda de consciência, acidose metabólica grave ou isquemia miocárdica", "Qualquer paciente com cefaleia leve", "Apenas pacientes acima de 80 anos", "Níveis de COHb < 5%"],
    correct: 0,
    explanation: "A OHB dissolve oxigênio diretamente no plasma e acelera a dissociação do CO da hemoglobina e da citocromo oxidase, reduzindo sequelas neurológicas tardias.",
    apiFallback: false
  },
  {
    id: 224,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "O Gás Cianídrico (Cianeto de Hidrogênio - HCN) atua como asfixiante celular histotóxico inibindo qual enzima mitocondrial?",
    options: ["ATP sintase mitocondrial pura", "Citocromo c oxidase (complexo IV da cadeia transportadora de elétrons)", "Glicose-6-fosfatase", "Citrato sintase"],
    correct: 1,
    explanation: "Ao fixar-se no ferro férrico (Fe3+) da enzima citocromo oxidase, o cianeto interrompe o transporte de elétrons para o oxigênio e a produção aeróbia de ATP celular.",
    apiFallback: false
  },
  {
    id: 225,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "O odor característico descrito classicamente na intoxicação por gases ou sais de Cianeto é de:",
    options: ["Ovo podre", "Amêndoas amargas", "Alho queimado", "Pimenta verde"],
    correct: 1,
    explanation: "O cianeto de hidrogênio exala odor penetrante de amêndoas amargas, cuja capacidade olfatória de detecção é determinada geneticamente.",
    apiFallback: false
  },
  {
    id: 226,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "Gases como Dióxido de Carbono (CO2 em concentrações elevadas), Metano e Nitrogênio atuam como Asfixiantes Simples porque:",
    options: ["Inibem o transporte de elétrons nos eritrócitos", "Deslocam mecanicamente o Oxigênio do ar ambiental, reduzindo a fração inspirada (FiO2) abaixo de níveis fisiológicos", "Causam broncoespasmo colinérgico imediato", "Provocam necrose pulmonar direta"],
    correct: 1,
    explanation: "Asfixiantes simples são quimicamente inertes no organismo; a asfixia decorre da redução física da pressão parcial de oxigênio no ar inspirado em ambientes confinados.",
    apiFallback: false
  },
  {
    id: 227,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "O Gás Sulfídrico (H2S), em baixas concentrações atmosféricas, é prontamente reconhecido pelo seu forte odor de:",
    options: ["Amêndoas amargas", "Ovo podre", "Frutas doces", "Cloro ativo"],
    correct: 1,
    explanation: "O H2S exala odor fétido de matéria orgânica em decomposição ('ovo podre'); contudo, em concentrações tóxicas elevadas (> 100 ppm) causa paralisia olfatória súbita.",
    apiFallback: false
  },
  {
    id: 228,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "A intervenção antidótica de resgate na intoxicação aguda grave por Gás Sulfídrico (H2S) pode incluir o uso de:",
    options: ["Indutores de metemoglobinemia (como Nitrito de Sódio) ou Hidroxocobalamina", "Flumazenil intravenoso", "Naloxona em altas doses", "Azul de metileno profilático"],
    correct: 0,
    explanation: "A indução de metemoglobina atrai o sulfeto livre ligando-se a ele como sulfometemoglobina, liberando a enzima citocromo c oxidase mitocondrial nos tecidos.",
    apiFallback: false
  },
  {
    id: 229,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "O Gás Cloro (Cl2), liberado em acidentes industriais ou pela mistura caseira de alvejantes com ácidos, é um gás irritante que reage na via aérea formando:",
    options: ["Ácido Clorídrico (HCl) e Ácido Hipocloroso (HOCl)", "Ácido sulfídrico puro", "Ácido nítrico", "Gás mostarda"],
    correct: 0,
    explanation: "A umidade das mucosas reage com o cloro liberando ácidos corrosivos que deflagram edema de laringe, traqueobronquite necrotizante e pneumonite química.",
    apiFallback: false
  },
  {
    id: 230,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "A inalação aguda de vapor concentrado de Amônia (NH3) acarreta grave lesão em vias aéreas devido à sua natureza:",
    options: ["Ácida com necrose de coagulação pura", "Alcalina cáustica, formando hidróxido de amônio com necrose de liquefação da mucosa respiratória", "Puramente asfixiante simples sem irritação", "Indutora de meta-hemoglobinemia"],
    correct: 1,
    explanation: "O gás amônia dissolve-se rapidamente na água tecidual gerando uma base cáustica forte que penetra as paredes brônquicas, gerando laringoespasmo e edema pulmonar.",
    apiFallback: false
  },
  {
    id: 231,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "O Dióxido de Nitrogênio (NO2), gás de baixa solubilidade em água presente na fumaça de queima e silos agrícolas, apresenta a coloração visual característica:",
    options: ["Totalmente incolor e inodoro", "Castanho-avermelhada (gás marrom)", "Azul brilhante", "Esverdeada"],
    correct: 1,
    explanation: "O NO2 é um gás denso de tonalidade marrom-avermelhada com odor acre sufocante, originado da combustão de compostos nitrogenados e fermentação em silos de grãos.",
    apiFallback: false
  },
  {
    id: 232,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "A chamada 'Doença dos Enchedores de Silos' (inalação de óxidos de nitrogênio, como NO2) manifesta-se tipicamente com:",
    options: ["Edema agudo de pulmão tardio e bronquiolite obliterante que surgem 12 a 72 horas após a exposição inicial", "Necrose tubular renal primária", "Paralisia flácida imediata", "Aplasia pura de medula óssea"],
    correct: 0,
    explanation: "Por ser relativamente insolúvel nas vias aéreas superiores, o NO2 alcança os bronquíolos terminais e alvéolos, desencadeando dano inflamatório fibrótico tardio.",
    apiFallback: false
  },
  {
    id: 233,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "O Ozônio (O3), poluente atmosférico fotoquímico e agente oxidante potente, atua fisiopatologicamente no trato respiratório por meio de:",
    options: ["Peroxidação lipídica das membranas celulares epiteliais e ativação de cascatas inflamatórias nos bronquíolos", "Bloqueio neuromuscular nicotínico", "Alcalose metabólica direta", "Inibição de colinesterases"],
    correct: 0,
    explanation: "O ozônio gera radicais livres na camada de fluido alveolar, lesionando macrófagos e pneumócitos tipo I e deflagrando hiper-reatividade brônquica.",
    apiFallback: false
  },
  {
    id: 234,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "A inalação do Gás Fosfina (PH3), gerado por inseticidas de fosfetos metálicos expostos à umidade, provoca colapso orgânico agudo por:",
    options: ["Inibição da cadeia respiratória celular mitocondrial e peroxidação lipídica, cursando com edema pulmonar e arritmias ventriculares", "Hepatite viral fulminante", "Bloqueio alfa-1 puro", "Sedação profunda benéfica"],
    correct: 0,
    explanation: "A fosfina inibe o complexo IV da cadeia respiratória celular e o sistema antioxidante da catalase, gerando estresse oxidativo severo no coração e pulmões.",
    apiFallback: false
  },
  {
    id: 235,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "O manejo clínico da intoxicação inalatória por Fosfina (PH3) baseia-se prioritariamente em:",
    options: ["Suporte hemodinâmico intensivo, ventilação mecânica invasiva e Sulfato de Magnésio para conter arritmias ventriculares refratárias", "Administração de antídoto enzimático específico oral", "Lavagem alveolar com bicarbonato", "Uso contínuo de pralidoxima"],
    correct: 0,
    explanation: "Não há antídoto neutralizante para a fosfina; o sulfato de magnésio atua como antioxidante e estabilizador eletrofisiológico miocárdico contra taquiarritmias letais.",
    apiFallback: false
  },
  {
    id: 236,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "O Gás Mostarda de Enxofre, agente químico de guerra de ação vesicante, atua lesando tecidos através de:",
    options: ["Alquilação de bases do DNA e ativação da enzima poli(ADP-ribose) polimerase (PARP), levando à morte celular e necrose epitelial", "Bloqueio do receptor GABA-A", "Inibição do transporte de elétrons nos eritrócitos", "Ação anticolinesterásica pura"],
    correct: 0,
    explanation: "Forma íons sulfônio cíclicos altamente reativos que alquilam a guanina no DNA; as tentativas celulares frustradas de reparo esgotam o NAD+ e ATP, gerando necrose e vesículas.",
    apiFallback: false
  },
  {
    id: 237,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "A inalação de fumos de soldagem contendo óxidos metálicos finos (como óxido de zinco ou cobre) provoca no operador a síndrome de:",
    options: ["Febre dos Fumos Metálicos (caracterizada por febre, mialgias, gosto metálico na boca, calafrios e leucocitose autolimitados)", "Asma crônica irreversível imediata", "Encefalopatia saturnina fulminante", "Silicose aguda"],
    correct: 0,
    explanation: "A deposição alveolar de nanopartículas de óxido metálico recém-formadas induz liberação aguda de pirógenos endógenos pulmonares, gerando quadro que simula gripe.",
    apiFallback: false
  },
  {
    id: 238,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "A inalação de Dióxido de Carbono (CO2) em concentrações atmosféricas críticas (> 10-15%) provoca distúrbio acidobásico e neurológico agudo marcado por:",
    options: ["Acidose respiratória hipercapnocárdica severa com depressão do centro respiratório e narcose", "Alcalose metabólica por perda de cloreto", "Hiperventilação compensatória eterna", "Poliúria osmótica"],
    correct: 0,
    explanation: "A hipercapnia aguda maciça acidifica o líquor e o plasma, deprime a excitabilidade neuronal central e conduz ao coma com parada respiratória.",
    apiFallback: false
  },
  {
    id: 239,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "O Gás Radônio (Rn-222), emanado do decaimento radioativo natural do rádio e urânio no solo e rochas em ambientes fechados, é carcinógeno associado ao:",
    options: ["Câncer de Pulmão", "Câncer de Bexiga", "Carcinoma de Células Renais", "Hepatocarcinoma"],
    correct: 0,
    explanation: "A inalação de seus produtos de decaimento emissores de radiação alfa atinge o epitélio brônquico, constituindo a segunda causa de neoplasia pulmonar após o tabagismo.",
    apiFallback: false
  },
  {
    id: 240,
    module: "toxico",
    topic: "Gases e Asfixiantes",
    question: "No atendimento pré-hospitalar de vítimas de incêndio com fumaça e rebaixamento do sensório, a abordagem empírica conjunta preconizada consiste em:",
    options: ["Oxigênio a 100% em máscara com reservatório (para monóxido de carbono) associado à Hidroxocobalamina intravenosa (para intoxicação por cianeto)", "Apenas ventilação com ar ambiente simples", "Infusão exclusiva de bicarbonato de sódio a 8,4%", "Administração de naloxona isolada"],
    correct: 0,
    explanation: "A fumaça de queima de materiais sintéticos libera simultaneamente CO e HCN; o oxigênio hiperoxigena a hemoglobina e a hidroxocobalamina quela o cianeto sem piorar a hipóxia tecidual.",
    apiFallback: false
  }
];
