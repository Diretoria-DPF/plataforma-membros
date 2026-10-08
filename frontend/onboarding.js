/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Onboarding por papel: na primeira entrada autenticada, um <dialog> com showModal() (foco preso,
// Esc fecha, foco volta) mostra 3 passos para visitante, membro ou administrador (4 quando a Lia
// está disponível). O passo da Lia abre a Lia; o do crachá usa [data-open-credential], que
// credential.js já trata. "Visto" fica em localStorage por perfil, só como conveniência: se o
// storage estiver bloqueado, o passo volta na próxima entrada. Sem innerHTML e sem animação
// própria (prefers-reduced-motion). Expõe window.LaiftOnboarding; as funções são testadas em Node.
(function (root) {
  'use strict';

  var KEY_PREFIX = 'laift_onboarding_seen_';
  var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  var CHATBOT_FLAG = 'data-flag-chatbot-enabled';
  var TITLE_ID = 'onboarding-title';
  var BODY_ID = 'onboarding-body';
  var ROLES = ['visitor', 'member', 'admin'];
  var TOUCH_SIZE = '44px';
  var ACTION_LABEL = { lia: 'Abrir a Lia', credential: 'Abrir meu crachá' };

  var COPY = {
    visitor: {
      intro: ['Bem-vindo(a) à LAIFT', 'Você entrou como visitante. Enquanto a conta não for de membro, Tarefas, Equipe e Mensagens ficam ocultas, e a votação é reservada a membros.'],
      content: ['Aprender e eventos', 'Aprender reúne simuladores, clínica virtual, laboratório e atlas 3D. Em Eventos você vê o que a liga publicou.'],
      credential: ['Seu crachá', 'O crachá virtual tem o QR de presença. Apresente-o na portaria para registrar presença em eventos.'],
    },
    member: {
      intro: ['Bem-vindo(a) de volta', 'Você entrou como membro. A barra inferior leva a Início, Aprender, Eventos, Propostas, Tarefas, Equipe e Mensagens.'],
      content: ['Tarefas, equipe e votações', 'Tarefas mostra o que a liga pediu a você. Em Equipe você envia e responde pedidos de conexão. Propostas tem as votações abertas.'],
      credential: ['Seu QR de presença', 'O QR fica no seu crachá virtual. Apresente-o na portaria para registrar presença nos eventos da liga.'],
    },
    admin: {
      intro: ['Bem-vindo(a), administrador(a)', 'Além da área de membro, o botão Admin abre Painel, Usuários, Eventos, Propostas, Tarefas, Feedback, Auditoria, Denúncias, Fiscal e IA.'],
      content: ['Moderação e IA', 'Denúncias e o acervo de IA pedem revisão: confira o conteúdo antes de aprovar. Casos gerados com IA só entram na biblioteca depois de aprovados.'],
      credential: ['Seu crachá', 'O crachá virtual tem o QR de presença. O terminal fiscal lê esse QR na portaria.'],
    },
  };
  var LIA_COPY = ['Conheça a Lia', 'A Lia é a guia da plataforma: explica as telas e responde dúvidas. Ela não altera seus dados.'];

  function normalizeRole(role) {
    return ROLES.indexOf(role) >= 0 ? role : 'visitor';
  }

  function step(kind, pair) {
    return Object.freeze({ kind: kind, title: pair[0], body: pair[1] });
  }

  /** Passos do papel: intro, conteúdo, [Lia se disponível] e crachá (sempre o último). */
  function stepsFor(role, options) {
    var copy = COPY[normalizeRole(role)];
    var steps = [step('intro', copy.intro), step('content', copy.content)];
    if (options && options.chatbotOn) steps.push(step('lia', LIA_COPY));
    steps.push(step('credential', copy.credential));
    return steps;
  }

  function isUsableId(value) {
    var text = typeof value === 'number' ? String(value) : value;
    return typeof text === 'string' && ID_RE.test(text);
  }

  function storageKey(profileId) {
    return KEY_PREFIX + String(profileId);
  }

  /** "Visto" por perfil. Storage ausente, bloqueado ou cheio nunca lança: o passo só volta a aparecer. */
  function createSeenStore(storage) {
    return {
      isSeen: function (profileId) {
        try { return !!storage && storage.getItem(storageKey(profileId)) === '1'; }
        catch (err) { return false; }
      },
      markSeen: function (profileId) {
        try { if (storage) storage.setItem(storageKey(profileId), '1'); }
        catch (err) { /* storage bloqueado: o passo volta na próxima entrada */ }
      },
    };
  }

  /** localStorage do navegador; o próprio acesso pode lançar (modo privado, dados bloqueados). */
  function browserStorage(win) {
    try { return (win && win.localStorage) || null; }
    catch (err) { return null; }
  }

  function make(doc, tag, className, text) {
    var el = doc.createElement(tag);
    (className || '').split(' ').filter(Boolean).forEach(function (c) { el.classList.add(c); });
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function touchButton(doc, label, className) {
    var btn = make(doc, 'button', className, label);
    btn.type = 'button';
    btn.style.minHeight = TOUCH_SIZE;
    btn.style.minWidth = TOUCH_SIZE;
    return btn;
  }

  function setHidden(el, hidden) {
    if (hidden) el.classList.add('hidden');
    else el.classList.remove('hidden');
  }

  function buildDialog(doc) {
    var dialog = make(doc, 'dialog', 'onboarding-dialog');
    dialog.setAttribute('aria-labelledby', TITLE_ID);
    dialog.setAttribute('aria-describedby', BODY_ID);
    var box = make(doc, 'div', 'modal-box onboarding-box');
    var progress = make(doc, 'p', 'muted onboarding-progress');
    progress.setAttribute('aria-live', 'polite');
    var title = make(doc, 'h2');
    title.id = TITLE_ID;
    var body = make(doc, 'p');
    body.id = BODY_ID;
    var actions = make(doc, 'div', 'modal-actions onboarding-actions');
    var nodes = {
      dialog: dialog,
      progress: progress,
      title: title,
      body: body,
      skip: touchButton(doc, 'Pular', 'secondary'),
      back: touchButton(doc, 'Voltar', 'secondary'),
      action: touchButton(doc, '', 'secondary'),
      next: touchButton(doc, 'Próximo', ''),
    };
    ['skip', 'back', 'action', 'next'].forEach(function (key) { actions.appendChild(nodes[key]); });
    [progress, title, body, actions].forEach(function (n) { box.appendChild(n); });
    dialog.appendChild(box);
    doc.body.appendChild(dialog);
    return nodes;
  }

  /** Cria o onboarding para um documento. Usado pela página e pelos testes. */
  function createOnboarding(doc, win, store) {
    var state = { current: null, opener: null, keyListening: false };
    var nodes = null;

    function chatbotOn() {
      return !!(doc.documentElement && doc.documentElement.hasAttribute(CHATBOT_FLAG) && win && win.LaiftAssistant);
    }

    function renderAction(step) {
      var isAction = step.kind === 'lia' || step.kind === 'credential';
      setHidden(nodes.action, !isAction);
      if (!isAction) return;
      nodes.action.textContent = ACTION_LABEL[step.kind];
      // O crachá é aberto pela delegação de credential.js; a Lia, por runAction.
      if (step.kind === 'credential') nodes.action.setAttribute('data-open-credential', '');
      else nodes.action.removeAttribute('data-open-credential');
    }

    function renderStep() {
      var cur = state.current;
      var step = cur.steps[cur.index];
      var last = cur.index === cur.steps.length - 1;
      nodes.progress.textContent = 'Passo ' + (cur.index + 1) + ' de ' + cur.steps.length;
      nodes.title.textContent = step.title;
      nodes.body.textContent = step.body;
      setHidden(nodes.back, cur.index === 0);
      nodes.next.textContent = last ? 'Concluir' : 'Próximo';
      renderAction(step);
    }

    function goTo(index) {
      state.current = Object.assign({}, state.current, { index: index });
      renderStep();
    }

    /** Botões visíveis do diálogo, na ordem do DOM. Os ocultos (Voltar no 1º passo, ação) não recebem foco. */
    function visibleButtons() {
      return [nodes.skip, nodes.back, nodes.action, nodes.next].filter(function (b) {
        return !b.classList.contains('hidden');
      });
    }

    /**
     * Prende o Tab no diálogo. O showModal nativo não impede o foco de sair para o body no Chromium:
     * Tab em "Próximo" e Shift+Tab em "Pular" são tratados aqui. Foco fora do diálogo volta ao primeiro.
     */
    function trapTab(evt) {
      var items = visibleButtons();
      var index = items.indexOf(doc.activeElement);
      if (index === -1) {
        evt.preventDefault();
        items[0].focus({ preventScroll: true });
      } else if (evt.shiftKey && index === 0) {
        evt.preventDefault();
        items[items.length - 1].focus({ preventScroll: true });
      } else if (!evt.shiftKey && index === items.length - 1) {
        evt.preventDefault();
        items[0].focus({ preventScroll: true });
      }
    }

    /** Esc = pular (grava visto). Tab fica preso. Enquanto o diálogo estiver aberto. */
    function onKeydown(evt) {
      if (!state.current) return;
      if (evt.key === 'Escape') {
        evt.preventDefault();
        evt.stopPropagation();
        finish();
      } else if (evt.key === 'Tab') {
        trapTab(evt);
      }
    }

    /** Um único listener em capture no document: o Tab de dentro do diálogo sobe até ele, então não há dupla contagem. */
    function attachKeys() {
      if (state.keyListening) return;
      doc.addEventListener('keydown', onKeydown, true);
      state.keyListening = true;
    }

    function detachKeys() {
      if (!state.keyListening) return;
      doc.removeEventListener('keydown', onKeydown, true);
      state.keyListening = false;
    }

    /** Encerramento único: solta as teclas, fecha e devolve o foco a quem estava focado antes de abrir. */
    function settle(markAsSeen) {
      var cur = state.current;
      var opener = state.opener;
      state.current = null;
      state.opener = null;
      detachKeys();
      if (cur && markAsSeen) store.markSeen(cur.profileId);
      if (nodes) nodes.dialog.close();
      if (opener && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    }

    /** Fecha e marca como visto (Pular, Concluir, Esc, ação de Lia/crachá). Idempotente. */
    function finish() {
      if (state.current) settle(true);
    }

    function runAction() {
      if (!state.current) return;
      var kind = state.current.steps[state.current.index].kind;
      finish();
      if (kind === 'lia' && win && win.LaiftAssistant && typeof win.LaiftAssistant.open === 'function') {
        win.LaiftAssistant.open();
      }
    }

    function onNext() {
      if (!state.current) return;
      if (state.current.index >= state.current.steps.length - 1) finish();
      else goTo(state.current.index + 1);
    }

    function onBack() {
      if (state.current && state.current.index > 0) goTo(state.current.index - 1);
    }

    /** Fechamento que não veio de finish() (ex.: o navegador fechou o diálogo): conta como visto. */
    function onNativeClose() {
      if (state.current && !nodes.dialog.open) settle(true);
    }

    function wire() {
      nodes.skip.addEventListener('click', finish);
      nodes.next.addEventListener('click', onNext);
      nodes.back.addEventListener('click', onBack);
      nodes.action.addEventListener('click', runAction);
      nodes.dialog.addEventListener('close', onNativeClose);
      // Esc do navegador passa por aqui: bloqueamos o fechamento nativo e seguimos pelo finish(), que grava "visto".
      nodes.dialog.addEventListener('cancel', function (evt) { evt.preventDefault(); finish(); });
    }

    /** Monta o diálogo na primeira vez. Sem <dialog> com showModal, devolve false (não exibe). */
    function ensureNodes() {
      if (nodes) return true;
      if (typeof make(doc, 'dialog').showModal !== 'function') return false;
      nodes = buildDialog(doc);
      wire();
      return true;
    }

    /** Exibe o onboarding se o perfil ainda não viu. Devolve true quando abriu. */
    function maybeShow(options) {
      var opts = options || {};
      if (state.current || !isUsableId(opts.profileId) || store.isSeen(opts.profileId)) return false;
      if (!ensureNodes()) return false;
      state.current = { profileId: String(opts.profileId), steps: stepsFor(opts.role, { chatbotOn: chatbotOn() }), index: 0 };
      state.opener = doc.activeElement;
      renderStep();
      try { nodes.dialog.showModal(); }
      catch (err) { state.current = null; state.opener = null; return false; }
      attachKeys();
      nodes.next.focus({ preventScroll: true });
      return true;
    }

    /** Fecha sem marcar como visto (sessão expirada ou logout). */
    function reset() {
      if (state.current) settle(false);
    }

    return { maybeShow: maybeShow, reset: reset };
  }

  var api = {
    normalizeRole: normalizeRole,
    stepsFor: stepsFor,
    isUsableId: isUsableId,
    storageKey: storageKey,
    createSeenStore: createSeenStore,
    createOnboarding: createOnboarding,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (root.document) {
    var instance = createOnboarding(root.document, root, createSeenStore(browserStorage(root)));
    root.LaiftOnboarding = { maybeShow: instance.maybeShow, reset: instance.reset };
  }
})(typeof window !== 'undefined' ? window : globalThis);
