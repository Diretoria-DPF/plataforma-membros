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
// Expõe window.LaiftAssistantSources.
(function (root) {
  'use strict';

  var PUBLIC_PATHS = ['/liga.html', '/edital.html', '/processo-seletivo.html', '/blog.html', '/biblioteca', '/termos.html', '/privacidade.html'];
  var CTA_PATHS = ['/#cadastro'];
  var MAX_SOURCES = 4;
  var CTA_TEXT_MAX = 200;

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
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LaiftAssistantSources = api;
})(typeof window !== 'undefined' ? window : globalThis);
