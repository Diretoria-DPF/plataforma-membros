/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * ai/safetyBlocklist.js
 * Lista de bloqueio determinística, aplicada no servidor ANTES de qualquer chamada à IA no
 * Preceptor do laboratório. Cobre agentes de guerra química, biológica e radiológica e pedidos
 * de síntese de drogas ilícitas. Não depende do prompt nem do modelo: o texto é normalizado
 * (sem acento, minúsculo, sem pontuação) e comparado com termos e padrões fixos.
 *
 * Quando bate, o Preceptor responde com texto educacional fixo (mecanismo, sinais, antídoto,
 * descontaminação, legislação), sem rota, reagente, quantidade ou condição.
 */

/** Agentes cuja menção, em qualquer contexto, recebe a resposta educacional fixa. */
const AGENT_TERMS = [
  // Química (agentes de guerra)
  'sarin', 'soman', 'tabun', 'ciclosarin', 'cyclosarin', 'novichok', 'agente nervoso', 'nerve agent',
  'gas mostarda', 'mostarda sulfurada', 'sulfur mustard', 'mustard gas', 'iperita', 'yperite', 'lewisita', 'lewisite',
  'cloropicrina', 'chloropicrin', 'difosgenio', 'diphosgene', 'fosgenio', 'phosgene', 'carbonyl dichloride',
  'dicloreto de carbonila', 'cloreto de carbonila', 'cianeto de hidrogenio', 'hydrogen cyanide', 'acido cianidrico',
  'hydrocyanic acid', 'cloreto de cianogenio', 'cyanogen chloride', 'methylphosphonofluoridate', 'bz agent', 'gas de guerra', 'arma quimica',
  'chemical weapon', 'chemical warfare',
  // Biológica
  'antraz', 'anthrax', 'bacillus anthracis', 'ricina', 'ricin', 'abrina', 'abrin', 'variola', 'smallpox',
  'yersinia pestis', 'peste pneumonica', 'tularemia', 'francisella tularensis', 'arma biologica', 'biological weapon',
  'bioweapon', 'bioarma', 'enterotoxina estafilococica',
  // Radiológica / nuclear
  'bomba suja', 'dirty bomb', 'arma radiologica', 'radiological weapon', 'enriquecimento de uranio', 'uranium enrichment',
  'arma nuclear', 'nuclear weapon', 'polonio 210',
];

/** Siglas curtas: exigem palavra inteira para não casar dentro de outras palavras. */
const AGENT_WORDS = ['vx', 'gb', 'ga', 'gd', 'gf', 'vr', 'hd'];
/** Cloro em si é insumo comum: só bloqueia quando o texto o põe como arma ou gás de guerra. */
const CHLORINE_WEAPON = /\b(cloro|chlorine)\b.*\b(arma|armas|weapon|weapons|guerra|war|combate|ataque|attack)\b|\b(arma|armas|weapon|weapons|guerra|war|combate|ataque|attack)\b.*\b(cloro|chlorine)\b/;
const AGENT_WORD_CONTEXT = /\b(agente|agent|nerv\w*|guerra|war|chemical|quimic\w*)\b/;

/** Drogas ilícitas e opioides/estimulantes de alto abuso: bloqueadas quando o pedido é de produção. */
const ILLICIT_DRUGS = [
  'metanfetamina', 'methamphetamine', 'meth', 'anfetamina ilicita', 'cocaina', 'cocaine', 'crack', 'heroina', 'heroin',
  'lsd', 'dietilamida do acido lisergico', 'mdma', 'ecstasy', 'extase', 'fentanil', 'fentanyl', 'carfentanil', 'carfentanila',
  'dmt', 'ghb', 'gbl', 'pcp', 'fenciclidina', 'mefedrona', 'mephedrone', 'cathinone', 'catinona', 'nitazeno', 'nitazene',
  'bath salts', 'sais de banho',
];
const SYNTHESIS_INTENT = [
  'sintese', 'sintetiz', 'synthes', 'sintese de', 'produzir', 'producao', 'fabric', 'manufactur', 'cozinh', 'cook',
  'preparar', 'preparo', 'obter', 'rota', 'route', 'receita', 'recipe', 'passo a passo', 'step by step', 'como fazer',
  'how to make', 'how to produce', 'como se faz', 'extrair', 'extracao', 'clandestin', 'caseir', 'homemade', 'precursor',
  'rendimento', 'reagentes necessarios',
];

/** Texto em minúsculo, sem acento, apenas letras/números/espaços simples. */
export function normalizeForSafety(input) {
  return String(input === undefined || input === null ? '' : input)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasPhrase(padded, phrase) {
  return padded.includes(' ' + phrase + ' ');
}

function mentionsAgent(norm) {
  const padded = ' ' + norm + ' ';
  const squashed = norm.replace(/ /g, '');
  for (const term of AGENT_TERMS) {
    if (hasPhrase(padded, term)) return true;
    // Burla por espaçamento ("s a r i n"): só para termos de uma palavra com 5+ letras.
    if (!term.includes(' ') && term.length >= 5 && squashed.includes(term)) return true;
  }
  if (CHLORINE_WEAPON.test(norm)) return true;
  const words = norm.split(' ');
  if (words.some((w) => AGENT_WORDS.includes(w)) && AGENT_WORD_CONTEXT.test(norm)) return true;
  // "VX" sozinho como agente nervoso é inequívoco no uso do laboratório.
  if (words.includes('vx')) return true;
  return false;
}

function mentionsIllicitSynthesis(norm) {
  const padded = ' ' + norm + ' ';
  const drug = ILLICIT_DRUGS.some((d) => hasPhrase(padded, d));
  if (!drug) return false;
  return SYNTHESIS_INTENT.some((i) => norm.includes(i));
}

/**
 * Avalia os textos enviados ao Preceptor. `term` é o termo livre de síntese (já é, por definição,
 * um pedido de rota): qualquer droga ilícita ali bloqueia, sem exigir verbo.
 * @returns {{ blocked: boolean, reason: 'cbrn'|'illicit_synthesis'|null }}
 */
export function checkSafety({ term, question } = {}) {
  const termNorm = normalizeForSafety(term);
  const questionNorm = normalizeForSafety(question);
  if (mentionsAgent(termNorm) || mentionsAgent(questionNorm)) return { blocked: true, reason: 'cbrn' };
  if (termNorm) {
    const padded = ' ' + termNorm + ' ';
    if (ILLICIT_DRUGS.some((d) => hasPhrase(padded, d))) return { blocked: true, reason: 'illicit_synthesis' };
  }
  if (mentionsIllicitSynthesis(termNorm) || mentionsIllicitSynthesis(questionNorm)) {
    return { blocked: true, reason: 'illicit_synthesis' };
  }
  return { blocked: false, reason: null };
}

/** Resposta educacional fixa (pt-BR, sem rota, reagente, quantidade ou condição). */
export const SAFE_EDUCATIONAL_ANSWER =
  'Não detalho como produzir esse tipo de substância: agentes de guerra e drogas ilícitas ficam fora do que a bancada ensina. ' +
  'Posso ajudar com o que importa para a prática farmacêutica: mecanismo de ação, sinais de intoxicação, antídotos e suporte clínico, ' +
  'descontaminação, detecção e a legislação aplicável (Convenção sobre Armas Químicas, Lei 11.343/2006 e Portaria SVS/MS 344/98). ' +
  'Para produção de medicamentos controlados, a prática correta parte do insumo farmacêutico autorizado, com escrituração e dispensação.';
