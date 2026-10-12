/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistant/questionKind.js
 * Guarda de intenção da Lia híbrida (flag lia_hibrida_enabled). Funções PURAS, sem banco e sem IA:
 *
 *   questionKind(message) -> 'definicao' | 'como-fazer' | 'clinico' | 'fora-de-escopo'
 *
 *   - 'definicao'      o que é/são, qual a diferença, para que serve, quem é, por que, quanto custa, quais...?
 *   - 'como-fazer'     como faço, onde, passo a passo, esqueci...; mantém o comportamento atual
 *   - 'clinico'        dose, posologia, conduta, tratamento de paciente: a Lia NÃO responde conduta
 *   - 'fora-de-escopo' sinal explícito de assunto alheio (previsão do tempo...) OU pergunta sem nenhum dos
 *                      sinais acima. A classe NÃO decide nada: quem decide é o acervo (RAG) e o answerable.
 *
 * A ordem das regras importa: clínico vence tudo; assunto alheio vem antes de "como/qual"; sinais fortes de
 * passo a passo vencem a abertura de definição; "onde" e "como" genéricos ficam por último.
 * allowIntent() é a guarda em si: numa pergunta de definição, intenção de passo a passo NÃO responde.
 */
import { normalize } from './kb.js';

export const KINDS = Object.freeze(['definicao', 'como-fazer', 'clinico', 'fora-de-escopo']);

const MEDICINE = 'remedio|medicamento|farmaco|antibiotico|analgesico|anti inflamatorio';
const SYMPTOM = 'febre|dor|tosse|enjoo|nausea|vomito|diarreia|tontura|falta de ar|alergia|coceira';
const KINSHIP = 'paciente|pacientes|meu|minha|filho|filha|mae|pai|bebe|crianca|avo|avos';

// Texto já normalizado (sem acento, minúsculo, só letras e números).
const CLINICAL = [
  /\bposologia\b|\bdosagem\b|\bconduta\b|\bcondutas\b/,
  /\bdoses? (de|do|da|dos|das|para|ideal|maxima|minima|segura|certa|correta|diaria|usual)\b/,
  /\b(qual|quanto|quantos|quantas) (e )?(a )?dose\b/,
  /\bquant[oa]s? (mg|miligramas?|comprimidos?|gotas?|ml|capsulas?|ampolas?|pilulas?)\b/,
  new RegExp('\\btrat(?:ar|amento|amentos)\\b.*\\b(?:' + KINSHIP + ')\\b'),
  /\b(posso|devo|preciso|pode|deve) (tomar|ingerir|misturar|associar)\b/,
  new RegExp('\\bqual (?:' + MEDICINE + ')\\b.*\\b(?:tomar|usar|devo|posso|indicado|recomendado)\\b'),
  /\b(tomei|tomou|ingeri|ingeriu|engoli|engoliu) (demais|muito|muitos|um monte|varios|tudo|todo)\b/,
  new RegExp('\\b(?:estou com|estou sentindo|tenho|sinto)\\b.*\\b(?:' + SYMPTOM + ')\\b'),
  /\bo que (eu )?(tomo|devo tomar|posso tomar)\b/,
];

const OUT_OF_SCOPE = [
  /\bprevisao do tempo\b|\bclima\b|\bhoroscopo\b|\bsigno\b|\bcotacao\b|\bdolar\b|\bbitcoin\b|\bloteria\b/,
  /\bpiada\b|\bpoema\b|\bpoesia\b|\bmusica\b|\bfilme\b|\brestaurante\b|\bbolo\b|\breceita d[eo] (comida|torta|pao|bolo)\b/,
  /\bfutebol\b|\bjogo d[oae]\b|\bquem ganhou\b|\bpresidente\b|\beleicao\b|\bcapital d[aeo]\b|\btraduza\b|\btraduzir\b|\bme conte uma\b/,
];

// Sinais FORTES de passo a passo: vencem até a abertura de definição ("qual o passo a passo...").
const HOW_TO_STRONG = [
  /\bpasso a passo\b|\besqueci\b|\bnao consigo\b|\bcomo (eu )?(faco|fazer)\b/,
  /\bme (cadastro|cadastrar|inscrevo|inscrever|registro)\b/,
  /\bquero (criar|entrar|trocar|mudar|alterar|fazer|me|instalar|recuperar|redefinir|ativar|abrir|salvar|citar|sugerir|enviar|participar|cadastrar|ver)\b/,
  /\bpreciso (criar|entrar|trocar|mudar|alterar|fazer|recuperar|instalar|redefinir|ativar)\b/,
  /\bo que (eu )?(devo|preciso|tenho que) fazer\b/,
];

const DEFINITION = [
  /\bo que (e|sao|significa|quer dizer)\b|^(o que|oque)\b/,
  /\bdiferenca(s)? (entre|de)\b/,
  /\bpara que (serve|servem)\b|\bpra que serve\b/,
  /\bquem\b/,
  /\bpor que\b|^porque\b/,
  /\bquanto(s|a|as)? (custa|custam|vale|tempo|e|sao)\b/,
  /^(qual|quais|quantos|quantas|quanto|quando)\b/,
  /\b(posso|da para|e possivel) confiar\b|\be (confiavel|seguro)\b/,
  /\b(explique|explica|fale sobre|fala sobre|defina|conceito de|significado de)\b/,
];

const HOW_TO = [/\bonde\b/, /\bcomo\b/];

const matchesAny = (list, text) => list.some((re) => re.test(text));

/** Tipo da pergunta (ver o cabeçalho). Nunca lança: entrada que não é texto vira 'fora-de-escopo'. */
export function questionKind(message) {
  const text = normalize(message);
  if (!text) return 'fora-de-escopo';
  if (matchesAny(CLINICAL, text)) return 'clinico';
  if (matchesAny(OUT_OF_SCOPE, text)) return 'fora-de-escopo';
  if (matchesAny(HOW_TO_STRONG, text)) return 'como-fazer';
  if (matchesAny(DEFINITION, text)) return 'definicao';
  if (matchesAny(HOW_TO, text)) return 'como-fazer';
  return 'fora-de-escopo';
}

/**
 * A intenção por regra (kb.js) pode responder esta pergunta? Em pergunta de definição só respondem as
 * marcadas `defines: true`; as de passo a passo (entrar, senha, criar conta, buscar na Biblioteca...)
 * respondem "como", não "o que é". Nos demais tipos nada muda.
 */
export function allowIntent(kind, hit) {
  if (!hit || !hit.intent) return false;
  return kind !== 'definicao' || hit.intent.defines === true;
}

const CLINICAL_SECTION = 'A Lia pode errar em temas clínicos';

/** Resposta segura a pergunta clínica: sem dose, sem conduta, remete a profissional e à emergência. */
export const CLINICAL_REPLY = Object.freeze({
  reply: 'Não posso orientar dose, medicamento, tratamento nem conduta: isso depende da avaliação de um profissional de saúde, que conhece o caso. Em caso de urgência ou suspeita de intoxicação, procure um serviço de emergência na hora (SAMU 192). A Lia orienta sobre a plataforma e pode errar em temas clínicos; os conteúdos de estudo não definem conduta.\n\n(Fonte: seção ' + CLINICAL_SECTION + ')',
  sources: Object.freeze([Object.freeze({ source: 'saude', section: CLINICAL_SECTION })]),
});
