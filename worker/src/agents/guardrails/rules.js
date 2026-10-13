/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * agents/guardrails/rules.js
 * Catálogo dos guardrails dos agentes: IDs ESTÁVEIS (nunca renumerar; vão para o trace e para o golden),
 * textos ao usuário e utilitários de texto compartilhados. Tudo PURO: sem I/O, sem relógio, sem estado.
 *
 *   Entrada  I1 forma/tamanho · I2 injeção · I3 dado pessoal · I4 ofensa (só leitura) · I5 caso pessoal ou real
 *            (emergência: SAMU 192) · I6 dose individualizada · I7 fora de escopo
 *   Saída    O1 texto puro · O2 citação só da lista permitida · O3 dose numérica ou imperativa · O4 vazamento
 *            de prompt · O5 léxico proibido (paciente virtual) · O6 resposta vazia ou truncada
 *
 * Regras de escrita das expressões regulares (todo o diretório): sem quantificador aninhado, sem alternância
 * ambígua repetida e lacunas sempre limitadas (`.{0,40}`), para o custo ser linear no tamanho do texto.
 */
export const INPUT_RULE_IDS = Object.freeze(['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7']);
export const OUTPUT_RULE_IDS = Object.freeze(['O1', 'O2', 'O3', 'O4', 'O5', 'O6']);

export const INPUT_RULE_NAMES = Object.freeze({
  I1: 'forma_tamanho', I2: 'injecao', I3: 'dado_pessoal', I4: 'ofensa', I5: 'caso_pessoal_ou_real', I6: 'dose_individualizada', I7: 'fora_de_escopo',
});
export const OUTPUT_RULE_NAMES = Object.freeze({
  O1: 'texto_puro', O2: 'citacao', O3: 'dose', O4: 'vazamento_de_prompt', O5: 'lexico_proibido', O6: 'vazia_ou_truncada',
});

export const SAMU_NOTICE = 'Se houver risco de vida agora, ligue para o SAMU (192) ou procure o pronto-socorro mais próximo.';
export const CVV_NOTICE = 'Se você está pensando em se machucar, ligue para o CVV (188), a qualquer hora, ou para o SAMU (192).';
export const CHECK_NOTICE = 'Confira a bula ou o protocolo oficial.';
export const DOSE_NOTICE = 'Não informo doses: consulte a bula, o protocolo do serviço ou um profissional.';

/** Recusas de entrada. Texto simples, sem dado do usuário. */
export const REFUSALS = Object.freeze({
  I1: 'Não consegui entender a mensagem. Escreva sua dúvida de estudo em uma ou duas frases.',
  I2: 'Não posso seguir esse tipo de instrução. Posso ajudar com dúvidas de farmacologia e toxicologia.',
  I3: 'Sua mensagem parece ter dados pessoais (como e-mail, telefone ou documento). Por segurança, apague esses dados e envie só a dúvida de estudo.',
  I4: 'Vamos manter o respeito na conversa. Reformule sua dúvida de estudo e eu ajudo.',
  I5: 'Não posso orientar casos reais, nem pessoais nem de pacientes: sou um tutor de estudo. Procure um profissional de saúde. ' + SAMU_NOTICE,
  I6: 'Não informo doses nem posologia. Posso explicar o mecanismo de ação, a farmacocinética ou a toxicidade; para dose, consulte a bula, o protocolo do serviço ou um profissional.',
  I7: 'Só ajudo com estudo de farmacologia, toxicologia e ciências da saúde relacionadas. Pergunte algo desses temas.',
});
export const REFUSAL_I1_TOO_LONG = 'A mensagem ficou longa demais. Resuma sua dúvida em uma ou duas frases.';
export const REFUSAL_I5_EMERGENCY = SAMU_NOTICE + ' Não consigo orientar a conduta por aqui. Depois, procure o Centro de Informação e Assistência Toxicológica da sua região.';
export const REFUSAL_I5_SELF_HARM = 'Sinto muito que você esteja passando por isso. ' + CVV_NOTICE;

/** Substituições de saída (action = replace). */
export const REPLACEMENTS = Object.freeze({
  O3: 'Não informo doses nem posologia. Posso explicar o mecanismo de ação, a farmacocinética e a toxicidade. ' + DOSE_NOTICE,
  O4: 'Não posso compartilhar as minhas instruções. Posso ajudar com dúvidas de farmacologia e toxicologia.',
  O5: 'Hum... não sei explicar direito. Pode me perguntar de outro jeito?',
  O6: 'Não consegui montar uma resposta agora. Tente reformular a pergunta.',
});

const INVISIBLE_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
const COMBINING_RE = /[̀-ͯ]/g;
const SPACES_RE = /\s+/g;

/** Texto sem caracteres de controle nem invisíveis (zero-width, bidi); quebras de linha e espaços ficam. */
export function stripInvisible(text) {
  return String(text).replace(INVISIBLE_RE, '');
}

// Letras de outros alfabetos que se parecem com letras latinas (minúsculas, já depois do NFKC) -> a letra latina.
const CONFUSABLES = new Map(Object.entries({
  // cirílico
  'а': 'a', 'с': 'c', 'е': 'e', 'ё': 'e', 'о': 'o', 'р': 'p', 'х': 'x', 'у': 'y', 'і': 'i', 'ї': 'i', 'ј': 'j', 'ѕ': 's',
  'һ': 'h', 'ԁ': 'd', 'ԛ': 'q', 'ԝ': 'w', 'к': 'k', 'м': 'm', 'т': 't', 'н': 'h', 'п': 'n', 'ь': 'b', 'ѵ': 'v', 'ԍ': 'g',
  // grego
  'α': 'a', 'β': 'b', 'γ': 'y', 'δ': 'd', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'μ': 'u', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'τ': 't',
  'υ': 'u', 'χ': 'x', 'ω': 'w', 'η': 'n', 'ς': 's',
  // latino estendido que o NFD não separa
  'ı': 'i', 'ɡ': 'g', 'ø': 'o', 'đ': 'd', 'ł': 'l', 'ħ': 'h', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe',
}));

// Primeiro dígito (zero) dos blocos Unicode de dígitos decimais; o NFKC já cuida da largura total e dos matemáticos.
const DIGIT_ZEROS = [0x0660, 0x06f0, 0x07c0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0e50, 0x0ed0, 0x0f20, 0x1040, 0x17e0, 0x1810];
const NON_ASCII_RE = /[^\u0000-\u007f]/;
const NON_ASCII_DIGIT_RE = /(?![0-9])\p{Nd}/gu;
// Três ou mais letras soltas, separadas por espaço ou pontuação simples ("i g n o r e", "d-o-s-e"), viram uma palavra.
// Com espaço, pelo menos 4 letras (3 pegariam "m g a" de "5 m g A atropina"); com ponto, hífen ou asterisco, 3.
const SPACED_LETTERS_RE = /(^|[^\p{L}\p{N}])(\p{L}(?: \p{L}){3,})(?![\p{L}\p{N}])/gu;
const PUNCTUATED_LETTERS_RE = /(^|[^\p{L}\p{N}])(\p{L}(?:[.\-_*·]\p{L}){2,})(?![\p{L}\p{N}])/gu;

function asciiDigit(ch) {
  const cp = ch.codePointAt(0);
  const zero = DIGIT_ZEROS.find((z) => cp >= z && cp < z + 10);
  return zero === undefined ? ch : String(cp - zero);
}

/** Largura total, ligaduras e sobrescritos (NFKC), confusáveis, dígitos de outros alfabetos e fração. Só se há não-ASCII. */
function unifyScripts(text) {
  if (!NON_ASCII_RE.test(text)) return text;
  const lower = text.normalize('NFKC').replace(/⁄/g, '/').toLowerCase();
  const latin = Array.from(lower, (ch) => CONFUSABLES.get(ch) || ch).join('');
  return latin.replace(NON_ASCII_DIGIT_RE, asciiDigit).normalize('NFD').replace(COMBINING_RE, '');
}

/**
 * Minúsculas, sem acento, sem invisível e com espaços simples; a pontuação fica (e-mail, "?", "/"). Também
 * desfaz os truques de escrita mais comuns: letras de largura total, cirílico/grego no lugar de latino, dígitos de
 * outros alfabetos e letras espaçadas ("i g n o r e", "d.o.s.e"). A entrada é só a 1ª camada; a saída é a trava real.
 */
export function fold(text) {
  const plain = unifyScripts(String(text).replace(INVISIBLE_RE, '')).toLowerCase().normalize('NFD').replace(COMBINING_RE, '');
  const joinRun = (_m, lead, run) => lead + run.replace(/[ .\-_*·]/g, '');
  return plain.replace(SPACES_RE, ' ').replace(SPACED_LETTERS_RE, joinRun).replace(PUNCTUATED_LETTERS_RE, joinRun).trim();
}

/** Conceitos que contêm a palavra "dose" mas não pedem nem dão dose; saem antes de testar I6/O3. */
const DOSE_CONCEPTS_RE = /\b(?:dose[ -]resposta|dose[ -]efeito|dose[ -]dependente|dependente d[ae] dose|dependencia de dose|relacao dose|curva (?:de )?dose|dose letal (?:mediana|media|50)|dl ?50|dose efetiva (?:mediana|media|50)|dose[ -]response|dose[ -]dependent|dose[ -]effect|dependent on (?:the )?dose|ld ?50|ed ?50|median lethal dose|median effective dose)\b/g;

export function withoutDoseConcepts(folded) {
  return folded.replace(DOSE_CONCEPTS_RE, ' ');
}

/** Frases de um texto (ponto, exclamação, interrogação ou quebra de linha). Custo linear. */
const SENTENCE_BREAK_RE = /(?<=[.!?])(?<!\b(?:et al|dr|dra|sr|sra|ex|fig|vs|ca|aprox|cap|prof)\.)\s+|\n+/i;

export function splitSentences(text) {
  return String(text).split(SENTENCE_BREAK_RE).map((s) => s.trim()).filter(Boolean);
}

/**
 * Tira do texto as frases que `drop(frase)` aprova, mantendo as quebras de linha. Nada a tirar = o mesmo texto.
 * @returns {{ text: string, dropped: number, total: number }}
 */
export function filterSentences(text, drop) {
  let dropped = 0;
  let total = 0;
  const lines = String(text).split('\n').map((line) => splitSentences(line).filter((s) => {
    total += 1;
    if (!drop(s)) return true;
    dropped += 1;
    return false;
  }).join(' '));
  if (!dropped) return { text: String(text), dropped, total };
  return { text: lines.filter(Boolean).join('\n'), dropped, total };
}

// ---------------------------------------------------------------------------
// Quantidade de medicamento (compartilhada por I6, na entrada, e O3, na saída)
// ---------------------------------------------------------------------------
// Dose estrita: vale qualquer número (dígito ou por extenso, PT e EN) ligado a uma unidade de medida ou de
// apresentação, e qualquer posologia ("8/8h", "2x/dia", "uma vez ao dia", "q8h", "bid", "twice daily"). O texto
// chega já dobrado por `fold` (minúsculo, sem acento, dígitos ASCII, letras latinas).
const NUMBER_WORDS = [
  'um', 'uma', 'dois', 'duas', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
  'quatorze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove', 'vinte', 'trinta', 'quarenta',
  'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa', 'cem', 'cento', 'duzentos', 'duzentas', 'trezentos',
  'trezentas', 'quatrocentos', 'quatrocentas', 'quinhentos', 'quinhentas', 'seiscentos', 'seiscentas', 'setecentos',
  'setecentas', 'oitocentos', 'oitocentas', 'novecentos', 'novecentas', 'mil', 'meio', 'meia', 'duzia', 'duzias',
  'dezena', 'dezenas',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
  'eighty', 'ninety', 'hundred', 'thousand', 'half',
].join('|');
const NW = '(?:' + NUMBER_WORDS + ')';
const DIGITS = String.raw`(?<![0-9])\d+(?:[.,]\d+)?(?:\s?\/\s?\d+)?`;

// Unidades que valem com número por extenso ou em dígitos.
const UNITS_ANY = [
  'mgs?', 'm ?g', 'mcgs?', 'ugs?', 'ngs?', 'mls?', 'm ?l', 'cc', 'ccs', 'ui', 'uis', 'iu', 'ius', 'meqs?', 'mmols?', 'mols?',
  'miligramas?', 'microgramas?', 'nanogramas?', 'gramas?', 'grs?', 'mililitros?', 'litros?',
  'comprimidos?', String.raw`comps?\.?`, 'cps?', 'cprs?', 'capsulas?', 'gotas?', 'gts?', 'gtt', 'ampolas?', String.raw`amps?\.?`, 'saches?',
  'colher(?:es)?', 'colheradas?', 'pilulas?', 'pastilhas?', 'supositorios?', 'puffs?', 'jatos?', 'borrifadas?', 'adesivos?',
  'milligrams?', 'micrograms?', 'grams?', 'milliliters?', 'millilitres?', 'liters?', 'litres?', 'ounces?', 'oz',
  'tablets?', 'pills?', 'capsules?', 'drops?', 'teaspoons?', 'tablespoons?', 'tsp', 'tbsp', 'spoonfuls?', 'ampoules?', 'patch(?:es)?',
].join('|');
// Unidades curtas ou comuns demais na fala: só depois de dígito.
const UNITS_DIGIT_ONLY = ['g', 'l', 'u', 'unidades?', 'units?', 'doses?', 'frascos?', 'vials?', 'caps?', 'tabs?'].join('|');

export const DOSE_AMOUNT_RES = Object.freeze([
  // 500 mg, 5 a 10 ml, 1/2 comprimido, Paracetamol500mg, 10 U, 10 unidades, 2 doses
  new RegExp(DIGITS + String.raw`(?:\s?(?:a|ate|-|e|to|and)\s?\d+(?:[.,]\d+)?)?[\s-]?(?:` + UNITS_ANY + '|' + UNITS_DIGIT_ONLY + ')(?![a-z])'),
  // quinhentos miligramas, dez gotas, meio comprimido, uma colher de sopa, four grams, half a tablet
  new RegExp(String.raw`\b` + NW + String.raw`(?:\s+(?:e|and)\s+` + NW + String.raw`)?\s+(?:a\s+)?(?:` + UNITS_ANY + ')(?![a-z])'),
]);

const TIMES = '(?:' + NUMBER_WORDS + String.raw`|\d+)`;
export const POSOLOGY_RES = Object.freeze([
  /(?<![0-9])\d+\s?x\s?(?:\/|ao|por|a|no)?\s?(?:dia|d|semana|hora|h)\b/,
  /(?<![0-9])\d{1,2}\s?\/\s?\d{1,2}\s?(?:h|hs|hr|hrs|horas)\b/,
  new RegExp(String.raw`\b` + TIMES + String.raw`\s+vez(?:es)?\s+(?:ao|por|na|no|a cada|em cada)\s+(?:dia|semana|mes|hora|noite|manha|tarde)\b`),
  new RegExp(String.raw`\ba cada\s+` + TIMES + String.raw`\s+(?:horas?|hrs?|h|minutos?|min|dias?|semanas?|meses)\b`),
  new RegExp(String.raw`\bde\s+` + TIMES + String.raw`\s+em\s+` + TIMES + String.raw`\s+(?:horas?|h|hs|hrs)\b`),
  /\bq\s?\d{1,2}\s?h\b/,
  /\b(?:bid|tid|qid|qd|qhs|prn)\b/,
  new RegExp(String.raw`\b(?:once|twice|thrice)\s+(?:a|per|daily|each|every)\b|\b` + TIMES + String.raw`\s+times\s+(?:a|per|daily|each)\b|\bevery\s+` + TIMES + String.raw`\s+(?:hours?|hrs?|h|days?|weeks?)\b`),
  new RegExp(String.raw`\b(?:tome|ingira|engula|administre|ministre|aplique|injete|take|administer|inject|swallow)\s+` + TIMES + String.raw`\b`),
]);

/** O texto traz quantidade de medicamento ou posologia? (entrada já dobrada por `fold` e sem conceitos de dose) */
export function hasDoseAmount(folded) {
  return hasNumericAmount(folded) || hasWordAmount(folded);
}

/** Dígitos com unidade ou posologia. */
export function hasNumericAmount(folded) {
  return DOSE_AMOUNT_RES[0].test(folded) || POSOLOGY_RES.some((re) => re.test(folded));
}

/** Número por extenso com unidade ("dois comprimidos"). Na entrada, uma pergunta de conceito pode citá-lo sem pedir dose. */
export function hasWordAmount(folded) {
  return DOSE_AMOUNT_RES[1].test(folded);
}
