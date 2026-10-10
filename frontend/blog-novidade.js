/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Aviso de nova publicação do blog. Lê blog/index.json e mostra a publicação
// mais recente (tela inicial) ou as três últimas (/liga). Cada item leva uma
// miniatura com o ícone do sprite do blog (blog/icones.svg), em tom da série
// (rosa discreto nas campanhas). Se algo falhar, o aviso continua escondido e
// nada aparece no console. Nós são criados com createElement, createElementNS
// e textContent, porque a CSP não permite estilo inline nem HTML montado por texto.
(function (root) {
  'use strict';

  const CHAVE_VISTO = 'laift_blog_visto';
  const INDICE_PADRAO = 'blog/index.json';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  // Sprite relativo: vale em /, /liga, /liga.html e em subpasta.
  const SPRITE = 'blog/icones.svg';
  // Cópia de ICONES em scripts/build-blog.js; scripts/blog-novidade.test.mjs confere a igualdade.
  const ICONES = [
    'inicio', 'aprender', 'eventos', 'propostas', 'tarefas', 'equipe', 'mensagens', 'perfil',
    'quiz', 'toxicologia', 'clinica', 'laboratorio', 'anatomia', 'cracha', 'lia',
    'seguranca', 'offline', 'desempenho', 'roteiro', 'liga', 'bemvindo', 'novidades', 'ig', 'envelope', 'laco',
  ];
  const ICONE_DA_SERIE = {
    liga: 'liga',
    modulos: 'aprender',
    plataforma: 'novidades',
    campanhas: 'laco',
  };
  const ICONE_PADRAO = 'novidades';
  const DIAS_NOVA = 14;
  const MS_DIA = 24 * 60 * 60 * 1000;
  const REGEX_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
  const REGEX_HREF = /^blog\/[a-z0-9-]+\.html$/;
  const ROTULOS_SERIE = {
    liga: 'A Liga',
    modulos: 'Módulos',
    plataforma: 'Plataforma',
    campanhas: 'Publicações',
  };

  /** Converte AAAA-MM-DD em milissegundos (UTC). NaN se a data não existir. */
  function dataMs(data) {
    const m = typeof data === 'string' ? REGEX_DATA.exec(data) : null;
    if (!m) return NaN;
    const ano = Number(m[1]);
    const mes = Number(m[2]) - 1;
    const dia = Number(m[3]);
    const ms = Date.UTC(ano, mes, dia);
    const d = new Date(ms);
    return d.getUTCFullYear() === ano && d.getUTCMonth() === mes && d.getUTCDate() === dia ? ms : NaN;
  }

  function hrefValido(href) {
    return typeof href === 'string' && REGEX_HREF.test(href);
  }

  function ehValido(post) {
    return !!post
      && typeof post.titulo === 'string'
      && post.titulo.trim() !== ''
      && hrefValido(post.href)
      && !Number.isNaN(dataMs(post.data));
  }

  function ehCampanha(post) {
    return post.serie === 'campanhas';
  }

  /** Publicações válidas, da mais nova para a mais antiga; empate favorece campanhas. */
  function escolherNovidades(posts, n) {
    if (!Array.isArray(posts)) return [];
    const limite = Math.max(0, Math.floor(Number(n)) || 0);
    return posts
      .map((post, ordem) => ({ post, ordem }))
      .filter((item) => ehValido(item.post))
      .sort((a, b) => (dataMs(b.post.data) - dataMs(a.post.data))
        || (Number(ehCampanha(b.post)) - Number(ehCampanha(a.post)))
        || (a.ordem - b.ordem))
      .slice(0, limite)
      .map((item) => item.post);
  }

  /** Nova = publicada há até 14 dias e ainda não vista neste aparelho. */
  function ehNova(post, agoraMs, vistoSlug) {
    if (!ehValido(post) || post.slug === vistoSlug) return false;
    return agoraMs - dataMs(post.data) <= DIAS_NOVA * MS_DIA;
  }

  function rotuloSerie(serie) {
    return Object.prototype.hasOwnProperty.call(ROTULOS_SERIE, serie) ? ROTULOS_SERIE[serie] : '';
  }

  function criarTexto(doc, tag, classe, texto) {
    const el = doc.createElement(tag);
    el.className = classe;
    el.textContent = texto;
    return el;
  }

  function dataPorExtenso(ms) {
    return new Date(ms).toLocaleDateString('pt-BR', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  }

  /** Selo só para publicação nova; sem ela a miniatura já diz de onde vem. */
  function textoSelo(nova) {
    return nova ? 'Nova publicação no blog' : '';
  }

  /** Ícone do aviso: o do post se estiver no sprite; senão o da série; senão o padrão. */
  function iconeDe(post) {
    if (!post || typeof post !== 'object') return ICONE_PADRAO;
    if (typeof post.icone === 'string' && ICONES.includes(post.icone)) return post.icone;
    if (Object.prototype.hasOwnProperty.call(ICONE_DA_SERIE, post.serie)) return ICONE_DA_SERIE[post.serie];
    return ICONE_PADRAO;
  }

  /** Miniatura decorativa: span aria-hidden com o símbolo do sprite do blog. */
  function criarCapa(doc, post) {
    const capa = doc.createElement('span');
    capa.className = 'blog-novidade__capa';
    capa.setAttribute('aria-hidden', 'true');
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'blog-novidade__icone');
    svg.setAttribute('focusable', 'false');
    const uso = doc.createElementNS(SVG_NS, 'use');
    uso.setAttribute('href', `${SPRITE}#${iconeDe(post)}`);
    svg.appendChild(uso);
    capa.appendChild(svg);
    return capa;
  }

  function criarItem(doc, post, opcoes) {
    const { n, agoraMs, vistoSlug, gravarVisto } = opcoes;
    const item = doc.createElement('a');
    item.className = 'blog-novidade__item';
    item.setAttribute('href', post.href);
    if (rotuloSerie(post.serie)) item.setAttribute('data-serie', post.serie);
    item.appendChild(criarCapa(doc, post));
    const texto = doc.createElement('span');
    texto.className = 'blog-novidade__texto';
    const selo = textoSelo(ehNova(post, agoraMs, vistoSlug));
    if (selo) texto.appendChild(criarTexto(doc, 'span', 'blog-novidade__selo', selo));
    texto.appendChild(criarTexto(doc, 'span', 'blog-novidade__titulo', post.titulo));
    if (n > 1 && typeof post.resumo === 'string' && post.resumo.trim() !== '') {
      texto.appendChild(criarTexto(doc, 'span', 'blog-novidade__resumo', post.resumo));
    }
    const meta = [rotuloSerie(post.serie), dataPorExtenso(dataMs(post.data))].filter(Boolean).join(' · ');
    texto.appendChild(criarTexto(doc, 'span', 'blog-novidade__meta', meta));
    item.appendChild(texto);
    item.addEventListener('click', () => gravarVisto(post.slug));
    return item;
  }

  function montarContainer(doc, alvo, posts, contexto) {
    const n = Math.max(1, parseInt(alvo.getAttribute('data-blog-novidade'), 10) || 1);
    const escolhidos = escolherNovidades(posts, n);
    if (escolhidos.length === 0) return;
    const opcoes = { ...contexto, n };
    const itens = escolhidos.map((post) => criarItem(doc, post, opcoes));
    if (n === 1) {
      itens.forEach((item) => alvo.appendChild(item));
    } else {
      const lista = doc.createElement('ul');
      lista.className = 'blog-novidade__lista';
      itens.forEach((item) => {
        const li = doc.createElement('li');
        li.appendChild(item);
        lista.appendChild(li);
      });
      alvo.appendChild(lista);
    }
    alvo.hidden = false;
  }

  function carregarPosts(win, url) {
    return Promise.resolve()
      .then(() => win.fetch(url, { cache: 'no-cache' }))
      .then((resposta) => {
        if (!resposta.ok) throw new Error('blog-novidade: índice indisponível');
        return resposta.json();
      })
      .then((indice) => (indice && Array.isArray(indice.posts) ? indice.posts : []));
  }

  function lerVisto(win) {
    try {
      return win.localStorage.getItem(CHAVE_VISTO);
    } catch (erro) {
      return null;
    }
  }

  function gravarVisto(win, slug) {
    try {
      win.localStorage.setItem(CHAVE_VISTO, slug);
    } catch (erro) {
      // Sem armazenamento (modo privado ou bloqueado): o aviso só não lembra o clique.
    }
  }

  function iniciar(win) {
    const doc = win.document;
    const alvos = Array.from(doc.querySelectorAll('[data-blog-novidade]'));
    if (alvos.length === 0) return;
    const contexto = {
      agoraMs: Date.now(),
      vistoSlug: lerVisto(win),
      gravarVisto: (slug) => gravarVisto(win, slug),
    };
    const indices = new Map();
    alvos.forEach((alvo) => {
      const url = alvo.getAttribute('data-blog-indice') || INDICE_PADRAO;
      if (!indices.has(url)) indices.set(url, carregarPosts(win, url));
      indices.get(url)
        .then((posts) => montarContainer(doc, alvo, posts, contexto))
        .catch(() => {
          // Falha silenciosa de propósito: o contêiner fica escondido, sem console.
        });
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      escolherNovidades, ehNova, hrefValido, rotuloSerie, iconeDe, ICONES,
    };
  } else if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', () => iniciar(root));
  } else {
    iniciar(root);
  }
})(typeof window !== 'undefined' ? window : globalThis);
