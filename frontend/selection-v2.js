/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Processo seletivo v2 (flag selection_v2_enabled; docs/seletivo-v2.md): muda só a APRESENTAÇÃO da jornada do candidato.
// selection.js segue dono de tudo: dados, etapas, rascunho no servidor, validações, aceite, aviso, confirmação antes de enviar
// e a regra "só visitantes". Ao desenhar cada tela, selection.js avisa (evento laift:selection-render) e este script, com a
// flag ligada, acrescenta por cima do mesmo DOM: cabeçalho com progresso e prazo, o aviso sobre dados de saúde, a lista de
// etapas e "Como funciona" na tela inicial. Nenhum campo, botão ou texto de validação é trocado; nenhum número é inventado
// (progresso e prazo vêm do que a API já devolveu). Carregado SOB DEMANDA (pacote "seletivo2" de lazy-bundles.js).
// Só DOM seguro (createElement e textContent); sem HTML por texto e sem estilo inline (só a variável --p da barra).
(function (root) {
  'use strict';

  var STYLE_HREF = 'selection-v2.css';
  var STYLE_ATTR = 'data-selection-v2-css';
  var FLAG_ATTR = 'data-flag-selection-v2-enabled';
  var RENDER_EVENT = 'laift:selection-render';
  var TOTAL_STEPS = 6;
  var STEP_IDS = ['intro', 'profile', 'scenario', 'thinking', 'conduct', 'review'];
  var STEP_LABELS = { intro: 'Aceite', profile: 'Perfil', scenario: 'Cenário', thinking: 'Seu raciocínio', conduct: 'Conduta', review: 'Revisão' };
  // Telas com campos de texto livre: onde o aviso sobre dados de saúde aparece.
  var NOTICE_VIEWS = ['welcome', 'intro', 'profile', 'scenario', 'thinking', 'conduct', 'status-draft'];
  var HEALTH_STRONG = 'Cuidado com os dados.';
  var HEALTH_TEXT = ' Nos campos de texto, não escreva dados de saúde, seus ou de terceiros.';

  // ---------- Funções puras ----------

  function stepIndex(id) { return STEP_IDS.indexOf(id); }

  /** Quantas etapas já estão concluídas: as anteriores à alcançada; "done" = as cinco de preenchimento. */
  function completedCount(application) {
    if (!application || application.status !== 'draft') return 0;
    if (application.step === 'done') return TOTAL_STEPS - 1;
    return Math.max(0, stepIndex(application.step));
  }

  /** Percentual da barra (etapas concluídas de seis). */
  function progressPct(application) { return Math.round(completedCount(application) / TOTAL_STEPS * 100); }

  /** "Etapa 3 de 6" para a etapa aberta. */
  function stepLabel(view) {
    var i = stepIndex(view);
    return i < 0 ? '' : 'Etapa ' + (i + 1) + ' de ' + TOTAL_STEPS;
  }

  /** Texto da barra: "2 de 6 etapas concluídas". */
  function progressText(application) {
    var n = completedCount(application);
    return n + ' de ' + TOTAL_STEPS + ' ' + (n === 1 ? 'etapa concluída' : 'etapas concluídas');
  }

  /** Itens da lista de etapas do rascunho: estado e se pode abrir (mesma regra do passo a passo). */
  function stepItems(application, canVisit) {
    var done = completedCount(application);
    return STEP_IDS.map(function (id, i) {
      var state = i < done ? 'done' : i === done ? 'current' : 'todo';
      return {
        id: id, label: STEP_LABELS[id], state: state,
        stateText: state === 'done' ? 'Concluída' : state === 'current' ? 'Em andamento' : 'Disponível depois da etapa anterior',
        canOpen: typeof canVisit === 'function' ? !!canVisit(id, application) : false,
      };
    });
  }

  /** "Como funciona" a partir do que o servidor informou (prazo em dias e data da próxima análise já formatada). */
  function howItems(windowDays, reviewDate) {
    var days = windowDays || 7;
    return [
      'Aceite o edital e o tratamento dos seus dados, e conte um pouco sobre você.',
      'Preencha as etapas no seu ritmo. O rascunho fica salvo e o prazo é de ' + days + ' dias a partir do início.',
      'Revise e envie. Depois do envio, não dá para editar; você recebe um comprovante.',
      'A comissão analisa as inscrições em lotes' + (reviewDate ? ' (próxima análise: ' + reviewDate + ')' : '') + '. O resultado chega pela plataforma e por e-mail.',
    ];
  }

  /** Chave da tela para o aviso e o cabeçalho: o rascunho em "status" é um caso à parte. */
  function viewKey(view, application) {
    if (view === 'status') return application && application.status === 'draft' ? 'status-draft' : 'status';
    return view;
  }

  function showsNotice(key) { return NOTICE_VIEWS.indexOf(key) !== -1; }

  // ---------- DOM ----------

  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function ensureStyles(doc) {
    if (!doc || !doc.head || doc.querySelector('link[' + STYLE_ATTR + ']')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.setAttribute(STYLE_ATTR, '1');
    doc.head.appendChild(link);
  }

  function noticeNode(doc) {
    var box = el(doc, 'div', 's2-notice');
    box.setAttribute('role', 'note');
    box.appendChild(el(doc, 'strong', null, HEALTH_STRONG));
    box.appendChild(el(doc, 'span', null, HEALTH_TEXT));
    return box;
  }

  function progressNode(doc, application) {
    var wrap = el(doc, 'div', 's2-progress');
    var pct = progressPct(application);
    var bar = el(doc, 'div', 's2-bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Etapas concluídas');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(pct));
    bar.setAttribute('aria-valuetext', progressText(application));
    var fill = el(doc, 'i');
    fill.style.setProperty('--p', pct + '%');
    bar.appendChild(fill);
    wrap.appendChild(bar);
    wrap.appendChild(el(doc, 'p', 's2-progress__text', progressText(application)));
    return wrap;
  }

  function stepsList(doc, application, api) {
    var ol = el(doc, 'ol', 's2-steps');
    ol.setAttribute('aria-label', 'Etapas da inscrição');
    stepItems(application, api.canVisit).forEach(function (item, i) {
      var li = el(doc, 'li');
      var inner = [el(doc, 'span', 's2-steps__n', item.state === 'done' ? '✓' : String(i + 1)), null];
      var text = el(doc, 'span', 's2-steps__t');
      text.appendChild(el(doc, 'strong', null, item.label));
      text.appendChild(el(doc, 'small', null, item.stateText));
      inner[1] = text;
      var node;
      if (item.canOpen) {
        node = el(doc, 'button', 's2-steps__item is-' + item.state);
        node.setAttribute('type', 'button');
        if (item.state === 'current') node.setAttribute('aria-current', 'step');
        node.addEventListener('click', function () { if (api.openView) api.openView(item.id); });
      } else {
        node = el(doc, 'div', 's2-steps__item is-' + item.state);
        node.setAttribute('aria-disabled', 'true');
      }
      inner.forEach(function (n) { node.appendChild(n); });
      li.appendChild(node);
      ol.appendChild(li);
    });
    return ol;
  }

  function howBlock(doc, overview, api) {
    var box = el(doc, 'section', 's2-how');
    box.appendChild(el(doc, 'h3', 's2-how__t', 'Como funciona'));
    var ol = el(doc, 'ol', 's2-how__l');
    var review = overview && api.formatReviewDate ? api.formatReviewDate(overview.nextReviewOn) : '';
    howItems(overview && overview.windowDays, review).forEach(function (t) { ol.appendChild(el(doc, 'li', null, t)); });
    box.appendChild(ol);
    var links = el(doc, 'p', 's2-how__links');
    [['edital.html', 'Edital'], ['privacidade.html', 'Privacidade']].forEach(function (pair, i) {
      if (i) links.appendChild(doc.createTextNode(' · '));
      var a = el(doc, 'a', null, pair[1]);
      a.setAttribute('href', pair[0]);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      links.appendChild(a);
    });
    box.appendChild(links);
    return box;
  }

  /** Direct child of parent that matches the selector. */
  function childMatching(parent, selector) {
    for (var i = 0; i < parent.children.length; i++) if (parent.children[i].matches(selector)) return parent.children[i];
    return null;
  }

  /** Cabeçalho: leva título, introdução e prazo (e, quando pedido, as ações) para dentro; título mantém o id. */
  function buildHero(doc, card, withActions) {
    var hero = el(doc, 'header', 's2-hero');
    card.insertBefore(hero, card.firstChild);
    ['.sel-title', '.sel-intro', '.sel-deadline'].forEach(function (sel) {
      var n = childMatching(card, sel);
      if (n) hero.appendChild(n);
    });
    if (withActions) {
      var actions = childMatching(card, '.sel-actions');
      if (actions) hero.appendChild(actions);
    }
    return hero;
  }

  function decorate(doc, api) {
    var host = doc.getElementById('selection-root');
    var card = host ? host.querySelector('.sel-card[data-sel-step]') : null;
    if (!card || card.hasAttribute('data-s2')) return false;
    var snap = api.snapshot ? api.snapshot() : null;
    var application = snap ? snap.application : null;
    var view = card.getAttribute('data-sel-step');
    var key = viewKey(view, application);
    card.setAttribute('data-s2', key);
    card.classList.add('s2-card');
    var hub = key === 'welcome' || key === 'status-draft';
    var hero = buildHero(doc, card, hub);
    if (stepIndex(view) !== -1) {
      hero.insertBefore(el(doc, 'p', 's2-hero__kicker', stepLabel(view)), hero.firstChild);
      hero.appendChild(progressNode(doc, application));
    } else if (key === 'status-draft') {
      hero.insertBefore(el(doc, 'p', 's2-hero__kicker', 'Sua inscrição'), hero.firstChild);
      hero.insertBefore(progressNode(doc, application), childMatching(hero, '.sel-actions'));
    } else if (key === 'welcome') {
      hero.insertBefore(el(doc, 'p', 's2-hero__kicker', 'Jornada do candidato'), hero.firstChild);
    } else {
      hero.insertBefore(el(doc, 'p', 's2-hero__kicker', 'Processo seletivo'), hero.firstChild);
      var receipt = childMatching(card, '.sel-receipt');
      if (receipt) hero.appendChild(receipt);
    }
    var after = hero.nextSibling;
    if (showsNotice(key)) card.insertBefore(noticeNode(doc), after);
    if (key === 'status-draft') {
      var list = stepsList(doc, application, api);
      card.insertBefore(list, childMatching(card, '.sel-live'));
      card.insertBefore(howBlock(doc, snap && snap.overview, api), childMatching(card, '.sel-live'));
    }
    return true;
  }

  var installed = null;

  /** Liga o ouvinte (uma vez por documento). Só desenha com a flag ligada no <html>. */
  function install(doc, api) {
    var d = doc || root.document;
    var sel = api || root.LaiftSelection;
    if (!d || !sel || installed) return false;
    ensureStyles(d);
    var handler = function () {
      if (!d.documentElement.hasAttribute(FLAG_ATTR)) return;
      decorate(d, sel);
    };
    d.addEventListener(RENDER_EVENT, handler);
    installed = { doc: d, handler: handler };
    // A tela pode já ter sido desenhada antes do pacote chegar.
    if (d.documentElement.hasAttribute(FLAG_ATTR)) {
      var title = d.getElementById('sel-title');
      var hadFocus = title && d.activeElement === title;
      if (decorate(d, sel) && hadFocus) { var t = d.getElementById('sel-title'); if (t && t.focus) t.focus(); }
    }
    return true;
  }

  /** Solta o ouvinte; a próxima tela desenhada volta a ser a de sempre. */
  function reset() {
    if (!installed) return;
    installed.doc.removeEventListener(RENDER_EVENT, installed.handler);
    installed = null;
  }

  var api = {
    RENDER_EVENT: RENDER_EVENT, STEP_IDS: STEP_IDS, completedCount: completedCount, progressPct: progressPct, stepLabel: stepLabel,
    progressText: progressText, stepItems: stepItems, howItems: howItems, viewKey: viewKey, showsNotice: showsNotice,
    ensureStyles: ensureStyles, install: install, reset: reset,
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftSelectionV2 = api;
  install(root.document, root.LaiftSelection);
})(typeof self !== 'undefined' ? self : this);
