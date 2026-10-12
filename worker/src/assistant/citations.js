/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * assistant/citations.js
 * Citações das respostas da Lia que usam trechos do acervo (extraído de services/assistantService.js sem
 * mudar o comportamento; a prévia de visitante usa a mesma regra).
 *
 * O texto da IA cita "[n]", n = número do trecho enviado no prompt. Só os trechos citados viram fonte: o texto
 * ganha "(Fonte: seção X)" no fim e `sources` leva só origem e seção (nunca o conteúdo). Recusa não cita fonte.
 */
import { normalize } from './kb.js';
import { sourceEntry } from './extractive.js';

// Recusa: a IA disse que não tem a informação na base. Texto normalizado (normalize() de kb.js).
const REFUSAL_TEXT = [/\bnao tenho (a |essa |esta )?informacao\b/, /\bnao encontrei\b/];
// Citação no texto da IA: "[n]", n é o número do trecho enviado no prompt (1 a 99).
const CITATION = /\s*\[(\d{1,2})\]/g;

export function isRefusal(reply) {
  const text = normalize(reply);
  return REFUSAL_TEXT.some((re) => re.test(text));
}

/** Números [n] da resposta que apontam para trechos existentes, sem repetir e em ordem crescente. */
function citedNumbers(reply, count) {
  const numbers = Array.from(reply.matchAll(CITATION), (m) => Number(m[1]));
  return Array.from(new Set(numbers)).filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
}

/**
 * Cita só os trechos que a IA usou ("[n]" no texto). Sem [n] e sem recusa, cita o trecho de maior score
 * (o primeiro, pois a busca já devolve ordenado). Com `withUrl`, cada fonte leva o `url` da página pública
 * da seção, quando existe (assistant/publicLinks.js).
 */
export function withCitations(result, chunks, opts = {}) {
  const body = result.reply.replace(CITATION, '').trim();
  if (isRefusal(result.reply)) return Object.assign({}, result, { reply: body, sources: [] });
  const numbers = citedNumbers(result.reply, chunks.length);
  const used = numbers.length ? numbers.map((n) => chunks[n - 1]) : chunks.slice(0, 1);
  const sections = Array.from(new Set(used.map((c) => c.section)));
  const entry = (c) => (opts.withUrl ? sourceEntry(c.source, c.section) : { source: c.source, section: c.section });
  const sources = Array.from(new Map(used.map((c) => [c.source + '|' + c.section, entry(c)])).values());
  const label = sections.length > 1 ? 'Fontes' : 'Fonte';
  const note = '(' + label + ': ' + sections.map((s) => 'seção ' + s).join('; ') + ')';
  return Object.assign({}, result, { reply: (body ? body + '\n\n' : '') + note, sources });
}
