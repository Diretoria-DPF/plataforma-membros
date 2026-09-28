/**
 * Normalização de IDs Uberon.
 *
 * content.schema.json exige `ids.uberon` no formato canônico "UBERON:<n>"
 * (pattern ^UBERON:[0-9]+$). As fontes reais devolvem esse id em formatos
 * variados — em especial o Wikidata (propriedade P1554, "Uberon ID"), cujo
 * valor bruto vem como "UBERON_<n>" (estilo purl/OBO, com underscore), o que
 * falha na validação do schema (14 erros vistos em CI antes desta correção:
 * `/za:.../ids/uberon não corresponde ao padrão esperado`).
 *
 * normUberon() é o único lugar que sabe reconhecer esses formatos — usado por
 * wikidata.mjs (ao gravar wikidata.json), asctb.mjs (ao ler wikidata.json
 * para construir o índice reverso FMA/UBERON -> sid) e build-content.mjs (ao
 * copiar wikidata.uberon e ids.uberon de legado para o registro final).
 *
 * Formatos aceitos (case-insensitive no prefixo):
 * - "UBERON:123"                                    (canônico)
 * - "UBERON_123"                                     (estilo OBO/purl)
 * - "uberon:123"                                      (minúsculo)
 * - "http(s)://purl.obolibrary.org/obo/UBERON_123"    (URI completa do OBO)
 * - "123"                                              (só o número — o que
 *   o Wikidata realmente devolve para P1554: o prefixo "UBERON_" já está no
 *   template da formatter URL da propriedade, "obo/UBERON_$1", não no valor
 *   gravado na declaração. Sem aceitar este formato, os únicos sids reais
 *   que tinham P1554 ficavam com um valor que reprovava o schema antes desta
 *   correção — e, se normUberon só aceitasse os formatos com prefixo, o
 *   valor seria simplesmente descartado depois, um regressão silenciosa
 *   pior que o erro original: 0 sids com ids.uberon em vez de 14 com o
 *   valor no formato errado.)
 *
 * Qualquer outro valor (vazio, sem número, formato desconhecido) devolve
 * `null` — o chamador deve então omitir o campo em vez de gravar um valor
 * que vai falhar na validação.
 *
 * @param {string|null|undefined} v
 * @returns {string|null}
 */
export function normUberon(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;

  const uriMatch = s.match(/^https?:\/\/purl\.obolibrary\.org\/obo\/UBERON_([0-9]+)$/i);
  if (uriMatch) return `UBERON:${uriMatch[1]}`;

  const prefixMatch = s.match(/^UBERON[:_]([0-9]+)$/i);
  if (prefixMatch) return `UBERON:${prefixMatch[1]}`;

  const bareDigitsMatch = s.match(/^([0-9]+)$/);
  if (bareDigitsMatch) return `UBERON:${bareDigitsMatch[1]}`;

  return null;
}
