/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Lia: fontes citadas sob a resposta e convite da prévia de IA (extraído de assistant.js, que tem teto de
// linhas). Tudo vindo do servidor é dado não confiável: o texto entra por textContent e o único href que
// existe é copiado de uma LISTA FIXA deste arquivo (nunca do valor recebido), só para caminhos relativos.
//   - PUBLIC_PATHS: páginas públicas que uma fonte pode abrir (`url` opcional de `sources`). É IGUAL à lista de
//     worker/src/assistant/publicLinks.js (o teste assistant.test.mjs confere).
//   - CTA_PATHS: onde o convite para criar conta pode levar (o cadastro abre por hash na tela de entrada).
//   - Artigos da Biblioteca citados pela Lia (`references`, flag lia_library_enabled): título, autores, periódico e ano
//     por textContent; o link só existe se a url for https://doi.org/ ou https://pubmed.ncbi.nlm.nih.gov/ (a mesma
//     regra do banco), e o href é montado com o host da LISTA FIXA daqui.
// Expõe window.LaiftAssistantSources.
(function (root) {
  'use strict';

  var PUBLIC_PATHS = ['/liga.html', '/edital.html', '/processo-seletivo.html', '/blog.html', '/biblioteca', '/termos.html', '/privacidade.html'];
  var CTA_PATHS = ['/#cadastro'];
  var MAX_SOURCES = 4;
  var CTA_TEXT_MAX = 200;
  var MAX_REFERENCES = 3;
  var QUERY_MAX = 120;
  var REFERENCE_URL = /^https:\/\/(doi\.org|pubmed\.ncbi\.nlm\.nih\.gov)(\/[^\s<>"']{1,260})$/;
  var REFERENCE_HOSTS = ['doi.org', 'pubmed.ncbi.nlm.nih.gov'];

  function clip(value, max) { return typeof value === 'string' ? value.slice(0, max) : ''; }

  function isPublicPath(path) { return typeof path === 'string' && PUBLIC_PATHS.indexOf(path) !== -1; }

  /**
   * Fontes: texto curto, no máximo 4. Só viram link se trouxerem `url` EXATAMENTE igual a um caminho relativo da
   * lista PUBLIC_PATHS; qualquer outro valor (URL absoluta, javascript:, com query) é descartado.
   */
  function sanitizeSources(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (s) { return !!s && typeof s.source === 'string' && s.source.trim(); })
      .slice(0, MAX_SOURCES)
      .map(function (s) {
        var out = { source: clip(s.source, 80).trim(), section: clip(s.section, 120).trim() };
        if (isPublicPath(s.url)) out.url = s.url;
        return out;
      });
  }

  /** Convite ({ text, url }): texto curto e url só da lista CTA_PATHS; senão, nenhum convite (null). */
  function sanitizeCta(cta) {
    if (!cta || typeof cta !== 'object' || typeof cta.text !== 'string' || CTA_PATHS.indexOf(cta.url) === -1) return null;
    var text = clip(cta.text, CTA_TEXT_MAX).trim();
    return text ? { text: text, url: cta.url } : null;
  }

  /** Busca da Biblioteca que o botão "Ver na Biblioteca" leva pronta: texto simples, sem controle nem marcação, até 120. */
  function cleanQuery(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, QUERY_MAX).trim();
  }

  /** Referências: no máximo 3, só com título e url de host permitido; o resto é texto curto. */
  function sanitizeReferences(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (r) { return !!r && typeof r.title === 'string' && r.title.trim() && typeof r.url === 'string' && REFERENCE_URL.test(r.url); })
      .slice(0, MAX_REFERENCES)
      .map(function (r) {
        var year = typeof r.year === 'number' && r.year >= 1800 && r.year <= 2100 ? r.year : null;
        return { title: clip(r.title, 300).trim(), authors: clip(r.authors, 200).trim(), journal: clip(r.journal, 200).trim(), year: year, url: r.url };
      });
  }

  function node(doc, tag, className, text) {
    var n = doc.createElement(tag);
    if (className) n.className = className;
    if (text) n.textContent = text;
    return n;
  }

  /** Lista de fontes sob a resposta. `labelOf(source)` dá o rótulo legível; link só com url da allowlist. */
  function renderSources(doc, sources, labelOf) {
    var box = node(doc, 'div', 'lia-sources');
    box.appendChild(node(doc, 'p', 'lia-sources-title', 'Fontes'));
    var list = node(doc, 'ul', 'lia-sources-list');
    list.setAttribute('aria-label', 'Fontes desta resposta');
    sources.forEach(function (s) {
      var label = labelOf(s.source);
      var text = s.section ? label + ' · ' + s.section : label;
      var item = node(doc, 'li', '');
      if (isPublicPath(s.url)) {
        var link = node(doc, 'a', 'lia-source-link', text);
        link.setAttribute('href', PUBLIC_PATHS[PUBLIC_PATHS.indexOf(s.url)]);
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
        item.appendChild(link);
      } else {
        item.textContent = text;
      }
      list.appendChild(item);
    });
    box.appendChild(list);
    return box;
  }

  /** "Artigos na Biblioteca": lista de links (abrem em outra aba) com autores, periódico e ano em texto. */
  function renderReferences(doc, refs) {
    var box = node(doc, 'div', 'lia-sources lia-references');
    box.appendChild(node(doc, 'p', 'lia-sources-title', 'Artigos na Biblioteca'));
    var list = node(doc, 'ul', 'lia-sources-list');
    list.setAttribute('aria-label', 'Artigos da Biblioteca sobre este tema');
    refs.forEach(function (r) {
      var match = REFERENCE_URL.exec(r.url);
      if (!match) return;
      var item = node(doc, 'li', '');
      var link = node(doc, 'a', 'lia-source-link', r.title);
      link.setAttribute('href', 'https://' + REFERENCE_HOSTS[REFERENCE_HOSTS.indexOf(match[1])] + match[2]);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      item.appendChild(link);
      var meta = [r.authors, r.journal, r.year ? String(r.year) : ''].filter(Boolean).join(' · ');
      if (meta) item.appendChild(node(doc, 'span', 'lia-reference-meta', ' ' + meta));
      list.appendChild(item);
    });
    box.appendChild(list);
    return box;
  }

  /** Convite da prévia de IA: uma linha de texto com link para o cadastro (caminho da allowlist). */
  function renderCta(doc, cta) {
    var line = node(doc, 'p', 'lia-cta');
    var link = node(doc, 'a', 'lia-cta-link', cta.text);
    link.setAttribute('href', CTA_PATHS[CTA_PATHS.indexOf(cta.url)]);
    line.appendChild(link);
    return line;
  }

  var api = {
    PUBLIC_PATHS: PUBLIC_PATHS, CTA_PATHS: CTA_PATHS, isPublicPath: isPublicPath,
    sanitizeSources: sanitizeSources, sanitizeCta: sanitizeCta, renderSources: renderSources, renderCta: renderCta,
    cleanQuery: cleanQuery, sanitizeReferences: sanitizeReferences, renderReferences: renderReferences,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LaiftAssistantSources = api;
})(typeof window !== 'undefined' ? window : globalThis);
