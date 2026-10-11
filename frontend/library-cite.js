/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * frontend/library-cite.js
 * Biblioteca LAIFT: citação ABNT (NBR 6023:2018) e Vancouver (ICMJE/NLM) de um artigo, e a
 * tabela única de rótulos de tipo e licença (CONTRATO-B2 §4.2 e §4.3). Função pura: sem DOM,
 * sem rede. Entrada inválida devolve ''. Usada pela ficha do painel, pela página pública e
 * pela aba admin.
 */
(function () {
  'use strict';

  const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
  const ABNT_ET_AL_FROM = 4;
  const VANCOUVER_ET_AL_FROM = 7;
  const VANCOUVER_LISTED = 6;

  const LABELS = Object.freeze({
    type: Object.freeze({
      artigo: 'Artigo original',
      revisao: 'Revisão',
      revisao_sistematica: 'Revisão sistemática',
      meta_analise: 'Metanálise',
      ensaio_clinico: 'Ensaio clínico',
      relato_caso: 'Relato de caso',
      diretriz: 'Diretriz',
      outro: 'Outro',
    }),
    language: Object.freeze({
      pt: 'Português',
      en: 'English',
    }),
    license: Object.freeze({
      'cc-by': 'CC BY',
      'cc-by-sa': 'CC BY-SA',
      'cc-by-nd': 'CC BY-ND',
      'cc-by-nc': 'CC BY-NC',
      'cc-by-nc-sa': 'CC BY-NC-SA',
      'cc-by-nc-nd': 'CC BY-NC-ND',
      cc0: 'CC0',
      pd: 'Domínio público',
      outra: 'Licença do editor',
      desconhecida: 'Licença não informada pelo editor',
    }),
  });

  function lookup(table, key) {
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : '';
  }

  function typeLabel(key) {
    return lookup(LABELS.type, key);
  }

  /** Selo de idioma em texto: 'Português' ou 'English'; outro idioma ou sem idioma: ''. */
  function languageLabel(key) {
    return lookup(LABELS.language, key);
  }

  function licenseLabel(key) {
    return lookup(LABELS.license, key);
  }

  /** Texto aparado; número finito vira string; qualquer outra coisa vira ''. */
  function text(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return typeof value === 'string' ? value.trim() : '';
  }

  /** Garante ponto final, preservando ? e !. */
  function endPunct(value) {
    return /[.?!]$/.test(value) ? value : value + '.';
  }

  /** Segmento opcional: vazio some; senão recebe pontuação final. */
  function seg(value) {
    return value ? endPunct(value) : '';
  }

  function joinSegments(segments) {
    return segments.filter(Boolean).join(' ');
  }

  function isArticle(article) {
    return Boolean(article) && typeof article === 'object' && text(article.title) !== '';
  }

  /** Autores com sobrenome; sem sobrenome a entrada é descartada. */
  function validAuthors(article) {
    const list = Array.isArray(article.authors) ? article.authors : [];
    return list
      .map((a) => ({ family: text(a && a.family), given: text(a && a.given) }))
      .filter((a) => a.family !== '');
  }

  /** Total declarado (pode passar da lista, que vem cortada em 30) ou o tamanho da lista. */
  function totalAuthors(article, list) {
    const declared = Number.isInteger(article.authorCount) ? article.authorCount : 0;
    return Math.max(declared, list.length);
  }

  function firstChar(part) {
    return Array.from(part)[0] || '';
  }

  /** "Ana Maria" -> "A. M."; "Jean-Paul" -> "J.-P.". */
  function initialsAbnt(given) {
    return given
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part
        .split('-')
        .filter(Boolean)
        .map((p) => firstChar(p).toLocaleUpperCase('pt-BR') + '.')
        .join('-'))
      .join(' ');
  }

  /** "Ana Maria" -> "AM"; "Jean-Paul" -> "JP". */
  function initialsVancouver(given) {
    return given
      .split(/[\s-]+/)
      .filter(Boolean)
      .map((p) => firstChar(p).toLocaleUpperCase('pt-BR'))
      .join('');
  }

  function abntAuthor(a) {
    const family = a.family.toLocaleUpperCase('pt-BR');
    const initials = initialsAbnt(a.given);
    return initials ? `${family}, ${initials}` : family;
  }

  function vancouverAuthor(a) {
    const initials = initialsVancouver(a.given);
    return initials ? `${a.family} ${initials}` : a.family;
  }

  function abntAuthors(article) {
    const list = validAuthors(article);
    if (list.length === 0) return '';
    if (totalAuthors(article, list) >= ABNT_ET_AL_FROM) return `${abntAuthor(list[0])} et al.`;
    return list.map(abntAuthor).join('; ');
  }

  function vancouverAuthors(article) {
    const list = validAuthors(article);
    if (list.length === 0) return '';
    const names = list.map(vancouverAuthor);
    if (totalAuthors(article, list) >= VANCOUVER_ET_AL_FROM) {
      return `${names.slice(0, VANCOUVER_LISTED).join(', ')}, et al.`;
    }
    return names.join(', ');
  }

  /** "2026-10-10" -> "10 out. 2026"; data inválida devolve ''. */
  function accessDatePt(iso) {
    const m = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
    if (!m) return '';
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return `${day} ${MESES[month - 1]} ${Number(m[1])}`;
  }

  function abntLocator(doi, pmid) {
    if (doi) return `Disponível em: https://doi.org/${doi}`;
    if (pmid) return `Disponível em: https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
    return '';
  }

  function abntPieces(article) {
    const year = text(article.year) || '[s. d.]';
    const volume = text(article.volume);
    const issue = text(article.issue);
    const pages = text(article.pages);
    return [
      text(article.journal),
      volume ? `v. ${volume}` : '',
      issue ? `n. ${issue}` : '',
      pages ? `p. ${pages}` : '',
      year,
    ].filter(Boolean).join(', ');
  }

  /** ABNT NBR 6023:2018, artigo de periódico online. Ver CONTRATO-B2 §4.2. */
  function abnt(article, options) {
    if (!isArticle(article)) return '';
    const doi = text(article.doi);
    const access = accessDatePt(options && options.accessDate);
    return joinSegments([
      seg(abntAuthors(article)),
      seg(text(article.title)),
      seg(abntPieces(article)),
      doi ? seg(`DOI: ${doi}`) : '',
      seg(abntLocator(doi, text(article.pmid))),
      access ? seg(`Acesso em: ${access}`) : '',
    ]);
  }

  /** Ano, volume, número e páginas no padrão NLM: 2021;12(3):45-67. Ausente, some. */
  function vancouverDate(article) {
    const volume = text(article.volume);
    const issue = text(article.issue);
    const pages = text(article.pages);
    let out = text(article.year) || '[s.d.]';
    if (volume) out += `;${volume}${issue ? `(${issue})` : ''}`;
    if (pages) out += `:${pages}`;
    return endPunct(out);
  }

  function vancouverLocator(doi, pmid) {
    if (doi) return `doi: ${doi}`;
    return pmid ? seg(`PMID: ${pmid}`) : '';
  }

  /** Vancouver (ICMJE/NLM). Ver CONTRATO-B2 §4.2. */
  function vancouver(article) {
    if (!isArticle(article)) return '';
    return joinSegments([
      seg(vancouverAuthors(article)),
      seg(text(article.title)),
      seg(text(article.journalAbbrev) || text(article.journal)),
      vancouverDate(article),
      vancouverLocator(text(article.doi), text(article.pmid)),
    ]);
  }

  const api = { abnt, vancouver, LABELS, typeLabel, licenseLabel, languageLabel };

  // Navegador: window.LaiftLibraryCite. Node: module.exports, para scripts/library-cite.test.mjs.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    window.LaiftLibraryCite = api;
  }
})();
