/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * frontend/library-detail.js
 * Ficha do artigo no painel da Biblioteca (CONTRATO-B2 §4.1): troca a lista pela ficha, com o
 * título focado, autores, revista, selos, resumo com a origem, links validados, favorito e a
 * citação ABNT ou Vancouver com cópia (CONTRATO-B2 §4.2, library-cite.js). Chama só
 * apiLearnLibraryGetArticle e apiLearnLibrarySetFavorite.
 *
 * Script clássico, carregado depois de library-cite.js e antes de library.js. Nada de
 * innerHTML: os nós nascem de LaiftDom.h, os textos entram como nó de texto e os botões
 * usam data-action (LaiftDom.delegateActions, num contêiner novo a cada ficha).
 */
(function () {
  'use strict';

  var LIBRARY_CITE = typeof module !== 'undefined' && module.exports ? require('./library-cite.js') : null;
  var LIBRARY_ROOT_ID = 'library-root';
  var NS = 'LaiftLibraryDetail.';
  var ACTION_BACK = NS + 'back';
  var ACTION_FAVORITE = NS + 'toggleFavorite';
  var ACTION_STYLE = NS + 'setStyle';
  var ACTION_COPY = NS + 'copyCitation';
  var ACTION_COLLECTION = NS + 'openCollection';
  var ACTIONS = [ACTION_BACK, ACTION_FAVORITE, ACTION_STYLE, ACTION_COPY, ACTION_COLLECTION];
  var LANDING_RE = /^https:\/\/(doi\.org|pubmed\.ncbi\.nlm\.nih\.gov)\//;
  var PMC_RE = /^https:\/\/pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC\d+\/$/;
  var SAFE_ID_RE = /^[A-Za-z0-9-]{1,80}$/;
  var CITE_STYLES = ['abnt', 'vancouver'];
  var CITE_STYLE_LABELS = { abnt: 'ABNT', vancouver: 'Vancouver' };
  var MSG = {
    loading: 'Carregando artigo…',
    loadError: 'Não foi possível abrir o artigo.',
    fallback: 'Tente novamente em instantes.',
    sessionMissing: 'Entre de novo para ver o artigo.',
    back: '← Voltar à lista',
    noSummary: 'Este artigo ainda não tem resumo da LAIFT.',
    membersOnly: 'O resumo é exclusivo para membros.',
    newTab: ' (abre em nova aba)',
    favAdd: 'Salvar nos favoritos',
    favRemove: 'Remover dos favoritos',
    favOn: 'Salvo nos favoritos.',
    favOff: 'Removido dos favoritos.',
    copied: 'Citação copiada.',
    selectText: 'Selecione e copie o texto acima.',
    copy: 'Copiar citação',
    licenseUnknown: 'Licença não informada pelo editor',
    openAccess: 'Acesso aberto',
    closedAccess: 'Acesso pelo site do editor',
  };

  var generation = 0; // descarta respostas de aberturas antigas, de antes de voltar ou do logout
  var current = null; // ficha aberta agora (estado da tela; os dados não são mutados)

  // ---------- Funções puras (testadas em scripts/library-detail.test.mjs) ----------

  function cite() { return LIBRARY_CITE || window.LaiftLibraryCite; }

  /** Texto aparado; número finito vira string; qualquer outra coisa vira ''. */
  function text(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return typeof value === 'string' ? value.trim() : '';
  }

  function count(value) { return Number.isInteger(value) && value > 0 ? value : 0; }

  /** Data do servidor formatada pelo app; sem data, ''. */
  function fmtDate(formatDate, iso) {
    var raw = text(iso);
    if (!raw) return '';
    return typeof formatDate === 'function' ? text(formatDate(raw)) : raw;
  }

  function authorName(author) {
    var family = text(author && author.family);
    var given = text(author && author.given);
    if (!family) return '';
    return given ? family + ', ' + given : family;
  }

  /** "Silva, Ana; Souza, Carlos"; o que passa da lista vira "e mais N" pelo total declarado. */
  function authorsLine(article) {
    var list = Array.isArray(article && article.authors) ? article.authors : [];
    var names = list.map(authorName).filter(Boolean);
    if (!names.length) return '';
    var more = count(article.authorCount) - list.length;
    var line = names.join('; ');
    return more > 0 ? line + ' e mais ' + more : line;
  }

  /** Só entra como link o que casa com o padrão (doi.org e PubMed por padrão); o resto vira texto. */
  function safeHref(url, pattern) {
    var value = text(url);
    return (pattern || LANDING_RE).test(value) ? value : '';
  }

  function aiNote(summary, formatDate) {
    var name = text(summary.reviewerName);
    var when = fmtDate(formatDate, summary.reviewedAt);
    var note = 'Gerado por IA e revisado';
    if (name) note += ' por ' + name;
    if (when) note += ' em ' + when;
    return note + '.';
  }

  /** Origem do resumo (CONTRATO-B2 §4.1): curadoria, IA revisada, ou '' quando não se sabe. */
  function pickSummaryNote(summary, formatDate) {
    var origin = summary && summary.origin;
    if (origin === 'curador') return 'Escrito pela curadoria.';
    if (origin === 'ia' || origin === 'ia_editado') return aiNote(summary, formatDate);
    return '';
  }

  /** "Revisão clínica: {nome}, {data}." ou '' sem revisão. */
  function clinicalNote(review, formatDate) {
    if (!review || typeof review !== 'object') return '';
    var who = [text(review.reviewerName), fmtDate(formatDate, review.reviewedAt)].filter(Boolean).join(', ');
    return who ? 'Revisão clínica: ' + who + '.' : '';
  }

  /** "Licença CC BY", "Domínio público"; sem licença, o aviso que a tela usa. */
  function licenseText(key) {
    var label = cite().licenseLabel(key);
    if (!label) return MSG.licenseUnknown;
    return /^(Licença|Domínio)/.test(label) ? label : 'Licença ' + label;
  }

  /** Nome do assunto pela lista da busca; sem nome, o slug legível ("Toxico logia"). */
  function topicName(slug, topics) {
    var key = text(slug);
    var list = Array.isArray(topics) ? topics : [];
    var found = list.find(function (topic) { return topic && topic.slug === key; });
    if (found && text(found.name)) return text(found.name);
    var plain = key.replace(/[-_]+/g, ' ').trim();
    return plain.charAt(0).toUpperCase() + plain.slice(1);
  }

  /** Dia local em AAAA-MM-DD (data de acesso da ABNT). */
  function isoDay(date) {
    var mm = String(date.getMonth() + 1).padStart(2, '0');
    var dd = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + mm + '-' + dd;
  }

  function citationText(citeStyle, article) {
    if (citeStyle === 'vancouver') return cite().vancouver(article);
    return cite().abnt(article, { accessDate: isoDay(new Date()) });
  }

  // ---------- DOM (só LaiftDom.h; texto sempre como nó de texto) ----------

  function dom() { return window.LaiftDom; }

  function h(tag, attrs, children) { return dom().h(tag, attrs, children); }

  function rootEl() { return document.getElementById(LIBRARY_ROOT_ID); }

  function sessionToken(app) {
    var state = app && app.getState ? app.getState() : null;
    return state && state.sessionToken;
  }

  function errorMessage(res) {
    var message = res && typeof res.message === 'string' ? res.message.trim() : '';
    return message || MSG.fallback;
  }

  /** Substitui o conteúdo do citação: ABNT leva o nome da revista em <strong>; o texto copiado não. */
  function citationParts(citeStyle, article, plain) {
    var journal = text(article.journal);
    var title = text(article.title);
    if (citeStyle !== 'abnt' || !journal || !title) return [plain];
    var at = plain.indexOf(journal, plain.indexOf(title) + title.length);
    if (at < 0) return [plain];
    return [plain.slice(0, at), h('strong', null, [journal]), plain.slice(at + journal.length)];
  }

  function fillCitation(node, parts) {
    dom().clear(node);
    parts.forEach(function (part) {
      node.appendChild(typeof part === 'string' ? h('span', null, [part]) : part);
    });
  }

  function announce(session, message) {
    if (session.status) session.status.textContent = message;
  }

  function closeFicha() {
    generation += 1;
    current = null;
  }

  /** Troca o conteúdo de library-root pela ficha e põe o foco no título. */
  function mountShell(session, children) {
    var box = rootEl();
    if (!box || !dom()) return;
    dom().clear(box);
    var wrap = h('div', { className: 'library-ficha' }, children);
    dom().delegateActions(wrap, ACTIONS);
    box.appendChild(wrap);
    if (session.heading) session.heading.focus();
  }

  function backButton() {
    return h('button', { type: 'button', className: 'secondary', 'data-action': ACTION_BACK }, [MSG.back]);
  }

  function showLoading(session) {
    session.heading = h('h2', { tabindex: '-1' }, ['Artigo']);
    mountShell(session, [backButton(), session.heading, h('p', { role: 'status', 'aria-busy': 'true' }, [MSG.loading])]);
  }

  function showError(session, res) {
    session.heading = h('h2', { tabindex: '-1' }, [MSG.loadError]);
    mountShell(session, [backButton(), session.heading, h('p', { role: 'alert' }, [errorMessage(res)])]);
  }

  function authorsParagraph(article) {
    var line = authorsLine(article);
    return line ? h('p', { className: 'library-autores' }, [line]) : null;
  }

  function volumeLine(article) {
    var parts = [];
    if (text(article.volume)) parts.push('v. ' + text(article.volume));
    if (text(article.issue)) parts.push('n. ' + text(article.issue));
    if (text(article.pages)) parts.push('p. ' + text(article.pages));
    return parts.join(', ');
  }

  /** Revista, ano e volume; DOI e PMID como texto (sem link); licença e acesso em texto. */
  function publicationBlock(article) {
    var line = [text(article.journal), text(article.year), volumeLine(article)].filter(Boolean).join(', ');
    var ids = [];
    if (text(article.doi)) ids.push('DOI: ' + text(article.doi));
    if (text(article.pmid)) ids.push('PMID: ' + text(article.pmid));
    var access = licenseText(article.license) + ' · ' + (article.openAccess === true ? MSG.openAccess : MSG.closedAccess);
    var lines = [h('p', null, [line])].concat(ids.map(function (id) { return h('p', { className: 'muted' }, [id]); }));
    return h('section', { className: 'library-meta' }, lines.concat([h('p', { className: 'muted' }, [access])]));
  }

  function badgesBlock(article, topics) {
    var type = cite().typeLabel(article.type);
    var areas = (Array.isArray(article.topics) ? article.topics : []).map(function (slug) {
      return topicName(slug, topics);
    });
    var badges = [type].concat(areas).filter(Boolean).map(function (label) {
      return h('span', { className: 'badge' }, [label]);
    });
    return h('div', { className: 'library-selos' }, badges);
  }

  function summaryParts(article, formatDate) {
    var summary = article.summary && typeof article.summary === 'object' ? article.summary : null;
    var body = summary && text(summary.text)
      ? [h('p', null, [text(summary.text)])]
      : [h('p', { className: 'muted' }, [MSG.noSummary])];
    var note = summary && text(summary.text) ? pickSummaryNote(summary, formatDate) : '';
    if (note) body.push(h('p', { className: 'muted' }, [note]));
    var clinical = clinicalNote(article.clinicalReview, formatDate);
    if (clinical) body.push(h('p', { className: 'muted' }, [clinical]));
    return body;
  }

  /** Resumo da LAIFT: aviso para visitante, texto com a origem ou a frase de "sem resumo". */
  function summarySection(article, formatDate) {
    var heading = h('h3', null, ['Resumo da LAIFT']);
    var body = article.membersOnly === true
      ? [h('p', { className: 'muted' }, [MSG.membersOnly])]
      : summaryParts(article, formatDate);
    return h('section', { className: 'library-resumo' }, [heading].concat(body));
  }

  function abstractSection(article) {
    var abstract = text(article.abstract);
    if (!abstract) return null;
    var parts = [h('h3', null, ['Resumo original']), h('p', null, [abstract])];
    var label = cite().licenseLabel(article.license);
    if (label) parts.push(h('p', { className: 'muted' }, ['Publicado sob licença ' + label + '.']));
    return h('section', { className: 'library-resumo' }, parts);
  }

  function externalLink(href, label) {
    return h('a', { href: href, target: '_blank', rel: 'noopener noreferrer' }, [
      label,
      h('span', { className: 'visually-hidden' }, [MSG.newTab]),
    ]);
  }

  function favoriteLabel(on) { return on ? MSG.favRemove : MSG.favAdd; }

  function favoriteButton(on) {
    return h('button', {
      type: 'button',
      className: 'secondary',
      'aria-pressed': String(on),
      'data-action': ACTION_FAVORITE,
    }, [favoriteLabel(on)]);
  }

  /** Links validados e favorito (só para membro). */
  function actionsRow(session, article) {
    var links = [];
    var landing = safeHref(article.landingUrl);
    if (landing) links.push(externalLink(landing, 'Abrir no site oficial'));
    var pmc = safeHref(article.pmcUrl, PMC_RE);
    if (pmc) links.push(externalLink(pmc, 'Texto completo aberto (PMC)'));
    var buttons = session.favoriteBtn ? [session.favoriteBtn] : [];
    return h('div', { className: 'library-acoes actions-row' }, links.concat(buttons));
  }

  /** Citar: ABNT e Vancouver (aria-pressed), o texto e "Copiar citação". */
  function citationSection(session, article) {
    session.plain = citationText(session.citeStyle, article);
    session.styleBtns = {};
    var buttons = CITE_STYLES.map(function (key) {
      var btn = h('button', {
        type: 'button',
        className: 'secondary',
        'aria-pressed': String(key === session.citeStyle),
        'data-action': ACTION_STYLE,
        'data-arg': key,
      }, [CITE_STYLE_LABELS[key]]);
      session.styleBtns[key] = btn;
      return btn;
    });
    fillCitation(session.citeEl, citationParts(session.citeStyle, article, session.plain));
    return h('section', { className: 'library-citacao-bloco' }, [
      h('h3', null, ['Citar']),
      h('div', { role: 'group', 'aria-label': 'Estilo da citação', className: 'actions-row' }, buttons),
      session.citeEl,
      h('button', { type: 'button', className: 'secondary', 'data-action': ACTION_COPY }, [MSG.copy]),
    ]);
  }

  function collectionLine(item, canOpen) {
    var title = text(item.title);
    var id = text(item.id);
    if (!canOpen || !SAFE_ID_RE.test(id)) return h('p', null, ['Faz parte de: ' + title]);
    var button = h('button', {
      type: 'button',
      className: 'secondary',
      'data-action': ACTION_COLLECTION,
      'data-arg': id,
    }, [title]);
    return h('p', null, ['Faz parte de: ', button]);
  }

  /** Coleções do artigo; visitante não vê (o servidor também não manda). */
  function collectionsSection(article, canOpen) {
    var list = (Array.isArray(article.collections) ? article.collections : [])
      .filter(function (item) { return text(item && item.title); });
    if (article.membersOnly === true || !list.length) return null;
    var lines = list.map(function (item) { return collectionLine(item, canOpen); });
    return h('section', { className: 'library-colecoes' }, [h('h3', null, ['Coleções'])].concat(lines));
  }

  function renderArticle(session, article) {
    var app = session.app;
    var formatDate = typeof app.formatDate === 'function' ? function (iso) { return app.formatDate(iso); } : null;
    session.article = article;
    session.favorite = article.isFavorite === true;
    session.citeStyle = 'abnt';
    session.heading = h('h2', { tabindex: '-1' }, [text(article.title) || 'Artigo sem título']);
    session.status = h('p', { role: 'status', className: 'muted' }, []);
    session.favoriteBtn = article.membersOnly === true ? null : favoriteButton(session.favorite);
    session.citeEl = h('p', { className: 'library-citacao' }, []);
    mountShell(session, [
      backButton(),
      session.heading,
      authorsParagraph(article),
      publicationBlock(article),
      badgesBlock(article, session.topics),
      summarySection(article, formatDate),
      abstractSection(article),
      actionsRow(session, article),
      session.status,
      citationSection(session, article),
      collectionsSection(article, typeof session.onCollection === 'function'),
    ]);
  }

  // ---------- Ações (data-action) ----------

  function focusItem(id) {
    var box = rootEl();
    if (!box || !SAFE_ID_RE.test(id) || typeof box.querySelector !== 'function') return;
    var item = box.querySelector('[data-id="' + id + '"]');
    if (item) item.focus({ preventScroll: true });
  }

  /** "Voltar à lista": tira a ficha, chama onBack (a lista volta) e devolve rolagem e foco ao item. */
  function back() {
    var session = current;
    if (!session) return;
    closeFicha();
    var box = rootEl();
    if (box) dom().clear(box);
    if (typeof session.onBack === 'function') session.onBack();
    if (typeof window.scrollTo === 'function') window.scrollTo(0, session.scrollY);
    focusItem(session.id);
  }

  function paintFavorite(session) {
    if (!session.favoriteBtn) return;
    session.favoriteBtn.setAttribute('aria-pressed', String(session.favorite));
    session.favoriteBtn.textContent = favoriteLabel(session.favorite);
  }

  /** Só troca aria-pressed depois da resposta do servidor; um clique por vez. */
  function toggleFavorite() {
    var session = current;
    if (!session || !session.article || session.favPending || session.article.membersOnly === true) return;
    var want = !session.favorite;
    session.favPending = true;
    session.app.callApi('apiLearnLibrarySetFavorite', session.token, { id: session.id, favorite: want }).then(function (res) {
      session.favPending = false;
      if (current !== session) return;
      if (!res || res.success !== true) {
        announce(session, errorMessage(res));
        return;
      }
      session.favorite = typeof res.favorite === 'boolean' ? res.favorite : want;
      paintFavorite(session);
      announce(session, session.favorite ? MSG.favOn : MSG.favOff);
    });
  }

  function fillCitationStyle(session) {
    CITE_STYLES.forEach(function (key) {
      session.styleBtns[key].setAttribute('aria-pressed', String(key === session.citeStyle));
    });
    fillCitation(session.citeEl, citationParts(session.citeStyle, session.article, session.plain));
  }

  function setStyle(citeStyle) {
    var session = current;
    if (!session || !session.article || CITE_STYLES.indexOf(citeStyle) < 0) return;
    session.citeStyle = citeStyle;
    session.plain = citationText(citeStyle, session.article);
    fillCitationStyle(session);
  }

  /** Copia o texto mostrado; sem permissão do navegador, pede para selecionar. */
  function copyCitation() {
    var session = current;
    if (!session || !session.article) return;
    var nav = window.navigator;
    var clip = nav && nav.clipboard;
    if (!clip || typeof clip.writeText !== 'function') {
      announce(session, MSG.selectText);
      return;
    }
    Promise.resolve().then(function () { return clip.writeText(session.plain); }).then(
      function () { if (current === session) announce(session, MSG.copied); },
      function () { if (current === session) announce(session, MSG.selectText); },
    );
  }

  function openCollection(id) {
    var session = current;
    if (!session || typeof session.onCollection !== 'function') return;
    closeFicha();
    session.onCollection(String(id));
  }

  // ---------- Ciclo de vida ----------

  /** Abre a ficha: id do artigo, onBack (volta à lista) e opções { topics, onCollection }. */
  function open(app, id, onBack, options) {
    var opts = options || {};
    var session = {
      app: app,
      id: text(id),
      token: sessionToken(app),
      onBack: onBack,
      onCollection: opts.onCollection,
      topics: opts.topics,
      scrollY: Number(window.scrollY) || 0,
      favorite: false,
      favPending: false,
      favoriteBtn: null,
      citeStyle: 'abnt',
      citeEl: null,
      styleBtns: {},
      plain: '',
      status: null,
      heading: null,
      article: null,
    };
    generation += 1;
    current = session;
    showLoading(session);
    if (!session.token) {
      showError(session, { message: MSG.sessionMissing });
      return;
    }
    app.callApi('apiLearnLibraryGetArticle', session.token, { id: session.id }).then(function (res) {
      if (current !== session) return;
      if (!res || res.success !== true || !res.article) showError(session, res);
      else renderArticle(session, res.article);
    });
  }

  /** Logout ou sessão expirada: descarta respostas pendentes e tira a ficha da tela. */
  function reset() {
    closeFicha();
    var box = rootEl();
    if (box && dom()) dom().clear(box);
  }

  var api = {
    open: open,
    reset: reset,
    back: back,
    toggleFavorite: toggleFavorite,
    setStyle: setStyle,
    copyCitation: copyCitation,
    openCollection: openCollection,
  };
  var pure = {
    authorsLine: authorsLine,
    safeHref: safeHref,
    pickSummaryNote: pickSummaryNote,
    clinicalNote: clinicalNote,
    licenseText: licenseText,
    topicName: topicName,
    isoDay: isoDay,
    citationText: citationText,
    LANDING_RE: LANDING_RE,
    PMC_RE: PMC_RE,
    ACTIONS: ACTIONS,
  };

  // Navegador: window.LaiftLibraryDetail. Node: module.exports, para scripts/library-detail.test.mjs.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign({}, api, pure);
  } else {
    window.LaiftLibraryDetail = api;
  }
})();
