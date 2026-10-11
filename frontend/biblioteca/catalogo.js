/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Página pública /biblioteca (CONTRATO-B2 §2). Melhoria progressiva:
// 1. a página nasce do instantâneo do build (lista pré-renderizada, funciona sem JS);
// 2. lê /biblioteca/index.json, mostra o formulário e filtra cada <li id="a-<id>"> com hidden;
// 3. busca o catálogo AO VIVO na API (apiLearnLibraryPublicCatalog, uma chamada por visita) e,
//    se vier válido e diferente, refaz a lista, as áreas e a contagem. Falhou: fica o instantâneo.
// Só textContent, atributos e hidden; nenhuma marcação entra por string.
// Este arquivo também é a regra única de validação de item: scripts/build-biblioteca.js usa
// validarItem/montarCatalogo daqui. `normalizar` precisa ficar igual a searchNorm
// (worker/src/library/normalize.js, CONTRATO-B1 §5).

const ATRASO_DIGITACAO = 250;
const INDICE_URL = '/biblioteca/index.json';
const VERSAO_INDICE = 1;
const SEARCH_MAX = 4000;
const MSG_VAZIO = 'Nenhum artigo com esses filtros.';
const MSG_SEM_ARTIGOS = 'Nenhum artigo publicado ainda.';
const TEMPO_LIMITE_MS = 8000;
const ACAO_CATALOGO = 'apiLearnLibraryPublicCatalog';
// Mesmas origens do connect-src da página (biblioteca.html) e de liga.js.
const API_PRODUCAO = 'https://api.laift.com.br/v1/';
const API_HOMOLOGACAO = 'https://staging-api.laift.com.br/v1/';
const HOST_HOMOLOGACAO = 'staging.laift.com.br';

const LINK_PERMITIDO = /^https:\/\/(doi\.org|pubmed\.ncbi\.nlm\.nih\.gov)\/[^\s<>"']{1,260}$/;
const ID_VALIDO = /^[A-Za-z0-9_-]{1,80}$/;
const SLUG_VALIDO = /^[a-z0-9-]{1,60}$/;
const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const ANO_MIN = 1800;
const ANO_MAX = 2100;
const AUTORES_NA_LISTA = 3;
const AUTORES_MAX = 30;

// Mesma tabela de rótulos de tipo de frontend/library-cite.js (LABELS.type).
const TIPOS = Object.freeze({
  artigo: 'Artigo original',
  revisao: 'Revisão',
  revisao_sistematica: 'Revisão sistemática',
  meta_analise: 'Metanálise',
  ensaio_clinico: 'Ensaio clínico',
  relato_caso: 'Relato de caso',
  diretriz: 'Diretriz',
  outro: 'Outro',
});

// ---------- normalização e filtros ----------

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, SEARCH_MAX)
    .trim();
}

/** Cópia de searchNorm (worker/src/library/normalize.js): mesmas partes, mesma ordem. */
function searchNorm(registro) {
  const r = registro || {};
  const sobrenomes = Array.isArray(r.authors) ? r.authors.map((a) => a?.family) : [];
  const partes = [r.title, ...sobrenomes, r.journal, r.journalAbbrev, r.doi, r.pmid];
  return normalizar(partes.filter((p) => p != null).map(String).join(' '));
}

function termosDaBusca(q) {
  const norm = normalizar(q);
  return norm ? norm.split(' ') : [];
}

function anoOuNull(valor) {
  if (valor === '' || valor === null || valor === undefined) return null;
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : null;
}

function textoOuVazio(valor) {
  return typeof valor === 'string' ? valor : '';
}

function passaAno(ano, de, ate) {
  if (de === null && ate === null) return true;
  if (typeof ano !== 'number') return false;
  return (de === null || ano >= de) && (ate === null || ano <= ate);
}

function passaTexto(item, termos) {
  const n = typeof item.n === 'string' ? item.n : '';
  return termos.every((termo) => n.includes(termo));
}

function passaArea(item, area) {
  return !area || (Array.isArray(item.topics) && item.topics.includes(area));
}

/**
 * Itens que casam com a busca e os filtros (todos em AND). Filtro vazio não restringe.
 * @param {Array<object>} itens entradas de index.json (com `n`)
 * @param {{q?: string, area?: string, tipo?: string, de?: unknown, ate?: unknown, aberto?: boolean}} [filtros]
 * @returns {Array<object>} novo array
 */
function filtrar(itens, filtros) {
  const f = filtros || {};
  const termos = termosDaBusca(f.q);
  const area = textoOuVazio(f.area);
  const tipo = textoOuVazio(f.tipo);
  const de = anoOuNull(f.de);
  const ate = anoOuNull(f.ate);
  return itens.filter((item) => (
    passaTexto(item, termos)
    && passaArea(item, area)
    && (!tipo || item.type === tipo)
    && passaAno(item.year, de, ate)
    && (f.aberto !== true || item.openAccess === true)
  ));
}

/**
 * @param {number} total
 * @returns {string} texto do contador depois de filtrar (CONTRATO-B2 §2.2)
 */
function contagem(total) {
  if (total === 0) return MSG_VAZIO;
  return total === 1 ? '1 artigo' : `${total} artigos`;
}

/** Texto do contador do catálogo inteiro (sem filtro): catálogo vazio tem frase própria. */
function rotuloDoTotal(total) {
  return total === 0 ? MSG_SEM_ARTIGOS : contagem(total);
}

// ---------- validação de item (regra única do build e do navegador) ----------

function textoLimpo(valor, max) {
  if (typeof valor !== 'string') return '';
  return valor.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function lerId(bruto) {
  if (typeof bruto === 'number' && Number.isSafeInteger(bruto) && bruto > 0) return String(bruto);
  if (typeof bruto === 'string' && ID_VALIDO.test(bruto)) return bruto;
  return null;
}

/** Ano ausente vira null; ano presente fora de 1800-2100 é inválido. */
function lerAno(bruto) {
  if (bruto === null || bruto === undefined) return { ok: true, valor: null };
  const ano = Number(bruto);
  const valido = Number.isInteger(ano) && ano >= ANO_MIN && ano <= ANO_MAX;
  return valido ? { ok: true, valor: ano } : { ok: false, valor: null };
}

function lerLink(bruto) {
  return typeof bruto === 'string' && bruto.length <= 300 && LINK_PERMITIDO.test(bruto) ? bruto : null;
}

function lerTopicos(bruto) {
  if (!Array.isArray(bruto)) return [];
  return [...new Set(bruto.filter((s) => typeof s === 'string' && SLUG_VALIDO.test(s)))];
}

function tipoValido(bruto) {
  return Object.prototype.hasOwnProperty.call(TIPOS, bruto) ? bruto : 'outro';
}

function listarAutores(bruto) {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((a) => a && typeof a === 'object')
    .map((a) => ({ family: textoLimpo(a.family, 120), given: textoLimpo(a.given, 120) }))
    .filter((a) => a.family)
    .slice(0, AUTORES_MAX);
}

/** Iniciais sem ponto: "Ana Maria" -> "AM", "Jean-Paul" -> "JP". */
function iniciais(prenome) {
  return prenome.split(/[\s-]+/).filter(Boolean).map((p) => Array.from(p)[0].toUpperCase()).join('');
}

/** "Silva AM, Souza B, Lima C et al." (até três autores; mais que três ganha "et al."). */
function textoAutores(autores, total) {
  const curtos = autores.slice(0, AUTORES_NA_LISTA)
    .map((a) => (a.given ? `${a.family} ${iniciais(a.given)}` : a.family));
  const maisDeTres = Math.max(total, autores.length) > AUTORES_NA_LISTA;
  return curtos.join(', ') + (maisDeTres ? ' et al.' : '');
}

function nomeCompleto(autor) {
  return [autor.given, autor.family].filter(Boolean).join(' ');
}

/**
 * Valida e normaliza um item de PublicItem (API ou instantâneo). Devolve { item, erro }.
 * item tem os campos de index.json mais nomesAutores (só para o JSON-LD; sai do index.json).
 */
function validarItem(bruto) {
  if (!bruto || typeof bruto !== 'object') return { item: null, erro: 'registro não é objeto' };
  const id = lerId(bruto.id);
  if (!id) return { item: null, erro: 'id inválido' };
  const titulo = textoLimpo(bruto.title, 300);
  if (!titulo) return { item: null, erro: 'sem título' };
  const ano = lerAno(bruto.year);
  if (!ano.ok) return { item: null, erro: 'ano inválido' };
  const url = lerLink(bruto.landingUrl ?? bruto.url);
  if (!url) return { item: null, erro: 'link fora da lista permitida' };
  const autores = listarAutores(bruto.authors);
  const revista = textoLimpo(bruto.journal, 200);
  const doi = textoLimpo(bruto.doi, 200);
  const pmid = textoLimpo(bruto.pmid == null ? '' : String(bruto.pmid), 20);
  const item = {
    id,
    title: titulo,
    authors: textoAutores(autores, Number(bruto.authorCount) || 0),
    journal: revista,
    year: ano.valor,
    type: tipoValido(bruto.type),
    topics: lerTopicos(bruto.topics),
    openAccess: bruto.openAccess === true,
    license: textoLimpo(bruto.license, 40),
    url,
    doi,
    n: searchNorm({ title: titulo, authors: autores, journal: revista, doi: doi || null, pmid: pmid || null }),
    nomesAutores: autores.map(nomeCompleto),
  };
  return { item, erro: null };
}

function montarTopicos(bruto) {
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set();
  return bruto.reduce((lista, t) => {
    const slug = t && t.slug;
    const nome = textoLimpo(t && t.name, 80);
    if (typeof slug !== 'string' || !SLUG_VALIDO.test(slug) || !nome || vistos.has(slug)) return lista;
    vistos.add(slug);
    return [...lista, { slug, name: nome }];
  }, []);
}

/**
 * Converte o catálogo bruto em { enabled, generatedAt, topics, items }; erro de item vira aviso.
 * @param {{enabled?: boolean, generatedAt?: string, topics?: unknown, items: Array<unknown>}} dados
 * @param {string[]} avisos recebe uma linha por item descartado
 */
function montarCatalogo(dados, avisos) {
  const vistos = new Set();
  const items = dados.items.reduce((lista, bruto, indice) => {
    const { item, erro } = validarItem(bruto);
    const rotulo = bruto && bruto.id != null ? String(bruto.id) : `posição ${indice + 1}`;
    if (erro) {
      avisos.push(`item ${rotulo}: ${erro}`);
      return lista;
    }
    if (vistos.has(item.id)) {
      avisos.push(`item ${rotulo}: id repetido`);
      return lista;
    }
    vistos.add(item.id);
    return [...lista, item];
  }, []);
  return {
    enabled: dados.enabled === true,
    generatedAt: textoLimpo(dados.generatedAt, 40),
    topics: montarTopicos(dados.topics),
    items,
  };
}

/** Item como sai em index.json (sem nomesAutores, que só serve ao JSON-LD). */
function itemPublico(item) {
  const { nomesAutores, ...publico } = item;
  return publico;
}

function dataPt(generatedAt) {
  const casa = DATA_ISO.exec(generatedAt || '') || DATA_ISO.exec(new Date().toISOString());
  return `${casa[3]}/${casa[2]}/${casa[1]}`;
}

/** Rótulos dos selos: tipo, áreas conhecidas e "Acesso aberto". */
function rotulosDosSelos(item, nomesTopicos) {
  const areas = item.topics.map((slug) => nomesTopicos.get(slug)).filter(Boolean);
  return [TIPOS[item.type], ...areas, ...(item.openAccess ? ['Acesso aberto'] : [])];
}

/** "Revista · 2021" (cada parte só se existir). */
function metaDoItem(item) {
  return [item.journal, item.year].filter((p) => p !== '' && p != null).join(' · ');
}

// ---------- índice estático e catálogo ao vivo ----------

function itemValido(item) {
  return !!item && typeof item === 'object' && typeof item.id === 'string' && item.id !== ''
    && typeof item.n === 'string';
}

/**
 * @param {unknown} corpo JSON já lido de /biblioteca/index.json
 * @returns {Array<object> | null} itens válidos, ou null se o formato não bate
 */
function validarIndice(corpo) {
  if (!corpo || typeof corpo !== 'object' || corpo.versao !== VERSAO_INDICE) return null;
  if (!Array.isArray(corpo.items)) return null;
  return corpo.items.filter(itemValido);
}

/**
 * Resposta de apiLearnLibraryPublicCatalog -> { generatedAt, topics, items } no formato de index.json,
 * ou null quando não dá para confiar nela (success diferente de true, formato estranho, ou lista com
 * itens e nenhum válido). enabled:false vale como catálogo vazio: a página mostra o estado vazio.
 * @param {unknown} corpo
 * @returns {{generatedAt: string, topics: Array<{slug: string, name: string}>, items: Array<object>} | null}
 */
function lerCatalogoAoVivo(corpo) {
  if (!corpo || typeof corpo !== 'object' || corpo.success !== true) return null;
  if (typeof corpo.enabled !== 'boolean' || !Array.isArray(corpo.items)) return null;
  if (corpo.topics !== undefined && !Array.isArray(corpo.topics)) return null;
  if (!corpo.enabled) return { generatedAt: '', topics: [], items: [] };
  const catalogo = montarCatalogo(corpo, []);
  if (corpo.items.length > 0 && catalogo.items.length === 0) return null;
  return { generatedAt: catalogo.generatedAt, topics: catalogo.topics, items: catalogo.items.map(itemPublico) };
}

/** Assinatura do que aparece na tela: igual = nada a refazer. */
function assinatura(topicos, itens) {
  return JSON.stringify({ topics: topicos, items: itens });
}

/** Endereço da API pelo host da página (mesma regra de liga.js; o resto cai na produção). */
function apiDoCatalogo(hostname) {
  return hostname === HOST_HOMOLOGACAO ? API_HOMOLOGACAO : API_PRODUCAO;
}

// ---------- tela (só no navegador) ----------

function lerCampos(doc) {
  return {
    form: doc.querySelector('.bib-filtros'),
    lista: doc.querySelector('.bib-lista'),
    status: doc.getElementById('bib-status'),
    atualizado: doc.querySelector('.bib-atualizado'),
    q: doc.getElementById('bib-q'),
    area: doc.getElementById('bib-area'),
    tipo: doc.getElementById('bib-tipo'),
    de: doc.getElementById('bib-ano-de'),
    ate: doc.getElementById('bib-ano-ate'),
    aberto: doc.getElementById('bib-aberto'),
    limpar: doc.querySelector('.bib-limpar'),
  };
}

function criarVazio(doc, lista) {
  const vazio = doc.createElement('p');
  vazio.className = 'bib-vazio';
  vazio.textContent = MSG_VAZIO;
  vazio.hidden = true;
  lista.parentNode.insertBefore(vazio, lista.nextSibling);
  return vazio;
}

function lerFiltros(campos) {
  return {
    q: campos.q.value,
    area: campos.area.value,
    tipo: campos.tipo.value,
    de: campos.de.value,
    ate: campos.ate.value,
    aberto: campos.aberto.checked,
  };
}

function mostrarLinhas(doc, itens, visiveis) {
  const ids = new Set(visiveis.map((item) => item.id));
  itens.forEach((item) => {
    const li = doc.getElementById('a-' + item.id);
    if (li) li.hidden = !ids.has(item.id);
  });
}

function aplicar(tela) {
  const visiveis = filtrar(tela.itens, lerFiltros(tela.campos));
  mostrarLinhas(tela.doc, tela.itens, visiveis);
  tela.campos.status.textContent = contagem(visiveis.length);
  tela.vazio.hidden = visiveis.length !== 0;
}

/** Catálogo vazio: sem formulário, só a frase. Com itens: formulário visível e filtro aplicado. */
function mostrarCatalogo(tela) {
  if (tela.itens.length === 0) {
    tela.campos.form.hidden = true;
    tela.vazio.hidden = true;
    tela.campos.status.textContent = MSG_SEM_ARTIGOS;
    return;
  }
  tela.campos.form.hidden = false;
  aplicar(tela);
}

function limparCampos(campos) {
  campos.q.value = '';
  campos.area.value = '';
  campos.tipo.value = '';
  campos.de.value = '';
  campos.ate.value = '';
  campos.aberto.checked = false;
}

function ligarEventos(tela) {
  const { campos } = tela;
  let temporizador = null;
  const agendar = () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => aplicar(tela), ATRASO_DIGITACAO);
  };
  const agora = () => {
    clearTimeout(temporizador);
    aplicar(tela);
  };
  campos.form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    agora();
  });
  [campos.q, campos.de, campos.ate].forEach((campo) => campo.addEventListener('input', agendar));
  [campos.area, campos.tipo, campos.aberto].forEach((campo) => campo.addEventListener('change', agora));
  campos.limpar.addEventListener('click', () => {
    clearTimeout(temporizador);
    limparCampos(campos);
    aplicar(tela);
    campos.q.focus();
  });
}

function criar(doc, tag, classe, texto) {
  const el = doc.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function criarSelos(doc, item, nomesTopicos) {
  const selos = criar(doc, 'ul', 'bib-selos');
  rotulosDosSelos(item, nomesTopicos).forEach((rotulo) => {
    const li = doc.createElement('li');
    li.appendChild(criar(doc, 'span', 'bib-selo', rotulo));
    selos.appendChild(li);
  });
  return selos;
}

function criarAcao(doc, url) {
  const acao = criar(doc, 'p', 'bib-acao');
  const link = criar(doc, 'a', 'bib-link', 'Abrir no site oficial');
  link.setAttribute('href', url);
  link.setAttribute('rel', 'noopener noreferrer');
  link.setAttribute('target', '_blank');
  link.appendChild(criar(doc, 'span', 'visually-hidden', ' (abre em nova aba)'));
  acao.appendChild(link);
  return acao;
}

/** Mesmo <li id="a-<id>"> que o build gera (renderItem em scripts/build-biblioteca.js). */
function criarLinha(doc, item, nomesTopicos) {
  const li = doc.createElement('li');
  li.id = 'a-' + item.id;
  const artigo = criar(doc, 'article', 'bib-artigo');
  artigo.appendChild(criar(doc, 'h2', 'bib-titulo', item.title));
  if (item.authors) artigo.appendChild(criar(doc, 'p', 'bib-autores', item.authors));
  const meta = metaDoItem(item);
  if (meta) artigo.appendChild(criar(doc, 'p', 'bib-meta', meta));
  artigo.appendChild(criarSelos(doc, item, nomesTopicos));
  artigo.appendChild(criarAcao(doc, item.url));
  li.appendChild(artigo);
  return li;
}

/** Troca as áreas do filtro, mantendo "Todas as áreas" e a escolha atual se ela ainda existir. */
function trocarAreas(doc, select, topicos) {
  const escolhida = select.value;
  Array.from(select.options).filter((opcao) => opcao.value !== '').forEach((opcao) => opcao.remove());
  topicos.forEach((t) => {
    const opcao = criar(doc, 'option', '', t.name);
    opcao.value = t.slug;
    select.appendChild(opcao);
  });
  select.value = topicos.some((t) => t.slug === escolhida) ? escolhida : '';
}

function pintarAoVivo(tela, catalogo) {
  const { doc, campos } = tela;
  const nomesTopicos = new Map(catalogo.topics.map((t) => [t.slug, t.name]));
  campos.lista.replaceChildren(...catalogo.items.map((item) => criarLinha(doc, item, nomesTopicos)));
  trocarAreas(doc, campos.area, catalogo.topics);
  if (catalogo.generatedAt && campos.atualizado) {
    campos.atualizado.textContent = `Atualizado em ${dataPt(catalogo.generatedAt)}.`;
  }
  tela.itens = catalogo.items;
  tela.assinatura = assinatura(catalogo.topics, catalogo.items);
  mostrarCatalogo(tela);
}

function carregarIndice(tela) {
  return fetch(INDICE_URL, { cache: 'no-cache' })
    .then((resposta) => {
      if (!resposta.ok) throw new Error('índice ' + resposta.status);
      return resposta.json();
    })
    .then((corpo) => {
      const itens = validarIndice(corpo);
      if (!itens) throw new Error('índice inválido');
      tela.itens = itens;
      tela.assinatura = assinatura(montarTopicos(corpo.topics), itens);
      mostrarCatalogo(tela);
    })
    .catch((erro) => {
      console.warn('biblioteca: índice', erro);
    });
}

function buscarAoVivo(url) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: ACAO_CATALOGO, args: [] }),
    credentials: 'omit',
    signal: controle.signal,
  })
    .then((resposta) => {
      if (!resposta.ok) throw new Error('api ' + resposta.status);
      return resposta.json();
    })
    .finally(() => clearTimeout(relogio));
}

/** Uma chamada por visita, sem repetição. Qualquer falha deixa a tela como está (o instantâneo). */
function carregarAoVivo(tela, hostname) {
  return buscarAoVivo(apiDoCatalogo(hostname))
    .then((corpo) => {
      const catalogo = lerCatalogoAoVivo(corpo);
      if (!catalogo) throw new Error('catálogo ao vivo inválido');
      if (assinatura(catalogo.topics, catalogo.items) === tela.assinatura) return;
      pintarAoVivo(tela, catalogo);
    })
    .catch((erro) => {
      console.warn('biblioteca: catálogo ao vivo', erro);
    });
}

function iniciarCatalogo(doc, hostname) {
  const campos = lerCampos(doc);
  if (!campos.form || !campos.lista || !campos.status || !campos.q || !campos.area || !campos.limpar) return null;
  const tela = {
    doc,
    campos,
    itens: [],
    assinatura: null,
    vazio: criarVazio(doc, campos.lista),
  };
  ligarEventos(tela);
  return carregarIndice(tela).then(() => carregarAoVivo(tela, hostname));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizar,
    searchNorm,
    filtrar,
    contagem,
    rotuloDoTotal,
    validarIndice,
    validarItem,
    montarCatalogo,
    itemPublico,
    lerCatalogoAoVivo,
    apiDoCatalogo,
    rotulosDosSelos,
    metaDoItem,
    dataPt,
    iniciarCatalogo,
    TIPOS,
    ATRASO_DIGITACAO,
    MSG_SEM_ARTIGOS,
    API_PRODUCAO,
    API_HOMOLOGACAO,
  };
} else if (typeof document !== 'undefined') {
  const iniciar = () => iniciarCatalogo(document, window.location.hostname);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
}
