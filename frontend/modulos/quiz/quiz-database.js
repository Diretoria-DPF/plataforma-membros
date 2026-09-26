/**
 * REPOSITÓRIO PEDAGÓGICO DE FARMACOLOGIA (LAIFT)
 */
const QUIZ_FARMACOLOGIA_DB = [
  {
    id: "farmaco_01",
    modulo: "Farmacodinâmica & AINEs",
    farmacoAlvo: "Aspirina",
    smiles: "CC(=O)OC1=CC=CC=C1C(=O)O", // Projeta no canvas via SmilesDrawer
    pubchemCid: 2244,
    nivel: "Intermediário",
    enunciado: "Um paciente de 58 anos em terapia antiplaquetária profilática utiliza ácido acetilsalicílico (AAS) em dose baixa (100 mg/dia). Em relação ao mecanismo farmacodinâmico diferencial do AAS frente aos outros AINEs tradicionais (como o ibuprofeno), assinale a afirmativa correta:",
    alternativas: [
      {
        letra: "A",
        texto: "O AAS inibe reversivelmente a ciclo-oxigenase 1 (COX-1) por competição estérica pelo sítio ativo da enzima.",
        correta: false,
        feedback: "Incorreto. A inibição reversível e competitiva é característica de outros AINEs (como ibuprofeno e naproxeno). O AAS atua por modificação covalente."
      },
      {
        letra: "B",
        texto: "O AAS acetila irreversivelmente o resíduo de serina (Ser-529) da COX-1, impedindo a síntese plaquetária de tromboxano A2 (TXA2) durante toda a vida útil da plaqueta.",
        correta: true,
        feedback: "Correto! O AAS transfere seu grupo acetil covalentemente para a Serina-529 no canal hidrofóbico da COX-1. Como as plaquetas são anucleadas e incapazes de sintetizar novas enzimas, a supressão do TXA2 perdura por toda a sobrevida celular (7 a 10 dias)."
      },
      {
        letra: "C",
        texto: "A seletividade antiplaquetária decorre da inibição exclusiva da COX-2 endotelial, mantendo preservada a prostaciclina (PGI2).",
        correta: false,
        feedback: "Incorreto. O endotélio expressa COX-1 e COX-2 e possui núcleo celular para regenerar a enzima; já o efeito antitrombótico depende da supressão da COX-1 plaquetária."
      },
      {
        letra: "D",
        texto: "A sua ação antiplaquetária exige a metabolização hepática prévia em salicilato livre, metabólito que exerce a inibição da COX.",
        correta: false,
        feedback: "Incorreto. O ácido salicílico desacetilado não possui o grupo acetil necessário para inativar irreversivelmente a enzima plaquetária."
      }
    ],
    analogiaDidatica: "Pense na enzima COX-1 como uma fechadura e no substrato (ácido araquidônico) como a chave. A maioria dos AINEs apenas entra na fechadura e bloqueia a passagem temporariamente. O AAS quebra a ponta da chave dentro da fechadura: a enzima nunca mais abre a porta até que o organismo fabrique uma nova fechadura (nova plaqueta)."
  },
  {
    id: "farmaco_02",
    modulo: "Farmacocinética & Metabolismo",
    farmacoAlvo: "Paracetamol",
    smiles: "CC(=O)NC1=CC=C(O)C=C1",
    pubchemCid: 1983,
    nivel: "Avançado",
    enunciado: "Em doses terapêuticas, o paracetamol é metabolizado primariamente por glicuronidação e sulfatação hepática. Em casos de sobredose aguda, ocorre saturação dessas vias e desvio metabólico significativo. Qual é o intermediário reativo gerado e qual a base racional para o uso da N-acetilcisteína (NAC) como antídoto?",
    alternativas: [
      {
        letra: "A",
        texto: "Formação de ácido homogentísico via CYP2D6; a NAC atua como inibidor competitivo dessa isoenzima.",
        correta: false,
        feedback: "Incorreto. O metabólito hepatotóxico não é o ácido homogentísico e a via não envolve predominantemente a CYP2D6."
      },
      {
        letra: "B",
        texto: "Oxidação pelo CYP2E1 gerando N-acetil-p-benzoquinona imina (NAPQI); a NAC restaura os níveis de glutationa hepática e fornece grupamentos sulfidrila para conjugar o NAPQI.",
        correta: true,
        feedback: "Correto! O excesso de paracetamol satura as vias de Fase II e é oxidado pelo CYP2E1 gerando NAPQI, um metabólito altamente eletrofílico. Ao esgotar os estoques de glutationa endógena, o NAPQI causa necrose centrolobular. A NAC atua repondo os estoques de cisteína necessários para a síntese de glutationa e neutralizando diretamente o metabólito."
      },
      {
        letra: "C",
        texto: "Acúmulo de ácido mercaptúrico no parênquima hepático; a NAC alcaliniza o meio para acelerar a excreção renal.",
        correta: false,
        feedback: "Incorreto. O ácido mercaptúrico é o produto final de eliminação atóxico da conjugação do NAPQI com a glutationa, e não a causa da toxicidade."
      },
      {
        letra: "D",
        texto: "Hidrólise direta em anilina livre; a NAC atua quelando os íons ferro livres gerados pela lise celular.",
        correta: false,
        feedback: "Incorreto. A principal via de toxificação não é a hidrólise em anilina, mas a oxidação mediada pelo citocromo P450 (CYP2E1)."
      }
    ],
    analogiaDidatica: "A glutationa é o caminhão de lixo do fígado que recolhe o material perigoso (NAPQI). Na sobredose, o lixo transborda porque os caminhões acabam. A N-acetilcisteína funciona como o combustível de emergência que monta uma frota nova de caminhões de limpeza a tempo de salvar as células."
  },
  {
    id: "farmaco_03",
    modulo: "Sistema Nervoso Autônomo",
    farmacoAlvo: "Propranolol",
    smiles: "CC(C)NCC(O)COC1=CC=CC2=CC=CC=C12",
    pubchemCid: 4946,
    nivel: "Básico",
    enunciado: "O propranolol é classificado como um antagonista adrenérgico não seletivo. Qual das seguintes manifestações clínicas representa uma contraindicação clássica ao seu uso, diretamente explicada pelo bloqueio de receptores beta-2 periféricos?",
    alternativas: [
      {
        letra: "A",
        texto: "Hipertensão arterial primária descompensada.",
        correta: false,
        feedback: "Incorreto. O bloqueio beta-1 reduz débito cardíaco e secreção de renina, sendo útil no controle pressórico."
      },
      {
        letra: "B",
        texto: "Crise aguda de asma brônquica ou DPOC grave.",
        correta: true,
        feedback: "Correto! Os receptores beta-2 na musculatura lisa brônquica medeiam a broncodilatação via elevação de AMPc intracelular. O bloqueio beta-2 pelo propranolol impede essa resposta e desencadeia broncoespasmo grave em pacientes suscetíveis."
      },
      {
        letra: "C",
        texto: "Taquicardia sinusal persistente com palpitações.",
        correta: false,
        feedback: "Incorreto. O propranolol é frequentemente indicado para controle de frequência em taquiarritmias por seu efeito cronotrópico negativo mediado por beta-1."
      },
      {
        letra: "D",
        texto: "Tremor essencial de extremidades.",
        correta: false,
        feedback: "Incorreto. O tremor essencial responde favoravelmente aos betabloqueadores, sendo uma das indicações clínicas comuns do propranolol."
      }
    ],
    analogiaDidatica: "Receptores beta-1 são o 'acelerador do coração', enquanto beta-2 são a 'chave de abertura das vias aéreas'. O propranolol é um bloqueador genérico: ele diminui o acelerador cardíaco (desejado), mas acidentalmente fecha as comportas dos pulmões (perigoso para asmáticos)."
  }
];
