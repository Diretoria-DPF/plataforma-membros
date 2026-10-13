/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * agents/guardrails/clinicalScope.js
 * Escopo clínico do tutor (regras I5, I6 e I7). PRÓPRIO dos agentes: NÃO reutiliza assistant/questionKind.js,
 * que bloqueia dose e conduta de propósito (certo para a Lia, errado para quem precisa explicar mecanismo e
 * toxicidade). Aqui o conceito PASSA e três coisas não:
 *   I5  caso pessoal ou real (o próprio estudante, família, "meu paciente"; emergência manda ao SAMU 192);
 *   I6  dose individualizada ou posologia (a decisão do dono é dose estrita: o tutor nunca dá número);
 *   I7  assunto fora de farmacologia, toxicologia e ciências da saúde.
 *
 * Funções PURAS sobre texto já dobrado por rules.fold (minúsculo, sem acento). Regex lineares.
 */
import { withoutDoseConcepts } from './rules.js';

// ---------------------------------------------------------------------------
// I5 — emergência, autolesão e caso pessoal ou real
// ---------------------------------------------------------------------------
const SELF_HARM = [
  /\b(?:quero|vou|penso em|pensando em|tentei|vontade de)\s+(?:me matar|me suicidar|suicid\w{0,10}|tirar minha vida|acabar com a minha vida|acabar com tudo)\b/,
  /\bnao quero mais viver\b/,
];

const EMERGENCY = [
  /\b(?:esta|estao|ta|tao|estava)\s+(?:passando mal|convulsionando|desmaiad[oa]s?|inconscientes?|sem respirar|sem pulso)\b/,
  /\b(?:parou de respirar|parou de responder|nao respira|nao esta respirando|nao acorda|nao responde|perdeu a consciencia|desmaiou|convulsionou|engasgou)\b/,
  /\b(?:overdose|intoxicad[oa]|envenenad[oa])\b.{0,30}\b(?:agora|neste momento|neste instante|aqui comigo|aqui em casa|hoje)\b/,
  /\b(?:acabou de|acabei de|acabamos de)\s+(?:tomar|ingerir|engolir|beber|usar|cheirar|injetar)\b/,
  /\b(?:preciso de|preciso)\s+(?:ajuda|socorro)\s+(?:urgente|agora)\b/,
  /\b(?:socorro|me ajudem|ajuda urgente)\b/,
];

const PERSONAL = [
  /\b(?:tomei|ingeri|engoli|injetei|cheirei|fumei|bebi)\b/,
  /\b(?:ele|ela|eles|elas)\s+(?:tomou|ingeriu|engoliu|bebeu|usou|passou mal|tomaram|ingeriram)\b/,
  /\b(?:meu|minha|meus|minhas)\s+(?:filh[oa]s?|bebe|crianca|mae|pai|avo|irma[oa]|primo|prima|tio|tia|namorad[oa]|espos[oa]|marido|mulher|amig[oa]|colega|vizinh[oa]|paciente|pacientes|cachorro|gato|familiar)\b/,
  /\b(?:estou|estamos|to|tou|me sinto|estou sentindo|sinto|tenho)\s+(?:com\s+)?(?:dor|febre|enjoo|nausea|tontura|vomito|diarreia|falta de ar|palpitac\w{0,6}|dormencia|coceira|alergia|sintomas?|mal)\b/,
  /\bestou\s+(?:gravida|amamentando|doente|tomando|usando|medicad\w{1,5})\b/,
  /\b(?:posso|devo|deveria)\s+(?:eu\s+)?(?:tomar|usar|misturar|associar|combinar|ingerir|dar|parar de tomar|parar de usar|suspender|trocar)\b/,
  /\b(?:o que|oque)\s+(?:eu\s+)?(?:devo|posso)\s+fazer\b/,
  /\b(?:no meu|em meu|no nosso)\s+(?:plantao|estagio|hospital|setor|servico|posto|ubs|upa|consultorio)\b/,
  /\b(?:atendi|atendendo|recebi|internei)\b.{0,40}\bpaciente\b/,
  /\bpaciente\s+(?:que atendi|do leito|do plantao|da enfermaria|aqui comigo|aqui no)\b/,
  /\bleito\s+\d{1,3}\b/,
  /\bmeus?\s+(?:exames?|resultados?|sintomas?|quadro|caso|receita|remedios?|medicamentos?)\b/,
];

/** 'self_harm' | 'emergency' | null */
export function emergencyKind(folded) {
  if (SELF_HARM.some((re) => re.test(folded))) return 'self_harm';
  return EMERGENCY.some((re) => re.test(folded)) ? 'emergency' : null;
}

export function isPersonalCase(folded) {
  return PERSONAL.some((re) => re.test(folded));
}

// ---------------------------------------------------------------------------
// I6 — dose individualizada e posologia
// ---------------------------------------------------------------------------
const UNITS = '(?:mg|mcg|ug|g|gramas?|miligramas?|microgramas?|ml|mililitros?|ui|meq|comprimidos?|capsulas?|gotas?|ampolas?|colheres?)';
const DOSE_ADJ = '(?:(?:menor|maior|melhor|real|exata|correta|certa|ideal|maxima|minima|segura|toxica|letal|habitual|usual|diaria|total|media|inicial|de ataque|de manutencao)\\s+){0,2}';
const DOSE_WORD = '(?:dose|doses|posologia|dosagem)';

// FORTES: pedem o número (ou trazem um): recusa sempre.
const DOSE_STRONG = [
  new RegExp('\\b(?:qual|quais|quanto|quantos|quantas)\\s+(?:e |sao |seria )?(?:(?:a|as|o|os|uma|um)\\s+)?' + DOSE_ADJ + DOSE_WORD + '\\b'),
  /\bque dose\b/,
  new RegExp('\\b(?:quantos|quantas)\\b.{0,30}\\b' + UNITS + '\\b'),
  new RegExp('\\b\\d+(?:[.,]\\d+)?\\s?' + UNITS + '\\b'),
  /\b(?:de quanto em quanto tempo|a cada quantas horas|de quantas em quantas horas|quantas vezes (?:por|ao) dia)\b/,
  /\b(?:dose|doses|dar|dou|administr\w{1,6}|prescrev\w{1,6}|receit\w{1,6})\b.{0,40}\b\d+(?:[.,]\d+)?\s?(?:kg|quilos?)\b/,
  /\b\d+(?:[.,]\d+)?\s?(?:kg|quilos?)\b.{0,40}\b(?:dose|doses|dar|dou|administr\w{1,6}|prescrev\w{1,6}|receit\w{1,6})\b/,
  /\b(?:prescreva|receite|indique|recomende|sugira)\b.{0,30}\b(?:dose|medicamento|remedio|tratamento|antibiotico|analgesico)\b/,
  new RegExp('\\b(?:me diga|me passe|informe|passe|fale|diga|mostre|quero saber|preciso saber)\\b.{0,25}\\b' + DOSE_WORD + '\\b'),
  new RegExp('\\bqual (?:a )?quantidade\\b.{0,30}\\b' + UNITS + '\\b'),
];

// FRACAS: frase nominal ("dose letal do X", "dose de X em adulto"). Perguntas de conceito ("mecanismo", "por que",
// "como", "explique") deixam passar: a saída (O3) garante que nenhum número chegue ao estudante.
const DOSE_WEAK = [
  new RegExp('\\b' + DOSE_WORD + '\\s+(?:maxima|minima|letal|toxica|terapeutica|segura|ideal|correta|habitual|usual|pediatrica|recomendad[ao]|adequad[ao])\\s+(?:de|do|da|dos|das|para)\\b'),
  /\b(?:dose|doses|posologia|dosagem)\s+(?:de|do|da|dos|das)\s+\w{3,30}\b.{0,40}\b(?:em|para|no|na|nos|nas)\s+(?:adultos?|criancas?|idosos?|bebes?|gestantes?|pacientes?|neonatos?|lactentes?|recem nascidos?)\b/,
  /^\s*(?:dose|posologia|dosagem)\s+(?:de|do|da)\b/,
];
const CONCEPT_CUE = /\b(?:mecanismo|por que|porque|como|explique|explica|explicar|defina|conceito|o que e|o que significa|diferenca|significa)\b/;

export function isDoseRequest(folded) {
  const text = withoutDoseConcepts(folded);
  if (DOSE_STRONG.some((re) => re.test(text))) return true;
  return !CONCEPT_CUE.test(text) && DOSE_WEAK.some((re) => re.test(text));
}

// ---------------------------------------------------------------------------
// I7 — fora de escopo: só recusa o que é claramente de outro assunto E sem termo do domínio
// ---------------------------------------------------------------------------
const DOMAIN = /farmac|toxic|toxi|veneno|antidot|medicament|remedio|droga|receptor|enzima|metabol|cinetic|dinamic|agonist|antagonist|inibidor|bula|dose|biodisponib|clearance|meia ?vida|hepat|renal|figado|rim\b|sangue|plasma|celul|anatomi|fisiolog|patolog|clinic|saude|hospital|paciente|enfermag|medic|laborat|molecul|quimic|colinergic|adrenergic|gaba|opioid|benzodiazep|antibio|penicil|inflamat|analgesic|anestesic|vacina|infecc|sintoma|doenca|diagnost|terap|tratament|organofosforad|paracetamol|atropina|naloxona|intoxic|overdose|cobra|escorpiao|aranha/;
const OFF_TOPIC = [
  /\b(?:python|javascript|typescript|html|css|react|nodejs|programar|programacao|codigo fonte|algoritmo|compilador|planilha de excel)\b/,
  /\b(?:futebol|campeonato|copa do mundo|filme|serie de tv|novela|cantor|cantora|videogame|minecraft|fortnite|bbb|horoscopo|signo|piada|poema|poesia|letra da musica|jogo do)\b/,
  /\b(?:eleicao|eleicoes|presidente da republica|partido politico|candidato|bolsonaro|lula|religiao|deus existe)\b/,
  /\b(?:bitcoin|criptomoeda|acoes da bolsa|investimento|imposto de renda|financiamento|divorcio|processo judicial)\b/,
  /\b(?:escreva|faca|redija|crie)\b.{0,25}\b(?:redacao|tcc|monografia|carta|discurso|poema|musica)\b/,
  /\b(?:receita de|viagem|passagem aerea|hotel|restaurante|culinaria|bolo de)\b/,
  /\b(?:traduza|traducao de)\b/,
  /\b(?:capital d[aeo]|previsao do tempo|cotacao do|quantos habitantes|resultado d[oa] (?:jogo|partida))\b/,
];

export function isOutOfScope(folded) {
  return !DOMAIN.test(folded) && OFF_TOPIC.some((re) => re.test(folded));
}
