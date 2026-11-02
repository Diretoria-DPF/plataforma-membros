/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Entrada v2 (flag entrada_v2_enabled): tela de abertura para quem ainda não entrou, com herói, vitrine
// com cadeado, "Como funciona", "Acontecendo na Liga" (dados reais) e uma folha com as abas Entrar e
// Criar conta. A folha NÃO tem formulários próprios: ela recebe os MESMOS elementos do index.html
// (#form-login, #form-login-mfa, #form-register, mensagens, caixas de senha e de termos), então app.js,
// mfa.js, entrada.js e resend-confirmation.js seguem funcionando sem mudança. Ao desligar a flag, tudo
// volta ao lugar de origem. Pacote sob demanda (lazy-bundles.js, "entradaV2"): só baixa com a flag ligada
// e sem sessão. Sem HTML montado por texto nem script inline (CSP). Expõe window.LaiftEntradaV2 { mount, reset }.
(function (root) {
  'use strict';

  var FLAG_ATTR = 'data-flag-entrada-v2-enabled';
  var CSS_HREF = 'entrada-v2.css';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MAX_EVENTOS = 6;
  var MAX_POSTS = 3;
  var ANIM_MS = 300;
  var REGEX_HREF_POST = /^blog\/[a-z0-9-]+\.html$/;
  var REGEX_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
  var FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  var ABAS = ['entrar', 'criar'];
  var TEXTOS_ABA = {
    entrar: { titulo: 'Entrar', apoio: '' },
    criar: { titulo: 'Criar conta', apoio: 'Sua conta começa como visitante. Confirme o e-mail para entrar.' },
  };
  var VITRINE = [
    { tag: 'Quiz do dia', titulo: 'Uma questão nova todo dia', texto: 'Acerte, mantenha a sequência e acompanhe seu ritmo.' },
    { tag: 'Atlas 3D', titulo: 'Gire estruturas em 3D', texto: 'Anatomia e moléculas na palma da mão.' },
    { tag: 'A Guia', titulo: 'Tire dúvidas com a Guia', texto: 'Respostas com referências e cuidado clínico.' },
    { tag: 'Casos clínicos', titulo: 'Simulações passo a passo', texto: 'Treine o raciocínio antes do plantão.' },
    { tag: 'Liga', titulo: 'Eventos e comunidade', texto: 'Encontros, tarefas e propostas da Liga.' },
  ];
  var PASSOS = [
    { titulo: 'Crie sua conta', texto: 'Nome, usuário, e-mail, telefone e senha. Confirme pelo link enviado ao e-mail.' },
    { titulo: 'Responda o quiz do dia', texto: 'Entre e comece a estudar pela questão de hoje.' },
    { titulo: 'Volte amanhã', texto: 'Sequência e meta diária só para você, sem ranking público.' },
  ];
  var LINKS = [
    ['Termos', 'termos.html'], ['Privacidade', 'privacidade.html'], ['Blog', 'blog.html'],
    ['Processo seletivo', 'processo-seletivo.html'], ['Biblioteca', '/biblioteca'], ['Conheça a LAIFT', 'liga.html'],
  ];

  // ---------------------------------------------------------------------------
  // Lógica pura (testada em Node)
  // ---------------------------------------------------------------------------

  /** Eventos públicos que ainda valem: em andamento, ou com data futura. Do mais próximo ao mais distante. */
  function escolherEventos(lista, agoraMs, max) {
    if (!Array.isArray(lista)) return [];
    var limite = Math.max(0, Math.floor(Number(max)) || 0);
    return lista
      .filter(function (e) { return e && typeof e.title === 'string' && e.title.trim() !== '' && !isNaN(Date.parse(e.eventDate)); })
      .filter(function (e) { return e.status === 'in_progress' || Date.parse(e.eventDate) >= agoraMs; })
      .sort(function (a, b) { return Date.parse(a.eventDate) - Date.parse(b.eventDate); })
      .slice(0, limite);
  }

  /** "05 de nov., 19:00" no fuso de Brasília; texto vazio se a data for inválida. */
  function rotuloData(iso) {
    var ms = Date.parse(iso);
    if (isNaN(ms)) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    }).format(new Date(ms));
  }

  function dataPost(data) {
    var m = typeof data === 'string' ? REGEX_DATA.exec(data) : null;
    if (!m) return NaN;
    var ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var d = new Date(ms);
    var existe = d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
    return existe ? ms : NaN;
  }

  /** "09/10/2026" a partir de AAAA-MM-DD; vazio se a data não existir. */
  function rotuloDataPost(data) {
    if (isNaN(dataPost(data))) return '';
    var p = data.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  /** As publicações mais novas do blog/index.json (título, href seguro e data válidos). */
  function escolherPosts(posts, max) {
    if (!Array.isArray(posts)) return [];
    var limite = Math.max(0, Math.floor(Number(max)) || 0);
    return posts
      .filter(function (p) { return p && typeof p.titulo === 'string' && p.titulo.trim() !== '' && REGEX_HREF_POST.test(p.href) && !isNaN(dataPost(p.data)); })
      .sort(function (a, b) { return dataPost(b.data) - dataPost(a.data); })
      .slice(0, limite);
  }

  /** Índice da aba depois de uma tecla (setas, Home, End); -1 se a tecla não move a seleção. */
  function abaPorTecla(tecla, atual, total) {
    if (!total) return -1;
    if (tecla === 'ArrowRight') return (atual + 1) % total;
    if (tecla === 'ArrowLeft') return (atual - 1 + total) % total;
    if (tecla === 'Home') return 0;
    if (tecla === 'End') return total - 1;
    return -1;
  }

  /** Foco preso na folha: índice a focar quando Tab sairia dela (ou -1 para deixar o navegador seguir). */
  function armadilha(total, atual, voltar) {
    if (!total) return -1;
    if (atual < 0) return voltar ? total - 1 : 0;
    if (!voltar && atual === total - 1) return 0;
    if (voltar && atual === 0) return total - 1;
    return -1;
  }

  /** Aba pedida pelo endereço (#entrar, #inscricao, #cadastro); null se não for um deles. */
  function abaDaHash(hash) {
    if (hash === '#entrar' || hash === '#inscricao') return 'entrar';
    if (hash === '#cadastro') return 'criar';
    return null;
  }

  // ---------------------------------------------------------------------------
  // Construção da tela (createElement + textContent)
  // ---------------------------------------------------------------------------

  function no(doc, tag, classe, texto) {
    var el = doc.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined && texto !== null) el.textContent = texto;
    return el;
  }

  function botao(doc, classe, texto, aba) {
    var b = no(doc, 'button', classe, texto);
    b.type = 'button';
    if (aba) b.setAttribute('data-ev2-abrir', aba);
    return b;
  }

  function cadeado(doc) {
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ev2-cadeado');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var corpo = doc.createElementNS(SVG_NS, 'path');
    corpo.setAttribute('d', 'M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V8a3 3 0 0 0-6 0v2z');
    corpo.setAttribute('fill', 'currentColor');
    svg.appendChild(corpo);
    return svg;
  }

  function cartaoVitrine(doc, item) {
    var b = botao(doc, 'ev2-cartao', null, 'criar');
    b.appendChild(cadeado(doc));
    var previa = no(doc, 'div', 'ev2-previa');
    previa.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 3; i++) previa.appendChild(no(doc, 'i'));
    b.appendChild(previa);
    var topo = no(doc, 'div');
    topo.appendChild(no(doc, 'span', 'ev2-etiqueta', item.tag));
    topo.appendChild(no(doc, 'strong', null, item.titulo));
    b.appendChild(topo);
    b.appendChild(no(doc, 'span', 'ev2-desc', item.texto));
    b.appendChild(no(doc, 'span', 'visually-hidden', 'Disponível depois de criar a conta.'));
    return b;
  }

  function secao(doc, classe, idTitulo, titulo) {
    var s = no(doc, 'section', 'ev2-wrap ev2-secao ' + classe);
    s.setAttribute('aria-labelledby', idTitulo);
    var h = no(doc, 'h2', null, titulo);
    h.id = idTitulo;
    s.appendChild(h);
    return s;
  }

  function construirHeroi(doc) {
    var heroi = no(doc, 'header', 'ev2-heroi');
    var wrap = no(doc, 'div', 'ev2-wrap');
    var barra = no(doc, 'div', 'ev2-barra');
    barra.appendChild(no(doc, 'span', 'ev2-logo', 'LAIFT'));
    barra.appendChild(botao(doc, 'ev2-btn-fantasma', 'Entrar', 'entrar'));
    wrap.appendChild(barra);
    var h1 = no(doc, 'h1', null, 'Estude farmacologia de um jeito que dá vontade de voltar.');
    h1.id = 'ev2-h1';
    wrap.appendChild(h1);
    wrap.appendChild(no(doc, 'p', 'ev2-sub', 'Quiz do dia, Atlas 3D, a Guia e a comunidade da Liga. Tudo no seu celular, no seu ritmo.'));
    var ctas = no(doc, 'div', 'ev2-ctas');
    ctas.appendChild(botao(doc, 'ev2-btn ev2-btn--pri', 'Criar conta', 'criar'));
    var conhecer = botao(doc, 'ev2-btn ev2-btn--sec', 'Conhecer a plataforma');
    conhecer.setAttribute('data-ev2-conhecer', '1');
    ctas.appendChild(conhecer);
    wrap.appendChild(ctas);
    wrap.appendChild(no(doc, 'p', 'ev2-micro', 'Confirmação por e-mail.'));
    heroi.appendChild(wrap);
    return heroi;
  }

  function construirVitrine(doc) {
    var s = secao(doc, 'ev2-vitrine', 'ev2-vitrine-t', 'O que a plataforma oferece');
    s.id = 'ev2-vitrine';
    var trilho = no(doc, 'div', 'ev2-trilho');
    VITRINE.forEach(function (item) { trilho.appendChild(cartaoVitrine(doc, item)); });
    s.appendChild(trilho);
    return s;
  }

  function construirPassos(doc) {
    var s = secao(doc, 'ev2-como', 'ev2-como-t', 'Como funciona');
    var lista = no(doc, 'ol', 'ev2-passos');
    PASSOS.forEach(function (p, i) {
      var li = no(doc, 'li', 'ev2-passo');
      li.appendChild(no(doc, 'b', null, String(i + 1)));
      li.lastChild.setAttribute('aria-hidden', 'true');
      li.appendChild(no(doc, 'h3', null, p.titulo));
      li.appendChild(no(doc, 'p', null, p.texto));
      lista.appendChild(li);
    });
    s.appendChild(lista);
    return s;
  }

  /** Seções que só existem com dado real: começam escondidas e são preenchidas depois. */
  function construirSecaoVazia(doc, classe, id, titulo) {
    var s = secao(doc, classe, id + '-t', titulo);
    s.id = id;
    s.hidden = true;
    s.appendChild(no(doc, 'ul', 'ev2-lista'));
    return s;
  }

  function construirRodape(doc) {
    var rodape = no(doc, 'footer', 'ev2-wrap ev2-rodape');
    var nav = no(doc, 'nav');
    nav.setAttribute('aria-label', 'Links da plataforma');
    LINKS.forEach(function (par) {
      var a = no(doc, 'a', null, par[0]);
      a.href = par[1];
      nav.appendChild(a);
    });
    rodape.appendChild(nav);
    return rodape;
  }

  function construirConvite(doc) {
    var barra = no(doc, 'div', 'ev2-convite');
    barra.appendChild(no(doc, 'span', null, 'Pronto para começar?'));
    barra.appendChild(botao(doc, 'ev2-btn ev2-btn--convite', 'Criar conta', 'criar'));
    return barra;
  }

  function construirPagina(doc) {
    var pagina = no(doc, 'div', 'ev2');
    var aviso = no(doc, 'p', 'ev2-aviso');
    aviso.setAttribute('role', 'status');
    aviso.hidden = true;
    pagina.appendChild(aviso);
    pagina.appendChild(construirHeroi(doc));
    var main = no(doc, 'div', 'ev2-corpo');
    main.appendChild(construirVitrine(doc));
    main.appendChild(construirPassos(doc));
    main.appendChild(construirSecaoVazia(doc, 'ev2-liga', 'ev2-liga', 'Acontecendo na Liga'));
    main.appendChild(construirSecaoVazia(doc, 'ev2-blog', 'ev2-blog', 'Novidades do blog'));
    main.appendChild(construirRodape(doc));
    pagina.appendChild(main);
    pagina.appendChild(construirConvite(doc));
    return pagina;
  }

  function construirAbas(doc) {
    var lista = no(doc, 'div', 'ev2-abas');
    lista.setAttribute('role', 'tablist');
    lista.setAttribute('aria-label', 'Entrar ou criar conta');
    ABAS.forEach(function (aba) {
      var b = no(doc, 'button', null, aba === 'entrar' ? 'Entrar' : 'Criar conta');
      b.type = 'button';
      b.id = 'ev2-aba-' + aba;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'ev2-painel-' + aba);
      b.setAttribute('data-ev2-aba', aba);
      lista.appendChild(b);
    });
    return lista;
  }

  function construirFolha(doc) {
    var folha = no(doc, 'section', 'ev2-folha');
    folha.id = 'ev2-folha';
    folha.hidden = true;
    folha.tabIndex = -1;
    folha.setAttribute('role', 'dialog');
    folha.setAttribute('aria-modal', 'true');
    folha.setAttribute('aria-labelledby', 'ev2-titulo');
    folha.appendChild(no(doc, 'div', 'ev2-alca')).setAttribute('aria-hidden', 'true');
    var cab = no(doc, 'div', 'ev2-folha-cab');
    var titulo = no(doc, 'h2', null, TEXTOS_ABA.entrar.titulo);
    titulo.id = 'ev2-titulo';
    cab.appendChild(titulo);
    var fechar = botao(doc, 'ev2-fechar', '×');
    fechar.setAttribute('aria-label', 'Fechar');
    fechar.setAttribute('data-ev2-fechar', '1');
    cab.appendChild(fechar);
    folha.appendChild(cab);
    folha.appendChild(no(doc, 'p', 'ev2-apoio')).hidden = true;
    folha.appendChild(construirAbas(doc));
    ABAS.forEach(function (aba) {
      var painel = no(doc, 'div', 'ev2-painel');
      painel.id = 'ev2-painel-' + aba;
      painel.setAttribute('role', 'tabpanel');
      painel.setAttribute('aria-labelledby', 'ev2-aba-' + aba);
      painel.hidden = aba !== 'entrar';
      folha.appendChild(painel);
    });
    var agora = botao(doc, 'ev2-agora-nao', 'Agora não, continuar navegando');
    agora.setAttribute('data-ev2-fechar', '1');
    folha.appendChild(agora);
    return folha;
  }

  // ---------------------------------------------------------------------------
  // Montagem: move os elementos de autenticação para a folha e devolve ao desligar
  // ---------------------------------------------------------------------------

  var IDS_ENTRAR = ['login-inscricao-aviso', 'form-login', 'form-login-mfa', 'msg-login'];
  var IDS_CRIAR = ['form-register', 'msg-register'];

  function localizar(doc) {
    var tela = doc.getElementById('screen-welcome');
    var casca = doc.getElementById('public-shell');
    if (!tela || !casca) return null;
    var ids = IDS_ENTRAR.concat(IDS_CRIAR);
    for (var i = 0; i < ids.length; i++) if (!doc.getElementById(ids[i])) return null;
    return { tela: tela, casca: casca, registro: doc.getElementById('screen-register') };
  }

  function mover(doc, ids, destino, movidos) {
    ids.forEach(function (id) {
      var el = doc.getElementById(id);
      movidos.push({ el: el, pai: el.parentNode, proximo: el.nextSibling });
      destino.appendChild(el);
    });
  }

  function devolver(movidos) {
    for (var i = movidos.length - 1; i >= 0; i--) movidos[i].pai.insertBefore(movidos[i].el, movidos[i].proximo);
  }

  function garantirEstilos(doc) {
    if (doc.querySelector('link[data-entrada-v2-css]')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_HREF;
    link.setAttribute('data-entrada-v2-css', '1');
    doc.head.appendChild(link);
  }

  function reduzMovimento(win) {
    return !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function visiveis(folha) {
    return Array.prototype.filter.call(folha.querySelectorAll(FOCAVEIS), function (el) {
      return el.getClientRects().length > 0;
    });
  }

  /** Preenche uma lista (<ul>) de uma seção e a mostra; sem itens, a seção continua escondida. */
  function preencher(doc, id, itens) {
    var s = doc.getElementById(id);
    if (!s || !itens.length) return;
    var ul = s.querySelector('ul');
    itens.forEach(function (item) { ul.appendChild(item); });
    s.hidden = false;
  }

  function itemEvento(doc, e) {
    var li = no(doc, 'li', 'ev2-item');
    var quando = no(doc, 'time', 'ev2-item-data', e.status === 'in_progress' ? 'Em andamento' : rotuloData(e.eventDate));
    quando.setAttribute('datetime', e.eventDate);
    li.appendChild(quando);
    li.appendChild(no(doc, 'strong', null, e.title));
    if (e.location) li.appendChild(no(doc, 'span', 'ev2-item-local', e.location));
    return li;
  }

  function itemPost(doc, p) {
    var li = no(doc, 'li', 'ev2-item');
    li.appendChild(no(doc, 'span', 'ev2-item-data', rotuloDataPost(p.data)));
    var a = no(doc, 'a', null, p.titulo);
    a.href = p.href;
    li.appendChild(a);
    return li;
  }

  function carregarDados(app, doc, win, vivo) {
    var eventos = app && typeof app.callApi === 'function'
      ? Promise.resolve(app.callApi('apiListEvents', '')).then(function (res) {
        return res && res.success === true ? escolherEventos(res.events, Date.now(), MAX_EVENTOS) : [];
      }) : Promise.resolve([]);
    eventos.then(function (lista) {
      if (vivo()) preencher(doc, 'ev2-liga', lista.map(function (e) { return itemEvento(doc, e); }));
    }, function () { /* sem eventos: a seção fica escondida */ });
    Promise.resolve().then(function () { return win.fetch('blog/index.json', { cache: 'no-cache' }); })
      .then(function (r) { if (!r.ok) throw new Error('indisponível'); return r.json(); })
      .then(function (indice) {
        var posts = escolherPosts(indice && indice.posts, MAX_POSTS);
        if (vivo()) preencher(doc, 'ev2-blog', posts.map(function (p) { return itemPost(doc, p); }));
      }, function () { /* sem blog: a seção fica escondida */ });
  }

  function criar(app, doc, partes) {
    var win = doc.defaultView || root;
    var movidos = [];
    var html = doc.documentElement;
    var pagina = construirPagina(doc);
    var folha = construirFolha(doc);
    var veu = no(doc, 'div', 'ev2-veu');
    var aberta = false;
    var gatilho = null;
    var abaAtual = 'entrar';
    var timer = null;
    var vivo = true;
    var observadores = [];

    function aba(nome) { return doc.getElementById('ev2-aba-' + nome); }

    function selecionar(nome) {
      abaAtual = nome;
      ABAS.forEach(function (n) {
        var ativa = n === nome;
        aba(n).setAttribute('aria-selected', String(ativa));
        aba(n).tabIndex = ativa ? 0 : -1;
        doc.getElementById('ev2-painel-' + n).hidden = !ativa;
      });
      doc.getElementById('ev2-titulo').textContent = TEXTOS_ABA[nome].titulo;
      var apoio = folha.querySelector('.ev2-apoio');
      apoio.textContent = TEXTOS_ABA[nome].apoio;
      apoio.hidden = !TEXTOS_ABA[nome].apoio;
    }

    function travar(sim) {
      html.classList.toggle('ev2-travado', sim);
      if (sim) pagina.setAttribute('inert', ''); else pagina.removeAttribute('inert');
    }

    function abrir(nome, origem) {
      if (!vivo) return;
      selecionar(ABAS.indexOf(nome) >= 0 ? nome : 'entrar');
      if (aberta) return;
      aberta = true;
      gatilho = origem || doc.activeElement;
      win.clearTimeout(timer);
      folha.hidden = false;
      veu.hidden = false;
      travar(true);
      sincronizarAviso();
      win.requestAnimationFrame(function () {
        folha.classList.add('ev2-on');
        veu.classList.add('ev2-on');
      });
      aba(abaAtual).focus({ preventScroll: true });
    }

    function fechar(devolverFoco) {
      if (!aberta) return;
      aberta = false;
      folha.classList.remove('ev2-on');
      veu.classList.remove('ev2-on');
      travar(false);
      var concluir = function () { if (!aberta) { folha.hidden = true; veu.hidden = true; } };
      if (reduzMovimento(win)) concluir(); else timer = win.setTimeout(concluir, ANIM_MS);
      if (devolverFoco !== false && gatilho && gatilho.isConnected && gatilho.getClientRects().length) gatilho.focus({ preventScroll: true });
      gatilho = null;
      sincronizarAviso();
    }

    /** Mensagens de #msg-login (confirmação de e-mail, sessão salva etc.) aparecem na página quando a folha está fechada. */
    function sincronizarAviso() {
      var msg = doc.getElementById('msg-login');
      var banner = pagina.querySelector('.ev2-aviso');
      var texto = msg ? (msg.textContent || '').trim() : '';
      banner.textContent = texto;
      banner.hidden = !texto || aberta;
    }

    function aoNavegarDaFolha(ev) {
      if (ev.target.closest && ev.target.closest('[data-nav]')) fechar(false);
    }

    function aoTeclar(ev) {
      if (!aberta) return;
      if (ev.key === 'Escape') { ev.preventDefault(); fechar(); return; }
      if (ev.key !== 'Tab') return;
      var lista = visiveis(folha);
      var alvo = armadilha(lista.length, lista.indexOf(doc.activeElement), ev.shiftKey);
      if (alvo >= 0) { ev.preventDefault(); lista[alvo].focus(); }
    }

    function aoTeclarAba(ev) {
      var destino = abaPorTecla(ev.key, ABAS.indexOf(abaAtual), ABAS.length);
      if (destino < 0) return;
      ev.preventDefault();
      selecionar(ABAS[destino]);
      aba(ABAS[destino]).focus();
    }

    function aoClicarPagina(ev) {
      var gatilhoAbrir = ev.target.closest('[data-ev2-abrir]');
      if (gatilhoAbrir) { abrir(gatilhoAbrir.getAttribute('data-ev2-abrir'), gatilhoAbrir); return; }
      if (!ev.target.closest('[data-ev2-conhecer]')) return;
      var alvo = doc.getElementById('ev2-vitrine');
      alvo.scrollIntoView({ behavior: reduzMovimento(win) ? 'auto' : 'smooth', block: 'start' });
      alvo.querySelector('h2').tabIndex = -1;
      alvo.querySelector('h2').focus({ preventScroll: true });
    }

    function observar(alvo, opcoes, fn) {
      if (!alvo || !win.MutationObserver) return;
      var obs = new win.MutationObserver(fn);
      obs.observe(alvo, opcoes);
      observadores.push(obs);
    }

    /** O app pede "Criar conta" (hash #cadastro, botão do aviso do processo seletivo): a folha assume. */
    function interceptarCadastro() {
      if (!partes.registro || partes.registro.classList.contains('hidden')) return;
      partes.registro.classList.add('hidden');
      partes.tela.classList.remove('hidden');
      abrir('criar');
    }

    function aoMudarHash() {
      var nome = abaDaHash(win.location.hash);
      if (nome) abrir(nome);
    }

    function iniciarEntrada() {
      var nomeHash = abaDaHash(win.APP_PUBLIC_HASH || '');
      win.APP_PUBLIC_HASH = ''; // o pedido vale uma vez só
      var avisoInscricao = doc.getElementById('login-inscricao-aviso');
      if (nomeHash) abrir(nomeHash);
      else if (win.APP_DEEP_LINK_MODE === 'confirm' || (avisoInscricao && !avisoInscricao.hidden)) abrir('entrar');
      interceptarCadastro();
    }

    function ligar() {
      garantirEstilos(doc);
      mover(doc, IDS_ENTRAR, doc.getElementById('ev2-painel-entrar'), movidos);
      mover(doc, IDS_CRIAR, doc.getElementById('ev2-painel-criar'), movidos);
      partes.tela.classList.add('ev2-ativo');
      partes.casca.classList.add('ev2-ativo');
      selecionar('entrar');
      sincronizarAviso();
      pagina.addEventListener('click', aoClicarPagina);
      folha.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-ev2-fechar]')) fechar();
        else aoNavegarDaFolha(ev);
      });
      veu.addEventListener('click', function () { fechar(); });
      folha.querySelector('.ev2-abas').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-ev2-aba]');
        if (b) selecionar(b.getAttribute('data-ev2-aba'));
      });
      folha.querySelector('.ev2-abas').addEventListener('keydown', aoTeclarAba);
      doc.addEventListener('keydown', aoTeclar);
      win.addEventListener('hashchange', aoMudarHash);
      observar(doc.getElementById('msg-login'), { childList: true, characterData: true, subtree: true }, sincronizarAviso);
      observar(partes.registro, { attributes: true, attributeFilter: ['class'] }, interceptarCadastro);
      observar(partes.casca, { attributes: true, attributeFilter: ['class'] }, function () {
        if (partes.casca.classList.contains('hidden')) fechar(false); // entrou no app: a folha sai de cena
      });
      carregarDados(app, doc, win, function () { return vivo; });
      iniciarEntrada();
    }

    function desmontar() {
      vivo = false;
      win.clearTimeout(timer);
      if (aberta) { aberta = false; travar(false); }
      observadores.forEach(function (o) { o.disconnect(); });
      doc.removeEventListener('keydown', aoTeclar);
      win.removeEventListener('hashchange', aoMudarHash);
      devolver(movidos);
      partes.tela.classList.remove('ev2-ativo');
      partes.casca.classList.remove('ev2-ativo');
      [pagina, folha, veu].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
      html.classList.remove('ev2-travado');
    }

    partes.tela.insertBefore(pagina, partes.tela.firstChild);
    veu.hidden = true;
    veu.className = 'ev2-veu';
    partes.casca.appendChild(veu);
    partes.casca.appendChild(folha);
    ligar();
    return { abrir: abrir, fechar: fechar, desmontar: desmontar };
  }

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  var ativo = null;

  /** Liga a entrada v2 (idempotente). Só age com a flag no <html> e a tela pública no DOM. */
  function mount(app, doc) {
    var d = doc || root.document;
    if (ativo || !d.documentElement.hasAttribute(FLAG_ATTR)) return false;
    var partes = localizar(d);
    if (!partes) return false;
    ativo = criar(app, d, partes);
    return true;
  }

  /** Desliga e devolve os formulários ao lugar original (flag desligada ou pessoa logada). */
  function reset() {
    if (!ativo) return;
    ativo.desmontar();
    ativo = null;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      FLAG_ATTR: FLAG_ATTR, escolherEventos: escolherEventos, rotuloData: rotuloData, escolherPosts: escolherPosts, rotuloDataPost: rotuloDataPost,
      abaPorTecla: abaPorTecla, armadilha: armadilha, abaDaHash: abaDaHash, VITRINE: VITRINE, PASSOS: PASSOS, LINKS: LINKS,
    };
    return;
  }
  root.LaiftEntradaV2 = { mount: mount, reset: reset };
})(typeof self !== 'undefined' ? self : this);
