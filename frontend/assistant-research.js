/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Pesquisa externa e registro da Lia, na tela: rótulos legíveis das fontes, aviso
// "já pesquisada", bloco de referências (Europe PMC) e aviso de privacidade. Tudo por
// createElement, textContent e setAttribute: nunca HTML a partir de texto. Links só para https em
// domínios da lista branca, sempre com target _blank e rel noopener. O aviso de
// privacidade fica marcado UMA vez no navegador (chave abaixo); a conversa nunca.
// Sem este script, a Lia segue igual. Expõe window.LaiftAssistantResearch (ou
// module.exports, no Node).
(function (root) {
  'use strict';

  // Rótulos das fontes que o servidor devolve. Id desconhecido volta como veio.
  var SOURCE_LABELS = {
    kb: 'Guia da plataforma',
    destinos: 'Telas e módulos',
    guia: 'Guia da Lia',
    privacidade: 'Privacidade',
    convivencia: 'Convivência',
    liga: 'A Liga',
    plataforma: 'Plataforma',
    modulos: 'Módulos de estudo',
    publicacoes: 'Blog e publicações',
    processo: 'Processo seletivo',
    faq: 'Perguntas frequentes',
    saude: 'Avisos de saúde',
  };
  // Lista branca de domínios de links (igual à da especificação de L07/L09).
  var RESEARCH_HOSTS = ['europepmc.org', 'www.ebi.ac.uk', 'pubmed.ncbi.nlm.nih.gov', 'doi.org', 'www.scielo.br', 'scielo.org', 'openalex.org'];
  var MAX_ITEMS = 10;
  var TITLE_MAX = 300;
  var JOURNAL_MAX = 200;
  var URL_MAX = 500;
  var MIN_YEAR = 1000;
  var MAX_YEAR = 9999;
  var HINT_KEY = 'lia.research.hint.v1';
  var EMPTY_TEXT = 'Nada encontrado para esses termos.';
  var FAIL_TEXT = 'A base externa não respondeu agora. Tente mais tarde.';
  var FOOT_TEXT = 'Referências de base externa (Europe PMC). A Lia não resume artigos nem dá orientação de saúde.';
  var CACHED_TEXT = 'Resposta já pesquisada antes, sem gastar IA.';
  var BUTTON_TEXT = 'Pesquisar mais a fundo';
  var PRIVACY_HINT = 'Só os termos gerais da pergunta vão para a base externa. Não escreva dados pessoais.';
  var PREFIX = 'Pesquisar mais a fundo: '; // prefixo só de exibição; a pesquisa recebe a pergunta sem ele
  var BUSY_TEXT = 'Pesquisando em bases científicas…';
  var REPLY_TEXT = 'Pesquisa em bases científicas:';

  // ---------------------------------------------------------------------------
  // Funções puras
  // ---------------------------------------------------------------------------
  function sourceLabel(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(SOURCE_LABELS, id) ? SOURCE_LABELS[id] : id;
  }

  /** Corta por pontos de código (não parte um par substituto) e tira espaços das pontas. */
  function clipText(value, max) {
    return typeof value === 'string' ? Array.from(value).slice(0, max).join('').trim() : '';
  }

  function yearOf(value) {
    var year = typeof value === 'string' && /^\s*\d{4}\s*$/.test(value) ? Number(value) : value;
    return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR ? year : null;
  }

  function parseUrl(value) {
    try { return new URL(value); } catch (err) { return null; } // texto que não é URL vira "sem link"
  }

  /** Só https, sem usuário, senha ou porta, e só nos domínios da lista. Qualquer outra coisa vira null. */
  function safeUrl(value) {
    if (typeof value !== 'string' || value.length > URL_MAX) return null;
    var parsed = parseUrl(value);
    if (!parsed) return null;
    var allowed = parsed.protocol === 'https:' && RESEARCH_HOSTS.indexOf(parsed.hostname) !== -1
      && parsed.username === '' && parsed.password === '' && parsed.port === '';
    return allowed ? parsed.href : null;
  }

  function sanitizeItem(item) {
    if (!item || typeof item !== 'object') return null;
    var title = clipText(item.title, TITLE_MAX);
    if (!title) return null; // item sem título não tem o que mostrar
    return { title: title, journal: clipText(item.journal, JOURNAL_MAX), year: yearOf(item.year), url: safeUrl(item.url) };
  }

  function sanitizeItems(list) {
    var out = [];
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length && out.length < MAX_ITEMS; i += 1) {
      var item = sanitizeItem(list[i]);
      if (item) out.push(item);
    }
    return out;
  }

  /** A última pergunta da pessoa, sem o prefixo do painel: é ela que vai à pesquisa. */
  function lastQuestion(messages) {
    var users = (messages || []).filter(function (m) { return m && m.role === 'user' && typeof m.text === 'string'; });
    if (!users.length) return '';
    var text = users[users.length - 1].text;
    return text.indexOf(PREFIX) === 0 ? text.slice(PREFIX.length) : text;
  }

  /** Resultado da pesquisa, sanitizado. Sem objeto (resposta sem o campo) conta como falha. */
  function sanitizeResearch(raw) {
    if (!raw || typeof raw !== 'object') return { cached: false, failed: true, items: [] };
    return { cached: raw.cached === true, failed: raw.failed === true, items: sanitizeItems(raw.items) };
  }

  // ---------------------------------------------------------------------------
  // Interface (createElement + textContent + setAttribute)
  // ---------------------------------------------------------------------------
  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function itemMeta(item) {
    return [item.journal, item.year].filter(Boolean).join(' · ');
  }

  function linkNode(doc, item) {
    var link = el(doc, 'a', 'lia-research-link', 'Abrir');
    link.setAttribute('href', item.url);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    link.setAttribute('aria-label', 'Abrir ' + item.title + ' em nova aba');
    return link;
  }

  function itemNode(doc, item) {
    var li = el(doc, 'li', 'lia-research-item');
    li.appendChild(el(doc, 'p', 'lia-research-title', item.title));
    var meta = itemMeta(item);
    if (meta) li.appendChild(el(doc, 'p', 'lia-research-meta', meta));
    if (item.url) li.appendChild(linkNode(doc, item));
    return li;
  }

  function listNode(doc, items) {
    var list = el(doc, 'ul', 'lia-research-list');
    list.setAttribute('aria-label', 'Referências encontradas');
    items.forEach(function (item) { list.appendChild(itemNode(doc, item)); });
    return list;
  }

  /** Bloco de referências: a lista, ou o estado (falha ou vazio), e sempre o rodapé. */
  function renderResearch(doc, raw) {
    var research = sanitizeResearch(raw);
    var box = el(doc, 'div', 'lia-research');
    if (research.failed) box.appendChild(el(doc, 'p', 'lia-research-state', FAIL_TEXT));
    else if (!research.items.length) box.appendChild(el(doc, 'p', 'lia-research-state', EMPTY_TEXT));
    else box.appendChild(listNode(doc, research.items));
    box.appendChild(el(doc, 'p', 'lia-research-foot', FOOT_TEXT));
    return box;
  }

  function cachedNote(doc) {
    return el(doc, 'p', 'lia-cached-note', CACHED_TEXT);
  }

  function researchButton(doc, onClick) {
    var button = el(doc, 'button', 'lia-chip lia-research-btn', BUTTON_TEXT);
    button.type = 'button';
    button.addEventListener('click', function () { if (typeof onClick === 'function') onClick(); });
    return button;
  }

  // ---------------------------------------------------------------------------
  // Aviso de privacidade (uma vez por navegador)
  // ---------------------------------------------------------------------------
  /** Armazenamento do navegador, se houver. Em alguns contextos ler a propriedade já lança exceção. */
  function browserStorage(win) {
    try { return win && win.localStorage ? win.localStorage : null; } catch (err) { return null; }
  }

  /** Mostra o aviso enquanto a chave não estiver marcada. Sem armazenamento, ou com erro, mostra. */
  function shouldShowPrivacyHint(storage) {
    try { return !(storage && storage.getItem(HINT_KEY) === '1'); } catch (err) { return true; }
  }

  function markPrivacyHintSeen(storage) {
    try {
      if (storage) storage.setItem(HINT_KEY, '1');
    } catch (err) {
      // Sem armazenamento, o aviso volta a cada página: é o lado seguro.
    }
  }

  var api = {
    SOURCE_LABELS: SOURCE_LABELS,
    RESEARCH_HOSTS: RESEARCH_HOSTS,
    HINT_KEY: HINT_KEY,
    PRIVACY_HINT: PRIVACY_HINT,
    PREFIX: PREFIX,
    BUSY_TEXT: BUSY_TEXT,
    REPLY_TEXT: REPLY_TEXT,
    lastQuestion: lastQuestion,
    sourceLabel: sourceLabel,
    sanitizeResearch: sanitizeResearch,
    renderResearch: renderResearch,
    cachedNote: cachedNote,
    researchButton: researchButton,
    browserStorage: browserStorage,
    shouldShowPrivacyHint: shouldShowPrivacyHint,
    markPrivacyHintSeen: markPrivacyHintSeen,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftAssistantResearch = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
