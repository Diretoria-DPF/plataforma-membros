/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Feed do blog (/blog.html): lê /blog/index.json, filtra por série (location.hash),
// pagina de 6 em 6 e abre o mapa da plataforma num modal. Texto só com textContent.

const PAGINA = 6;
const ESQUELETOS = 3;
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONES_URL = '/blog/icones.svg#';
const INDICE_URL = '/blog/index.json';
const MSG_ERRO = 'Não foi possível carregar os posts.';
const MSG_VAZIO = 'Ainda não há posts neste assunto.';
const FILTROS = ['liga', 'modulos', 'plataforma', 'campanhas'];
const SERIE_ROTULO = { liga: 'Liga', modulos: 'Módulos', plataforma: 'Plataforma', campanhas: 'Publicações' };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const RE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RE_DATA = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/;
const RE_ICONE = /^[a-z]+$/;
const RE_FILTRO_HASH = /^#filtro=(\w+)$/;

// Módulo do mapa: post que o explica, ícone e frase curta.
const MODULOS = {
  inicio: { slug: 'modulo-inicio', icone: 'inicio', frase: 'Resumo da sua conta e atalhos para as telas.' },
  quiz: { slug: 'modulo-farmacologia', icone: 'quiz', frase: 'Simulador com 240 questões de farmacologia.' },
  toxicologia: { slug: 'modulo-toxicologia', icone: 'toxicologia', frase: 'Simulador com 240 questões de toxicologia clínica e forense.' },
  clinica: { slug: 'modulo-clinica-virtual', icone: 'clinica', frase: 'Plantões virtuais, acervo de casos e preceptor com IA.' },
  laboratorio: { slug: 'modulo-laboratorio', icone: 'laboratorio', frase: 'Bancada virtual, estúdio 3D e preceptor com IA.' },
  anatomia: { slug: 'modulo-anatomia-3d', icone: 'anatomia', frase: 'Atlas 3D, farmacocinética e vias de administração.' },
  eventos: { slug: 'eventos-e-cracha', icone: 'eventos', frase: 'Lista os eventos da Liga e as inscrições.' },
  cracha: { slug: 'eventos-e-cracha', icone: 'cracha', frase: 'Cartão digital com o seu papel e QR de presença.' },
  propostas: { slug: 'propostas-votacao-tarefas', icone: 'propostas', frase: 'Envie propostas à Liga e vote nelas.' },
  tarefas: { slug: 'propostas-votacao-tarefas', icone: 'tarefas', frase: 'Inscreva-se em tarefas e comente o andamento.' },
  equipe: { slug: 'equipe-cargos-e-areas', icone: 'equipe', frase: 'A árvore da Liga, com cargos e diretorias.' },
  mensagens: { slug: 'mensagens-cifradas', icone: 'mensagens', frase: 'Conversas entre membros, cifradas no navegador.' },
  lia: { slug: 'lia-a-guia', icone: 'lia', frase: 'A guia da plataforma: orienta e leva às telas certas.' },
  perfil: { slug: 'perfil-e-conexoes', icone: 'perfil', frase: 'Seus dados e preferências da conta.' },
};

const els = {
  feed: document.getElementById('feed'),
  status: document.getElementById('feed-status'),
  mais: document.getElementById('mais'),
  sentinela: document.getElementById('feed-sentinela'),
  dialog: document.getElementById('modal'),
  chips: Array.from(document.querySelectorAll('.blog-chip')),
  mapaItens: Array.from(document.querySelectorAll('.blog-mapa__item')),
  destaque: document.getElementById('campanha'),
  destaqueTitulo: document.querySelector('.blog-campanha-destaque__titulo'),
  destaqueResumo: document.querySelector('.blog-campanha-destaque__resumo'),
  destaqueLink: document.querySelector('.blog-campanha-destaque__link'),
};

const estado = {
  posts: [],
  lista: [],
  mostrados: 0,
  pronto: false,
  observer: null,
  botaoMapa: null,
};

function reduzirMovimento() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function criarNo(tag, classe, texto) {
  const no = document.createElement(tag);
  if (classe) no.className = classe;
  if (texto !== undefined) no.textContent = texto;
  return no;
}

function criarIcone(id, classe) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', classe);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const uso = document.createElementNS(SVG_NS, 'use');
  uso.setAttribute('href', ICONES_URL + id);
  svg.appendChild(uso);
  return svg;
}

function postValido(post) {
  return !!post && typeof post === 'object'
    && typeof post.slug === 'string' && RE_SLUG.test(post.slug)
    && post.href === 'blog/' + post.slug + '.html'
    && typeof post.titulo === 'string' && typeof post.resumo === 'string'
    && typeof post.data === 'string' && RE_DATA.test(post.data)
    && FILTROS.indexOf(post.serie) !== -1
    && typeof post.icone === 'string' && RE_ICONE.test(post.icone)
    && Number.isInteger(post.leitura_min) && post.leitura_min >= 1;
}

function dataExtenso(iso) {
  const partes = iso.split('-').map(Number);
  return partes[2] + ' de ' + MESES[partes[1] - 1] + ' de ' + partes[0];
}

function existePost(slug) {
  return estado.posts.some(function (post) { return post.slug === slug; });
}

function filtrar(posts, filtro) {
  if (filtro === 'todos') return posts;
  return posts.filter(function (post) { return post.serie === filtro; });
}

function filtroDoHash() {
  const achado = RE_FILTRO_HASH.exec(window.location.hash);
  return achado && FILTROS.indexOf(achado[1]) !== -1 ? achado[1] : 'todos';
}

function gravarFiltroNoHash(filtro) {
  const base = window.location.pathname + window.location.search;
  const destino = filtro === 'todos' ? base : base + '#filtro=' + filtro;
  window.history.replaceState(null, '', destino);
}

function carregarIndice() {
  return fetch(INDICE_URL, { cache: 'no-cache' })
    .then(function (resposta) {
      if (!resposta.ok) throw new Error('índice ' + resposta.status);
      return resposta.json();
    })
    .then(function (corpo) {
      if (!corpo || !Array.isArray(corpo.posts)) throw new Error('índice inválido');
      return corpo.posts.filter(postValido);
    });
}

function criarCartao(post, posicao, total) {
  const cartao = criarNo('article', 'blog-card');
  cartao.setAttribute('data-serie', post.serie);
  cartao.setAttribute('aria-posinset', String(posicao));
  cartao.setAttribute('aria-setsize', String(total));
  if (!reduzirMovimento()) {
    cartao.style.setProperty('--i', String((posicao - 1) % PAGINA));
  }
  const link = criarNo('a', 'blog-card__link');
  link.setAttribute('href', '/' + post.href);
  link.appendChild(criarIcone(post.icone, 'blog-icone blog-card__icone'));
  link.appendChild(criarNo('h3', 'blog-card__titulo', post.titulo));
  link.appendChild(criarNo('p', 'blog-card__resumo', post.resumo));
  const meta = SERIE_ROTULO[post.serie] + ' · ' + dataExtenso(post.data) + ' · ' + post.leitura_min + ' min';
  link.appendChild(criarNo('p', 'blog-card__meta', meta));
  cartao.appendChild(link);
  return cartao;
}

function renderProxima() {
  const total = estado.lista.length;
  const inicio = estado.mostrados;
  const fim = Math.min(inicio + PAGINA, total);
  const fragmento = document.createDocumentFragment();
  for (let i = inicio; i < fim; i += 1) {
    fragmento.appendChild(criarCartao(estado.lista[i], i + 1, total));
  }
  els.feed.appendChild(fragmento);
  estado.mostrados = fim;
}

function atualizarStatus() {
  const total = estado.lista.length;
  if (total === 0) {
    els.status.textContent = '0 posts';
    return;
  }
  els.status.textContent = estado.mostrados + ' de ' + total + (total === 1 ? ' post' : ' posts');
}

function desligarSentinela() {
  if (estado.observer) {
    estado.observer.disconnect();
    estado.observer = null;
  }
}

function avancarPagina() {
  renderProxima();
  atualizarControles();
}

function aoCruzarSentinela(entradas) {
  const visivel = entradas.some(function (entrada) { return entrada.isIntersecting; });
  if (visivel && estado.mostrados < estado.lista.length) avancarPagina();
}

function observarSentinela() {
  if (!('IntersectionObserver' in window)) return;
  if (!estado.observer) {
    estado.observer = new IntersectionObserver(aoCruzarSentinela, { rootMargin: '200px 0px' });
  }
  // Reobservar refaz a checagem: se a sentinela seguir visível, carrega mais.
  estado.observer.unobserve(els.sentinela);
  estado.observer.observe(els.sentinela);
}

function atualizarControles() {
  const restam = estado.mostrados < estado.lista.length;
  els.mais.hidden = !restam;
  atualizarStatus();
  if (restam) observarSentinela();
  else desligarSentinela();
}

function focarCartao(indice) {
  const cartoes = els.feed.querySelectorAll('.blog-card');
  const link = cartoes[indice] && cartoes[indice].querySelector('a');
  if (link) link.focus({ preventScroll: true });
}

// Foco só muda quando o próprio botão some; nunca é roubado.
function aoClicarMais() {
  const botaoTinhaFoco = document.activeElement === els.mais;
  const anterior = estado.mostrados;
  renderProxima();
  if (botaoTinhaFoco && estado.mostrados >= estado.lista.length) focarCartao(anterior);
  atualizarControles();
}

function aplicarFiltro(filtro) {
  estado.lista = filtrar(estado.posts, filtro);
  estado.mostrados = 0;
  els.feed.textContent = '';
  els.chips.forEach(function (chip) {
    chip.setAttribute('aria-pressed', String(chip.getAttribute('data-filtro') === filtro));
  });
  renderProxima();
  mostrarVazio();
  atualizarControles();
}

// Filtro sem posts: mensagem simples no feed (o anúncio aria-live já diz "0 posts").
function mostrarVazio() {
  if (estado.lista.length === 0) els.feed.appendChild(criarNo('p', '', MSG_VAZIO));
}

function aoClicarChip(evento) {
  if (!estado.pronto) return;
  const filtro = evento.currentTarget.getAttribute('data-filtro');
  gravarFiltroNoHash(filtro);
  aplicarFiltro(filtro);
}

// Âncoras (#mapa) não mexem no filtro.
function aoMudarHash() {
  const hash = window.location.hash;
  if (!estado.pronto || (hash && hash.indexOf('#filtro=') !== 0)) return;
  aplicarFiltro(filtroDoHash());
}

function mostrarCarregando() {
  els.feed.setAttribute('aria-busy', 'true');
  els.feed.textContent = '';
  for (let i = 0; i < ESQUELETOS; i += 1) {
    const esqueleto = criarNo('div', 'blog-skeleton');
    esqueleto.setAttribute('aria-hidden', 'true');
    els.feed.appendChild(esqueleto);
  }
  desligarSentinela();
  els.mais.hidden = true;
  els.status.textContent = 'Carregando posts.';
}

function mostrarErro(erro) {
  console.error('blog: feed', erro);
  els.feed.textContent = '';
  els.feed.appendChild(criarNo('p', '', MSG_ERRO));
  const tentar = criarNo('button', 'blog-botao', 'Tentar novamente');
  tentar.setAttribute('type', 'button');
  tentar.addEventListener('click', iniciarFeed);
  els.feed.appendChild(tentar);
  els.feed.setAttribute('aria-busy', 'false');
  els.status.textContent = MSG_ERRO;
}

// Campanha fixada do mês: 1º post de campanha fixado do índice. Sem ele, a seção fica escondida.
function mostrarDestaque(posts) {
  if (!els.destaque) return;
  const campanha = posts.find(function (post) { return post.serie === 'campanhas' && post.fixado === true; });
  els.destaque.hidden = !campanha;
  if (!campanha) return;
  els.destaqueTitulo.textContent = campanha.titulo;
  els.destaqueResumo.textContent = campanha.resumo;
  els.destaqueLink.setAttribute('href', '/' + campanha.href);
}

function iniciarFeed() {
  estado.pronto = false;
  mostrarCarregando();
  return carregarIndice()
    .then(function (posts) {
      estado.posts = posts;
      mostrarDestaque(posts);
      estado.pronto = true;
      els.feed.setAttribute('aria-busy', 'false');
      aplicarFiltro(filtroDoHash());
    })
    .catch(mostrarErro);
}

function abrirModal(botao) {
  const info = MODULOS[botao.getAttribute('data-modulo')];
  if (!info) return;
  const dialog = els.dialog;
  estado.botaoMapa = botao;
  dialog.textContent = '';
  dialog.appendChild(criarIcone(info.icone, 'blog-icone blog-modal__icone'));
  const titulo = criarNo('h2', '', botao.textContent.trim());
  titulo.id = 'modal-titulo';
  dialog.appendChild(titulo);
  dialog.appendChild(criarNo('p', '', info.frase));
  if (existePost(info.slug)) {
    const ler = criarNo('a', 'blog-botao', 'Ler o post');
    ler.setAttribute('href', '/blog/' + info.slug + '.html');
    dialog.appendChild(ler);
  }
  const fechar = criarNo('button', 'blog-modal__fechar', 'Fechar');
  fechar.setAttribute('type', 'button');
  fechar.addEventListener('click', function () { dialog.close(); });
  dialog.appendChild(fechar);
  dialog.showModal();
}

function aoFecharModal() {
  if (estado.botaoMapa) estado.botaoMapa.focus({ preventScroll: true });
}

function iniciar() {
  if (!els.feed || !els.status || !els.mais || !els.sentinela || !els.dialog) return;
  els.chips.forEach(function (chip) { chip.addEventListener('click', aoClicarChip); });
  els.mapaItens.forEach(function (item) {
    item.addEventListener('click', function () { abrirModal(item); });
  });
  els.mais.addEventListener('click', aoClicarMais);
  els.dialog.addEventListener('close', aoFecharModal);
  window.addEventListener('hashchange', aoMudarHash);
  iniciarFeed();
}

iniciar();
