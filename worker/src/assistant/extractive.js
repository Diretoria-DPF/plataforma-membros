/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistant/extractive.js
 * Resposta EXTRATIVA da Lia híbrida (sem LLM, sem cota de IA): devolve o melhor trecho do acervo, com até
 * TREE.VISITOR_SNIPPET_MAX caracteres, cortado em fim de frase, e a fonte (com `url` quando a seção tem
 * página pública). É o degrau de fallback da prévia de IA do visitante e a resposta de quem não usa IA.
 */
import { TREE } from '../constants.js';
import { bodyOf, sentenceEnds } from './tree.js';
import { publicPathFor } from './publicLinks.js';

const MIN_SNIPPET_CHARS = 40;
const ELLIPSIS = '…';

/** Quando nada passa do piso: convite amigável, com os temas que a Lia cobre. */
export const NO_MATCH_REPLY = 'Não encontrei isso na minha base de conhecimento. Posso falar sobre a LAIFT e as suas áreas, o processo seletivo, os módulos de estudo e o blog com as publicações. Tente perguntar de outro jeito ou escolha um tema.';
export const NO_MATCH_SUGGESTIONS = Object.freeze(['O que é a LAIFT?', 'Processo seletivo', 'Módulos de estudo', 'Blog e publicações']);

/** Trecho do conteúdo (sem o prefixo "Título — Seção.") com no máximo `max` caracteres, em fim de frase. */
export function snippetOf(content, section, max = TREE.VISITOR_SNIPPET_MAX) {
  const body = bodyOf(content, section).trim();
  if (body.length <= max) return body;
  const fits = sentenceEnds(body).filter((end) => end <= max);
  const last = fits.length ? fits[fits.length - 1] : 0;
  if (last >= MIN_SNIPPET_CHARS) return body.slice(0, last).trim();
  return body.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[\s,;:.]+$/, '') + ELLIPSIS;
}

/** Fonte para o cliente: origem e seção, mais `url` só se a seção tem página pública (allowlist). */
export function sourceEntry(source, section) {
  const url = publicPathFor(source, section);
  return url ? { source, section, url } : { source, section };
}

/** { reply, sources } a partir de UM trecho do acervo. */
export function extractiveAnswer(chunk) {
  const snippet = snippetOf(chunk.content, chunk.section);
  return {
    reply: snippet + '\n\n(Fonte: seção ' + chunk.section + ')',
    sources: [sourceEntry(chunk.source, chunk.section)],
  };
}
