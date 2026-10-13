/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistant/libraryRefs.js
 * Regras puras da Lia sobre a Biblioteca (decisão 10 do PLANO-CORTEX): reconhecer o pedido de artigos
 * ("tem artigos sobre paracetamol?"), tirar o tema e transformar os itens de LibraryService.search em
 * referências seguras. Sem banco, sem rede e sem IA.
 *
 * - O conteúdo dos artigos é DADO: título, autores e resumo vão como texto (o front usa textContent),
 *   nunca para o prompt de uma IA, e item com cara de instrução sai da lista.
 * - Só sai link oficial (doi.org ou PubMed), a mesma regra da página pública (biblioteca/catalogo.js).
 * - Resumo só para membro e admin; visitante recebe só o catálogo (o serviço já não manda o resumo).
 * - A Lia NÃO envia resumo algum ao cliente (referenceView): só id, título, autores, periódico, ano e link.
 */
import { normalize } from './kb.js';
import { looksLikeInjection } from './moderationRules.js';

export const LIBRARY_REFS_MAX = 3;
export const LIBRARY_QUERY_MAX = 120;
const TOPIC_TERMS_MAX = 6;
const LOOKAHEAD_WORDS = 5;
const TITLE_MAX = 300;
const JOURNAL_MAX = 200;
const AUTHORS_SHOWN = 3;
const SUMMARY_MAX = 320;
const LANDING_RE = /^https:\/\/(doi\.org|pubmed\.ncbi\.nlm\.nih\.gov)\/[^\s<>"']{1,260}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g;
const STUDY_TERMS_MAX = 3; // a busca exige TODOS os termos: poucos termos, mais chance de achar
const MIN_STUDY_TERM_CHARS = 3;
const LANGUAGE_LABELS = { pt: 'Português', en: 'English' };

// Palavras que pedem artigos; "biblioteca" só vale com "sobre" ("o que tem na biblioteca sobre X").
const REQUEST_WORDS = new Set(['artigo', 'artigos', 'referencia', 'referencias', 'estudo', 'estudos', 'publicacao', 'publicacoes',
  'paper', 'papers', 'bibliografia', 'leitura', 'leituras', 'literatura']);
const STRONG_LINKS = new Set(['sobre', 'acerca', 'respeito']);
const WEAK_LINKS = new Set(['de', 'do', 'da', 'dos', 'das', 'em', 'para']);
// Pergunta de uso da Biblioteca (sugerir, citar, salvar, publicar, remover, usar): é intenção, não busca.
// Verbos explícitos: "uso" ou "retirada" sozinhos são temas comuns ("uso racional", "síndrome de retirada").
const HOW_TO_RE = new RegExp([
  '\\b(sugerir|sugiro|sugestao|sugestoes|salvar|salvo|favoritar|favorito|favoritos|cito|citar|citacao|citacoes)\\b',
  '\\b(publico|publicar|curo|curar|curadoria|remover|removo|remocao|apagar|apago|excluir|excluo)\\b',
  '\\b(como|onde) (uso|usar|funciona)\\b', '\\b(usar|uso) a biblioteca\\b', '\\bretirar (o |um |esse |este )?artigo\\b',
].join('|'));
const STOPWORDS = new Set(['a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
  'por', 'pelo', 'pela', 'pelos', 'pelas', 'para', 'pra', 'com', 'sem', 'sobre', 'e', 'ou', 'que', 'me', 'te', 'se', 'ao', 'aos',
  'algum', 'alguma', 'alguns', 'algumas', 'tem', 'ha', 'voce', 'vc', 'favor', 'pf', 'pfv', 'isso', 'esse', 'essa', 'este', 'esta',
  'tema', 'assunto', 'area', 'biblioteca', 'laift', 'portugues', 'ingles', 'recente', 'recentes', 'bom', 'bons', 'boa', 'boas',
  'cientifico', 'cientificos', 'cientifica', 'cientificas', 'acerca', 'respeito', 'relacionado', 'relacionados', 'relacionada',
  'relacionadas', 'estudar', 'ler', 'aqui', 'ai', 'la', 'qual', 'quais', 'tipo', 'mais', 'muito', 'muitos', 'novo', 'novos']);

// Abertura de pergunta de definição ("o que é", "qual a diferença entre"...): não é tema, sai da busca.
const QUESTION_WORDS = new Set(['sao', 'significa', 'quer', 'dizer', 'diferenca', 'diferencas', 'entre', 'serve', 'servem', 'funciona',
  'funcionam', 'explique', 'explica', 'fale', 'fala', 'defina', 'conceito', 'significado', 'quem', 'porque', 'quanto', 'quanta',
  'quantos', 'quantas', 'quando', 'como', 'onde', 'custa', 'vale', 'confiar', 'confiavel', 'seguro', 'possivel', 'pra', 'eh']);
// Pergunta sobre a PLATAFORMA ou a Liga, não sobre ciência: nunca ganha artigos por inferência.
const PLATFORM_RE = /\b(plataforma|laift|liga|cadastr\w*|inscri\w*|evento\w*|cracha|senha|login|perfil|modulo\w*|edital|seletivo|mensalidade|certificado\w*|lia|app|aplicativo|mensage\w*|proposta\w*|tarefa\w*|equipe|biblioteca|conta|membro\w*|diretoria|atlas|quiz|suporte|site|blog)\b/;

/** Texto curto e seguro para o campo de busca: sem controle, sem marcação, espaços simples, até 120. */
export function cleanLibraryQuery(value) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_RE, ' ').replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIBRARY_QUERY_MAX).trim();
}

/** Palavras da mensagem com a forma original (acentos) e a normalizada (para comparar). */
function wordsOf(message) {
  return message.slice(0, 500).replace(CONTROL_RE, ' ').toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((orig) => ({ orig, norm: normalize(orig) }))
    .filter((w) => w.norm);
}

/** Onde começa o tema: depois do elo ("sobre", "a respeito de", "de"...) que segue a palavra de pedido. */
function topicStart(words, request) {
  const window = words.slice(request + 1, request + 1 + LOOKAHEAD_WORDS + 1);
  const strong = window.findIndex((w) => STRONG_LINKS.has(w.norm));
  if (strong >= 0) return request + 1 + strong + 1;
  if (words[request].norm === 'biblioteca') return -1;
  const weak = window.findIndex((w) => WEAK_LINKS.has(w.norm));
  return weak >= 0 ? request + 1 + weak + 1 : -1;
}

/**
 * Tema de um pedido de artigos, ou null quando a mensagem não pede artigos (ou é pergunta de uso da
 * Biblioteca). Mantém a grafia da pessoa (acentos), sem palavras vazias, até 6 termos.
 * Ex.: "tem artigos sobre intoxicação por metanol?" → "intoxicação metanol".
 */
export function libraryTopic(message) {
  if (typeof message !== 'string') return null;
  if (HOW_TO_RE.test(normalize(message))) return null;
  const words = wordsOf(message);
  const request = words.findIndex((w) => REQUEST_WORDS.has(w.norm) || w.norm === 'biblioteca');
  if (request < 0) return null;
  const start = topicStart(words, request);
  if (start < 0) return null;
  const terms = words.slice(start).filter((w) => !STOPWORDS.has(w.norm) && w.norm.length >= 2).slice(0, TOPIC_TERMS_MAX);
  const topic = cleanLibraryQuery(terms.map((w) => w.orig).join(' '));
  return topic || null;
}

function clip(value, max) {
  return typeof value === 'string' ? value.replace(CONTROL_RE, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** "Silva A, Souza B, Lima C et al." a partir de [{family, given}] e do total declarado. */
function authorsText(item) {
  const list = Array.isArray(item.authors) ? item.authors : [];
  const names = list.slice(0, AUTHORS_SHOWN).map((a) => {
    const family = clip(a && a.family, 80);
    const initials = clip(a && a.given, 80).split(/[\s-]+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase()).join('');
    return [family, initials].filter(Boolean).join(' ');
  }).filter(Boolean);
  const total = Number(item.authorCount) || list.length;
  return names.join(', ') + (names.length && total > names.length ? ' et al.' : '');
}

/** Resumo curto (membros): corta numa palavra e marca a origem ('curador' ou de IA revisada). */
function shortSummary(preview) {
  if (!preview || typeof preview !== 'object') return null;
  const text = clip(preview.text, SUMMARY_MAX + 1);
  if (!text) return null;
  const cut = text.length > SUMMARY_MAX ? text.slice(0, text.lastIndexOf(' ', SUMMARY_MAX) > 0 ? text.lastIndexOf(' ', SUMMARY_MAX) : SUMMARY_MAX) + '…' : text;
  return { text: cut, origin: preview.origin === 'curador' ? 'curador' : 'ia' };
}

function looksUnsafe(ref) {
  return [ref.title, ref.authors, ref.journal, ref.summary && ref.summary.text].some((t) => t && looksLikeInjection(t));
}

/** Um item de LibraryService.search como referência, ou null se não tem título ou link oficial. */
function toReference(item, member) {
  if (!item || typeof item !== 'object') return null;
  const title = clip(item.title, TITLE_MAX);
  const url = typeof item.landingUrl === 'string' && LANDING_RE.test(item.landingUrl) ? item.landingUrl : '';
  if (!title || !url) return null;
  const language = typeof item.language === 'string' ? item.language : null;
  return {
    id: clip(String(item.id || ''), 80),
    title,
    authors: authorsText(item),
    journal: clip(item.journal, JOURNAL_MAX),
    year: Number.isInteger(item.year) ? item.year : null,
    language,
    languageLabel: LANGUAGE_LABELS[language] || '',
    openAccess: item.openAccess === true,
    url,
    summary: member ? shortSummary(item.summaryPreview) : null,
  };
}

/**
 * Itens da busca → até 3 referências, português primeiro (a busca já ordena assim; aqui é garantia).
 * Devolve { refs, suppressed }: `suppressed` conta os itens que saíram por parecerem instrução.
 */
export function toReferences(items, member) {
  const all = (Array.isArray(items) ? items : []).map((item) => toReference(item, member)).filter(Boolean);
  const safe = all.filter((ref) => !looksUnsafe(ref));
  const ordered = safe.filter((r) => r.language === 'pt').concat(safe.filter((r) => r.language !== 'pt'));
  return { refs: ordered.slice(0, LIBRARY_REFS_MAX), suppressed: all.length - safe.length };
}

/** Termos de estudo de uma pergunta de definição (sem abertura nem palavras vazias), até 3, com a grafia da pessoa. */
export function studyQuery(message) {
  if (typeof message !== 'string') return '';
  const terms = wordsOf(message)
    .filter((w) => !STOPWORDS.has(w.norm) && !QUESTION_WORDS.has(w.norm) && w.norm.length >= MIN_STUDY_TERM_CHARS)
    .slice(0, STUDY_TERMS_MAX);
  return cleanLibraryQuery(terms.map((w) => w.orig).join(' '));
}

/**
 * A Lia busca artigos da Biblioteca para esta pergunta? Devolve { query, explicit } ou null.
 *  - Pergunta clínica (dose, conduta, tratamento): NUNCA (kind 'clinico').
 *  - Pedido explícito de artigos ("tem artigos sobre X?"): sim, com o tema (libraryTopic).
 *  - Pergunta de definição de conteúdo científico, que não é sobre a plataforma e que nenhuma intenção por
 *    regra respondeu (`hadIntent`): sim, com os termos de estudo. Uso da plataforma e assunto alheio: não.
 * Função pura: quem chama ainda confere as flags e se a busca achou algo publicado.
 */
export function libraryPlan(message, kind, hadIntent) {
  if (typeof message !== 'string' || kind === 'clinico') return null;
  const topic = libraryTopic(message);
  if (topic) return { query: topic, explicit: true };
  if (hadIntent || kind !== 'definicao' || PLATFORM_RE.test(normalize(message))) return null;
  const query = studyQuery(message);
  return query ? { query, explicit: false } : null;
}

/** O que o cliente recebe de cada referência (sem resumo, idioma nem outros campos internos). */
export function referenceView(ref) {
  return { id: ref.id, title: ref.title, authors: ref.authors, journal: ref.journal, year: ref.year, url: ref.url };
}
