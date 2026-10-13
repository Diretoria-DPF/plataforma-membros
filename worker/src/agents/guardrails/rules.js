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

/** Minúsculas, sem acento, sem invisível e com espaços simples; a pontuação fica (e-mail, "?", "/"). */
export function fold(text) {
  return String(text).replace(INVISIBLE_RE, '').normalize('NFD').replace(COMBINING_RE, '').toLowerCase().replace(SPACES_RE, ' ').trim();
}

/** Conceitos que contêm a palavra "dose" mas não pedem nem dão dose; saem antes de testar I6/O3. */
const DOSE_CONCEPTS_RE = /\b(?:dose[ -]resposta|dose[ -]efeito|dose[ -]dependente|dependente d[ae] dose|dependencia de dose|relacao dose|curva (?:de )?dose|dose letal (?:mediana|media|50)|dl ?50|dose efetiva (?:mediana|media|50))\b/g;

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
