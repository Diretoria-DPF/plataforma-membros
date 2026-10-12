/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistant/tree.js
 * Árvore de seções da Lia (o "PageIndex" do desenho híbrido), montada de forma determinística dos
 * MESMOS documentos de buildDocuments (assistant/docs.js). Sem banco, sem vetor, sem IA.
 *
 * Nó = { id, source, section, summary, content }:
 *   - id: estável, "source/slug-da-seção" (colisão de slug ganha sufixo -2, -3...);
 *   - summary: primeira frase do conteúdo, até TREE.SUMMARY_MAX caracteres, numa linha só;
 *   - content: o texto do trecho (só para o servidor montar o prompt; nunca vai no resumo da árvore).
 * Só entra o que está em buildDocuments, então nada de administração nem de dado de pessoa.
 */
import { buildDocuments } from './docs.js';
import { normalize } from './kb.js';
import { TREE } from '../constants.js';

export const SUMMARY_MAX = TREE.SUMMARY_MAX;
const SLUG_MAX = 60;
const ELLIPSIS = '…';

/** "liga" + "O que é a LAIFT" -> "liga/o-que-e-a-laift". */
export function nodeId(source, section) {
  const slug = normalize(String(section)).replace(/\s/g, '-').slice(0, SLUG_MAX).replace(/-+$/, '');
  return normalize(String(source)).replace(/\s/g, '-') + '/' + (slug || 'secao');
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Conteúdo sem o prefixo "Título — Seção. " (ou "Seção: ") que o chunking e o kb.js colocam na frente. */
export function bodyOf(content, section) {
  const text = String(content || '').trim();
  const lead = new RegExp('^(?:[^\\n]{0,80}? — )?' + escapeRegExp(String(section || '')) + '[.:]?\\s+');
  return text.replace(lead, '');
}

/**
 * Posições (índices no texto) onde uma frase termina: depois de . ! ? seguido de espaço ou fim, ou antes de
 * uma quebra de linha. O "1." de uma lista numerada não conta. Em ordem crescente.
 */
export function sentenceEnds(text) {
  const flat = String(text || '');
  const re = /[.!?]+(?=\s|$)|\n/g;
  const ends = [];
  let match = re.exec(flat);
  while (match) {
    const head = flat.slice(0, match.index);
    const isListNumber = match[0] === '.' && /(^|\s)\d{1,2}$/.test(head);
    if (!isListNumber && head.trim()) ends.push(match[0] === '\n' ? match.index : match.index + match[0].length);
    match = re.exec(flat);
  }
  return ends;
}

/** Primeira frase de um texto (ver sentenceEnds). Sem fim de frase, o texto inteiro. */
export function firstSentence(text) {
  const flat = String(text || '').trim();
  const [end] = sentenceEnds(flat);
  return end === undefined ? flat : flat.slice(0, end).trim();
}

function clip(text, max) {
  return text.length <= max ? text : text.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[\s,;:.]+$/, '') + ELLIPSIS;
}

const MIN_SUMMARY_CHARS = 30;
const FOR_WHOM = /^Para quem:/;

/**
 * Resumo de uma linha: a primeira frase útil. "Para quem: ..." (rótulo do guia) sai; frase curta demais ou
 * que termina em ":" ("Para criar a conta:", "Sim.") ganha a seguinte.
 */
function leadOf(body) {
  let rest = String(body || '').trim();
  let lead = '';
  for (let step = 0; step < 4 && rest; step += 1) {
    const piece = firstSentence(rest);
    rest = rest.slice(piece.length).trim();
    if (!lead && FOR_WHOM.test(piece)) continue;
    lead = (lead ? lead + ' ' : '') + piece;
    if (lead.length >= MIN_SUMMARY_CHARS && !lead.endsWith(':')) break;
  }
  return lead;
}

function summaryOf(doc) {
  const sentence = leadOf(bodyOf(doc.content, doc.section)) || String(doc.section);
  return clip(sentence.replace(/\s+/g, ' '), SUMMARY_MAX);
}

/** Árvore completa. `docs` é injetável em teste; em produção são os documentos reais do acervo. */
export function buildTree(docs = buildDocuments()) {
  const used = new Set();
  return docs.map((doc) => {
    const base = nodeId(doc.source, doc.section);
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = base + '-' + n;
    used.add(id);
    return { id, source: doc.source, section: doc.section, summary: summaryOf(doc), content: doc.content };
  });
}

let treeMemo = null;

/** A árvore do acervo atual, montada uma vez por isolate (os documentos são fixos no código). */
export function getTree() {
  if (treeMemo === null) treeMemo = buildTree();
  return treeMemo;
}

/** Linhas do resumo: "[id] source › section — resumo"; com brief, só "[id]" (o id já traz a fonte e o título). */
function lineOf(node, brief) {
  return brief ? '[' + node.id + ']' : '[' + node.id + '] ' + node.source + ' › ' + node.section + ' — ' + node.summary;
}

/**
 * Resumo compacto da árvore para o prompt, no máximo `maxChars` caracteres. Uma linha nunca é cortada no
 * meio: a primeira que não couber encerra o resumo (por isso quem chama põe as mais importantes primeiro).
 */
export function renderOutline(nodes, maxChars = TREE.OUTLINE_MAX_CHARS, opts = {}) {
  const lines = [];
  let size = 0;
  for (const node of nodes) {
    const line = lineOf(node, opts.brief === true);
    const next = size + line.length + (lines.length ? 1 : 0);
    if (next > maxChars) break;
    lines.push(line);
    size = next;
  }
  return lines.join('\n');
}

/** id -> nó. Mapa de verdade (não objeto): "__proto__" e afins não acham nada. */
export function byId(nodes) {
  return new Map(nodes.map((n) => [n.id, n]));
}

/** "source|section" -> nó, a mesma chave que o acervo (kb_chunks) usa. */
export function byKey(nodes) {
  return new Map(nodes.map((n) => [n.source + '|' + n.section, n]));
}
