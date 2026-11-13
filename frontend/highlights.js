/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Destaques da Liga (docs/destaques.md): bloco "Na Liga" da tela Início, atrás da flag highlights_enabled.
// Carregado SOB DEMANDA (pacote "destaques" de lazy-bundles.js), só com a flag ligada ou ao abrir a tela de gestão.
// Junta os itens manuais (apiListHighlights) com os automáticos do cliente, sem gravação no banco: próximos eventos
// (apiListEvents) e a publicação recente do blog (blog/index.json). O teto de 8 itens vale para o conjunto, e os
// manuais têm prioridade. Só DOM seguro (createElement e textContent), sem innerHTML e sem estilo inline (CSP).
// Falha em qualquer fonte: o bloco usa o que conseguiu ou some; nunca quebra a Início.
(function (root) {
  'use strict';

  var VISIBLE_MAX = 8;
  var AUTO_EVENTS_MAX = 3;
  var BLOG_RECENT_DAYS = 14;
  var MS_DAY = 24 * 60 * 60 * 1000;
  var STYLE_HREF = 'highlights.css';
  var HOST_ID = 'home-highlights';
  var KIND_LABELS = { aviso: 'Aviso', evento: 'Evento', edital: 'Edital', blog: 'Blog', link: 'Link' };
  var BLOG_HREF_RE = /^blog\/[a-z0-9-]+\.html$/;
  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var generation = 0;

  function kindLabel(kind) {
    return Object.prototype.hasOwnProperty.call(KIND_LABELS, kind) ? KIND_LABELS[kind] : KIND_LABELS.link;
  }

  /** Destino do clique: caminho interno ("/blog/") ou https; qualquer outra coisa não vira link. */
  function linkTarget(linkPath) {
    if (typeof linkPath !== 'string' || !linkPath || /[\s\\]/.test(linkPath)) return null;
    if (linkPath.charAt(0) === '/') return linkPath.charAt(1) === '/' ? null : { href: linkPath, external: false };
    try {
      var url = new URL(linkPath);
      if (url.protocol === 'https:' && !url.username && !url.password) return { href: url.href, external: true };
    } catch (e) { /* link inválido: sem destino */ }
    return null;
  }

  /** "2026-11-30" (campo de data) -> fim desse dia no horário local, em ISO. Vazio ou inválido: ''. */
  function endOfDayIso(dateValue) {
    var m = typeof dateValue === 'string' ? DATE_RE.exec(dateValue) : null;
    if (!m) return '';
    var date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 0, 0);
    return Number.isNaN(date.getTime()) || date.getMonth() !== Number(m[2]) - 1 ? '' : date.toISOString();
  }

  /** ISO -> "30/11" (data local); inválido: ''. */
  function shortDate(iso) {
    var date = new Date(iso);
    if (!iso || Number.isNaN(date.getTime())) return '';
    return String(date.getDate()).padStart(2, '0') + '/' + String(date.getMonth() + 1).padStart(2, '0');
  }

  function eventSubtitle(event) {
    var date = new Date(event.eventDate);
    var parts = [];
    if (!Number.isNaN(date.getTime())) {
      parts.push(shortDate(event.eventDate) + ' às ' + String(date.getHours()).padStart(2, '0') + 'h' + (date.getMinutes() ? String(date.getMinutes()).padStart(2, '0') : ''));
    }
    if (event.location) parts.push(String(event.location).slice(0, 60));
    return parts.join(' · ');
  }

  /** Próximos eventos (a partir de agora) como itens automáticos; o clique leva à tela de eventos. */
  function eventsToItems(events, now, max) {
    if (!Array.isArray(events)) return [];
    return events
      .filter(function (e) { return e && typeof e.title === 'string' && e.title.trim() && !Number.isNaN(new Date(e.eventDate).getTime()) && new Date(e.eventDate).getTime() >= now; })
      .sort(function (a, b) { return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(); })
      .slice(0, Math.max(0, max))
      .map(function (e) {
        return { id: 'auto-evento-' + String(e.id || ''), kind: 'evento', title: e.title.trim().slice(0, 120), subtitle: eventSubtitle(e), auto: true, panel: 'panel-events' };
      });
  }

  /** A publicação mais recente do blog (até 14 dias) como item automático; link relativo ao site. */
  function postsToItems(posts, now) {
    if (!Array.isArray(posts)) return [];
    var recent = posts
      .filter(function (p) {
        var m = p && typeof p.data === 'string' ? DATE_RE.exec(p.data) : null;
        return m && typeof p.titulo === 'string' && p.titulo.trim() && typeof p.href === 'string' && BLOG_HREF_RE.test(p.href)
          && now - Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) <= BLOG_RECENT_DAYS * MS_DAY;
      })
      .sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; });
    return recent.slice(0, 1).map(function (p) {
      return { id: 'auto-blog-' + p.href, kind: 'blog', title: p.titulo.trim().slice(0, 120), subtitle: 'Nova publicação no blog', auto: true, linkPath: '/' + p.href };
    });
  }

  /** Manuais primeiro; os automáticos entram nas vagas que sobram, sem repetir título. Teto de 8. */
  function mergeItems(manual, autos, max) {
    var cap = max || VISIBLE_MAX;
    var out = (Array.isArray(manual) ? manual : []).slice(0, cap);
    var seen = {};
    out.forEach(function (item) { seen[String(item.title).toLowerCase()] = true; });
    (Array.isArray(autos) ? autos : []).forEach(function (item) {
      var key = String(item.title).toLowerCase();
      if (out.length >= cap || seen[key]) return;
      seen[key] = true;
      out.push(item);
    });
    return out;
  }

  function ensureStyles(doc) {
    if (!doc || !doc.head || doc.querySelector('link[data-highlights-css]')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.setAttribute('data-highlights-css', '1');
    doc.head.appendChild(link);
  }

  function node(doc, tag, className, text) {
    var el = doc.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }

  function buildCard(doc, item, app) {
    var target = linkTarget(item.linkPath);
    var card;
    if (target) {
      card = node(doc, 'a', 'hl-card');
      card.href = target.href;
      if (target.external) { card.target = '_blank'; card.rel = 'noopener noreferrer'; }
    } else if (item.panel && app && typeof app.showPanel === 'function') {
      card = node(doc, 'button', 'hl-card');
      card.type = 'button';
      card.addEventListener('click', function () { app.showPanel(item.panel); });
    } else {
      card = node(doc, 'div', 'hl-card hl-card--static');
    }
    card.appendChild(node(doc, 'span', 'hl-kind', kindLabel(item.kind)));
    card.appendChild(node(doc, 'strong', 'hl-title', item.title));
    if (item.subtitle) card.appendChild(node(doc, 'span', 'hl-sub', item.subtitle));
    if (target && target.external) card.appendChild(node(doc, 'span', 'sr-only', ' (abre em nova aba)'));
    return card;
  }

  /** Desenha a lista; sem itens, esconde o bloco inteiro (a Início fica como era). */
  function renderBlock(doc, host, items, app) {
    while (host.firstChild) host.removeChild(host.firstChild);
    if (!items.length) { host.classList.add('hidden'); return; }
    host.appendChild(node(doc, 'h2', 'hl-heading', 'Na Liga')).id = HOST_ID + '-title';
    host.setAttribute('aria-labelledby', HOST_ID + '-title');
    var list = node(doc, 'ul', 'hl-list');
    items.forEach(function (item) {
      var li = node(doc, 'li', 'hl-item');
      li.appendChild(buildCard(doc, item, app));
      list.appendChild(li);
    });
    host.appendChild(list);
    host.classList.remove('hidden');
  }

  function fetchBlogPosts(win) {
    if (!win || typeof win.fetch !== 'function') return Promise.resolve([]);
    return win.fetch('blog/index.json', { cache: 'no-cache' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (index) { return index && Array.isArray(index.posts) ? index.posts : []; })
      .catch(function () { return []; });
  }

  /** Itens automáticos (próximos eventos e blog recente). Cada fonte falha sozinha, sem derrubar a outra. */
  function loadAutomatic(app, token, win) {
    var now = Date.now();
    var events = Promise.resolve(app.callApi('apiListEvents', token))
      .then(function (res) { return res && res.success ? eventsToItems(res.events, now, AUTO_EVENTS_MAX) : []; })
      .catch(function () { return []; });
    var posts = fetchBlogPosts(win).then(function (list) { return postsToItems(list, now); });
    return Promise.all([events, posts]).then(function (parts) { return parts[0].concat(parts[1]); });
  }

  /** Monta o bloco na Início. Cada chamada vale só até a próxima (resposta atrasada é descartada). */
  function mount(app, doc) {
    var host = doc.getElementById(HOST_ID);
    if (!host || !app) return Promise.resolve();
    generation += 1;
    var mine = generation;
    var token = app.getState().sessionToken || '';
    if (!token) { renderBlock(doc, host, [], app); return Promise.resolve(); } // visitante: o bloco "Na Liga" é do membro (evita 401)
    return Promise.resolve(app.callApi('apiListHighlights', token)).then(function (res) {
      if (mine !== generation) return undefined;
      if (!res || res.success !== true || res.enabled === false) { renderBlock(doc, host, [], app); return undefined; }
      ensureStyles(doc);
      var manual = Array.isArray(res.highlights) ? res.highlights : [];
      return loadAutomatic(app, token, root).then(function (autos) {
        if (mine === generation) renderBlock(doc, host, mergeItems(manual, autos, VISIBLE_MAX), app);
      });
    }).catch(function () { if (mine === generation) renderBlock(doc, host, [], app); });
  }

  /** Logout: solta respostas em voo e esconde o bloco. */
  function reset(doc) {
    generation += 1;
    var host = doc && doc.getElementById(HOST_ID);
    if (host) renderBlock(doc, host, [], null);
  }

  var api = {
    VISIBLE_MAX: VISIBLE_MAX, KIND_LABELS: KIND_LABELS, kindLabel: kindLabel, linkTarget: linkTarget, endOfDayIso: endOfDayIso,
    shortDate: shortDate, eventsToItems: eventsToItems, postsToItems: postsToItems, mergeItems: mergeItems,
    ensureStyles: ensureStyles, node: node, loadAutomatic: loadAutomatic, renderBlock: renderBlock, mount: mount, reset: reset,
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftHighlights = api;
})(typeof self !== 'undefined' ? self : this);
